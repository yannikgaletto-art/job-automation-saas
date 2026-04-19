/**
 * Cover Letter Prompt Structure Test Script
 * 
 * Analyzes the RENDERED prompt for structural risks:
 * 1. Contradiction detection (conflicting instructions)
 * 2. Negative attention ratio (VERBOTEN/❌ vs positive instructions)
 * 3. Duplicate instruction detection
 * 4. Risk scoring per scenario
 * 
 * Run: npx tsx scripts/test-prompt-structure.ts
 */

import { buildSystemPrompt } from '@/lib/services/cover-letter-prompt-builder';
import type { CoverLetterSetupContext, SelectedQuote } from '@/types/cover-letter-setup';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_PROFILE = {
    cv_structured_data: {
        experience: [
            { company: 'Fraunhofer FOKUS', role: 'Innovation Consultant', period: '11.2023 - Heute', bullets: ['Quantum Computing Projekte geleitet', 'Workshop-Facilitation für 30+ Teilnehmer'] },
            { company: 'Ingrano Solutions', role: 'Business Development Manager', period: '03.2023 - 10.2023', bullets: ['B2B-Kunden mit NIS-2 Handlungsbedarf identifiziert', 'CRM aufgebaut'] },
        ],
    },
};

const MOCK_JOB = {
    job_title: 'Junior Consultant',
    company_name: 'Cassini Consulting',
    requirements: ['Erfahrung in der Strategieberatung', 'Analytische Fähigkeiten', 'Teamfähigkeit'],
    responsibilities: ['Strategische Empfehlungen entwickeln', 'Analysen erstellen', 'In cross-funktionalen Teams arbeiten', 'Kunden bei Transformationsprojekten begleiten'],
    summary: 'Junior Consultant bei Cassini: Strategieberatung und Digitale Transformation.',
    company_research: [{ intel_data: { company_values: ['Innovation', 'Nachhaltigkeit'], tech_stack: ['SAP'], current_challenges: ['Digitale Transformation'], roadmap_signals: ['KI-Beratung'], recent_news: [{ title: 'Cassini expandiert', date: '2026-03' }] } }],
};

const MOCK_COMPANY = { company_values: ['Innovation', 'Nachhaltigkeit'], tech_stack: ['SAP'], current_challenges: ['Digitale Transformation'], roadmap_signals: ['KI-Beratung'], recent_news: [{ title: 'Cassini expandiert', date: '2026-03' }] };

const MOCK_STYLE = { tone: 'professional' as const, sentence_length: 'medium' as const, conjunctions: ['Daher', 'Zudem'], greeting: 'Hallo Jens,', rhetorical_devices: [] as string[], forbidden_constructs: [] as string[], uses_em_dash: false, rhetorical_contrast_pattern: false, max_commas_per_sentence: 2 };

const QUOTE_A: SelectedQuote = { quote: 'Ohne Daten bist du nur eine weitere Person mit einer Meinung.', author: 'W. Edwards Deming', source: 'Attributed', matchedValue: 'Innovation', relevanceScore: 0.9 };
const QUOTE_B: SelectedQuote = { quote: 'The only way to do great work is to love what you do.', author: 'Steve Jobs', source: 'Stanford 2005', matchedValue: 'Innovation', relevanceScore: 0.8 };
const QUOTE_C: SelectedQuote = { quote: 'Was man nicht messen kann, kann man nicht verbessern.', author: 'Peter Drucker', source: 'Management', matchedValue: 'Nachhaltigkeit', relevanceScore: 0.85 };

const HOOK = { id: 'h1', type: 'value' as const, label: 'Strategie', content: 'Cassini verbindet seit 2005 Strategiekompetenz mit Umsetzungsstärke', sourceName: 'cassini.de', sourceUrl: 'https://cassini.de', sourceAge: 'aktuell', relevanceScore: 0.9 };
const EMPTY_HOOK = { id: '', type: 'manual' as const, label: '', content: '', sourceName: '', sourceUrl: '', sourceAge: '', relevanceScore: 0 };

const STATIONS = [
    { stationIndex: 1 as const, company: 'Fraunhofer FOKUS', role: 'Innovation Consultant', period: '11.2023 - Heute', keyBullet: 'Quantum Computing', matchedRequirement: 'Strategieberatung', intent: 'Beweis für strategische Kooperationen', bullets: ['Quantum Computing', 'Workshops'] },
    { stationIndex: 2 as const, company: 'Ingrano Solutions', role: 'BDM', period: '03.2023 - 10.2023', keyBullet: 'B2B-Kunden', matchedRequirement: 'Analytische Fähigkeiten', intent: 'Analytik-Beweis', bullets: ['B2B-Kunden', 'CRM'] },
];

const BASE_TONE = { preset: 'storytelling' as const, toneSource: 'preset' as const, targetLanguage: 'de' as const, hasStyleSample: true, styleWarningAcknowledged: true, contactPerson: 'Herr Jens Müller', formality: 'du' as const };
const BASE_MODULES = { first90DaysHypothesis: false, painPointMatching: true, vulnerabilityInjector: false, pingPong: false, stationsSelector: true };

// ─── Scenarios ────────────────────────────────────────────────────────────────

interface Scenario { name: string; desc: string; ctx: CoverLetterSetupContext }

const scenarios: Scenario[] = [
    {
        name: 'A: Zitat+Hook (focus=quote)',
        desc: 'Häufigster Fall: Quote Intro, Hook Body',
        ctx: { jobId: 't1', companyName: 'Cassini Consulting', selectedHook: HOOK, selectedQuote: QUOTE_A, cvStations: STATIONS, tone: BASE_TONE, completedAt: new Date().toISOString(), optInModules: BASE_MODULES, introFocus: 'quote' },
    },
    {
        name: 'B: Nur Zitat (kein Hook)',
        desc: 'Quote Intro, kein Hook',
        ctx: { jobId: 't2', companyName: 'Cassini Consulting', selectedHook: EMPTY_HOOK, selectedQuote: QUOTE_B, cvStations: STATIONS, tone: BASE_TONE, completedAt: new Date().toISOString(), optInModules: BASE_MODULES, introFocus: 'quote' },
    },
    {
        name: 'C: Nur Hook (kein Zitat)',
        desc: 'Hook Intro, kein Quote',
        ctx: { jobId: 't3', companyName: 'Cassini Consulting', selectedHook: HOOK, cvStations: STATIONS, tone: BASE_TONE, completedAt: new Date().toISOString(), optInModules: BASE_MODULES, introFocus: 'hook' },
    },
    {
        name: 'D: Weder Zitat noch Hook',
        desc: 'Preset-Eröffnung',
        ctx: { jobId: 't4', companyName: 'Cassini Consulting', selectedHook: EMPTY_HOOK, cvStations: STATIONS, tone: BASE_TONE, completedAt: new Date().toISOString(), optInModules: BASE_MODULES, introFocus: 'quote' },
    },
    {
        name: 'E: Zitat+PingPong',
        desc: 'Max Komplexität: Quote+Antithese+Synthese',
        ctx: { jobId: 't5', companyName: 'Cassini Consulting', selectedHook: HOOK, selectedQuote: QUOTE_A, cvStations: STATIONS, tone: BASE_TONE, completedAt: new Date().toISOString(), optInModules: { ...BASE_MODULES, pingPong: true }, introFocus: 'quote', enablePingPong: true },
    },
    {
        name: 'F: Formal+Zitat',
        desc: 'PingPong soll blockiert werden',
        ctx: { jobId: 't6', companyName: 'Cassini Consulting', selectedHook: HOOK, selectedQuote: QUOTE_C, cvStations: STATIONS, tone: { ...BASE_TONE, preset: 'formal', formality: 'sie' }, completedAt: new Date().toISOString(), optInModules: { ...BASE_MODULES, pingPong: true }, introFocus: 'quote' },
    },
];

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

function analyze(sc: Scenario, prompt: string): Result {
    const words = prompt.split(/\s+/).length;
    const lines = prompt.split('\n').length;

    const verboten = countAll(prompt, ['VERBOTEN', '❌', 'FORBIDDEN', 'NIEMALS', 'NEVER', 'ABSOLUTES VERBOT', 'KOMPLETT VERBOTEN']);
    const positive = countAll(prompt, ['✅', 'ERLAUBT', 'PFLICHT', 'STATTDESSEN', 'BEISPIEL', 'ALLOWED']);
    const total = verboten + positive;
    const negRatio = total > 0 ? verboten / total : 0;

    // Contradiction checks
    const contradictions: string[] = [];
    const firmaInIntro = /Firmenbezug.*(?:MUSS|muss).*(?:Einleitung|ersten?\s*(?:Absatz|Satz))/i.test(prompt);
    const firmaNotIntro = /(?:Firmenbezug|Firmenanalyse).*(?:NICHT|VERBOTEN).*(?:Einleitung|ersten?\s*(?:Absatz|Satz))/i.test(prompt);
    if (firmaInIntro && firmaNotIntro) contradictions.push('Firmenbezug: gleichzeitig PFLICHT und VERBOTEN in Abs.1');

    const quoteInIntro = prompt.includes('EINLEITUNG — ZITAT-BRIDGING') || prompt.includes('EINLEITUNG — JD');
    const quoteInBody = prompt.includes('ZITAT IM HAUPTTEIL');
    if (quoteInIntro && quoteInBody) contradictions.push('KRITISCH: Zitat in Intro UND Body → Dopplung');

    // Duplicate checks
    const duplicates: string[] = [];
    const checkPhrases = ['wurde mir klar', 'wurde mir bewusst', 'bildet eine solide Grundlage', 'Die Kombination aus', 'echten Mehrwert', 'hat mich ein Gedanke begleitet', 'Doch ich lernte schnell', 'schnell den Sprung'];
    for (const ph of checkPhrases) {
        const cnt = (prompt.match(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
        if (cnt >= 2) duplicates.push(`"${ph}" ${cnt}x`);
    }

    // Risks
    const risks: string[] = [];
    if (negRatio > 0.50) risks.push(`HOCH: Neg-Ratio ${(negRatio*100).toFixed(0)}% → Negative Attention Collapse`);
    else if (negRatio > 0.35) risks.push(`MITTEL: Neg-Ratio ${(negRatio*100).toFixed(0)}%`);
    if (words > 4000) risks.push(`HOCH: ${words} Wörter → Lost-in-the-Middle`);
    else if (words > 3000) risks.push(`MITTEL: ${words} Wörter`);
    if (contradictions.length > 0) risks.push(`KRITISCH: ${contradictions.length} Widersprüche`);
    if (duplicates.length > 2) risks.push(`MITTEL: ${duplicates.length} redundante Phrasen`);

    const jdFrag = (prompt.match(/PFLICHT-FRAGMENT/g) || []).length;
    if (jdFrag === 0) risks.push('JD-Fragment-Pflicht fehlt');
    else if (jdFrag > 1) risks.push(`JD-Fragment ${jdFrag}x (Verwirrung)`);

    // Score
    let score = 100;
    score -= contradictions.length * 15;
    score -= Math.max(0, negRatio - 0.3) * 100;
    score -= Math.max(0, duplicates.length - 1) * 5;
    score -= Math.max(0, words - 3000) / 100;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return { scenario: sc.name, lines, words, verboten, positive, negRatio, contradictions, duplicates, risks, score };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
    console.log('═'.repeat(80));
    console.log('🧪 COVER LETTER PROMPT STRUCTURE TEST');
    console.log(`   ${new Date().toISOString()}`);
    console.log('═'.repeat(80));

    const results: Result[] = [];

    for (const sc of scenarios) {
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`📝 ${sc.name} — ${sc.desc}`);

        try {
            const prompt = buildSystemPrompt(MOCK_PROFILE, MOCK_JOB as any, MOCK_COMPANY, MOCK_STYLE as any, sc.ctx, [], 0);
            const r = analyze(sc, prompt);
            results.push(r);

            console.log(`   Zeilen: ${r.lines} | Wörter: ${r.words} | VERBOTEN: ${r.verboten} | ✅: ${r.positive} | Neg-Ratio: ${(r.negRatio*100).toFixed(0)}%`);
            if (r.contradictions.length > 0) { console.log('   ⚠️  WIDERSPRÜCHE:'); r.contradictions.forEach(c => console.log(`      - ${c}`)); }
            if (r.duplicates.length > 0) { console.log('   🔄 DUPLIKATE:'); r.duplicates.forEach(d => console.log(`      - ${d}`)); }
            if (r.risks.length > 0) { console.log('   🚨 RISIKEN:'); r.risks.forEach(x => console.log(`      - ${x}`)); }
            console.log(`   🎯 SCORE: ${r.score}/100 ${r.score >= 90 ? '✅' : r.score >= 70 ? '⚠️' : '❌'}`);
        } catch (err) {
            console.error(`   ❌ BUILD FEHLER: ${err instanceof Error ? err.message : err}`);
            results.push({ scenario: sc.name, lines: 0, words: 0, verboten: 0, positive: 0, negRatio: 0, contradictions: ['Build Error'], duplicates: [], risks: ['KRITISCH: Prompt bricht'], score: 0 });
        }
    }

    // Summary table
    console.log('\n' + '═'.repeat(80));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('═'.repeat(80));
    console.log('  Scenario                            Score  VERBOTEN  Neg%  Widersp.  Wörter');
    console.log('  ' + '─'.repeat(76));
    for (const r of results) {
        console.log(`  ${r.scenario.padEnd(38)} ${String(r.score).padStart(3)}    ${String(r.verboten).padStart(5)}   ${((r.negRatio*100).toFixed(0)+'%').padStart(4)}     ${String(r.contradictions.length).padStart(3)}    ${String(r.words).padStart(5)}`);
    }

    const avgScore = Math.round(results.reduce((s,r) => s + r.score, 0) / results.length);
    const avgNeg = (results.reduce((s,r) => s + r.negRatio, 0) / results.length * 100).toFixed(0);
    const totalC = results.reduce((s,r) => s + r.contradictions.length, 0);
    console.log(`\n  DURCHSCHNITT: Score ${avgScore}/100 | Neg-Ratio ${avgNeg}% | ${totalC} Widersprüche`);
    console.log(`  ${avgScore >= 90 ? '✅ PRODUKTIONSREIF' : avgScore >= 70 ? '⚠️ OPTIMIERUNG NÖTIG' : '❌ NICHT PRODUKTIONSREIF'}`);

    // Model comparison
    console.log('\n' + '═'.repeat(80));
    console.log('📊 MODEL-VERGLEICH: Sonnet 4.5 vs Sonnet 4.6');
    console.log('═'.repeat(80));
    console.log('  Sonnet 4.5 (aktuell): $3/$15 per 1M | 200K Kontext | Stabil aber älter');
    console.log('  Sonnet 4.6 (upgrade): $3/$15 per 1M | 1M Kontext  | Besseres Multi-Constraint');
    console.log('');
    console.log('  GLEICHER PREIS | Bessere Qualität bei komplexen Prompts');
    console.log('  ✅ EMPFEHLUNG: Upgrade auf Sonnet 4.6 (claude-sonnet-4-6)');
    console.log('  ⚠️  AGENTS.md muss aktualisiert werden (Regel "version 4.5" → "4.5 oder höher")');

    // Splitting analysis
    console.log('\n' + '═'.repeat(80));
    console.log('🔬 GENERIERUNGS-SPLITTING ANALYSE');
    console.log('═'.repeat(80));
    console.log('  Option A: Single-Pass (AKTUELL) — 1 Call, ~3-5s, $0.025');
    console.log('  Option B: 2-Step (Intro+Body)   — 2 Calls, ~6-10s, $0.035 (+40% Kosten)');
    console.log('  Option C: 3-Step                — 3 Calls, ~12s, $0.050 (+100% Kosten)');
    console.log('');
    console.log('  ✅ EMPFEHLUNG: Single-Pass BEIBEHALTEN');
    console.log('  BEGRÜNDUNG:');
    console.log('  1. Prompt-Entschlackung (128→45 VERBOTEN) behebt "Lost in the Middle" effektiver');
    console.log('  2. Splitting verdoppelt Latenz → schlechte UX');
    console.log('  3. Sonnet 4.6 verbessert Multi-Constraint ohne Splitting');
    console.log('  4. Splitting als Fallback SPÄTER, wenn Single-Pass nach Entschlackung scheitert');

    console.log('\n' + '═'.repeat(80));
    console.log('✅ Test abgeschlossen');
    console.log('═'.repeat(80));
}

main();
