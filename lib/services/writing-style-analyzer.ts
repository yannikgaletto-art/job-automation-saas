import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface StyleAnalysis {
    tone: 'professional' | 'enthusiastic' | 'technical' | 'conversational' | 'storytelling' | 'philosophical';
    sentence_length: 'short' | 'medium' | 'long'; // avg 10-15 / 16-25 / 26+ words
    conjunctions: string[]; // Top 5 most used (e.g., ["Daher", "Deshalb", "Gleichzeitig"])
    greeting: string; // e.g., "Sehr geehrte Damen und Herren" or "Hallo [Name]"
    rhetorical_devices: string[]; // e.g., ["quote", "anecdote", "rhetorical_question"]
    forbidden_constructs: string[]; // Constructs the user never uses
}

/**
 * Analyze writing style from cover letter text
 * Uses Claude Haiku for fast, cheap extraction of 6 style markers
 */
export async function analyzeWritingStyle(
    coverLetterText: string
): Promise<StyleAnalysis> {
    // Edge case: Text too short
    if (coverLetterText.length < 100) {
        console.warn('⚠️ Cover letter too short for style analysis (<100 chars)');
        return getDefaultStyleAnalysis();
    }

    // Only analyze first 2000 chars (cover letters are ~250-350 words = ~1500 chars)
    const textToAnalyze = coverLetterText.slice(0, 2000);

    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.warn('⚠️ No Anthropic API Key found. Using default style.');
            return getDefaultStyleAnalysis();
        }

        const message = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 768,
            temperature: 0,
            system: `You are a writing style analyzer. Extract style patterns from cover letters.
Return ONLY valid JSON with these 6 keys:
- tone: "professional" | "enthusiastic" | "technical" | "conversational" | "storytelling" | "philosophical"
- sentence_length: "short" | "medium" | "long" (avg 10-15 / 16-25 / 26+ words)
- conjunctions: array of top 5 conjunctions/transition words used (German examples: Daher, Deshalb, Zudem, Gleichzeitig, Außerdem)
- greeting: the exact greeting used (e.g., "Sehr geehrte Damen und Herren" or "Liebe Anna")
- rhetorical_devices: array of rhetorical devices found (from: "quote", "anecdote", "rhetorical_question", "metaphor", "enumeration", "contrast", "personal_story", "data_reference")
- forbidden_constructs: array of writing patterns the author deliberately avoids (e.g., "passive_voice", "exclamation_marks", "generic_openings", "buzzword_lists"). If you cannot determine this, return an empty array.`,
            messages: [{
                role: 'user',
                content: `Analyze the writing style of this cover letter thoroughly:

${textToAnalyze}

Return JSON with: tone, sentence_length, conjunctions, greeting, rhetorical_devices, forbidden_constructs`
            }]
        });

        // Parse JSON response safely
        const contentBlock = message.content[0];
        if (contentBlock.type === 'text') {
            const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);

                // Validate structure (basic check — must have at least the 4 core fields)
                if (analysis.tone && analysis.sentence_length &&
                    Array.isArray(analysis.conjunctions) && analysis.greeting) {

                    // Ensure new fields exist with defaults
                    const result: StyleAnalysis = {
                        tone: analysis.tone,
                        sentence_length: analysis.sentence_length,
                        conjunctions: analysis.conjunctions,
                        greeting: analysis.greeting,
                        rhetorical_devices: Array.isArray(analysis.rhetorical_devices) ? analysis.rhetorical_devices : [],
                        forbidden_constructs: Array.isArray(analysis.forbidden_constructs) ? analysis.forbidden_constructs : [],
                    };

                    console.log(`📊 Style analysis: ${result.tone}, ${result.sentence_length} sentences, ${result.rhetorical_devices.length} devices, ${result.forbidden_constructs.length} forbidden`);
                    return result;
                }
            }
        }

        throw new Error('Invalid JSON response from Claude');

    } catch (error) {
        console.error('❌ Style analysis failed:', error);
        return getDefaultStyleAnalysis();
    }
}

/**
 * Fallback style if analysis fails
 */
export function getDefaultStyleAnalysis(): StyleAnalysis {
    return {
        tone: 'professional',
        sentence_length: 'medium',
        conjunctions: ['Daher', 'Deshalb', 'Zudem', 'Außerdem', 'Gleichzeitig'],
        greeting: 'Sehr geehrte Damen und Herren',
        rhetorical_devices: [],
        forbidden_constructs: [],
    };
}