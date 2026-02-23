import OpenAI from 'openai';

// Initialize OpenAI client lazily to allow env vars to load first in tests
let openaiClient: OpenAI | null = null;
function getOpenAI() {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiClient;
}

export interface QuoteSuggestion {
    quote: string;
    author: string;
    source?: string; // Book, speech, etc.
    relevance_score: number; // 0-1 (from Perplexity)
    match_score?: number; // 0-1 (calculated via embeddings)
    matched_value: string; // The specific company value this quote supports
    value_connection: string; // Explanation
    language: 'en' | 'de';
}

/**
 * Calculates cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * STEP 2: Score quotes using OpenAI embeddings
 * This ensures the quotes effectively match the company values semantically.
 */
async function scoreQuoteRelevance(
    quotes: QuoteSuggestion[],
    companyValues: string[]
): Promise<QuoteSuggestion[]> {
    if (quotes.length === 0 || companyValues.length === 0) return quotes;

    try {
        // 1. Generate embedding for company values (combined)
        const valuesText = companyValues.join(" ");
        const valuesEmbeddingResponse = await getOpenAI().embeddings.create({
            model: "text-embedding-3-small",
            input: valuesText,
        });
        const valuesEmbedding = valuesEmbeddingResponse.data[0].embedding;

        // 2. Generate embeddings for each quote and calculate similarity
        const scoredQuotes = await Promise.all(
            quotes.map(async (quote) => {
                const quoteText = `${quote.quote} ${quote.value_connection}`;
                const quoteEmbeddingResponse = await getOpenAI().embeddings.create({
                    model: "text-embedding-3-small",
                    input: quoteText,
                });
                const quoteEmbedding = quoteEmbeddingResponse.data[0].embedding;

                const similarity = cosineSimilarity(valuesEmbedding, quoteEmbedding);

                return {
                    ...quote,
                    match_score: similarity,
                };
            })
        );

        // 3. Sort by match_score descending
        return scoredQuotes.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));

    } catch (error) {
        console.error("Error scoring quotes:", error);
        // Fallback: return quotes as-is or with 0 score
        return quotes.map(q => ({ ...q, match_score: 0 }));
    }
}

/**
 * STEP 1: Find quotes via Perplexity (with OpenAI fallback)
 */
export async function suggestRelevantQuotes(
    companyName: string,
    companyValues: string[],
    companyVision: string = ""
): Promise<QuoteSuggestion[]> {
    const promptText = `Find exactly 5 high-quality, visionary quotes that thematically match the company "${companyName}".

Focus the quotes on their core values: ${JSON.stringify(companyValues)}
${companyVision ? `and their vision: ${companyVision}` : ''}

CRITICAL INSTRUCTIONS ON QUOTE SELECTION:
1. You may include MAXIMUM ONE (1) quote from the CEO/Founder of ${companyName}.
2. The remaining 4 quotes MUST be from diverse external sources (renowned authors, historical innovators, philosophers, industry thought leaders) whose profound ideas logically align with the company's mission/values.
3. Example: If the company focuses on green energy or sustainability, find a profound quote from an environmentalist or author about system change or the planet. The goal is to show deep thematic alignment, not just name-drop the company.
4. DO NOT select quotes about specific recent news events, stock prices, or funding rounds. Focus on timeless values and overarching visions.
5. Support German language if the company values are in German, otherwise English.

Return a strict JSON array matching this exact structure:
[
  {
    "quote": "The actual quote text",
    "author": "Author Name (Role/Company)",
    "source": "Source context (e.g. 'Letter to Shareholders')",
    "relevance_score": 0.95,
    "matched_value": "Customer Obsession",
    "value_connection": "This quote emphasizes putting the customer first...",
    "language": "en"
  }
]`;

    let quotes: QuoteSuggestion[] = [];

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'sonar-pro',
                messages: [
                    {
                        role: 'user',
                        content: promptText
                    }
                ],
                temperature: 0.2
            })
        });

        if (!response.ok) {
            console.warn(`Perplexity Quote API error: ${response.status}`);
            // Let the fallback handle it
        } else {
            const data = await response.json();
            const content = data.choices[0]?.message?.content;

            const jsonMatch = content.match(/```json?\s*([\s\S]*?)```/) || [null, content];

            try {
                quotes = JSON.parse(jsonMatch[1] ? jsonMatch[1].trim() : content.trim());
            } catch (e) {
                console.warn('Failed to parse Perplexity Quote JSON', e);
            }
        }
    } catch (error) {
        console.error('Suggest Quotes Perplexity Error:', error);
    }

    // FALLBACK to OpenAI if Perplexity failed or returned no quotes
    if (!Array.isArray(quotes) || quotes.length === 0) {
        console.log("⚠️ Perplexity returned no quotes. Falling back to OpenAI API.");
        try {
            const openai = getOpenAI();
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "You are a specialized quote discovery assistant. Output extremely high-quality, visionary quotes strictly matching the required JSON format." },
                    { role: "user", content: promptText }
                ],
                response_format: { type: "json_object" },
                temperature: 0.6,
            });

            const content = response.choices[0].message.content || '{"quotes":[]}';
            const jsonMatch = content.match(/```json?\s*([\s\S]*?)```/) || [null, content];
            const parsed = JSON.parse(jsonMatch[1] ? jsonMatch[1].trim() : content.trim());

            // Handle both wrapped inside "quotes" key and direct array formats
            if (Array.isArray(parsed)) {
                quotes = parsed;
            } else if (parsed.quotes && Array.isArray(parsed.quotes)) {
                quotes = parsed.quotes;
            } else {
                // If it returned an object that looks like a single quote, wrap it
                if (parsed.quote && parsed.author) {
                    quotes = [parsed as QuoteSuggestion];
                }
            }
        } catch (error) {
            console.error('OpenAI Fallback Error:', error);
        }
    }

    if (!Array.isArray(quotes) || quotes.length === 0) {
        console.warn("❌ Both AI engines failed to return quotes.");
        return [];
    }

    // Validate structure briefly
    quotes = quotes.filter(q => q.quote && q.matched_value);

    // Step 2: Score them with embeddings for double-verification
    const scored = await scoreQuoteRelevance(quotes, companyValues);

    // Return top 5
    return scored.slice(0, 5);
}
