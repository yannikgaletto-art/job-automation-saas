import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/utils/encryption';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Retrieves the text of a specific CV (or the latest one).
 *
 * @param userId - The user's ID (scoped query — Contract 3)
 * @param documentId - Optional: specific document ID. If omitted, uses latest CV.
 *
 * Self-Healing: If the CV exists but has no extracted_text, attempts
 * on-the-fly extraction via processDocument() + saves the result.
 */
export async function getCVText(userId: string, documentId?: string): Promise<{
    text: string;
    documentId: string;
    fileName: string;
} | null> {
    // Use admin client for reads — consistent with cv/match route pattern
    // Auth client + RLS can silently fail in certain API route contexts
    let query = supabaseAdmin
        .from('documents')
        .select('id, file_url_encrypted, metadata, pii_encrypted')
        .eq('user_id', userId)
        .eq('document_type', 'cv');

    if (documentId) {
        query = query.eq('id', documentId);
    } else {
        query = query.order('created_at', { ascending: false }).limit(1);
    }

    const { data: doc, error } = await query.maybeSingle();

    if (error || !doc) {
        console.warn('⚠️ CV document not found for user:', userId, documentId ? `docId:${documentId}` : '(latest)', 'error:', error?.message);
        return null;
    }

    console.log(`📋 CV document found: id=${doc.id} file_url=${doc.file_url_encrypted?.substring(0, 50)}...`);

    let text = (doc.metadata as Record<string, unknown>)?.extracted_text as string | undefined;

    // ================================================================
    // Self-Healing: Extract text on-the-fly if missing
    // ================================================================
    if (!text || (typeof text === 'string' && text.trim().length < 50)) {
        console.warn(`⚠️ [Self-Healing] CV ${doc.id} has no extracted_text (current length: ${text?.length ?? 0}), attempting on-the-fly extraction...`);

        try {
            const storagePath = doc.file_url_encrypted;
            if (!storagePath || typeof storagePath !== 'string') {
                throw new Error(`No valid storage path found: ${JSON.stringify(storagePath)}`);
            }

            // Download the file from storage
            console.log(`⬇️ [Self-Healing] Downloading from bucket 'cvs', path: ${storagePath}`);
            const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
                .from('cvs')
                .download(storagePath);

            if (downloadErr || !fileData) {
                throw new Error(`Storage download failed: ${downloadErr?.message || 'No file data returned'}`);
            }
            console.log(`⬇️ [Self-Healing] Downloaded ${fileData.size} bytes`);

            const buffer = Buffer.from(await fileData.arrayBuffer());
            console.log(`🤖 [Self-Healing] Calling processDocument (Claude Haiku)...`);
            const { processDocument } = await import('@/lib/services/document-processor');
            const processed = await processDocument(buffer, 'application/pdf');

            text = processed.extractedText;
            console.log(`🤖 [Self-Healing] Extraction complete: ${text.length} chars`);

            // Save extracted text back to DB for next time
            const existingMeta = (doc.metadata as Record<string, unknown>) || {};
            const { error: updateErr } = await supabaseAdmin
                .from('documents')
                .update({
                    metadata: { ...existingMeta, extracted_text: text, original_name: existingMeta.original_name },
                    pii_encrypted: processed.encryptedPii,
                })
                .eq('id', doc.id);

            if (updateErr) {
                console.error(`⚠️ [Self-Healing] DB update failed (non-blocking):`, updateErr.message);
            } else {
                console.log('✅ [Self-Healing] Text extracted and saved for document:', doc.id, `(${text.length} chars)`);
            }
        } catch (healErr) {
            const errMsg = healErr instanceof Error ? healErr.message : String(healErr);
            console.error(`❌ [Self-Healing] On-the-fly extraction failed for ${doc.id}: ${errMsg}`);
            console.error('Full error:', healErr);
            return null;
        }
    }

    // If we have text but it has placeholders like [NAME], we could try to decrypt pii_encrypted and replace them.
    // For AI matching, the sanitized text is usually sufficient and safer.
    if (text && doc.pii_encrypted && typeof doc.pii_encrypted === 'object') {
        let reconstructedText = text;
        for (const [key, encryptedValue] of Object.entries(doc.pii_encrypted)) {
            if (typeof encryptedValue === 'string') {
                try {
                    const decrypted = decrypt(encryptedValue);
                    const placeholder = `[${key.toUpperCase()}]`;
                    reconstructedText = reconstructedText.split(placeholder).join(decrypted);
                } catch (e) {
                    console.error(`Failed to decrypt PII field ${key}:`, e);
                }
            }
        }
        text = reconstructedText;
    }

    if (!text || text.trim().length < 50) {
        console.warn('⚠️ CV text too short or empty for document:', doc.id);
        return null;
    }

    // Attempt to extract filename from URL
    const meta = doc.metadata as Record<string, unknown>;
    const originalName = (meta?.original_name as string) || '';
    const urlParts = doc.file_url_encrypted ? doc.file_url_encrypted.split('/') : [];
    const fileName = originalName || (urlParts.length > 0 ? urlParts[urlParts.length - 1] : 'cv.pdf');

    console.log('✅ CV text retrieved:', text.length, 'characters');
    return { text, documentId: doc.id, fileName };
}

/**
 * Lists all CV documents for a user (for the CV selection dialog).
 */
export async function listUserCVs(userId: string): Promise<{
    id: string;
    name: string;
    createdAt: string;
}[]> {
    const supabase = await createClient();

    const { data: docs, error } = await supabase
        .from('documents')
        .select('id, metadata, created_at')
        .eq('user_id', userId)
        .eq('document_type', 'cv')
        .order('created_at', { ascending: false });

    if (error || !docs) return [];

    return docs.map((doc) => {
        const meta = doc.metadata as Record<string, unknown>;
        return {
            id: doc.id,
            name: (meta?.original_name as string) || 'Lebenslauf',
            createdAt: doc.created_at,
        };
    });
}
