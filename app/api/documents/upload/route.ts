
import { NextRequest, NextResponse } from 'next/server'
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
    try {
        const supabase = await createClient()

        // Get authenticated user
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized', details: userError?.message },
                { status: 401 }
            )
        }

        const userId = user.id
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
                { error: 'Missing CV file' },
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
                    { error: 'Validation failed', details: validationError.errors },
                    { status: 400 }
                )
            }
        }

        // Upload CV to Supabase Storage
        const cvFileName = `${userId}/cv-${Date.now()}.${cvFile.name.split('.').pop()}`
        const cvBytes = await cvFile.arrayBuffer()

        const { data: cvUploadData, error: cvUploadError } = await supabaseAdmin.storage
            .from('cvs')
            .upload(cvFileName, cvBytes, {
                contentType: cvFile.type,
                upsert: false
            })

        if (cvUploadError) {
            console.error('CV upload error:', cvUploadError)
            return NextResponse.json(
                { error: 'Failed to upload CV', details: cvUploadError.message },
                { status: 500 }
            )
        }

        // 1. Process CV immediately (Sync) to get Metadata/PII
        console.log('Processing CV...')
        let processedCv: any = null
        let cvDocId: string | null = null

        try {
            // Convert ArrayBuffer to Buffer for processing
            const cvBuffer = Buffer.from(cvBytes)
            processedCv = await processDocument(cvBuffer, cvFile.type)

            // Save CV to documents table
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
                console.error('CV DB Insert Error:', cvDbError)
            } else {
                cvDocId = cvDoc.id
            }

        } catch (procError) {
            console.error('CV Processing Failed:', procError)
        }

        // 2. Upload cover letters
        const coverLetterIds: string[] = []
        const coverLetterUrls: string[] = []

        for (let i = 0; i < coverLetterFiles.length; i++) {
            const file = coverLetterFiles[i]
            const fileName = `${userId}/cover-letter-${i}-${Date.now()}.${file.name.split('.').pop()}`
            const bytes = await file.arrayBuffer()

            const { data, error } = await supabaseAdmin.storage
                .from('cover-letters')
                .upload(fileName, bytes, {
                    contentType: file.type,
                    upsert: false
                })

            if (error) {
                console.error(`Cover letter ${i} upload error:`, error)
                // Continue with other files or fail? For now, log and continue.
            } else if (data) {
                coverLetterUrls.push(data.path)

                // Save to DB
                const { data: clDoc } = await supabaseAdmin
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

                if (clDoc) coverLetterIds.push(clDoc.id)
            }
        }

        // Return success with extracted data
        return NextResponse.json({
            success: true,
            message: 'Documents uploaded and verified',
            data: {
                cv_url: cvUploadData.path,
                extracted: processedCv ? {
                    pii: processedCv.encryptedPii,
                    metadata: processedCv.metadata
                } : null,
                document_ids: {
                    cv: cvDocId,
                    coverLetters: coverLetterIds
                }
            }
        })

    } catch (error) {
        console.error('Error in upload pipeline:', error)
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
