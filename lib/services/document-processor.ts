import { extractText } from './text-extractor';
import { extractTextWithAzure } from './azure-document-extractor';
import { encrypt } from '@/lib/utils/encryption';
import Anthropic from '@anthropic-ai/sdk';
import { analyzeWritingStyle, StyleAnalysis, getDefaultStyleAnalysis } from './writing-style-analyzer';
import { sanitizeForAI } from './pii-sanitizer';

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface ProcessedDocument {
    rawText: string;
    extractedText: string;
    encryptedPii: Record<string, string>; // key -> encrypted_value
    metadata: {
        skills: string[];
        experienceYears: number;
        educationLevel?: string;
        languages?: string[];
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
    // Step 2: PII Extraction (LOCAL — Regex) + AI Metadata Extraction
    // DSGVO Art. 25 (Privacy by Design):
    //   - PII (name, email, phone) is extracted locally via sanitizeForAI() regex
    //   - Only SANITIZED text is sent to Claude Haiku for metadata extraction
    //   - Haiku NEVER sees real PII — only tokens like __NAME_0__, __EMAIL_0__
    // ================================================================
    const textToAnalyze = rawText.slice(0, 3000);

    // Phase 1 (DSGVO): Sanitize before AI call — extract PII locally
    const { sanitized: sanitizedText, tokenMap, warningFlags } = sanitizeForAI(textToAnalyze);
    console.log(`🛡️ [document-processor] PII sanitized before AI call. Found: [${warningFlags.join(', ')}]`);

    let metadataResult: { skills: string[]; experienceYears: number; educationLevel?: string; languages?: string[] } = {
        skills: [], experienceYears: 0,
    };

    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.warn('⚠️ No Anthropic API Key found. Using MOCK extraction.');
            const mock = mockExtraction(rawText);
            metadataResult = mock.metadata;
        } else {
            const message = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001', // Fast & cheap
                max_tokens: 1024,
                temperature: 0,
                system: "You are a specialized CV metadata extractor. Extract ONLY professional metadata (skills, experience, education, languages) from the text. The text has been pre-processed and personal information has been removed. Do NOT attempt to extract names, emails, or phone numbers. Return ONLY valid JSON.",
                messages: [
                    {
                        role: "user",
                        content: `Extract the following professional metadata from this CV text:\n\n1. skills: array of technologies, tools, and competencies mentioned\n2. experience_years: estimated total years of professional experience (number)\n3. education_level: highest degree (e.g. 'Bachelor', 'Master', 'PhD')\n4. languages: array of spoken languages mentioned\n\nReturn ONLY a JSON object with these keys.\n\nText:\n${sanitizedText}`
                    }
                ]
            });

            // Safe parsing of response
            const contentBlock = message.content[0];
            if (contentBlock.type === 'text') {
                try {
                    metadataResult = JSON.parse(contentBlock.text);
                } catch (e) {
                    // Fallback mechanism to find JSON block if Claude chatted
                    const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        metadataResult = JSON.parse(jsonMatch[0]);
                    } else {
                        throw new Error('Could not parse JSON from Claude response');
                    }
                }
            }
        }
    } catch (error) {
        console.error('AI Extraction failed:', error);
        throw new Error('Fehler bei der Dokumentenanalyse.');
    }

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
            ...metadataResult || { skills: [], experienceYears: 0 },
            content_snippet: rawText.slice(0, 500), // For preview in cover-letter-generator
            style_analysis: styleAnalysis // Only present for cover letters
        }
    };
}

// Fallback Mock Extraction (regex based)
function mockExtraction(text: string) {
    const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    const phoneMatch = text.match(/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/);

    return {
        pii: {
            email: emailMatch ? emailMatch[0] : null,
            phone: phoneMatch ? phoneMatch[0] : null,
            name: "Unknown Candidate" // Hard to regex names reliably
        },
        metadata: {
            skills: ["JavaScript (Mock)", "React (Mock)", "Node.js (Mock)"],
            experienceYears: 2,
            educationLevel: "Bachelor (Mock)"
        }
    };
}
