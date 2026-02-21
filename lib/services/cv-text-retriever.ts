import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/utils/encryption';

export async function getCVText(userId: string): Promise<{
    text: string;
    documentId: string;
    fileName: string;
} | null> {
    const supabase = await createClient();

    const { data: doc, error } = await supabase
        .from('documents')
        .select('id, file_url_encrypted, metadata, pii_encrypted')
        .eq('user_id', userId)
        .eq('document_type', 'cv')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !doc) {
        console.warn('⚠️ CV document not found for user:', userId);
        return null;
    }

    let text = doc.metadata?.extracted_text;

    // If we have text but it has placeholders like [NAME], we could try to decrypt pii_encrypted and replace them.
    // For AI matching, the sanitized text is usually sufficient and safer.
    // But if we want the exact text, we can reconstruct it:
    if (text && doc.pii_encrypted && typeof doc.pii_encrypted === 'object') {
        let reconstructedText = text;
        for (const [key, encryptedValue] of Object.entries(doc.pii_encrypted)) {
            if (typeof encryptedValue === 'string') {
                try {
                    const decrypted = decrypt(encryptedValue);
                    const placeholder = `[${key.toUpperCase()}]`;
                    // Replace all occurrences of the placeholder with the decrypted value
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

    // Attempt to extract filename from URL (since file_url_encrypted holds the storage path)
    const urlParts = doc.file_url_encrypted ? doc.file_url_encrypted.split('/') : [];
    const fileName = urlParts.length > 0 ? urlParts[urlParts.length - 1] : 'cv.pdf';

    console.log('✅ CV text retrieved:', text.length, 'characters');
    return { text, documentId: doc.id, fileName };
}
