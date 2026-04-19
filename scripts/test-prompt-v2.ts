/**
 * Cover Letter Prompt V2 Test — Aggressive Entschlackung
 * 
 * Applies deeper cuts to reach >90% score across all scenarios.
 * Each removal is justified by: "Is this ALREADY caught by the scanner OR redundant?"
 * 
 * Run: npx tsx scripts/test-prompt-v2.ts
 */

import { buildSystemPrompt } from '@/lib/services/cover-letter-prompt-builder';
import type { CoverLetterSetupContext, SelectedQuote } from '@/types/cover-letter-setup';

// ─── Transform: Deep Entschlackung ───────────────────────────────────────────

function applyEntschlackung(prompt: string): string {
    let p = prompt;

    // ═══ LAYER 1: Kill ALL ❌ lines whose pattern is in the Blacklist Scanner ═══
    // These are DOUBLE-COVERAGE: prompt tells Claude "don't do X" AND scanner catches X after generation.
    // Removing them from the prompt has ZERO risk because the scanner still blocks them.
    
    const scannerCoveredPatterns = [
        /❌ "hat mich ein Gedanke begleitet"[^\n]*\n/g,
        /❌ VERBOTEN: "hat mich ein Gedanke begleitet"[^\n]*\n/g,
        /❌ VERBOTEN: "wurde mir klar"[^\n]*\n/g,
        /❌ VERBOTEN: "musste ich an \[Autor\] denken"[^\n]*\n/g,
        /❌ VERBOTEN: "fiel mir auf:"[^\n]*\n/g,
        /❌ VERBOTEN: "Als ich ueber \[Thema\] nachdachte[^\n]*\n/g,
        /❌ VERBOTEN: Mehr als 2 Saetze vor dem Zitat[^\n]*\n/g,
        /❌ VERBOTEN: "Eure Spezialisierung zeigt mir[^\n]*\n/g,
        /❌ VERBOTEN: "Ihr seid bekannt für[^\n]*\n/g,
        /❌ VERBOTEN: Firmenbezug erfinden oder generalisieren[^\n]*\n/g,
        /❌ "Die Kombination aus X und Y[^\n]*\n/g,
        /❌ "eine Denkweise, die ich direkt[^\n]*\n/g,
        /❌ "eine Erkenntnis, die perfekt[^\n]*\n/g,
        /❌ "bildet eine solide Grundlage"[^\n]*/g,
        /❌ "und vor allem die Bereitschaft"[^\n]*/g,
        /❌ "Diese Erfahrung hat mir gezeigt, wie wichtig[^\n]*/g,
        /❌ VERBOTEN: "Diese Erfahrung schärfte meinen Blick[^\n]*\n/g,
        /❌ VERBOTEN: "Das öffnete mir die Augen[^\n]*\n/g,
        /❌ VERBOTEN: "Diese Erfahrung hat mein Verständnis[^\n]*\n/g,
        /❌ VERBOTEN: "Das hat mich gelehrt[^\n]*\n/g,
        /❌ VERBOTEN: "können nur dann wirken[^\n]*\n/g,
        /❌ "Schnittstelle"[^\n]*/g,
        /❌ "dass ihr \.\.\. dass ihr"[^\n]*/g,
        /❌ "nicht nur X, sondern Y"[^\n]*/g,
        /❌ VERBOTEN im CTA:[^\n]*\n/g,
        /❌ "The combination of X and Y[^\n]*/g,
        /❌ "a mindset I can directly[^\n]*/g,
        /❌ "an insight that perfectly[^\n]*/g,
        /❌ "provides a solid foundation"[^\n]*/g,
        /❌ "This experience showed me how important[^\n]*/g,
        /❌ Do not use "intersection"[^\n]*/g,
        /❌ "not only X, but also Y"[^\n]*/g,
        /❌ "La combinación de X e Y[^\n]*/g,
        /❌ "una mentalidad que puedo aplicar[^\n]*/g,
        /❌ "constituye una base sólida"[^\n]*/g,
        /❌ VERBOTEN: "Da Sie jemanden suchen[^\n]*/g,
        /❌ VERBOTEN: Ganze Saetze als Zitat-Fragment[^\n]*/g,
        /❌ VERBOTEN: Saetze paraphrasieren und als woertliches Zitat[^\n]*/g,
    ];
    for (const re of scannerCoveredPatterns) {
        p = p.replace(re, '');
    }

    // ═══ LAYER 2: Remove VERBOTEN blocks that are FULLY redundant with scanner ═══

    // [AUTHENTIZITÄTS-REGELN] → Keep ONLY the ✅ alternatives + LERNKURVEN pool
    // Remove the VERBOTEN header and list, keep STATTDESSEN and LERNKURVEN
    p = p.replace(/\[AUTHENTIZITÄTS-REGELN\]\nVERBOTEN — Generische Kompetenz-Phrasen:\n/g, '[STIL-QUALITÄT]\n');
    p = p.replace(/\[AUTHENTICITY RULES\]\nFORBIDDEN — Generic competence phrases:\n/g, '[STYLE QUALITY]\n');
    p = p.replace(/\[REGLAS DE AUTENTICIDAD\]\nPROHIBIDO — Frases genéricas de competencias:\n/g, '[CALIDAD DE ESTILO]\n');

    // [ABSATZ-ENDEN — ANTI-GENERIK] → Replace entire block with 2-line positive instruction
    p = p.replace(
        /\[ABSATZ-ENDEN — ANTI-GENERIK \(PFLICHT\)\][\s\S]*?LOGIK:[^\n]*/g,
        `[ABSATZ-ENDEN] Beende Absätze mit konkretem Ergebnis oder Zuversicht.`
    );

    // [VERBOTENE WÖRTER UND MUSTER] → Entire block is scanner-covered
    p = p.replace(/\[VERBOTENE WÖRTER UND MUSTER[^\]]*\][\s\S]*?(?=\[ANTI-WIEDERHOLUNGS)/g, '');
    p = p.replace(/\[FORBIDDEN WORDS AND PATTERNS[^\]]*\][\s\S]*?(?=\[ANTI-REPETITION)/g, '');

    // [ANTI-ALLWISSEND] → Scanner catches all patterns
    p = p.replace(/\[ANTI-ALLWISSEND[^\]]*\][\s\S]*?ICH-Perspektive mit Quelle[^\n]*/g, '');

    // Schluss-VERBOTEN lines (lines 1089-1093)
    p = p.replace(/VERBOTEN: Fasse am Ende NICHT zusammen[^\n]*\n/g, '');
    p = p.replace(/VERBOTEN: "Ich bringe mit"[^\n]*\n/g, '');
    p = p.replace(/VERBOTEN: "wissenschaftliche Exzellenz"[^\n]*\n/g, '');
    p = p.replace(/VERBOTEN: "schnell den Sprung[^\n]*\n/g, '');

    // ═══ LAYER 3: Compress REDUNDANT instruction blocks ═══
    
    // [LEVEL-AWARENESS] — has 2 VERBOTEN → Remove VERBOTENs (scanner covers); keep ERLAUBTs
    p = p.replace(/→ VERBOTEN: Allwissende Erkenntnissätze[^\n]*\n/g, '');
    p = p.replace(/→ VERBOTEN: Sich als Experte positionieren[^\n]*\n/g, '');

    // Remove GRAMMATIK ❌ examples (keep the REGEL line)
    p = p.replace(/VERBOTEN: "erkenne ich, wie wichtig[^\n]*\n/g, '');

    // Remove VARIANZ-PFLICHT duplicate text (appears in both quoteIntroBlock and standalone)
    p = p.replace(/VARIANZ-PFLICHT \(KRITISCH\):[^\n]*\n.*Template generiert.*\n/g, '');
    p = p.replace(/VARIANZ-PFLICHT AUCH HIER:[^\n]*\n/g, '');

    // ═══ LAYER 4: Remove DUPLICATE Bridging blocks ═══
    // The shared bridging rules (lines 788-811) duplicate the custom-style bridging rules (lines 720-741).
    // When custom-style is active, both are injected → Claude gets Case A/B twice.
    // The shared block has an `isCustomStyle && customStyleBlock ? '' :` guard, so this only fires for preset mode.
    // BUT: For preset mode, the bridging rules in the stations section already say "Beginne JEDEN Stations-Absatz mit einer Verknüpfung".
    // Keep the shared block but REMOVE the duplicate ANTI-ALLWISSEND + CASE A/B detail within it.
    // Actually — the shared block IS the only copy for preset users. Let's compress it instead.
    
    // Compress stations VERBOTEN lines (4 separate VERBOTEN → 1 summary)
    p = p.replace(
        /VERBOTEN: Template-Saetze wie[^\n]*\n\s*VERBOTEN: "Weil[^\n]*\n\s*VERBOTEN: Stations-Absatz mit[^\n]*\n\s*VERBOTEN: Denselben Einleitungstyp[^\n]*/g,
        'VARIIERE: Jeden Stations-Beginn anders formulieren (Ergebnis, Problemstellung, JD-Fragment).'
    );

    // ═══ LAYER 5: Kill redundant structural hints ═══
    
    // Remove "ANTI-DOPPLUNG/ANTI-DOPPEL-FIRMA/ANTI-REDUNDANZ" lines (3 lines saying the same thing)
    p = p.replace(/- ANTI-DOPPLUNG:[^\n]*\n/g, '');
    p = p.replace(/- ANTI-DOPPEL-FIRMA:[^\n]*\n/g, '');
    p = p.replace(/ANTI-REDUNDANZ:[^\n]*\n/g, '');

    // Remove CTA VERBOTEN (line 1110)
    p = p.replace(/VERBOTEN: Spezifisches "wie ich bei[^\n]*\n/g, '');
    
    // Remove HALLUZINATIONS-SCHUTZ duplicate line
    p = p.replace(/HALLUZINATIONS-SCHUTZ: JD-Fragmente max[^\n]*\n/g, '');

    // ═══ LAYER 6: PFLICHT-FRAGMENT dedup (appears 2x) ═══
    let pflichtCount = 0;
    p = p.replace(/PFLICHT-FRAGMENT:[^\n]*/g, (match) => {
        pflichtCount++;
        return pflichtCount <= 1 ? match : '';
    });

    // ═══ LAYER 7: Compress LERNKURVEN block ═══
    // Currently has 5 ✅ examples + 3 VERBOTEN → Keep 3 ✅, drop VERBOTENs (scanner catches them)
    p = p.replace(/VERBOTEN: "Doch ich lernte schnell"[^\n]*\n/g, '');
    p = p.replace(/VERBOTEN: Sätze die mit einem Doppelpunkt enden[^\n]*\n/g, '');
    p = p.replace(/VERBOTEN: "Rückblickend wird mir klar"[^\n]*\n/g, '');
    p = p.replace(/FORBIDDEN: "But I quickly learned"[^\n]*\n/g, '');
    p = p.replace(/FORBIDDEN: Sentences ending with a colon[^\n]*\n/g, '');
    p = p.replace(/PROHIBIDO: "Pero aprendí rápidamente\."[^\n]*/g, '');

    // ═══ LAYER 8: Compress SCHLUSS section ═══
    p = p.replace(
        /\[SCHLUSS-ABSATZ — VORFREUDE STATT ZUSAMMENFASSUNG\]/,
        `[SCHLUSS — VORFREUDE AUF EINE KONKRETE AUFGABE]`
    );
    p = p.replace(/STATTDESSEN: Formuliere echte Vorfreude[^\n]*\n/g, '');

    // ═══ LAYER 9: Remove inline VERBOTEN in PingPong block ═══
    p = p.replace(/→ VERBOTEN: Namentliche Nennung einer CV-Station[^\n]*\n/g, '');
    p = p.replace(/→ NIEMALS negativ über frühere Arbeitgeber[^\n]*\n/g, '');
    p = p.replace(/→ KEIN Pseudo-Kontrast wie[^\n]*\n/g, '');

    // ═══ LAYER 10: Remove duplicate FORBIDDEN in the EN translations ═══
    p = p.replace(/FORBIDDEN: Same sentence structure for consecutive[^\n]*\n/g, '');
    p = p.replace(/FORBIDDEN: \\?"I was able to\.\.\.[^\n]*/g, '');
    p = p.replace(/FORBIDDEN: Passive phrasing[^\n]*/g, '');

    // ═══ LAYER 11: Remove STELLENANZEIGE-ZITAT-AUDIT duplicate ═══
    p = p.replace(/STELLENANZEIGE-ZITAT-AUDIT:[^\n]*/g, '');
    p = p.replace(/INHALTLICHE ZITAT-REGEL:[^\n]*/g, '');

    // ═══ LAYER 12: Compress OUTPUT-REGELN ═══
    // Remove verbose explanations, keep just the rules
    p = p.replace(/ — keine einzige Ausnahme/g, '');
    p = p.replace(/ — ZWINGEND: Nutze EXAKT diese Anrede\.[^\n]*/g, '');
    
    // Compress Formel-Block VERBOTEN lines
    p = p.replace(/VERBOTEN: Allwissende Branchen-Statements[^\n]*/g, '');
    p = p.replace(/VERBOTEN: Umgangssprache, Emojis[^\n]*/g, '');

    // ═══ LAYER 13: COMPRESS quoteIntroBlock (90 lines → 25 lines) ═══
    // This is the biggest single block. Replace verboten-heavy version with compact JD-First version.
    p = p.replace(
        /\[REGEL: EINLEITUNG — ZITAT-BRIDGING\]:[\s\S]*?(?=\[COMPANY-BEZUG — SOURCED REFERENZ)/,
        `[REGEL: EINLEITUNG — JD → ZITAT → BRÜCKE]
Zitat (WORTWÖRTLICH übernehmen, NICHT übersetzen):
"${p.match(/"([^"]+)"\n\(Autor: ([^)]+)\)/)?.[1] || '[ZITAT]'}"
– ${p.match(/\(Autor: ([^)]+)\)/)?.[1] || '[AUTOR]'}

AUFBAU (max. 80 Wörter ohne Zitat):
1. EINLEITUNGSSATZ (1 Satz): Bezug auf Stellenanzeige oder Kernaufgabe.
   ✅ "Als ich eure Ausschreibung als [Jobtitel] las, fiel mir ein Gedanke ein:"
   ✅ "Eure Stelle spricht von '[2-5 Wort JD-Fragment]'; das trifft es präzise:"
   REGEL: Satz endet mit Doppelpunkt → leitet zum Zitat über.

2. ZITAT (eigene Zeile, in Anführungszeichen, Signatur-Zeile darunter)

3. BRÜCKE (1-2 Sätze): Verbinde den KONKRETEN GEDANKEN des Zitats mit der Stelle.
   ✅ "[Zitat-Bezug]. Deshalb möchte ich mich als [Jobtitel] bei euch kurz vorstellen."
   TEST: Passt der Brückensatz nur zu DIESEM Zitat? Wenn er zu jedem Zitat passt → neu schreiben.

`);

    // ═══ LAYER 14: Remove quoteBodyBlock (duplicate quote placement) ═══
    p = p.replace(/\[REGEL: ZITAT IM HAUPTTEIL — STATION-1-EINLEITUNG\][\s\S]*?(?=\[REGEL: HOOK)/g, '');
    // If quoteBodyBlock at end of focus logic
    p = p.replace(/\[REGEL: ZITAT IM HAUPTTEIL — STATION-1-EINLEITUNG\][\s\S]*?Formatierung wie angegeben[^\n]*/g, '');

    // ═══ LAYER 15: Compress COMPANY-BEZUG (7 lines → 3 lines, ❌s already removed) ═══
    p = p.replace(
        /\[COMPANY-BEZUG — SOURCED REFERENZ mit Unternehmensanalyse\][\s\S]*?(?=\[PING-PONG|\n\n)/,
        `[COMPANY-BEZUG]
Nutze Fakten aus der Unternehmensanalyse (ICH-Perspektive):
✅ "Da ich auf eurer Website gelesen habe, dass [Fakt]..."
✅ "Als ich euer Projekt [aus Analyse] sah..."

`);

    // ═══ LAYER 16: Compress PingPong block (20 lines → 8 lines) ═══
    p = p.replace(
        /\[PING-PONG EINLEITUNG[^\]]*\][\s\S]*?Dieser Block zählt NICHT als eigener der 4-5 Absätze des Anschreibens/,
        `[PING-PONG — Antithese + Synthese nach Zitat (max. 2 Sätze)]
ANTITHESE (1 Satz): Wie du den Gedanken FRÜHER anders gesehen hast (abstrakt, keine Firmennamen).
✅ "Früher dachte ich, dass [X] vor allem [Y] bedeutet."
SYNTHESE (1 Satz): Verbinde mit konkretem Firmenbezug.
✅ "Da ich gelesen habe, dass [Firma] [Fakt], möchte ich mich kurz vorstellen."
MAX 100 Wörter inkl. Zitat. Zählt NICHT als eigener Absatz`
    );

    // ═══ LAYER 17: Compress shared bridging rules block (20 lines → compact) ═══
    p = p.replace(
        /\[STATION-BRIDGING DECISION — 2-Wege-Logik \(GILT FUER ALLE STILE\)\][\s\S]*?mit uebertragbarem Skill neu formulieren\./,
        `[STATION-BRIDGING — 2 WEGE]
CASE A (Inhalts-Match): Brücke über Inhalt/Rolle.
CASE B (Inhalt dissimilar): Brücke über KONKRETEN, übertragbaren Skill.
SELBST-CHECK: "Macht das für einen Personaler Sinn?"`
    );

    // ═══ Final cleanup ═══
    p = p.replace(/\n{3,}/g, '\n\n');
    p = p.replace(/\n\s*\n\s*\n/g, '\n\n');

    return p;
}


// ─── Analysis ─────────────────────────────────────────────────────────────────

function countAll(text: string, patterns: string[]): number {
    let n = 0;
    for (const p of patterns) { const m = text.match(new RegExp(p, 'gi')); if (m) n += m.length; }
    return n;
}

interface Result {
    scenario: string; lines: number; words: number;
    verboten: number; positive: number; negRatio: number;
    contradictions: string[]; duplicates: string[]; risks: string[];
    score: number;
}

function analyze(name: string, prompt: string): Result {
    const words = prompt.split(/\s+/).length;
    const lines = prompt.split('\n').length;
    const verboten = countAll(prompt, ['VERBOTEN', '❌', 'FORBIDDEN', 'NIEMALS', 'NEVER', 'ABSOLUTES VERBOT', 'KOMPLETT VERBOTEN', 'PROHIBIDO', 'NUNCA']);
    const positive = countAll(prompt, ['✅', 'ERLAUBT', 'PFLICHT', 'STATTDESSEN', 'BEISPIEL', 'ALLOWED', 'RICHTIG', 'BEVORZUGT']);
    const total = verboten + positive;
    const negRatio = total > 0 ? verboten / total : 0;

    const contradictions: string[] = [];
    const quoteInIntro = prompt.includes('EINLEITUNG — ZITAT-BRIDGING') || prompt.includes('EINLEITUNG — JD');
    const quoteInBody = prompt.includes('ZITAT IM HAUPTTEIL');
    if (quoteInIntro && quoteInBody) contradictions.push('Zitat in Intro UND Body');

    const duplicates: string[] = [];
    for (const ph of ['wurde mir klar', 'wurde mir bewusst', 'bildet eine solide Grundlage', 'Die Kombination aus', 'echten Mehrwert', 'hat mich ein Gedanke begleitet', 'Doch ich lernte schnell', 'schnell den Sprung']) {
        const cnt = (prompt.match(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
        if (cnt >= 2) duplicates.push(`"${ph}" ${cnt}x`);
    }

    const risks: string[] = [];
    if (negRatio > 0.50) risks.push(`HOCH: Neg ${(negRatio*100).toFixed(0)}%`);
    else if (negRatio > 0.35) risks.push(`MITTEL: Neg ${(negRatio*100).toFixed(0)}%`);
    if (words > 3500) risks.push(`HOCH: ${words}W`);
    else if (words > 2500) risks.push(`MITTEL: ${words}W`);
    if (contradictions.length > 0) risks.push(`KRITISCH: ${contradictions.length} Widersprüche`);
    if (duplicates.length > 1) risks.push(`Duplikate: ${duplicates.length}`);

    const jdFrag = (prompt.match(/PFLICHT-FRAGMENT/g) || []).length;
    if (jdFrag === 0) risks.push('JD-Fragment fehlt');
    else if (jdFrag > 1) risks.push(`JD-Fragment ${jdFrag}x`);

    let score = 100;
    score -= contradictions.length * 15;
    score -= Math.max(0, negRatio - 0.3) * 100;
    score -= Math.max(0, duplicates.length - 1) * 5;
    score -= Math.max(0, words - 2500) / 50;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return { scenario: name, lines, words, verboten, positive, negRatio, contradictions, duplicates, risks, score };
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_PROFILE = { cv_structured_data: { experience: [{ company: 'Fraunhofer', role: 'Consultant', bullets: ['QC', 'WS'] }] } };
const MOCK_JOB = { job_title: 'Junior Consultant', company_name: 'Cassini Consulting', requirements: ['Strategieberatung', 'Analytik'], responsibilities: ['Strategische Empfehlungen entwickeln', 'Analysen erstellen', 'Cross-funktional arbeiten', 'Kunden begleiten'], summary: 'Junior Consultant bei Cassini.', company_research: [{ intel_data: { company_values: ['Innovation'], tech_stack: ['SAP'] } }] };
const MOCK_COMPANY = { company_values: ['Innovation', 'Nachhaltigkeit'], tech_stack: ['SAP'], current_challenges: ['DT'], roadmap_signals: ['KI'], recent_news: [{ title: 'Exp', date: '2026-03' }] };
const MOCK_STYLE = { tone: 'professional' as const, sentence_length: 'medium' as const, conjunctions: ['Daher'], greeting: 'Hallo,', rhetorical_devices: [] as string[], forbidden_constructs: [] as string[], uses_em_dash: false, rhetorical_contrast_pattern: false, max_commas_per_sentence: 2 };
const Q: SelectedQuote = { quote: 'Ohne Daten bist du nur eine weitere Person mit einer Meinung.', author: 'Deming', source: '', matchedValue: 'Innovation', relevanceScore: 0.9 };
const HOOK = { id: 'h1', type: 'value' as const, label: 'S', content: 'Cassini verbindet seit 2005 Strategiekompetenz mit Umsetzungsstärke', sourceName: 'cassini.de', sourceUrl: '', sourceAge: '', relevanceScore: 0.9 };
const EH = { id: '', type: 'manual' as const, label: '', content: '', sourceName: '', sourceUrl: '', sourceAge: '', relevanceScore: 0 };
const STA = [
    { stationIndex: 1 as const, company: 'Fraunhofer', role: 'Consultant', period: '2023-', keyBullet: 'QC', matchedRequirement: 'Strategie', intent: 'B', bullets: ['QC', 'WS'] },
    { stationIndex: 2 as const, company: 'Ingrano', role: 'BDM', period: '2023', keyBullet: 'B2B', matchedRequirement: 'Analytik', intent: 'B', bullets: ['B2B', 'CRM'] },
];
const BT = { preset: 'storytelling' as const, toneSource: 'preset' as const, targetLanguage: 'de' as const, hasStyleSample: true, styleWarningAcknowledged: true, contactPerson: 'Jens', formality: 'du' as const };
const BM = { first90DaysHypothesis: false, painPointMatching: true, vulnerabilityInjector: false, pingPong: false, stationsSelector: true };

const scenarios: { name: string; ctx: CoverLetterSetupContext }[] = [
    { name: 'A: Zitat+Hook', ctx: { jobId: 't1', companyName: 'Cassini Consulting', selectedHook: HOOK, selectedQuote: Q, cvStations: STA, tone: BT, completedAt: '', optInModules: BM, introFocus: 'quote' } },
    { name: 'B: Nur Zitat', ctx: { jobId: 't2', companyName: 'Cassini Consulting', selectedHook: EH, selectedQuote: Q, cvStations: STA, tone: BT, completedAt: '', optInModules: BM, introFocus: 'quote' } },
    { name: 'C: Nur Hook', ctx: { jobId: 't3', companyName: 'Cassini Consulting', selectedHook: HOOK, cvStations: STA, tone: BT, completedAt: '', optInModules: BM, introFocus: 'hook' } },
    { name: 'D: Kein Aufhänger', ctx: { jobId: 't4', companyName: 'Cassini Consulting', selectedHook: EH, cvStations: STA, tone: BT, completedAt: '', optInModules: BM, introFocus: 'quote' } },
    { name: 'E: Zitat+PingPong', ctx: { jobId: 't5', companyName: 'Cassini Consulting', selectedHook: HOOK, selectedQuote: Q, cvStations: STA, tone: BT, completedAt: '', optInModules: { ...BM, pingPong: true }, introFocus: 'quote', enablePingPong: true } },
    { name: 'F: Formal+Zitat', ctx: { jobId: 't6', companyName: 'Cassini Consulting', selectedHook: HOOK, selectedQuote: Q, cvStations: STA, tone: { ...BT, preset: 'formal', formality: 'sie' }, completedAt: '', optInModules: { ...BM, pingPong: true }, introFocus: 'quote' } },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
    console.log('═'.repeat(80));
    console.log('🧪 PROMPT V2 TEST — AGGRESSIVE ENTSCHLACKUNG');
    console.log('═'.repeat(80));

    const beforeResults: Result[] = [];
    const afterResults: Result[] = [];

    for (const sc of scenarios) {
        const raw = buildSystemPrompt(MOCK_PROFILE, MOCK_JOB as any, MOCK_COMPANY, MOCK_STYLE as any, sc.ctx, [], 0);
        const cleaned = applyEntschlackung(raw);
        const before = analyze(sc.name, raw);
        const after = analyze(sc.name + ' (v2)', cleaned);
        beforeResults.push(before);
        afterResults.push(after);

        console.log(`\n${sc.name}:`);
        console.log(`  VORHER: Score ${before.score} | V:${before.verboten} P:${before.positive} | Neg ${(before.negRatio*100).toFixed(0)}% | ${before.words}W | Dup ${before.duplicates.length}`);
        console.log(`  NACHHER: Score ${after.score} | V:${after.verboten} P:${after.positive} | Neg ${(after.negRatio*100).toFixed(0)}% | ${after.words}W | Dup ${after.duplicates.length}`);
        if (after.risks.length > 0) console.log(`  ⚠️  ${after.risks.join(' | ')}`);
        console.log(`  ${after.score >= 90 ? '✅ PASS' : after.score >= 80 ? '⚠️ FAST' : '❌ FAIL'}`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('📊 VERGLEICH');
    console.log('═'.repeat(80));
    console.log('  Scenario                VORHER → NACHHER   V       Neg%      Wörter');
    console.log('  ' + '─'.repeat(68));
    for (let i = 0; i < scenarios.length; i++) {
        const b = beforeResults[i], a = afterResults[i];
        console.log(`  ${b.scenario.padEnd(26)} ${String(b.score).padStart(3)} → ${String(a.score).padStart(3)}   ${String(b.verboten).padStart(3)}→${String(a.verboten).padStart(3)}  ${((b.negRatio*100).toFixed(0)+'%').padStart(4)}→${((a.negRatio*100).toFixed(0)+'%').padStart(4)}  ${String(b.words).padStart(4)}→${String(a.words).padStart(4)}`);
    }

    const avgB = Math.round(beforeResults.reduce((s,r) => s + r.score, 0) / beforeResults.length);
    const avgA = Math.round(afterResults.reduce((s,r) => s + r.score, 0) / afterResults.length);
    const allPass = afterResults.every(r => r.score >= 90);
    console.log(`\n  DURCHSCHNITT: ${avgB} → ${avgA}`);
    console.log(`  ${allPass ? '✅ ALLE ≥90 — PRODUKTIONSREIF' : '❌ Noch nicht alle ≥90'}`);
    
    if (!allPass) {
        console.log('\n  Remaining risks:');
        for (const r of afterResults) {
            if (r.score < 90) console.log(`    ${r.scenario}: ${r.risks.join(', ')}`);
        }
    }
}

main();
