import { extractText } from './text-extractor';
import { extractTextWithAzure } from './azure-document-extractor';
import { encrypt } from '@/lib/utils/encryption';
import Anthropic from '@anthropic-ai/sdk';
import { analyzeWritingStyle, StyleAnalysis, getDefaultStyleAnalysis } from './writing-style-analyzer';

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface ProcessedDocument {
    rawText: string;
    sanitizedText: string;
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
    // Step 2: AI Metadata Extraction (PII + Skills)
    // Still uses Claude Haiku — this is metadata only, not full CV text
    // The PII is immediately encrypted after this step.
    // ================================================================
    const textToAnalyze = rawText.slice(0, 15000);

    let analysisResult: any;

    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.warn('⚠️ No Anthropic API Key found. Using MOCK extraction.');
            analysisResult = mockExtraction(rawText);
        } else {
            const message = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001', // Fast & cheap
                max_tokens: 1024,
                temperature: 0,
                system: "You are a specialized CV Parser. Extract Personally Identifiable Information (PII) and professional metadata from the text. Return ONLY valid JSON.",
                messages: [
                    {
                        role: "user",
                        content: `Extract the following from this CV text:\n\n1. PII: name, email, phone, address (if present). If missing, return null.\n2. Metadata: languages (array), skills (array of tech/tools), experience_years (number, estimate if needed), education_level (e.g. 'Bachelor', 'Master').\n\nReturn ONLY a JSON object with keys: 'pii' and 'metadata'.\n\nText:\n${textToAnalyze}`
                    }
                ]
            });

            // Safe parsing of response
            const contentBlock = message.content[0];
            if (contentBlock.type === 'text') {
                try {
                    analysisResult = JSON.parse(contentBlock.text);
                } catch (e) {
                    // Fallback mechanism to find JSON block if Claude chatted
                    const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        analysisResult = JSON.parse(jsonMatch[0]);
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

    // 4. Encrypt PII
    const encryptedPii: Record<string, string> = {};
    const pii = analysisResult.pii || {};

    // TODO: Improve PII replacement to be consistent (e.g. replace all occurrences, case-insensitive)
    let sanitizedText = rawText;

    for (const [key, value] of Object.entries(pii)) {
        if (value && typeof value === 'string') {
            // Encrypt
            encryptedPii[key] = encrypt(value);

            // Sanitize (Simple string replacement - robust version would use regex escaping)
            // We only replace if the value is somewhat unique (len > 2) to avoid replacing common syllables
            if (value.length > 2) {
                // To display correct names in PDF, we disable physical redaction of the text for now
                // Global replace, case insensitive
                // const regex = new RegExp(escapeRegExp(value), 'gi');
                // sanitizedText = sanitizedText.replace(regex, `[${key.toUpperCase()}]`);
            }
        }
    }

    return {
        rawText,
        sanitizedText,
        encryptedPii,
        metadata: {
            ...analysisResult.metadata || { skills: [], experienceYears: 0 },
            content_snippet: rawText.slice(0, 500), // For preview in cover-letter-generator
            style_analysis: styleAnalysis // Only present for cover letters
        }
    };
}

// Utility to escape string for Regex
function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
