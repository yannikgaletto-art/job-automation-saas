/**
 * Anti-Fluff Blacklist — Pathly V2.0
 * Single Source of Truth for ALL forbidden cover letter patterns (~70 entries).
 *
 * Consolidated from 4 sources (2026-04-09 Pipeline Refactoring):
 *   - BLACKLIST_PATTERNS (this file, 41 originals)
 *   - DE_BLACKLIST (cover-letter-judge.ts)
 *   - EN_BLACKLIST (cover-letter-judge.ts)
 *   - HARD_PHRASE_BLACKLIST (cover-letter-validator.ts)
 *
 * Reference: QUALITY_CV_COVER_LETTER.md B1.2
 *
 * 3 Consumers:
 *   1. Prompt Builder: buildBlacklistPromptSection() → System Prompt
 *   2. Validator: Regex scan → errors before Judge
 *   3. Judge: buildJudgeBlacklistSection(lang) → Haiku Judge Prompt
 */

export interface BlacklistPattern {
    pattern: string;
    reason: string;
    category: 'cliche' | 'ai_marker' | 'passive' | 'structure' | 'source_leak';
    /** Optional feedback string for hard-stop phrases that survive the LLM Judge.
     *  Used by cover-letter-validator.ts to inject explicit re-generation guidance. */
    feedback?: string;
}

/**
 * ~70 forbidden patterns. Case-insensitive matching.
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
        reason: 'Klingt allwissend und belehrend — niemand hat nach der Erkenntnis gefragt',
        category: 'ai_marker',
        feedback: 'Ersetze durch "Dieser Gedanke begleitete mich bei..." oder "Diese Erfahrung zeigte mir, dass..."',
    },
    {
        pattern: 'wurde mir klar',
        reason: 'Allwissend-Marker — suggeriert eine göttliche Erkenntnis statt konkreter Erfahrung',
        category: 'ai_marker',
        feedback: 'Ersetze durch "Dieser Gedanke begleitete mich bei..." oder "Diese Erfahrung zeigte mir, dass..."',
    },
    {
        pattern: 'wurde mir jedoch klar',
        reason: 'Verstärkte Version des allwissend-Markers — doppelt belehrend',
        category: 'ai_marker',
        feedback: 'Ersetze durch "Diese Erfahrung zeigte mir, dass..." oder formuliere den Kontext konkreter.',
    },
    {
        pattern: 'bin ich zu der Erkenntnis gelangt',
        reason: 'Philosophisches Pathos — klingt akademisch-KI und aufgeblasen',
        category: 'ai_marker',
        feedback: 'Kürzer und konkreter: "Dabei habe ich verstanden, dass..." oder "Das zeigte mir..."',
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
        feedback: 'Entferne sofort den Ausdruck "Vielmehr als nur" — er ist logisch gebrochen (korrekt wäre "Mehr als nur", aber auch das ist gestelzt). Formuliere den Satz komplett um.',
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

    // ─── Intro-Doppelpunkt-Pattern (2026-04-07: Defect #1 — T1 Audit) ──────────
    {
        pattern: 'fiel mir auf:',
        reason: 'Doppelpunkt nach Beobachtung ist ein KI-Marker. Stattdessen: vollständiger Aussagesatz mit "dass"',
        category: 'ai_marker',
    },

    // ─── Exzellenz-Compounds (2026-04-07: Defect #3 — nur Compounds, nicht das Einzelwort) ──
    {
        pattern: 'technische Exzellenz',
        reason: 'Pompöse KI-Trope — nicht authentisch',
        category: 'ai_marker',
    },
    {
        pattern: 'wissenschaftliche Exzellenz',
        reason: 'Pompöse KI-Trope — nicht authentisch',
        category: 'ai_marker',
    },
    {
        pattern: 'strategische Exzellenz',
        reason: 'Pompöse KI-Trope — nicht authentisch',
        category: 'ai_marker',
    },
    {
        pattern: 'operative Exzellenz',
        reason: 'Pompöse KI-Trope — nicht authentisch',
        category: 'ai_marker',
    },

    // ─── Meta-Opener verboten (2026-04-07: Defect #5 — "Weil Sie jemanden suchen") ──
    {
        pattern: 'Weil Sie jemanden suchen',
        reason: 'Meta-Formulierung statt konkretem Aufgabenbezug — zitiere stattdessen eine konkrete Aufgabe aus der Stelle',
        category: 'ai_marker',
    },
    {
        pattern: 'Weil ihr jemanden sucht',
        reason: 'Meta-Formulierung (Du-Form) statt konkretem Aufgabenbezug',
        category: 'ai_marker',
    },

    // ─── Generische Absatz-Enden (2026-04-07: Defect #6 — KI-Reflexions-Varianten) ──
    {
        pattern: 'schärfte meinen Blick dafür',
        reason: 'KI-generische Reflexion am Absatzende — stattdessen konkretes Ergebnis oder Überzeugung',
        category: 'ai_marker',
    },
    {
        pattern: 'öffnete mir die Augen für',
        reason: 'KI-generische Reflexion — abgegriffen',
        category: 'ai_marker',
    },
    {
        pattern: 'hat mein Verständnis dafür geprägt',
        reason: 'KI-generische Reflexion — substanzlos',
        category: 'ai_marker',
    },

    // ─── NEW: Merged from Judge DE_BLACKLIST / EN_BLACKLIST (2026-04-09) ──────────
    {
        pattern: 'an der Schnittstelle zwischen',
        reason: 'KI-Trope — nur diese Konstruktion verboten, das Wort allein ist erlaubt',
        category: 'ai_marker',
    },
    {
        pattern: 'echten Mehrwert',
        reason: 'Leerphrase — was ist schon "echt"? Sei konkreter.',
        category: 'ai_marker',
    },
    {
        pattern: 'echter Mehrwert',
        reason: 'Leerphrase — was ist schon "echt"? Sei konkreter.',
        category: 'ai_marker',
    },
    {
        pattern: 'Doch ich lernte schnell',
        reason: 'Coaching-Klischee — klingt nach KI-Template',
        category: 'ai_marker',
    },
    {
        pattern: 'echte Werte',
        reason: 'Leerphrase ohne konkreten Inhalt',
        category: 'ai_marker',
    },
    {
        pattern: 'stehen und fallen',
        reason: 'Allwissens-Konstrukt: "X steht und fällt damit, dass..."',
        category: 'ai_marker',
    },
    {
        pattern: 'I am confident that',
        reason: 'Generic English AI boilerplate',
        category: 'ai_marker',
    },
    {
        pattern: 'ideal for this position',
        reason: 'Generic English self-assessment',
        category: 'ai_marker',
    },
    {
        pattern: 'With great enthusiasm',
        reason: 'Generic English opening cliché',
        category: 'cliche',
    },
    {
        pattern: 'real value',
        reason: 'Empty English phrase — be more specific',
        category: 'ai_marker',
    },
    {
        pattern: 'genuine value',
        reason: 'Empty English phrase — be more specific',
        category: 'ai_marker',
    },
    {
        pattern: 'But I quickly learned',
        reason: 'Coaching cliché — AI template phrasing',
        category: 'ai_marker',
    },

    // ─── NEW: Merged from HARD_PHRASE_BLACKLIST (cover-letter-validator.ts, 2026-04-09) ──
    {
        pattern: 'Möchte ich mein Projekt',
        reason: 'Invertierter Modalsatz als Aussagesatz — grammatikalisch falsch',
        category: 'structure',
        feedback: 'Der Satz beginnt mit einem invertierten Modalsatz ("Möchte ich..."), der als Aussagesatz grammatikalisch falsch ist. Schreibe: "Zudem habe ich bei [Firma]..." oder "Auch meine Zeit bei [Firma] zeigt...".',
    },
    {
        pattern: 'schnell den Sprung',
        reason: 'Erkennbare KI-Schablone als Closing-Formulierung',
        category: 'ai_marker',
        feedback: 'Entferne das "Sprung von X zur Y"-Konstrukt — es ist eine erkennbare KI-Schablone. Formuliere stattdessen konkret, was du einbringen willst.',
    },

    // ─── NEW: User-Feedback Blacklist (2026-04-18 — Anti-Allwissend + Authentizität) ──
    {
        pattern: 'echte Zusammenarbeit',
        reason: '"Echte" ist ein leeres Adjektiv — was ist "nicht-echte" Zusammenarbeit? Konkret beschreiben.',
        category: 'ai_marker',
    },
    {
        pattern: 'echte Wirkung',
        reason: '"Echte" vor abstrakten Nomen ist substanzlos — stattdessen konkretes Ergebnis nennen.',
        category: 'ai_marker',
    },
    {
        pattern: 'können nur dann wirken, wenn',
        reason: 'Allwissende Wenn-dann-Wahrheit — klingt belehrend und hochnäsig, besonders bei Junior-Positionen.',
        category: 'ai_marker',
        feedback: 'Entferne die allwissende Erkenntnis. Stattdessen: konkretes Ergebnis oder Zuversicht.',
    },
    {
        pattern: 'nur dann greifen, wenn',
        reason: 'Allwissende Wenn-dann-Wahrheit — Bewerber stellen keine universellen Regeln auf.',
        category: 'ai_marker',
    },
    {
        pattern: 'nur dann funktionieren, wenn',
        reason: 'Allwissende Wenn-dann-Wahrheit — klingt belehrend.',
        category: 'ai_marker',
    },
    {
        pattern: 'nur dann gelingen, wenn',
        reason: 'Allwissende Wenn-dann-Wahrheit.',
        category: 'ai_marker',
    },
    {
        pattern: 'nur gelingen, wenn',
        reason: 'Allwissende Wenn-dann-Wahrheit (ohne „dann"-Variante).',
        category: 'ai_marker',
    },
    {
        pattern: 'nur greifen, wenn',
        reason: 'Allwissende Wenn-dann-Wahrheit (ohne „dann"-Variante).',
        category: 'ai_marker',
    },
    {
        pattern: 'nur wirken, wenn',
        reason: 'Allwissende Wenn-dann-Wahrheit (ohne „dann"-Variante).',
        category: 'ai_marker',
    },
    {
        pattern: 'nur funktionieren, wenn',
        reason: 'Allwissende Wenn-dann-Wahrheit (ohne „dann"-Variante).',
        category: 'ai_marker',
    },
    {
        pattern: 'funktioniert nur, wenn',
        reason: 'Allwissende Wenn-dann-Wahrheit — der Bewerber stellt keine Regeln auf.',
        category: 'ai_marker',
    },
    {
        pattern: 'prägt eure Arbeit',
        reason: 'Omniszientes Prädikat — der Bewerber kann nicht wissen, was die Arbeit der Firma "prägt". Stattdessen: ICH-Perspektive mit Quelle.',
        category: 'ai_marker',
        feedback: 'Formuliere aus ICH-Perspektive: "Auf eurer Website habe ich gelesen, dass..." statt allwissend über die Firma zu sprechen.',
    },
    {
        pattern: 'prägt Ihre Arbeit',
        reason: 'Omniszientes Prädikat — Sie-Form-Variante.',
        category: 'ai_marker',
    },
    {
        pattern: 'Raum für echte',
        reason: 'Kombination aus allwissendem Framing + leerem "echte" — doppelt verboten.',
        category: 'ai_marker',
    },
    {
        pattern: 'schärfte meinen Blick dafür',
        reason: 'Generischer Erkenntnissatz — klingt allwissend und ist austauschbar. Absätze enden mit konkretem Ergebnis oder Zuversicht, nicht mit abstrakten Reflexionen.',
        category: 'ai_marker',
        feedback: 'Beende den Absatz mit einem konkreten Ergebnis oder einer zuversichtlichen Aussage, nicht mit einer abstrakten Erkenntnis.',
    },
    {
        pattern: 'hat mich ein Gedanke begleitet',
        reason: 'KI-Schablone — wird in jedem Anschreiben identisch generiert. Einleitungen müssen einzigartig formuliert sein.',
        category: 'ai_marker',
        feedback: 'Formuliere den Übergang zum Zitat natürlicher und einzigartig — z.B. "ist mir aufgefallen", "erinnerte ich mich", "kam mir ein Gedanke".',
    },
    {
        pattern: 'Dieses Prinzip prägt meinen Arbeitsstil grundlegend',
        reason: 'KI-Schablone — identische Zitat-Brücke in jedem Anschreiben. Die Brücke muss den KONKRETEN Zitat-Inhalt aufgreifen.',
        category: 'ai_marker',
        feedback: 'Verbinde den konkreten Gedanken des Zitats mit der Stelle — nicht mit einer generischen "Arbeitsstil"-Floskel.',
    },
    {
        pattern: 'Genau dieses Denken begleitet mich',
        reason: 'KI-Schablone — Template-Formulierung für Zitat-Brücken.',
        category: 'ai_marker',
    },
];

export interface FluffScanResult {
    found: boolean;
    matches: Array<{
        pattern: string;
        reason: string;
        category: BlacklistPattern['category'];
        feedback?: string;
    }>;
}

/**
 * Scan generated text for blacklisted patterns.
 * Returns { found: true, matches: [...] } if any patterns are detected.
 */
export function scanForFluff(text: string): FluffScanResult {
    const lowerText = text.toLowerCase();
    const matches: FluffScanResult['matches'] = [];

    for (const { pattern, reason, category, feedback } of BLACKLIST_PATTERNS) {
        if (lowerText.includes(pattern.toLowerCase())) {
            matches.push({ pattern, reason, category, feedback });
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
 * Used in buildSystemPrompt() to instruct Claude during generation.
 */
export function buildBlacklistPromptSection(): string {
    return `VERBOTENE PHRASEN (HARD RULES — niemals verwenden):
${BLACKLIST_PATTERNS.map(p => `- "${p.pattern}" (${p.reason})`).join('\n')}
- Sätze über 30 Wörter ohne Komma
- Sätze die bei einem Leser den Gedanken auslösen: "Das hat ChatGPT geschrieben"
- Aussagen die für jede Firma 1:1 kopierbar wären`;
}

/**
 * Generate a blacklist section for the Judge prompt, filtered by language.
 * Used in cover-letter-judge.ts to replace the hardcoded DE_BLACKLIST/EN_BLACKLIST strings.
 *
 * @param lang - 'de' | 'en' | 'es'
 */
export function buildJudgeBlacklistSection(lang: 'de' | 'en' | 'es'): string {
    const isEnglish = lang === 'en';

    // Categorize patterns by language relevance
    const dePatterns = BLACKLIST_PATTERNS.filter(p => {
        const lower = p.pattern.toLowerCase();
        // Exclude clearly English-only patterns from DE list
        return !/^[a-z\s,.'!?-]+$/i.test(p.pattern) || lower.includes('ich') || lower.includes('mein');
    });

    const enPatterns = BLACKLIST_PATTERNS.filter(p => {
        const lower = p.pattern.toLowerCase();
        // Include English patterns + German patterns that are universal AI markers
        return /^[a-z\s,.'!?-]+$/i.test(p.pattern) || p.category === 'ai_marker';
    });

    // ES falls through to DE patterns intentionally:
    // Spanish cover letters use German blacklist patterns because the product's
    // primary audience is DACH. ES-specific patterns can be added when demand exists.
    const patterns = isEnglish ? enPatterns : dePatterns;

    const header = isEnglish
        ? 'FORBIDDEN PHRASES — GPT-BLACKLIST (each found = fail):'
        : 'VERBOTENE PHRASEN — GPT-BLACKLIST (jeder Fund = fail):';

    return `${header}
${patterns.map(p => `- "${p.pattern}"`).join('\n')}`;
}
