// Vercel timeout: pipeline runs Azure DI + Claude (PII) AND Mistral (parse) sequentially,
// which exceeds 60s on real-world PDFs. 120s is the Pro-plan budget; matches cv/optimize.
export const maxDuration = 120;

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
        //
        // USER-EDIT-FIRST (2026-04-28): The route uploads the file, runs
        // Azure OCR + Claude parse, and RETURNS the parsed JSON in the
        // response. It does NOT write user_profiles.cv_structured_data
        // here anymore — that write happens in /api/documents/confirm-parse
        // after the user has reviewed/edited the extracted fields.
        // ================================================================
        let cvDocId: string | null = null;
        let cvUploadPath: string | null = null;
        let cvParsedStructure: import('@/types/cv').CvStructuredData | null = null;

        if (cvFile) {
            // Single-CV invariant: 409 if the user already has a CV. The DB has a
            // partial unique index (one_cv_per_user) as the authoritative guard;
            // this pre-check is friendlier UX and avoids an orphan storage upload
            // before the index would reject the insert anyway.
            const { data: existingCvs, error: existingErr } = await supabaseAdmin
                .from('documents')
                .select('id')
                .eq('user_id', userId)
                .eq('document_type', 'cv')
                .limit(1);

            if (existingErr) {
                console.error(`[${requestId}] route=documents/upload step=existing_cv_check supabase_error=${existingErr.message}`);
                return NextResponse.json(
                    { error: 'Internal error', details: existingErr.message, requestId },
                    { status: 500 }
                );
            }

            if (existingCvs && existingCvs.length > 0) {
                console.log(`[${requestId}] route=documents/upload step=existing_cv_check rejected — user already has a CV`);
                return NextResponse.json(
                    {
                        error: 'Du hast bereits einen Lebenslauf. Lösche ihn zuerst, um einen neuen hochzuladen.',
                        code: 'CV_ALREADY_EXISTS',
                        requestId,
                    },
                    { status: 409 }
                );
            }

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

            // Mistral-only pipeline (EU/DSGVO): one OCR + one parse pass.
            // Replaces previous Azure-DI + Claude-Haiku pre-pass that doubled
            // the latency and pushed real-world PDFs over the 60s budget.
            console.log(`[${requestId}] route=documents/upload step=parse_cv_pdf...`);

            try {
                const cvBuffer = Buffer.from(cvBytes);
                const { parseCvFromPdf } = await import('@/lib/services/cv-pdf-parser');
                const { encrypt } = await import('@/lib/utils/encryption');
                const { structured: structuredCv, markdown } = await parseCvFromPdf(cvBuffer);

                // Encrypt PII straight from the parser output. Mistral reads the PDF
                // natively so name/email/phone are extracted alongside the structured
                // CV; we never need a second model just to surface them.
                const piiEncrypted: Record<string, string> = {};
                const pi = structuredCv.personalInfo ?? {};
                if (pi.name) piiEncrypted.name = encrypt(pi.name);
                if (pi.email) piiEncrypted.email = encrypt(pi.email);
                if (pi.phone) piiEncrypted.phone = encrypt(pi.phone);

                const { data: cvDoc, error: cvDbError } = await supabaseAdmin
                    .from('documents')
                    .insert({
                        user_id: userId,
                        document_type: 'cv',
                        file_url_encrypted: cvUploadData.path,
                        metadata: {
                            extracted_text: markdown,
                            original_name: cvFile.name,
                            cv_parsed_v2: structuredCv,
                        },
                        pii_encrypted: piiEncrypted,
                    })
                    .select()
                    .single();

                if (cvDbError) {
                    console.error(`[${requestId}] route=documents/upload step=db_insert_cv supabase_error=${cvDbError.message} code=${cvDbError.code}`);
                    if (cvDbError.code === '23505') {
                        // Lost the race vs one_cv_per_user partial index — compensate the
                        // orphan storage upload and signal 409.
                        await supabaseAdmin.storage.from('cvs').remove([cvUploadData.path]).catch(() => null);
                        return NextResponse.json(
                            {
                                error: 'Du hast bereits einen Lebenslauf. Lösche ihn zuerst, um einen neuen hochzuladen.',
                                code: 'CV_ALREADY_EXISTS',
                                requestId,
                            },
                            { status: 409 }
                        );
                    }
                    return NextResponse.json({ error: 'Failed to persist CV', details: cvDbError.message, requestId }, { status: 500 });
                }

                // ✅ READ-BACK guard (SICHERHEITSARCHITEKTUR.md §2)
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
                cvParsedStructure = structuredCv;
                console.log(`[${requestId}] route=documents/upload step=parse_cv_pdf success`);
            } catch (parseError) {
                const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
                console.error(`[${requestId}] route=documents/upload step=parse_cv_pdf failed error=${errMsg}`);
                // Non-blocking: persist the document with error metadata so the user
                // can retry via Re-Parse rather than losing the upload entirely.
                const { data: cvDoc, error: cvDbError } = await supabaseAdmin
                    .from('documents')
                    .insert({
                        user_id: userId,
                        document_type: 'cv',
                        file_url_encrypted: cvUploadData.path,
                        metadata: { extracted_text: null, extraction_error: errMsg, original_name: cvFile.name },
                        pii_encrypted: {},
                    })
                    .select()
                    .single();
                if (!cvDbError && cvDoc) {
                    cvDocId = cvDoc.id;
                    console.log(`[${requestId}] route=documents/upload step=db_insert_cv_fallback success`);
                } else if (cvDbError?.code === '23505') {
                    await supabaseAdmin.storage.from('cvs').remove([cvUploadData.path]).catch(() => null);
                    return NextResponse.json(
                        {
                            error: 'Du hast bereits einen Lebenslauf. Lösche ihn zuerst, um einen neuen hochzuladen.',
                            code: 'CV_ALREADY_EXISTS',
                            requestId,
                        },
                        { status: 409 }
                    );
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
                cv_storage_path: cvUploadPath, // confirm-parse needs this to set cv_original_file_path
                // User-Edit-First: parsed structure for the confirm dialog.
                // null when the file is a cover letter or when parsing failed.
                cv_parsed: cvParsedStructure,
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
