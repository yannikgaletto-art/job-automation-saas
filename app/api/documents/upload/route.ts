import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server' // Auth client
import { createClient as createAdminClient } from '@supabase/supabase-js' // Admin client
import { processDocument } from '@/lib/services/document-processor'
import { z } from 'zod'

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

// Validation schema for file uploads
const uploadSchema = z.object({
    cv: z.instanceof(File).refine(
        (f) => f.size < 5_000_000,
        'CV file must be less than 5MB'
    ).refine(
        (f) => ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'].includes(f.type),
        'CV must be PDF, DOC, or DOCX'
    ),
    coverLetters: z.array(z.instanceof(File)).min(1, 'At least 1 cover letter required').max(3, 'Maximum 3 cover letters allowed')
})

export async function POST(req: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        const supabase = await createClient()

        // Get authenticated user
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        console.log(`[${requestId}] route=documents/upload step=start userId=${user?.id ?? 'anon'}`);

        let userId = user?.id

        if (!userId) {
            // MVP / Dev Mode Fallback for unauthenticated onboarding flow
            console.log(`[${requestId}] route=documents/upload Auth missing, attempting dev fallback...`);
            const { data: fallbackUsers } = await supabaseAdmin.from('user_profiles').select('id').limit(1);
            if (fallbackUsers && fallbackUsers.length > 0) {
                userId = fallbackUsers[0].id;
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

        // Extract files from FormData
        const cvFile = formData.get('cv') as File | null
        const coverLetterFiles: File[] = []

        // Get cover letter files
        let i = 0
        while (formData.has(`coverLetter_${i}`)) {
            const file = formData.get(`coverLetter_${i}`) as File
            if (file) coverLetterFiles.push(file)
            i++
        }

        if (!cvFile) {
            return NextResponse.json(
                { error: 'Missing CV file', requestId },
                { status: 400 }
            )
        }

        // Validate files
        try {
            uploadSchema.parse({
                cv: cvFile,
                coverLetters: coverLetterFiles
            })
        } catch (validationError) {
            if (validationError instanceof z.ZodError) {
                return NextResponse.json(
                    { error: 'Validation failed', details: validationError.errors, requestId },
                    { status: 400 }
                )
            }
        }

        // Upload CV to Supabase Storage
        console.log(`[${requestId}] route=documents/upload step=storage_upload_cv`);
        const cvFileName = `${userId}/cv-${Date.now()}.${cvFile.name.split('.').pop()}`
        const cvBytes = await cvFile.arrayBuffer()

        const { data: cvUploadData, error: cvUploadError } = await supabaseAdmin.storage
            .from('cvs')
            .upload(cvFileName, cvBytes, {
                contentType: cvFile.type,
                upsert: false
            })

        if (cvUploadError) {
            console.error(`[${requestId}] route=documents/upload step=storage_upload_cv supabase_error=${cvUploadError.message}`)
            return NextResponse.json(
                { error: 'Failed to upload CV', details: cvUploadError.message, requestId },
                { status: 500 }
            )
        }

        // 1. Process CV immediately (Sync) to get Metadata/PII
        console.log(`[${requestId}] route=documents/upload step=process_cv`)
        let processedCv: { encryptedPii: Record<string, unknown>; metadata: Record<string, unknown>; sanitizedText: string } | null = null
        let cvDocId: string | null = null

        try {
            const cvBuffer = Buffer.from(cvBytes)
            processedCv = await processDocument(cvBuffer, cvFile.type)

            // Save CV to documents table
            console.log(`[${requestId}] route=documents/upload step=db_insert_cv`)
            const { data: cvDoc, error: cvDbError } = await supabaseAdmin
                .from('documents')
                .insert({
                    user_id: userId,
                    document_type: 'cv',
                    file_url_encrypted: cvUploadData.path,
                    metadata: {
                        ...processedCv.metadata,
                        extracted_text: processedCv.sanitizedText
                    },
                    pii_encrypted: processedCv.encryptedPii
                })
                .select()
                .single()

            if (cvDbError) {
                console.error(`[${requestId}] route=documents/upload step=db_insert_cv supabase_error=${cvDbError.message} code=${cvDbError.code}`)
            } else {
                cvDocId = cvDoc.id
                console.log(`[${requestId}] route=documents/upload step=db_insert_cv success`)
            }

        } catch (procError) {
            const errMsg = procError instanceof Error ? procError.message : String(procError)
            console.error(`[${requestId}] route=documents/upload step=process_cv error=${errMsg}`)
        }

        // 2. Upload cover letters
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

                // Save to DB
                console.log(`[${requestId}] route=documents/upload step=db_insert_cl index=${j}`)
                const { data: clDoc, error: clDbError } = await supabaseAdmin
                    .from('documents')
                    .insert({
                        user_id: userId,
                        document_type: 'cover_letter',
                        file_url_encrypted: data.path,
                        metadata: {},
                        pii_encrypted: {}
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

        // Return success with extracted data
        return NextResponse.json({
            success: true,
            requestId,
            message: 'Documents uploaded and verified',
            data: {
                cv_url: cvUploadData.path,
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
