import { extractText } from './text-extractor';
import { encrypt } from '@/lib/utils/encryption';
import Anthropic from '@anthropic-ai/sdk';

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
    };
}

export async function processDocument(fileBuffer: Buffer, mimeType: string): Promise<ProcessedDocument> {
    // 1. Extract Raw Text
    const rawText = await extractText(fileBuffer, mimeType);

    // 2. Intelligent Analysis (PII & Metadata) via Claude
    // We send a portion of text (first 4k chars usually enough for PII/Skills header) to save tokens/cost
    // provided the CV isn't huge. For full analysis, we might send more.
    const textToAnalyze = rawText.slice(0, 15000); // Analyze first ~15k chars (approx 3-4 pages)

    let analysisResult: any;

    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.warn('⚠️ No Anthropic API Key found. Using MOCK extraction.');
            analysisResult = mockExtraction(rawText);
        } else {
            const message = await anthropic.messages.create({
                model: 'claude-3-haiku-20240307', // Fast & cheap
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
        analysisResult = mockExtraction(rawText); // Fallback to mock/regex
    }

    // 3. Encrypt PII
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
                // Global replace, case insensitive
                const regex = new RegExp(escapeRegExp(value), 'gi');
                sanitizedText = sanitizedText.replace(regex, `[${key.toUpperCase()}]`);
            }
        }
    }

    return {
        rawText,
        sanitizedText,
        encryptedPii,
        metadata: analysisResult.metadata || { skills: [], experienceYears: 0 }
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
