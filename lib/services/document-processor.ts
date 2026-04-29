import { extractText } from './text-extractor';
import { extractTextWithAzure } from './azure-document-extractor';
import { encrypt } from '@/lib/utils/encryption';
import { analyzeWritingStyle, StyleAnalysis, getDefaultStyleAnalysis } from './writing-style-analyzer';
import { sanitizeForAI } from './pii-sanitizer';

// CV metadata (skills, experience, languages, education) is now derived from
// `cv_structured_data` produced by the Mistral parser in cv-pdf-parser.ts.
// The previous Claude Haiku metadata call was redundant with that parser and
// has been removed (2026-04-29) — see Agent_Onboarding.md Folgenabschätzung.

export interface ProcessedDocument {
    rawText: string;
    extractedText: string;
    encryptedPii: Record<string, string>; // key -> encrypted_value
    metadata: {
        content_snippet?: string; // First 500 chars for preview
        style_analysis?: StyleAnalysis; // Writing style (cover letters only)
    };
}

export async function processDocument(
    fileBuffer: Buffer,
    mimeType: string,
    documentType: 'cv' | 'cover_letter' = 'cv'
): Promise<ProcessedDocument> {

    // ================================================================
    // Step 1: Text Extraction
    // PRIMARY:  Azure Document Intelligence (EU — DSGVO-konform)
    // FALLBACK: pdf-parse / mammoth (local, no API)
    // ================================================================
    let rawText: string | null = null;
    let extractionSource: 'azure' | 'local' = 'azure';

    // Try Azure first (layout-aware OCR, handles visual/scanned PDFs)
    rawText = await extractTextWithAzure(fileBuffer, mimeType);

    if (!rawText) {
        // Azure unavailable or insufficient text — fall back to local extraction
        console.warn('⚠️ [document-processor] Azure extraction failed or insufficient — falling back to local extractor');
        extractionSource = 'local';
        rawText = await extractText(fileBuffer, mimeType);
    }

    console.log(`📝 [document-processor] Text extracted via ${extractionSource}: ${rawText.length} chars`);

    if (rawText.trim().length < 50) {
        throw new Error('PDF konnte nicht gelesen werden. Bitte als Text-PDF exportieren.');
    }

    // ================================================================
    // Step 2: PII Extraction (LOCAL — Regex)
    // DSGVO Art. 25: PII (name, email, phone) extracted locally via regex.
    // No external AI call here — Mistral parser in cv-pdf-parser.ts derives
    // skills/languages/education from the structured JSON instead.
    // ================================================================
    const textToAnalyze = rawText.slice(0, 3000);
    const { tokenMap, warningFlags } = sanitizeForAI(textToAnalyze);
    console.log(`🛡️ [document-processor] PII detected via regex. Tokens: [${warningFlags.join(', ')}]`);

    // 3. Style Analysis (only for cover letters)
    let styleAnalysis: StyleAnalysis | undefined;

    if (documentType === 'cover_letter') {
        try {
            console.log('📊 Analyzing writing style for cover letter...');
            styleAnalysis = await analyzeWritingStyle(rawText);
            console.log('✅ Style analysis complete:', styleAnalysis.tone, styleAnalysis.sentence_length);
        } catch (error) {
            console.error('⚠️ Style analysis failed, using default style:', error);
            // Don't block upload if style analysis fails - use default
            styleAnalysis = getDefaultStyleAnalysis();
        }
    }

    // ================================================================
    // 4. Encrypt PII (from LOCAL regex extraction, NOT from AI response)
    // DSGVO Art. 25: PII never touched external AI — extracted purely by regex
    // ================================================================
    const encryptedPii: Record<string, string> = {};

    // Extract PII values from tokenMap (token → original plaintext)
    for (const [token, originalValue] of tokenMap.entries()) {
        if (token.startsWith('__NAME_') && !encryptedPii.name) {
            encryptedPii.name = encrypt(originalValue);
        } else if (token.startsWith('__EMAIL_') && !encryptedPii.email) {
            encryptedPii.email = encrypt(originalValue);
        } else if (token.startsWith('__PHONE_') && !encryptedPii.phone) {
            encryptedPii.phone = encrypt(originalValue);
        }
        // IBAN is not stored as PII in document metadata
    }

    console.log(`🔐 [document-processor] PII encrypted from regex: ${Object.keys(encryptedPii).join(', ') || 'none found'}`);

    return {
        rawText,
        extractedText: rawText, // Full text for PDF rendering & CV parsing (name stays per User-Directive)
        encryptedPii,
        metadata: {
            content_snippet: rawText.slice(0, 500), // For preview in cover-letter-generator
            style_analysis: styleAnalysis, // Only present for cover letters
        },
    };
}
