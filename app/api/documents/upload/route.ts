// Vercel timeout: Azure Document Intelligence + Claude CV parsing can take 20-40s.
// Without this, Vercel defaults to 10s (Hobby) causing silent production timeouts.
export const maxDuration = 60;

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server' // Auth client
import { createClient as createAdminClient } from '@supabase/supabase-js' // Admin client
import { processDocument } from '@/lib/services/document-processor'


// Admin client for bypassing RLS
const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

// Validation: file size + type check (shared for CV and cover letters)
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
];
const MAX_FILE_SIZE = 5_000_000;

function validateFile(f: File, label: string) {
    if (f.size > MAX_FILE_SIZE) throw new Error(`${label} must be less than 5MB`);
    if (!ALLOWED_MIME_TYPES.includes(f.type)) throw new Error(`${label} must be PDF, DOC, or DOCX`);
}

export async function POST(req: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        const supabase = await createClient()

        // Get authenticated user
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        console.log(`[${requestId}] route=documents/upload step=start userId=${user?.id ?? 'anon'}`);

        let userId = user?.id

        if (!userId && process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_UPLOAD_BYPASS === 'true') {
            // MVP / Dev Mode Fallback for unauthenticated onboarding flow
            console.log(`[${requestId}] route=documents/upload Auth missing, attempting dev fallback...`);
            if (process.env.DEV_BYPASS_USER_ID) {
                userId = process.env.DEV_BYPASS_USER_ID;
                console.log(`[${requestId}] route=documents/upload using fallback user: ${userId}`);
            }
        }

        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized and no fallback user found', details: userError?.message, requestId },
                { status: 401 }
            )
        }

        const formData = await req.formData()

        // ─── Document Limit Guard (max 3 per type) ───────────────────
        // Double-Assurance: Frontend disables button at 3, backend rejects at 3.
        const singleTypeField = (formData.get('type') as string) || null;

        // Only applies to Settings mode: single `file` upload with explicit `type`
        if (formData.get('file')) {
            const explicitType = singleTypeField || 'cv';
            const { count, error: countErr } = await supabaseAdmin
                .from('documents')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('document_type', explicitType);

            if (!countErr && (count ?? 0) >= 3) {
                console.log(`[${requestId}] route=documents/upload BLOCKED — ${explicitType} limit reached (${count}/3)`);
                return NextResponse.json(
                    { error: `Limit erreicht: Du kannst maximal 3 ${explicitType === 'cv' ? 'Lebensläufe' : 'Anschreiben'} hochladen. Lösche zuerst ein bestehendes Dokument.`, code: 'DOCUMENT_LIMIT_REACHED', requestId },
                    { status: 429 }
                );
            }
        }

        // ================================================================
        // Settings mode: single `file` + `type` field
        // Onboarding mode: `cv` + `coverLetter_0..N` fields
        // Contract 2: ONE upload route for both flows
        // ================================================================
        let cvFile: File | null = null;
        const coverLetterFiles: File[] = [];

        const singleFile = formData.get('file') as File | null;
        const singleType = (formData.get('type') as string) || 'cv';

        if (singleFile) {
            // === Settings mode: single file upload ===
            if (singleType === 'cv') {
                cvFile = singleFile;
            } else {
                coverLetterFiles.push(singleFile);
            }
        } else {
            // === Onboarding mode: cv + coverLetter_N ===
            cvFile = formData.get('cv') as File | null;
            let i = 0;
            while (formData.has(`coverLetter_${i}`)) {
                const file = formData.get(`coverLetter_${i}`) as File;
                if (file) coverLetterFiles.push(file);
                i++;
            }
        }

        if (!cvFile && coverLetterFiles.length === 0) {
            return NextResponse.json(
                { error: 'No files provided', requestId },
                { status: 400 }
            )
        }

        // Validate files
        try {
            if (cvFile) validateFile(cvFile, 'CV');
            for (const cl of coverLetterFiles) validateFile(cl, 'Cover letter');
        } catch (validationError) {
            const msg = validationError instanceof Error ? validationError.message : 'Validation failed';
            return NextResponse.json(
                { error: msg, requestId },
                { status: 400 }
            )
        }

        // ================================================================
        // CV Upload + Processing (only when a CV file is provided)
        // ================================================================
        let processedCv: { encryptedPii: Record<string, unknown>; metadata: Record<string, unknown>; extractedText: string } | null = null;
        let cvDocId: string | null = null;
        let cvUploadPath: string | null = null;

        if (cvFile) {
            console.log(`[${requestId}] route=documents/upload step=storage_upload_cv`);
            const cvFileName = `${userId}/cv-${Date.now()}.${cvFile.name.split('.').pop()}`;
            const cvBytes = await cvFile.arrayBuffer();

            const { data: cvUploadData, error: cvUploadError } = await supabaseAdmin.storage
                .from('cvs')
                .upload(cvFileName, cvBytes, {
                    contentType: cvFile.type,
                    upsert: false
                });

            if (cvUploadError) {
                console.error(`[${requestId}] route=documents/upload step=storage_upload_cv supabase_error=${cvUploadError.message}`);
                return NextResponse.json(
                    { error: 'Failed to upload CV', details: cvUploadError.message, requestId },
                    { status: 500 }
                );
            }

            cvUploadPath = cvUploadData.path;

            // 1. Process CV immediately (Sync) to get Metadata/PII
            console.log(`[${requestId}] route=documents/upload step=process_cv`);

            try {
                const cvBuffer = Buffer.from(cvBytes);
                processedCv = await processDocument(cvBuffer, cvFile.type);

                const { data: cvDoc, error: cvDbError } = await supabaseAdmin
                    .from('documents')
                    .insert({
                        user_id: userId,
                        document_type: 'cv',
                        file_url_encrypted: cvUploadData.path,
                        metadata: {
                            ...processedCv.metadata,
                            extracted_text: processedCv.extractedText,
                            original_name: cvFile.name // ✅ SICHERHEITSARCHITEKTUR.md Section 2
                        },
                        pii_encrypted: processedCv.encryptedPii
                    })
                    .select()
                    .single();

                if (cvDbError) {
                    console.error(`[${requestId}] route=documents/upload step=db_insert_cv supabase_error=${cvDbError.message} code=${cvDbError.code}`);
                } else {
                    // ✅ READ-BACK: Verify DB insert was successful (SICHERHEITSARCHITEKTUR.md Section 2)
                    const { data: verify, error: vErr } = await supabaseAdmin
                        .from('documents')
                        .select('id')
                        .eq('id', cvDoc.id)
                        .single();

                    if (vErr || !verify) {
                        console.error(`[${requestId}] route=documents/upload step=db_insert_cv_verify failed`);
                        return NextResponse.json({ error: 'CV verification failed' }, { status: 500 });
                    }

                    cvDocId = cvDoc.id;
                    console.log(`[${requestId}] route=documents/upload step=db_insert_cv success`);

                    // 1.5 Parse the unstructured text to strict JSON SSoT immediately
                    if (processedCv.extractedText) {
                        try {
                            console.log(`[${requestId}] route=documents/upload step=parse_cv_json...`);
                            const { parseCvTextToJson } = await import('@/lib/services/cv-parser');
                            const structuredCv = await parseCvTextToJson(processedCv.extractedText);

                            // ═══ INTEGRITY GUARD — Restore PII from Phase 1 encryption ═══
                            // document-processor runs a dedicated Haiku PII-extraction call
                            // on the raw CV text -> encryptedPii.name is more reliable than
                            // cv-parser's general-purpose extraction (which can be misled by
                            // OCR headers like "Deutsche Rentenversicherung").
                            // Name is ALWAYS overridden; email/phone only when null.
                            let resolvedName: string | null = null;
                            if (processedCv.encryptedPii) {
                                const { decrypt } = await import('@/lib/utils/encryption');
                                if (!structuredCv.personalInfo) structuredCv.personalInfo = {} as any;
                                if (processedCv.encryptedPii.name) {
                                    try {
                                        resolvedName = decrypt(processedCv.encryptedPii.name as string);
                                        structuredCv.personalInfo.name = resolvedName;
                                        console.log(`[integrity-guard] Name override from Phase 1 PII -> "${resolvedName}"`);

                                    } catch { /* decrypt failed — leave as-is */ }
                                }
                                if (!structuredCv.personalInfo.email && processedCv.encryptedPii.email) {
                                    try {
                                        structuredCv.personalInfo.email = decrypt(processedCv.encryptedPii.email as string);
                                        console.log(`🔧 [integrity-guard] Restored email from Phase 1 encrypted PII`);
                                    } catch { /* decrypt failed — leave as-is */ }
                                }
                                if (!structuredCv.personalInfo.phone && processedCv.encryptedPii.phone) {
                                    try {
                                        structuredCv.personalInfo.phone = decrypt(processedCv.encryptedPii.phone as string);
                                        console.log(`🔧 [integrity-guard] Restored phone from Phase 1 encrypted PII`);
                                    } catch { /* decrypt failed — leave as-is */ }
                                }
                            }

                            const { error: profileErr } = await supabaseAdmin
                                .from('user_profiles')
                                .update({
                                    cv_structured_data: structuredCv,
                                    cv_original_file_path: cvUploadData.path,
                                    ...(resolvedName ? { full_name: resolvedName } : {}),
                                })
                                .eq('id', userId);

                            if (profileErr) {
                                console.error(`[${requestId}] route=documents/upload step=save_profile supabase_error=${profileErr.message}`);
                            } else {
                                console.log(`[${requestId}] route=documents/upload step=save_profile success`);
                            }
                        } catch (parseError: unknown) {
                            const msg = parseError instanceof Error ? parseError.message : String(parseError);
                            console.error(`[${requestId}] route=documents/upload step=parse_cv_json error=${msg}`);
                        }
                    }
                }

            } catch (procError) {
                const errMsg = procError instanceof Error ? procError.message : String(procError);
                console.error(`[${requestId}] route=documents/upload step=process_cv extraction_failed_non_blocking error=${errMsg}`);
                // Non-blocking: save the file without extracted text rather than failing the whole upload
                const { data: cvDoc, error: cvDbError } = await supabaseAdmin
                    .from('documents')
                    .insert({
                        user_id: userId,
                        document_type: 'cv',
                        file_url_encrypted: cvUploadData.path,
                        metadata: { extracted_text: null, extraction_error: errMsg, original_name: cvFile.name },
                        pii_encrypted: {}
                    })
                    .select()
                    .single();
                if (!cvDbError && cvDoc) {
                    cvDocId = cvDoc.id;
                    console.log(`[${requestId}] route=documents/upload step=db_insert_cv_fallback success`);
                }
            }
        }

        // 2. Upload cover letters (with Azure EU extraction + writing style analysis)
        const coverLetterIds: string[] = []
        const coverLetterUrls: string[] = []

        for (let j = 0; j < coverLetterFiles.length; j++) {
            const file = coverLetterFiles[j]
            const fileName = `${userId}/cover-letter-${j}-${Date.now()}.${file.name.split('.').pop()}`
            const bytes = await file.arrayBuffer()

            console.log(`[${requestId}] route=documents/upload step=storage_upload_cl index=${j}`)
            const { data, error } = await supabaseAdmin.storage
                .from('cover-letters')
                .upload(fileName, bytes, {
                    contentType: file.type,
                    upsert: false
                })

            if (error) {
                console.error(`[${requestId}] route=documents/upload step=storage_upload_cl index=${j} supabase_error=${error.message}`)
            } else if (data) {
                coverLetterUrls.push(data.path)

                // ── Azure EU extraction + writing style analysis (non-blocking) ──
                let clMetadata: Record<string, unknown> = { original_name: file.name };
                let clPii: Record<string, unknown> = {};

                try {
                    console.log(`[${requestId}] route=documents/upload step=process_cl index=${j}`);
                    const clBuffer = Buffer.from(bytes);
                    const processedCl = await processDocument(clBuffer, file.type, 'cover_letter');
                    clMetadata = {
                        ...processedCl.metadata,
                        extracted_text: processedCl.extractedText,
                        original_name: file.name,
                    };
                    clPii = processedCl.encryptedPii;
                    console.log(`[${requestId}] route=documents/upload step=process_cl success chars=${processedCl.extractedText.length}`);
                } catch (clProcErr) {
                    const msg = clProcErr instanceof Error ? clProcErr.message : String(clProcErr);
                    console.warn(`[${requestId}] route=documents/upload step=process_cl failed (non-blocking): ${msg}`);
                    // Keep minimal metadata — file is still saved
                }

                // Save to DB
                console.log(`[${requestId}] route=documents/upload step=db_insert_cl index=${j}`)
                const { data: clDoc, error: clDbError } = await supabaseAdmin
                    .from('documents')
                    .insert({
                        user_id: userId,
                        document_type: 'cover_letter',
                        file_url_encrypted: data.path,
                        metadata: clMetadata,
                        pii_encrypted: clPii,
                    })
                    .select()
                    .single()

                if (clDbError) {
                    console.error(`[${requestId}] route=documents/upload step=db_insert_cl index=${j} supabase_error=${clDbError.message} code=${clDbError.code}`)
                } else if (clDoc) {
                    coverLetterIds.push(clDoc.id)
                }
            }
        }

        console.log(`[${requestId}] route=documents/upload step=complete cv_doc_id=${cvDocId ?? 'none'} cl_count=${coverLetterIds.length}`)

        return NextResponse.json({
            success: true,
            requestId,
            message: 'Documents uploaded and verified',
            data: {
                cv_url: cvUploadPath,
                extracted: processedCv ? {
                    metadata: processedCv.metadata
                    // NOTE: not returning pii_encrypted in response (GDPR)
                } : null,
                document_ids: {
                    cv: cvDocId,
                    coverLetters: coverLetterIds
                }
            }
        })

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[${requestId}] route=documents/upload step=unhandled_error error=${errMsg}`)
        return NextResponse.json(
            { error: 'Internal server error', details: errMsg, requestId },
            { status: 500 }
        )
    }
}
