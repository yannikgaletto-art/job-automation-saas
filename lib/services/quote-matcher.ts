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

    const promptText = `Du bist ein Experte für maßgeschneiderte, tiefgründige Zitate in Bewerbungsanschreiben.

KONTEXT:
- Stelle: "${jobTitle || 'Fachkraft'}"
- Unternehmen: ${companyName}
- Kernwerte des Unternehmens: ${JSON.stringify(companyValues)}${companyVision ? `\n- Vision/Mission: ${companyVision}` : ''}

DEINE AUFGABE:
Finde 5 Zitate, die eine BRÜCKE bauen zwischen:
  (A) der spezifischen ROLLE ("${jobTitle || 'diese Position'}") und
  (B) den WERTEN/der DNA von ${companyName}.

Das Zitat soll so wirken, als ob der Bewerber sagt:
"Eure Maxime [X] erinnert mich an [Vordenker Y], der sagte: [Zitat]. Genau dieses Mindset bringe ich als [Rolle] mit."

REGELN FÜR DIE AUSWAHL:
1. VERBOTEN: Steve Jobs ("Stay hungry"), Elon Musk, Jeff Bezos, Mark Zuckerberg, Bill Gates.
   Diese sind abgedroschen. Nutze stattdessen TIEFGRÜNDIGE Denker.
2. Die Autoren MÜSSEN thematisch zur Rolle passen:
   - Consulting/Strategie → Denker wie Peter Drucker, Clayton Christensen, Roger Martin
   - Innovation/Tech → Grace Hopper, Ada Lovelace, Alan Kay, Mariana Mazzucato
   - New Work/HR/Purpose → Frederic Laloux, Amy Edmondson, Simon Sinek
   - Sales/Growth → Daniel Pink, Zig Ziglar, Jill Konrath
   - Nachhaltigkeit/Impact → Donella Meadows, Kate Raworth, Hans Rosling
   - Recht/Compliance → Ruth Bader Ginsburg, Oliver Wendell Holmes
   - Philosophie/Führung → Marcus Aurelius, Seneca, Hannah Arendt
   (Dies sind BEISPIELE. Wähle die BESTEN Matches für die konkrete Rolle + Firma.)
3. Maximal 1 Zitat darf vom CEO/Gründer von ${companyName} stammen (falls bekannt).
4. Die restlichen 4 MÜSSEN von externen Vordenkern kommen.
5. Das Feld "value_connection" MUSS die Brücke zwischen Vordenker, Rolle UND Unternehmenswert erklären.
   SCHLECHT: "Dieses Zitat passt zu Innovation."
   GUT: "Grace Hoppers Aufruf, den Status quo zu hinterfragen, spiegelt ${companyName}s Maxime [Wert X] wider — und ist genau das Mindset, das ein ${jobTitle || 'Fachkraft'} täglich braucht."
6. Sprache: Deutsch, wenn die Unternehmenswerte auf Deutsch sind. Sonst Englisch.
7. Quelle: Nenne das Format "Autor - Werk/Kontext" (z.B. "M. Aurelius - Selbstbetrachtungen"). KEINE URLs.

AUSGABE als JSON:
{
  "quotes": [
    {
      "quote": "Der exakte Zitat-Text",
      "author": "Vorname Nachname",
      "source": "Werk oder Kontext (z.B. 'Reinventing Organizations', 'Meditations')",
      "relevance_score": 0.95,
      "matched_value": "Der konkrete Unternehmenswert, auf den sich das Zitat bezieht",
      "value_connection": "Die Brücke: Warum passt dieses Zitat zur Rolle UND zum Unternehmen?",
      "language": "de"
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
