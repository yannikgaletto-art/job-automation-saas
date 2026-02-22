export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        // Fetch document info to verify ownership and find the file path
        const { data: document, error: fetchError } = await supabase
            .from('documents')
            .select('id, document_type, file_url_encrypted')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !document) {
            console.error('❌ Document not found or unauthorized:', fetchError);
            return NextResponse.json({ success: false, error: 'Document not found or unauthorized' }, { status: 404 });
        }

        const bucketName = document.document_type === 'cv' ? 'cvs' : 'cover-letters';
        const filePath = document.file_url_encrypted;

        // Delete from storage
        if (filePath) {
            const { error: storageError } = await supabaseAdmin.storage
                .from(bucketName)
                .remove([filePath]);

            if (storageError) {
                console.error(`❌ Failed to delete file from storage (${bucketName}/${filePath}):`, storageError);
                // Return 500 but log error
                return NextResponse.json({ success: false, error: 'Failed to delete file from storage' }, { status: 500 });
            }
        }

        // Delete from database
        const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (deleteError) {
            console.error('❌ Failed to delete document from database:', deleteError);
            return NextResponse.json({ success: false, error: 'Failed to delete document record' }, { status: 500 });
        }

        console.log(`✅ Document ${id} deleted successfully`);
        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ Server error deleting document:', errMsg);
        return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }
}
