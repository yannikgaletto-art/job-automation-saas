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
 * STEP 1: Find quotes via Perplexity
 */
export async function suggestRelevantQuotes(
    companyValues: string[],
    jobField: string = "Technology", // Default
    companyVision: string = ""
): Promise<QuoteSuggestion[]> {
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
                        content: `Based on these company values: ${JSON.stringify(companyValues)}
         ${companyVision ? `and vision: ${companyVision}` : ''}
         and industry/field: ${jobField}
         
         Find exactly 5 high-quality matching quotes from:
         - CEOs/Founders in ${jobField}
         - Renowned thought leaders
         - Historical innovators
         
         Requirements:
         1. Quotes must be DIRECTLY relevant to one of the provided company values.
         2. Map each quote to the specific company value it supports.
         3. Assign a relevance score (0.0 - 1.0) based on how well it fits the value.
         4. Avoid overused clichés (e.g., "Stay hungry, stay foolish" unless it's a perfect match for a specific value).
         5. Support German language if the company values are in German, otherwise English.
         
         Return a strict JSON array:
         [
           {
             "quote": "The actual quote text",
             "author": "Author Name (Role/Company)",
             "source": "Source context (e.g. 'Letter to Shareholders 1997')",
             "relevance_score": 0.95,
             "matched_value": "Customer Obsession",
             "value_connection": "This quote emphasizes putting the customer first...",
             "language": "en"
           }
         ]`
                    }
                ],
                temperature: 0.2
            })
        });

        if (!response.ok) {
            console.warn(`Perplexity Quote API error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        const jsonMatch = content.match(/```json?\s*([\s\S]*?)```/) || [null, content];
        let quotes: QuoteSuggestion[] = [];

        try {
            quotes = JSON.parse(jsonMatch[1] ? jsonMatch[1].trim() : content.trim());
        } catch (e) {
            console.warn('Failed to parse Quote JSON', e);
            return [];
        }

        if (!Array.isArray(quotes)) return [];

        // Validate structure briefly
        quotes = quotes.filter(q => q.quote && q.matched_value);

        // Step 2: Score them with embeddings for double-verification
        const scored = await scoreQuoteRelevance(quotes, companyValues);

        // Return top 5
        return scored.slice(0, 5);

    } catch (error) {
        console.error('Suggest Quotes Error:', error);
        return [];
    }
}
