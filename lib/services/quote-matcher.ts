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
    source?: string; // e.g. "Buch", "Interview", "Shareholder Letter" (KEINE URLs mehr)
    relevance_score: number; // 0-1
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
// STEP 1: Generate Quotes via OpenAI GPT-4o (Primary Engine for Batch 7)
// Perplexity is dropped for quotes because quotes rarely need live web-search,
// and LLMs are much better at philosophical/thematic value matching.
async function generateQuotesWithOpenAI(promptText: string): Promise<QuoteSuggestion[]> {
    try {
        const openai = getOpenAI();
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a specialized quote discovery assistant. Output extremely high-quality, visionary quotes strictly matching the required JSON format. DO NOT generate URLs. Use 'Author - Work' format." },
                { role: "user", content: promptText }
            ],
            response_format: { type: "json_object" },
            temperature: 0.6,
        });

        const content = response.choices[0].message.content || '{"quotes":[]}';
        const jsonMatch = content.match(/```json?\s*([\s\S]*?)```/) || [null, content];
        const parsed = JSON.parse(jsonMatch[1] ? jsonMatch[1].trim() : content.trim());

        if (Array.isArray(parsed)) {
            return parsed;
        } else if (parsed.quotes && Array.isArray(parsed.quotes)) {
            return parsed.quotes;
        } else if (parsed.quote && parsed.author) {
            return [parsed as QuoteSuggestion];
        }
        return [];
    } catch (error) {
        console.error('OpenAI Quote Generation Error:', error);
        return [];
    }
}

export async function suggestRelevantQuotes(
    companyName: string,
    companyValues: string[],
    companyVision: string = "",
    jobTitle: string = "",
    jobField: string = ""
): Promise<QuoteSuggestion[]> {
    const jobContext = jobTitle
        ? `\nStelle: ${jobTitle}${jobField ? `\nBranche/Kontext: ${jobField}` : ''}`
        : '';

    const promptText = `Du suchst Zitate, Werte oder offizielle Statements von ${companyName},
die DIREKT relevant sind für die Stelle "${jobTitle || 'diese Position'}".

Kriterien:
- Das Zitat/der Wert muss zum Tätigkeitsbereich der Stelle passen
- Quelle: Nenne das Format "Autor - Werk/Kontext" (z.B. "M. Aurelius - Selbstbetrachtungen" oder "Tim Cook - Q3 2023 Earnings Call").
- CRITICAL: Benutze KEINE HTTP-URLs (` + "`" + `http://...` + "`" + `)! Nur plain text Namen.
- JA: Spezifische Aussagen über Kultur, Rolle, Team, Wachstumsstrategie die zur Stelle passen

Unternehmen: ${companyName}
Kernwerte: ${JSON.stringify(companyValues)}${companyVision ? `\nVision: ${companyVision}` : ''}${jobContext}

CRITICAL INSTRUCTIONS ON QUOTE SELECTION:
1. You may include MAXIMUM ONE (1) quote from the CEO/Founder of ${companyName}.
2. The remaining 4 quotes MUST be from diverse external sources (renowned authors, historical innovators, philosophers, industry thought leaders) whose profound ideas logically align with the company's mission/values.
3. Example: If the company focuses on green energy or sustainability, find a profound quote from an environmentalist or author about system change or the planet. The goal is to show deep thematic alignment, not just name-drop the company.
4. DO NOT select quotes about specific recent news events, stock prices, or funding rounds. Focus on timeless values and overarching visions.
5. Support German language if the company values are in German, otherwise English.

Return exactly 5 quotes as a strict JSON array matching this exact structure:
{
  "quotes": [
    {
      "quote": "The actual quote text",
      "author": "Author Name (Role/Company)",
      "source": "Source context (e.g. 'Letter to Shareholders' - NO URLs)",
      "relevance_score": 0.95,
      "matched_value": "Customer Obsession",
      "value_connection": "This quote emphasizes putting the customer first...",
      "language": "en"
    }
  ]
}`;

    let quotes: QuoteSuggestion[] = await generateQuotesWithOpenAI(promptText);


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
