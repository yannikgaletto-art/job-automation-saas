/**
 * Anti-Fluff Blacklist — Pathly V2.0
 * Central blacklist of 15+ patterns that destroy cover letter authenticity.
 * Used by both cover-letter-validator.ts (hard validation) and
 * cover-letter-generator.ts (post-generation scan + re-gen feedback).
 *
 * Reference: QUALITY_CV_COVER_LETTER.md B1.2
 */

export interface BlacklistPattern {
    pattern: string;
    reason: string;
    category: 'cliche' | 'ai_marker' | 'passive' | 'structure' | 'source_leak';
}

/**
 * 15+ forbidden patterns. Case-insensitive matching.
 * These destroy authenticity and must never appear in generated cover letters.
 */
export const BLACKLIST_PATTERNS: BlacklistPattern[] = [
    // ─── Clichés & Floskeln ───────────────────────────────────────────────
    {
        pattern: 'hiermit bewerbe ich mich',
        reason: 'Generische Floskel — klingt wie eine Standard-Vorlage',
        category: 'cliche',
    },
    {
        pattern: 'mit großem Interesse',
        reason: 'Austauschbare Phrase ohne Substanz',
        category: 'cliche',
    },
    {
        pattern: 'mit großer Begeisterung',
        reason: 'Übertriebene Enthusiasmus-Floskel',
        category: 'cliche',
    },
    {
        pattern: 'I am excited to apply',
        reason: 'Generic English cliché',
        category: 'cliche',
    },
    {
        pattern: 'I am writing to apply',
        reason: 'Generic English opening',
        category: 'cliche',
    },
    {
        pattern: 'meine Leidenschaft für',
        reason: 'Substanzlose Behauptung ohne Beweis',
        category: 'cliche',
    },
    {
        pattern: 'Ich brenne für',
        reason: 'Abgegriffene Metapher — klingt nach KI',
        category: 'cliche',
    },

    // ─── AI-Marker (sofort erkennbar als KI-generiert) ────────────────────
    {
        pattern: 'Ich bin überzeugt, dass',
        reason: 'Typischer GPT-Marker — klingt generisch',
        category: 'ai_marker',
    },
    {
        pattern: 'Ich freue mich sehr darauf',
        reason: 'GPT-typische Schlussformel',
        category: 'ai_marker',
    },
    {
        pattern: 'ideal auf diese Stelle',
        reason: 'Generische Eigenbewertung ohne Substanz',
        category: 'ai_marker',
    },
    {
        pattern: 'ideal zu Ihrem Team passe',
        reason: 'GPT-Floskel — Selbstbewertung statt Beweis',
        category: 'ai_marker',
    },
    {
        pattern: 'In der heutigen schnelllebigen',
        reason: 'Kalenderweisheit / Allgemeinplatz',
        category: 'ai_marker',
    },
    {
        pattern: 'Ich glaube fest daran',
        reason: 'Substanzlose Überzeugungsaussage',
        category: 'ai_marker',
    },

    // ─── Passive / substanzlose Konstrukte ────────────────────────────────
    {
        pattern: 'konnte ich feststellen',
        reason: 'Passivkonstruktion ohne Substanz',
        category: 'passive',
    },
    {
        pattern: 'wurde mir bewusst',
        reason: 'Passiv und vage',
        category: 'passive',
    },
    {
        pattern: 'Erfolg entsteht, wenn',
        reason: 'Kalenderspruch — substanzlose Allgemeinweisheit',
        category: 'ai_marker',
    },
    {
        pattern: 'Leidenschaft ist mein Antrieb',
        reason: 'Leere Behauptung ohne Beweis',
        category: 'cliche',
    },

    // ─── Quellen-Leaks ────────────────────────────────────────────────────
    {
        pattern: 'auf LinkedIn gefunden',
        reason: 'Verrät Scraping-Quelle (unprofessionell)',
        category: 'source_leak',
    },
    {
        pattern: 'laut meiner Recherche',
        reason: 'Klingt robotisch / KI-generiert',
        category: 'source_leak',
    },
    {
        pattern: 'wie ich bei Google sah',
        reason: 'Verrät Recherche-Methode (unprofessionell)',
        category: 'source_leak',
    },
    {
        pattern: 'durch künstliche Intelligenz',
        reason: 'Niemals KI-Nutzung erwähnen',
        category: 'source_leak',
    },
    {
        pattern: 'meine Analyse ergab',
        reason: 'Zu formal/robotisch',
        category: 'source_leak',
    },

    // ─── Struktur-Verbote ─────────────────────────────────────────────────
    {
        pattern: 'steht für Innovation',
        reason: 'Generische Firmenbeschreibung — für jede Firma kopierbares Statement',
        category: 'structure',
    },
    {
        pattern: 'verkörpert die Werte',
        reason: 'Generische Firmenbeschreibung',
        category: 'structure',
    },
];

export interface FluffScanResult {
    found: boolean;
    matches: Array<{
        pattern: string;
        reason: string;
        category: BlacklistPattern['category'];
    }>;
}

/**
 * Scan generated text for blacklisted patterns.
 * Returns { found: true, matches: [...] } if any patterns are detected.
 */
export function scanForFluff(text: string): FluffScanResult {
    const lowerText = text.toLowerCase();
    const matches: FluffScanResult['matches'] = [];

    for (const { pattern, reason, category } of BLACKLIST_PATTERNS) {
        if (lowerText.includes(pattern.toLowerCase())) {
            matches.push({ pattern, reason, category });
        }
    }

    if (matches.length > 0) {
        console.warn(`⚠️ [Anti-Fluff] ${matches.length} Blacklist-Treffer gefunden: ${matches.map(m => `"${m.pattern}"`).join(', ')}`);
    }

    return {
        found: matches.length > 0,
        matches,
    };
}

/**
 * Generate a prompt section listing all forbidden patterns.
 * Used in buildSystemPrompt() to instruct Claude.
 */
export function buildBlacklistPromptSection(): string {
    return `VERBOTENE PHRASEN (HARD RULES — niemals verwenden):
${BLACKLIST_PATTERNS.map(p => `- "${p.pattern}" (${p.reason})`).join('\n')}
- Sätze über 30 Wörter ohne Komma
- Sätze die bei einem Leser den Gedanken auslösen: "Das hat ChatGPT geschrieben"
- Aussagen die für jede Firma 1:1 kopierbar wären`;
}
