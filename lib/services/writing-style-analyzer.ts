import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface StyleAnalysis {
    tone: 'professional' | 'enthusiastic' | 'technical' | 'conversational';
    sentence_length: 'short' | 'medium' | 'long'; // avg 10-15 / 16-25 / 26+ words
    conjunctions: string[]; // Top 5 most used (e.g., ["Daher", "Deshalb", "Gleichzeitig"])
    greeting: string; // e.g., "Sehr geehrte Damen und Herren" or "Hallo [Name]"
}

/**
 * Analyze writing style from cover letter text
 * Uses Claude Haiku for fast, cheap extraction (~$0.0004 per analysis)
 */
export async function analyzeWritingStyle(
    coverLetterText: string
): Promise<StyleAnalysis> {
    // Edge case: Text too short
    if (coverLetterText.length < 100) {
        console.warn('⚠️ Cover letter too short for style analysis (<100 chars)');
        return getDefaultStyle();
    }

    // Only analyze first 2000 chars (cover letters are ~250-350 words = ~1500 chars)
    const textToAnalyze = coverLetterText.slice(0, 2000);

    try {
        const message = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 512,
            temperature: 0,
            system: `You are a writing style analyzer. Extract style patterns from cover letters.
Return ONLY valid JSON with these 4 keys:
- tone: "professional" | "enthusiastic" | "technical" | "conversational"
- sentence_length: "short" | "medium" | "long"
- conjunctions: array of top 5 conjunctions/transition words used (German: Daher, Deshalb, Zudem, etc. or English: Therefore, Thus, Moreover, etc.)
- greeting: the exact greeting used (e.g., "Sehr geehrte Damen und Herren" or "Dear Hiring Manager")

Analyze the natural writing patterns, not what would be ideal.`,
            messages: [{
                role: 'user',
                content: `Analyze the writing style of this cover letter and return only JSON:

${textToAnalyze}

Return JSON with exactly these keys: tone, sentence_length, conjunctions (array), greeting`
            }]
        });

        // Parse JSON response
        const contentBlock = message.content[0];
        if (contentBlock.type === 'text') {
            // Try to extract JSON from response
            const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);
                
                // Validate structure
                if (analysis.tone && analysis.sentence_length && 
                    Array.isArray(analysis.conjunctions) && analysis.greeting) {
                    
                    console.log(`📊 Style analysis: ${analysis.tone}, ${analysis.sentence_length} sentences, ${analysis.conjunctions.length} conjunctions`);
                    return analysis as StyleAnalysis;
                }
            }
        }

        throw new Error('Invalid JSON response from Claude');

    } catch (error) {
        console.error('❌ Style analysis failed:', error);
        return getDefaultStyle();
    }
}

/**
 * Fallback style if analysis fails or API is unavailable
 */
function getDefaultStyle(): StyleAnalysis {
    return {
        tone: 'professional',
        sentence_length: 'medium',
        conjunctions: ['Daher', 'Deshalb', 'Zudem', 'Außerdem', 'Gleichzeitig'],
        greeting: 'Sehr geehrte Damen und Herren'
    };
}

/**
 * Get default style (exported for use in other services)
 */
export function getDefaultStyleAnalysis(): StyleAnalysis {
    return getDefaultStyle();
}