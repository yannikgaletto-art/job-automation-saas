import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client (isolated — does NOT use shared model-router.ts)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

export interface QuoteSuggestion {
    quote: string;
    author: string;
    source?: string; // e.g. "Buch", "Interview", "Shareholder Letter"
    relevance_score: number; // 0-1
    match_score?: number; // 0-1 (kept for interface compatibility)
    matched_value: string; // The specific company value this quote supports
    value_connection: string; // Explanation
    language: 'en' | 'de';
    verified_url?: string; // kept for interface compatibility (always undefined now)
}


// ─── Banned Authors ──────────────────────────────────────────────────────────
// Authors that should never appear in a professional cover letter
const BANNED_AUTHORS = [
    'anonymous', 'unknown', 'unbekannt', 'autor unbekannt',
    'various', 'n/a', 'na', '-', '', 'zitat', 'quote'
];

// Reduced from original list — Bill Gates is now allowed per user's real examples.
// Only polarizing/overused tech CEOs remain banned.
const BANNED_THINKERS = ['elon musk', 'jeff bezos', 'mark zuckerberg'];

// Obvious spam / placeholder patterns in quote text
const SPAM_PATTERNS = [
    /lorem ipsum/i,
    /\[insert quote\]/i,
    /placeholder/i,
    /example quote/i,
];


// ─── Stage 1: Claude One-Shot (Thinker + Quote in a single call) ─────────────

interface ClaudeQuoteResult {
    name: string;
    quote: string;
    source: string;
    why: string;
    matchedValue: string;
    confidence: 'high' | 'low';
}

async function fetchQuotesFromClaude(
    companyName: string,
    companyValues: string[],
    companyVision: string,
    jobTitle: string,
    jobField: string,
    language: 'de' | 'en'
): Promise<ClaudeQuoteResult[]> {
    const langInstruction = language === 'de'
        ? 'Zitate dürfen auf Deutsch ODER Englisch sein. Bei deutschen Zitaten: verwende korrekt ä, ö, ü.'
        : 'Quotes should be in English.';

    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 1500,
            temperature: 0.8,
            system: 'Du bist ein Experte für Vordenker und Intellektuelle aus allen Epochen und Disziplinen. Antworte AUSSCHLIESSLICH mit validem JSON. Kein Markdown, kein Text davor oder danach.',
            messages: [{
                role: 'user',
                content: `KONTEXT:
- Unternehmen: "${companyName}"
- Stelle: "${jobTitle || 'Fachkraft'}"
- Branche: "${jobField || 'Allgemein'}"
- Unternehmenswerte: ${JSON.stringify(companyValues)}
${companyVision ? `- Vision: "${companyVision}"` : ''}

AUFGABE:
Gib mir 3 echte, bekannte Vordenker mit je EINEM echten Zitat, das thematisch zum Unternehmen und seinem Kontext passt.

REGELN:
1. VERBOTEN als Vordenker: ${BANNED_THINKERS.join(', ')}. Zu polarisierend.
2. Wähle Vordenker aus VERSCHIEDENEN Epochen und Disziplinen (Wissenschaft, Praxis, Philosophie).
3. Das Zitat muss REAL sein — ein Zitat, das du sicher aus deinem Trainingswissen kennst.
   - KEINE Paraphrasierungen, KEINE "attributed to"-Zitate.
   - Wenn du dir bei einem Zitat NICHT 100% sicher bist, setze "confidence": "low".
4. Das Zitat muss thematisch zum UNTERNEHMEN und seinen WERTEN passen, nicht zwingend zur exakten Stelle.
5. Max. 30 Wörter pro Zitat. Kurze, prägnante Zitate wirken in Anschreiben besser.
6. ${langInstruction}
7. "source" = Werk/Buch/Rede/Interview aus dem das Zitat stammt (z.B. "Reinventing Organizations", "TED Talk 2014").

OUTPUT (JSON Array):
[
  {
    "name": "Vorname Nachname",
    "quote": "Der exakte Zitat-Text",
    "source": "Werk oder Kontext des Zitats",
    "why": "Warum passt dieses Zitat zum Unternehmen (1 Satz, deutsch)",
    "matchedValue": "Exakter Text des Unternehmenswertes, der am besten passt",
    "confidence": "high"
  }
]`
            }]
        });

        const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

        // Parse JSON — handle potential markdown wrapping
        let jsonText = rawText;
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonText = jsonMatch[1].trim();
        }

        const parsed = JSON.parse(jsonText);
        const results: ClaudeQuoteResult[] = Array.isArray(parsed) ? parsed : parsed.quotes || [];

        return results.filter(r => r.name && r.quote && r.confidence);
    } catch (error) {
        console.error('❌ [Stage 1] Claude One-Shot failed:', error instanceof Error ? error.message : error);
        return [];
    }
}


// ─── Stage 2: Rule-Based Validation ──────────────────────────────────────────

interface ValidationResult {
    approved: boolean;
    reason: string;
}

function validateQuote(
    quote: string,
    author: string,
    confidence: 'high' | 'low'
): ValidationResult {
    const authorNorm = author.trim().toLowerCase();

    // 1. Author must be a real named person
    if (!author.trim() || BANNED_AUTHORS.includes(authorNorm)) {
        return { approved: false, reason: `Autor unbekannt oder anonym: "${author}"` };
    }

    // 2. Author must not be banned thinker
    if (BANNED_THINKERS.some(b => authorNorm.includes(b))) {
        return { approved: false, reason: `Autor auf Bannliste: "${author}"` };
    }

    // 3. Quote must be at least 8 words
    const wordCount = quote.trim().split(/\s+/).length;
    if (wordCount < 8) {
        return { approved: false, reason: `Zitat zu kurz (${wordCount} Wörter, min. 8)` };
    }

    // 4. Quote must not exceed 30 words
    if (wordCount > 30) {
        return { approved: false, reason: `Zitat zu lang (${wordCount} Wörter, max. 30)` };
    }

    // 5. Quote must not be obvious spam/placeholder
    for (const pattern of SPAM_PATTERNS) {
        if (pattern.test(quote)) {
            return { approved: false, reason: 'Zitat enthält Placeholder-Text' };
        }
    }

    // 6. NEW: Anti-hallucination — reject low-confidence quotes
    if (confidence === 'low') {
        return { approved: false, reason: 'Claude unsicher über Authentizität (confidence: low)' };
    }

    // 7. NEW: Anti-hallucination — reject quotes shorter than 5 words within quotation marks
    const innerQuoteMatch = quote.match(/["""„](.*?)["""]/);
    if (innerQuoteMatch && innerQuoteMatch[1].trim().split(/\s+/).length < 5) {
        return { approved: false, reason: 'Zitat-Fragment zu kurz (< 5 Wörter innerhalb Anführungszeichen)' };
    }

    return { approved: true, reason: 'Bekannter Autor, ausreichende Länge, hohe Konfidenz.' };
}


// ─── Main Pipeline (2 Stages) ────────────────────────────────────────────────

export async function suggestRelevantQuotes(
    companyName: string,
    companyValues: string[],
    companyVision: string = '',
    jobTitle: string = '',
    jobField: string = '',
    language: 'de' | 'en' = 'de'
): Promise<QuoteSuggestion[]> {
    // Guard: empty values → early return
    if (!companyValues || companyValues.length === 0) {
        console.error('❌ [QuotePipeline] No companyValues provided — returning []');
        return [];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STAGE 1: Claude One-Shot (Thinker + Quote in one call)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🔍 [Stage 1] Claude One-Shot for:', jobTitle, '|', companyName);
    const claudeResults = await fetchQuotesFromClaude(
        companyName, companyValues, companyVision, jobTitle, jobField, language
    );

    if (claudeResults.length === 0) {
        console.error('❌ [Stage 1] No quotes from Claude — returning []');
        return [];
    }
    console.log(`✅ [Stage 1] ${claudeResults.length} quotes: ${claudeResults.map(r => r.name).join(', ')}`);

    // ═══════════════════════════════════════════════════════════════════════
    // STAGE 2: Rule-Based Validation (fast, no AI call)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🔍 [Stage 2] Validating quotes (rule-based)...');
    const approvedQuotes: QuoteSuggestion[] = [];

    for (const result of claudeResults) {
        const verdict = validateQuote(result.quote, result.name, result.confidence);

        if (verdict.approved) {
            approvedQuotes.push({
                quote: result.quote,
                author: result.name,
                source: result.source || '',
                relevance_score: 0.85,
                match_score: 0.85, // fixed score — no embedding scoring anymore
                matched_value: result.matchedValue || companyValues[0] || companyName,
                value_connection: result.why,
                language: /[äöüßÄÖÜ]/.test(result.quote) ? 'de' : 'en',
            });
            console.log(`  ✅ ${result.name}: APPROVED — ${verdict.reason}`);
        } else {
            console.log(`  ❌ ${result.name}: REJECTED — ${verdict.reason}`);
        }
    }

    if (approvedQuotes.length === 0) {
        console.error('❌ [Stage 2] All quotes rejected — returning []');
        return [];
    }
    console.log(`✅ [Stage 2] ${approvedQuotes.length} quotes approved`);

    // Return top 3 (was top 5, but Claude only generates 3)
    return approvedQuotes.slice(0, 3);
}
