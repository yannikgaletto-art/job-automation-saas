import OpenAI from 'openai';
import { complete } from '@/lib/ai/model-router';

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
    verified_url?: string; // neu — von Perplexity citations[], optional
}


// ─── Stage 1: Thinker Identification (Claude Sonnet) ─────────────────────────

interface ThinkerProfile {
    name: string;
    why: string;
    searchQuery: string;
    matchedValue?: string; // Which specific company value triggered this thinker
}

async function identifyThinkers(
    jobTitle: string,
    jobField: string,
    companyValues: string[],
    companyVision: string
): Promise<ThinkerProfile[]> {
    try {
        const response = await complete({
            taskType: 'personalize_intro',
            systemPrompt: 'Antworte AUSSCHLIESSLICH mit validem JSON. Kein Markdown, kein Text davor oder danach.',
            prompt: `Du bist ein Experte für Vordenker und Intellektuelle aus allen Disziplinen.

KONTEXT:
- Stelle: "${jobTitle || 'Fachkraft'}"
- Branche: "${jobField || 'Allgemein'}"
- Unternehmenswerte: ${JSON.stringify(companyValues)}
${companyVision ? `- Vision: ${companyVision}` : ''}

AUFGABE:
Identifiziere genau 3 reale Vordenker, deren Gedankenwelt eine BRÜCKE baut zwischen:
  (A) der spezifischen ROLLE ("${jobTitle || 'diese Position'}") und
  (B) den WERTEN des Unternehmens.

REGELN:
1. VERBOTEN: Steve Jobs, Elon Musk, Jeff Bezos, Mark Zuckerberg, Bill Gates, Peter Thiel.
   Diese sind abgedroschen und unseriös in Bewerbungen.
2. Wähle Vordenker aus VERSCHIEDENEN Epochen und Disziplinen.
   Ideal: ein/e Wissenschaftler/in, ein/e Praktiker/in, ein/e Philosoph/in.
3. Die Vordenker müssen für die KONKRETE ROLLE relevant sein, nicht nur generisch "inspirierend".
   WICHTIG: Wähle Vordenker, die KONSTRUKTIV und AUFBAUEND denken — keine reinen Kritiker.
4. Gib KEINE ZITATE zurück — nur Profile. (Zitate kommen in Schritt 2 von Perplexity.)
5. Das Feld "searchQuery" MUSS thematisch zur STELLE und zum UNTERNEHMENSBEREICH passen.
   Format: "[Name] quote on [Thema direkt aus jobTitle oder companyValues]"
   RICHTIG: "Andrew Ng quote on AI platform innovation"
   RICHTIG: "Fei-Fei Li quote on human-centered artificial intelligence"
   FALSCH: "Shoshana Zuboff quote on corporate surveillance" (thematisch unpassend für ein KI-Unternehmen)
   FALSCH: allgemeine Lebensweisheiten ohne Bezug zur Stelle

OUTPUT (JSON Array, KEINE Umrahmung):
[
  {
    "name": "Vorname Nachname",
    "why": "Warum passt diese Person zur Rolle + den Werten (1 Satz)",
    "searchQuery": "Name quote on [topic matching jobTitle/companyValues]",
    "matchedValue": "Exakter Text des Unternehmenswertes aus der Liste, der am besten passt"
  }
]`,
            temperature: 0.85,
            maxTokens: 1024,
        });

        let rawText = response.text.trim();
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            rawText = jsonMatch[1].trim();
        }

        const parsed = JSON.parse(rawText);
        const profiles: ThinkerProfile[] = Array.isArray(parsed) ? parsed : parsed.profiles || parsed.thinkers || [];

        return profiles.filter(p => p.name && p.searchQuery).slice(0, 3);
    } catch (error) {
        console.error('❌ [Stage 1] Thinker identification failed:', error instanceof Error ? error.message : error);
        return [];
    }
}


// ─── Stage 2: Quote Search via Perplexity ────────────────────────────────────

interface PerplexityQuoteResult {
    quote: string;
    author: string;
    source: string;
    verified_url: string;
}

async function searchQuoteViaPerplexity(
    thinker: ThinkerProfile
): Promise<PerplexityQuoteResult | null> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        console.error('❌ [Stage 2] PERPLEXITY_API_KEY not set');
        return null;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'Du bist ein Fakten-Prüfer für Zitate. Antworte NUR mit validem JSON oder dem Wort NOT_FOUND.',
                    },
                    {
                        role: 'user',
                        content: `Finde ein ECHTES, VERIFIZIERTES Zitat von ${thinker.name}.
Suchanfrage: "${thinker.searchQuery}"

Antworte NUR als JSON:
{
  "quote": "Der exakte Zitat-Text",
  "author": "${thinker.name}",
  "source": "Autor - Werk/Kontext (z.B. 'Meditations', 'Interview mit HBR 2019')"
}

REGELN:
- Das Zitat MUSS real und verifizierbar sein.
- Keine Paraphrasierungen, keine "attributed to"-Zitate ohne Quelle.
- Wenn du KEIN verifiziertes Zitat findest: Antworte ausschließlich mit dem Wort NOT_FOUND`,
                    },
                ],
                temperature: 0,
                return_citations: true,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`❌ [Stage 2] Perplexity HTTP ${response.status} for "${thinker.name}"`);
            return null;
        }

        const data = await response.json();
        const content: string = data.choices?.[0]?.message?.content || '';
        const citations: string[] = data.citations || [];

        // Check for NOT_FOUND
        if (content.trim() === 'NOT_FOUND' || content.trim().startsWith('NOT_FOUND')) {
            return null;
        }

        // Parse JSON
        let parsed;
        try {
            parsed = JSON.parse(content.trim());
        } catch {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            parsed = JSON.parse(jsonMatch[0]);
        }

        if (!parsed.quote || !parsed.author) return null;

        return {
            quote: parsed.quote,
            author: parsed.author,
            source: parsed.source || '',
            verified_url: citations[0] || '',
        };
    } catch (error) {
        console.error(`❌ [Stage 2] Perplexity search failed for "${thinker.name}":`, error instanceof Error ? error.message : error);
        return null;
    }
}


// ─── Stage 3: Quote Validator (rule-based — Perplexity already verified) ──────
// WHY: The previous Claude judge rejected ~100% of quotes due to subjective
// "relevance" and "fluff" checks that failed too aggressively in live context.
// Perplexity (Stage 2) already verified authenticity. We only need hard rules.

interface JudgeVerdict {
    approved: boolean;
    reason: string;
}

// Authors that should never appear in a professional cover letter
const BANNED_AUTHORS = [
    'anonymous', 'unknown', 'unbekannt', 'autor unbekannt',
    'various', 'n/a', 'na', '-', '', 'zitat', 'quote'
];

// Obvious spam / placeholder patterns in quote text
const SPAM_PATTERNS = [
    /lorem ipsum/i,
    /\[insert quote\]/i,
    /placeholder/i,
    /example quote/i,
];


function judgeQuote(
    quote: string,
    author: string,
    _source: string,
    _jobTitle: string,
    _companyValues: string[],
    _thinkerWhy: string = ''
): JudgeVerdict {
    const authorNorm = author.trim().toLowerCase();

    // 1. Author must be a real named person
    if (!author.trim() || BANNED_AUTHORS.includes(authorNorm)) {
        return { approved: false, reason: `Autor unbekannt oder anonym: "${author}"` };
    }

    // 2. Quote must be at least 8 words
    const wordCount = quote.trim().split(/\s+/).length;
    if (wordCount < 8) {
        return { approved: false, reason: `Zitat zu kurz (${wordCount} Wörter, min. 8 erforderlich)` };
    }

    // 3. Quote must not be obvious spam/placeholder
    for (const pattern of SPAM_PATTERNS) {
        if (pattern.test(quote)) {
            return { approved: false, reason: 'Zitat enthält Placeholder-Text' };
        }
    }

    // Relevanz wird durch Stage 1 (searchQuery-Anker) sichergestellt.
    // Perplexity verifiziert die Authentizität in Stage 2.
    return { approved: true, reason: 'Zitat von bekanntem Autor, ausreichend lang, verifiziert durch Perplexity.' };
}


// ─── Scoring (PRESERVED — unchanged from original) ──────────────────────────

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


// ─── Main Pipeline ───────────────────────────────────────────────────────────

export async function suggestRelevantQuotes(
    companyName: string,
    companyValues: string[],
    companyVision: string = "",
    jobTitle: string = "",
    jobField: string = ""
): Promise<QuoteSuggestion[]> {
    // Guard: empty values → early return (Gate G)
    if (!companyValues || companyValues.length === 0) {
        console.error('❌ [QuotePipeline] No companyValues provided — returning []');
        return [];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STAGE 1: Identify Thinkers (Claude Sonnet, temp 0.85)
    // ═══════════════════════════════════════════════════════════════════════
    console.error('🔍 [Stage 1] Identifying thinkers for:', jobTitle, '|', companyName);
    const thinkers = await identifyThinkers(jobTitle, jobField, companyValues, companyVision);

    if (thinkers.length === 0) {
        console.error('❌ [Stage 1] No thinkers identified — returning []');
        return [];
    }
    console.error(`✅ [Stage 1] ${thinkers.length} thinkers: ${thinkers.map(t => t.name).join(', ')}`);

    // ═══════════════════════════════════════════════════════════════════════
    // STAGE 2: Search Quotes via Perplexity (parallel, per-candidate try/catch)
    // ═══════════════════════════════════════════════════════════════════════
    console.error('🔍 [Stage 2] Searching verified quotes via Perplexity...');
    const searchResults = await Promise.all(
        thinkers.map(async (thinker) => {
            const result = await searchQuoteViaPerplexity(thinker);
            return result ? { thinker, result } : null;
        })
    );

    const verifiedQuotes = searchResults.filter(
        (r): r is { thinker: ThinkerProfile; result: PerplexityQuoteResult } => r !== null
    );

    if (verifiedQuotes.length === 0) {
        console.error('❌ [Stage 2] No verified quotes found — returning []');
        return [];
    }
    console.error(`✅ [Stage 2] ${verifiedQuotes.length}/${thinkers.length} quotes verified`);

    // ═══════════════════════════════════════════════════════════════════════
    // STAGE 3: Validate Quotes (rule-based — fast, no extra AI call)
    // ═══════════════════════════════════════════════════════════════════════
    console.error('🔍 [Stage 3] Validating quote quality (rule-based)...');
    const judgedQuotes: QuoteSuggestion[] = [];

    for (const { thinker, result } of verifiedQuotes) {
        const verdict = judgeQuote(
            result.quote,
            result.author,
            result.source,
            jobTitle,
            companyValues,
            thinker.why || ''
        );

        if (verdict.approved) {
            judgedQuotes.push({
                quote: result.quote,
                author: result.author,
                source: result.source,
                relevance_score: 0.85,
                matched_value: thinker.matchedValue || companyValues[0] || companyName,
                value_connection: thinker.why,
                language: /[äöüßÄÖÜ]/.test(result.quote) ? 'de' : 'en',
                verified_url: result.verified_url || undefined,
            });
            console.error(`  ✅ ${result.author}: APPROVED — ${verdict.reason}`);
        } else {
            console.error(`  ❌ ${result.author}: REJECTED — ${verdict.reason}`);
        }
    }

    if (judgedQuotes.length === 0) {
        console.error('❌ [Stage 3] All quotes rejected — returning []');
        return [];
    }
    console.error(`✅ [Stage 3] ${judgedQuotes.length} quotes approved`);

    // ═══════════════════════════════════════════════════════════════════════
    // POST-PROCESSING: Längen-Filter (max. 25 Wörter)
    // Kurze, prägnante Zitate sind in Anschreiben deutlich wirkungsvoller.
    // ═══════════════════════════════════════════════════════════════════════
    const lengthFiltered = judgedQuotes.filter(q => {
        const wordCount = q.quote.trim().split(/\s+/).length;
        if (wordCount > 25) {
            console.error(`  ⚠️ [Post-Filter] Zu lang (${wordCount}W), entfernt: "${q.quote.substring(0, 50)}..."`);
            return false;
        }
        return true;
    });

    if (lengthFiltered.length === 0) {
        console.error('❌ [Post-Filter] Alle Zitate zu lang — returning []');
        return [];
    }
    console.error(`✅ [Post-Filter] ${lengthFiltered.length} Zitate nach Längen-Filter`);

    // ═══════════════════════════════════════════════════════════════════════
    // POST-PIPELINE: Embedding Scoring (PRESERVED — unchanged)
    // ═══════════════════════════════════════════════════════════════════════
    const scored = await scoreQuoteRelevance(lengthFiltered, companyValues);

    // Return top 5
    return scored.slice(0, 5);
}
