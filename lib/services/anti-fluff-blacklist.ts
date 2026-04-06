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

    // ─── Leere Kompetenzbehauptungen ──────────────────────────────────────
    {
        pattern: 'teamfähig und belastbar',
        reason: 'Leere Doppel-Adjektiv-Floskel ohne Beweis',
        category: 'cliche',
    },
    {
        pattern: 'echte Partnerschaften',
        reason: 'Subjektiver Begriff — was ist eine „echte" Partnerschaft? Konkret formulieren: Was wurde gemeinsam aufgebaut?',
        category: 'ai_marker',
    },
    {
        pattern: 'echte Verbindungen',
        reason: 'Hohler Superlativ — was „echt" bedeutet, weiß nur der Leser selbst.',
        category: 'ai_marker',
    },

    // ─── Allwissende Firmen-Sätze & Generische Kompetenz-Phrasen (2026-04-06) ──
    {
        pattern: 'genau an dieser Schnittstelle',
        reason: 'Allwissender Firmenbezug — klingt wie KI-Analyse',
        category: 'ai_marker',
    },
    {
        pattern: 'Die Kombination aus',
        reason: 'Generische Kompetenz-Aufzählung statt persönlicher Reflexion',
        category: 'ai_marker',
    },
    {
        pattern: 'Diese Kombination aus',
        reason: 'Generische Kompetenz-Aufzählung statt persönlicher Reflexion',
        category: 'ai_marker',
    },
    {
        pattern: 'ermöglicht es mir',
        reason: 'ChatGPT-typische Enabler-Phrase — ersetze durch persönliche Reflexion',
        category: 'ai_marker',
    },
    {
        pattern: 'nicht als isoliertes Thema, sondern als',
        reason: 'Allwissende Firmenbeschreibung — Bewerber kann das nicht wissen',
        category: 'ai_marker',
    },
    {
        pattern: 'als integraler Bestandteil',
        reason: 'Abstrakte Firmen-Analyse statt persönlicher Beobachtung',
        category: 'ai_marker',
    },
    {
        pattern: 'eine Denkweise, die',
        reason: 'Meta-Reflexion statt konkreter Handlung',
        category: 'ai_marker',
    },
    {
        pattern: 'eine Erkenntnis, die perfekt',
        reason: '"Perfekt zu X passt" ist generisch und anmaßend',
        category: 'ai_marker',
    },
    {
        pattern: 'bildet eine solide Grundlage',
        reason: 'Kompetenz-Auflistung statt persönlicher Reflexion',
        category: 'ai_marker',
    },
    {
        pattern: 'und vor allem die Bereitschaft',
        reason: 'Leere Behauptung ohne konkreten Beweis',
        category: 'ai_marker',
    },
    {
        pattern: 'Diese Erfahrung hat mir gezeigt, wie wichtig',
        reason: 'AI-typische Reflexion ohne Substanz',
        category: 'ai_marker',
    },

    // ─── Text 1 Audit (2026-04-06b): Omniscient Company + Broken Constructions ──
    {
        pattern: 'stellt sich ins Zentrum',
        reason: 'Allwissende Firmenbeschreibung — Bewerber weiß nicht, was die Firma intern anstrebt',
        category: 'ai_marker',
    },
    {
        pattern: 'hat mich dieser Gedanke wieder eingeholt',
        reason: 'Unklar und passiv — besser: "Dieser Gedanke prägte..."',
        category: 'ai_marker',
    },
    {
        pattern: 'Vielmehr als nur',
        reason: 'Logisch gebrochene Satzkonstruktion — wirkt gestelzt',
        category: 'ai_marker',
    },
    {
        pattern: 'gestaltet gemeinsam mit Kunden',
        reason: 'Allwissende Firmen-Innensicht — Bewerber kann das nicht wissen',
        category: 'ai_marker',
    },
    {
        pattern: 'steuert die nächste digitale',
        reason: 'Marketing-Sprache der Firma — nicht die Perspektive des Bewerbers',
        category: 'ai_marker',
    },
    {
        pattern: 'Diese Haltung erinnert mich an',
        reason: 'Generisch — die "Haltung" wird nicht konkretisiert, wirkt wie Platzhalter',
        category: 'ai_marker',
    },
    {
        pattern: 'hat mir gezeigt, wie wichtig es ist',
        reason: 'AI-Reflexion ohne Substanz — stattdessen konkretes Ergebnis nennen',
        category: 'ai_marker',
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
