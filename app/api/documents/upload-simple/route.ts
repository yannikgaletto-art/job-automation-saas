export const dynamic = 'force-dynamic';

/**
 * POST /api/documents/upload-simple
 * Lightweight document upload for Settings — no AI processing.
 * Accepts a single file (cv or cover_letter), stores it in the correct bucket,
 * writes a row to the documents table, and returns immediately.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
];

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        // Auth
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const docType = (formData.get('type') as string) || 'cv'; // 'cv' | 'cover_letter'

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        if (file.size > 5_000_000) {
            return NextResponse.json({ error: 'File must be less than 5MB' }, { status: 400 });
        }
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json({ error: 'Only PDF, DOC, DOCX allowed' }, { status: 400 });
        }

        const bucket = docType === 'cv' ? 'cvs' : 'cover-letters';
        const ext = file.name.split('.').pop();
        const filePath = `${user.id}/${docType}-${Date.now()}.${ext}`;
        const bytes = await file.arrayBuffer();

        // Upload to Storage
        const { data: uploadData, error: storageError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(filePath, bytes, { contentType: file.type, upsert: false });

        if (storageError) {
            console.error(`[${requestId}] upload-simple storage error:`, storageError.message);
            return NextResponse.json({ error: storageError.message }, { status: 500 });
        }

        // Save record in documents table
        const { data: doc, error: dbError } = await supabaseAdmin
            .from('documents')
            .insert({
                user_id: user.id,
                document_type: docType,
                file_url_encrypted: uploadData.path,
                metadata: { original_name: file.name },
                pii_encrypted: {},
            })
            .select()
            .single();

        if (dbError) {
            console.error(`[${requestId}] upload-simple db error:`, dbError.message);
            // Don't fail — file is already uploaded
        }

        // If it's a CV, also save path to user_profiles for downstream use
        if (docType === 'cv') {
            await supabaseAdmin
                .from('user_profiles')
                .update({ cv_original_file_path: uploadData.path })
                .eq('id', user.id);
        }

        return NextResponse.json({
            success: true,
            document: {
                id: doc?.id,
                type: docType,
                name: file.name,
                path: uploadData.path,
            },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[upload-simple] Fatal:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
