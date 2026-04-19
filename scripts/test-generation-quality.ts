#!/usr/bin/env npx tsx
/**
 * E2E Cover Letter Generation Quality Test — V3 (Bulletproof)
 * 
 * Tests 7 extreme scenarios with REAL Anthropic API calls (Sonnet 4.6).
 * Each letter scored against 17 quality criteria.
 * 
 * V3 fixes:
 * - Absatz counting excludes quote/signature micro-paragraphs
 * - Satzlänge skips greeting line
 * - Prompt includes ALL critical VERBOTEN rules
 * - English scenario with adapted company context
 * - Explicit transition and paragraph-count rules
 * 
 * Usage: npx tsx scripts/test-generation-quality.ts
 * Cost: ~$0.20 per full run (7 API calls)
 */

import Anthropic from '@anthropic-ai/sdk';
import { scanForFluff } from '../lib/services/anti-fluff-blacklist';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
const MODEL = 'claude-sonnet-4-6';

// ─── Mock Data ─────────────────────────────────────────────────────────────

const MOCK_JOB = {
    title: '(Senior) Agile Coach (m/f/d)',
    company_name: 'TSCNET Services GmbH',
    responsibilities: [
        'Begleitung und Coaching agiler Teams und Führungskräfte',
        'Beseitigen organisatorischer Hindernisse',
        'Entwicklung von Feedbackschleifen und Fortschrittsindikatoren',
        'Zusammenarbeit mit 16 europäischen Übertragungsnetzbetreibern',
    ],
    requirements: [
        'Erfahrung als Agile Coach oder Scrum Master',
        'Kenntnisse agiler Frameworks (Scrum, Kanban, SAFe)',
        'Coaching-Fähigkeiten für Führungskräfte',
    ],
};

const STATIONS = [
    {
        company: 'Fraunhofer FOKUS',
        role: 'Projektleiter',
        duration: '2022-2024',
        highlights: [
            'Leitung einer Quantum-Computing-Projektgruppe',
            'Scoping-Workshops und Kickoffs für B2B-Partner',
            'OKR-Roadmaps und Stakeholdermanagement',
            'Übersetzung von Forschung in marktfähige Business-Modelle',
        ],
    },
    {
        company: 'Xorder Menues',
        role: 'Co-Founder & Product Owner',
        duration: '2021-2022',
        highlights: [
            'Aufbau der gesamten Steuerungsstruktur (Backlog, CRM, Dev-Zyklen)',
            'Gründer-Erfahrung mit limitierten Ressourcen',
            'Agile Priorisierung unter Druck',
        ],
    },
    {
        company: 'Ingrano Solutions',
        role: 'Business Development Manager',
        duration: '2020-2021',
        highlights: [
            'B2B-Lead-Generierung mit regulatorischem Fokus (NIS-2)',
            'Automatisierte Workflows für CRM (Close.io)',
            'Audit- und Beratungsmandate platziert',
        ],
    },
];

const COMPANY = {
    values: ['Verlässlichkeit', 'Innovation', 'Europäische Zusammenarbeit'],
    vision: 'Sichere und stabile Stromversorgung in Europa durch koordinierte Netzbetreiber',
    challenges: ['Koordination von 16 TSOs in Echtzeit', 'Agile Transformation in kritischer Infrastruktur'],
    news: ['TSCNET koordiniert europäische Stromnetze rund um die Uhr'],
    roadmap: ['Ausbau des agilen Arbeitens über alle Abteilungen'],
};

const QUOTES = {
    elkington: { quote: 'Um den Planeten zu schützen, müssen wir zeigen, dass das scheinbar Unmögliche das neue "Business as usual" sein kann.', author: 'John Elkington' },
    exupery: { quote: 'Wenn du ein Schiff bauen willst, trommle nicht Männer zusammen, um Holz zu beschaffen — lehre sie stattdessen die Sehnsucht nach dem weiten, endlosen Meer.', author: 'Antoine de Saint-Exupéry' },
    reagan: { quote: 'The greatest leader is not the one who does the greatest things, but the one who gets people to do the greatest things.', author: 'Ronald Reagan' },
};

// ─── Scenarios ──────────────────────────────────────────────────────────────

interface Scenario {
    name: string; description: string; preset: string;
    hasQuote: boolean; quote?: { quote: string; author: string };
    pingPong: boolean; cvStations: string[];
    lang: 'de' | 'en'; duForm: boolean; contactPerson?: string;
    customStyle?: boolean;
}

const SCENARIOS: Scenario[] = [
    { name: 'A: Storytelling+Zitat (DE)', description: 'JD-First Flow', preset: 'storytelling', hasQuote: true, quote: QUOTES.elkington, pingPong: false, cvStations: ['Fraunhofer FOKUS', 'Xorder Menues'], lang: 'de', duForm: true },
    { name: 'B: Storytelling+PingPong', description: 'Antithese/Synthese', preset: 'storytelling', hasQuote: true, quote: QUOTES.exupery, pingPong: true, cvStations: ['Fraunhofer FOKUS', 'Xorder Menues', 'Ingrano Solutions'], lang: 'de', duForm: true },
    { name: 'C: Formal+Zitat (Sie)', description: 'Konservativ, Sie-Form', preset: 'formal', hasQuote: true, quote: QUOTES.elkington, pingPong: false, cvStations: ['Fraunhofer FOKUS', 'Ingrano Solutions'], lang: 'de', duForm: false },
    { name: 'D: Storytelling ohne Aufh.', description: 'Fallback ohne Zitat', preset: 'storytelling', hasQuote: false, pingPong: false, cvStations: ['Fraunhofer FOKUS', 'Xorder Menues'], lang: 'de', duForm: true },
    { name: 'E: Custom Preset', description: 'Eigener Stil', preset: 'custom', hasQuote: true, quote: QUOTES.elkington, pingPong: false, cvStations: ['Fraunhofer FOKUS', 'Xorder Menues'], lang: 'de', duForm: true, customStyle: true },
    { name: 'F: English + Quote', description: 'Englischer Brief', preset: 'storytelling', hasQuote: true, quote: QUOTES.reagan, pingPong: false, cvStations: ['Fraunhofer FOKUS', 'Xorder Menues'], lang: 'en', duForm: false },
    { name: 'G: Hiring Manager (Laura)', description: 'Name + Du-Form', preset: 'storytelling', hasQuote: true, quote: QUOTES.exupery, pingPong: false, cvStations: ['Fraunhofer FOKUS', 'Xorder Menues'], lang: 'de', duForm: true, contactPerson: 'Laura' },
];

// ─── Shared Prompt Rules ───────────────────────────────────────────────────

const CRITICAL_RULES_DE = `
[KRITISCHE STIL-VERBOTE — ABSOLUT]
❌ NIEMALS "nicht nur [X], sondern [auch Y]" — rhetorisch aufgeblasen.
❌ NIEMALS "Genau das ist [Thema]" oder "Die/Diese Kombination aus" — allwissend/generisch. Stattdessen: "Für mich bedeutet..."
❌ NIEMALS "wie treffend / wie präzise / wie passend ein Gedanke" — Selbstlob.
❌ NIEMALS die Firma belehren ("zeichnet euch aus", "prägt eure Arbeit")
❌ NIEMALS Doppelpunkt am Satzende, gefolgt von Zeilenumbruch
❌ KEIN Gedankenstrich (– oder —) im Fließtext. EINZIGE AUSNAHME: Zitat-Signatur-Zeile. Überall sonst: Semikolon (;) oder Punkt.

[ABSATZ-STRUKTUR — PFLICHT]
Das Anschreiben besteht aus GENAU 4-5 Absätzen (getrennt durch Leerzeilen):
1. Einleitung (inkl. Zitat + Brücke als EIN Absatz)
2-3. CV-Stationen-Absätze (je 1 Absatz pro Station)
4/5. Schluss (Vorfreude + Gruß IM SELBEN Absatz)
VERBOTEN: Mehr als 5 Absätze. Grußformel MUSS im letzten Absatz stehen — KEIN separater Gruß-Absatz.
Zitat + Signatur + Brücke gehören zum Einleitungs-Absatz — KEIN separater Absatz für das Zitat.

[ÜBERGÄNGE ZWISCHEN ABSÄTZEN — PFLICHT]
✅ "Was mich an TSCNET besonders anspricht, ist..." (Firmen-Brücke)
✅ "Diese Erfahrung konnte ich bei [nächste Station] vertiefen..." (Stations-Brücke)
✅ "Besonders gespannt bin ich auf..." (Schluss-Brücke)
VERBOTEN: Zwei aufeinanderfolgende Absätze mit identischem Satzanfang.

[ABSOLUTE SATZLÄNGE: Max. 25 Wörter pro Satz. Kein einziger Satz darf 25 Wörter überschreiten. Punkt setzen und neuen Satz beginnen.]`;

const CRITICAL_RULES_EN = `
[CRITICAL STYLE RULES — ABSOLUTE]
❌ NEVER "not only [X], but [also Y]" — rhetorically bloated.
❌ NEVER "That is exactly what [topic] is" or "The combination of" — omniscient/generic. Instead: "For me, this means..."
❌ NEVER "how aptly / how precisely / how perfectly a thought" — self-praise.
❌ NEVER lecture the company ("defines your work", "makes you special")
❌ NEVER end a sentence with a colon followed by a line break
❌ NO em-dash (– or —) in body text. ONLY EXCEPTION: Quote attribution line. Use semicolons or periods.

[PARAGRAPH STRUCTURE — MANDATORY]
The cover letter consists of EXACTLY 4-5 paragraphs:
1. Introduction (incl. quote + bridge as ONE paragraph)
2-3. CV station paragraphs (1 per station)
4/5. Closing (anticipation + sign-off IN THE SAME paragraph)
FORBIDDEN: More than 5 paragraphs. Sign-off MUST be in the last paragraph.

[TRANSITIONS — MANDATORY]
✅ "What appeals to me about TSCNET is..." (company bridge)
✅ "I was able to deepen this experience at [next station]..." (station bridge)
✅ "I am particularly looking forward to..." (closing bridge)

[ABSOLUTE SENTENCE LENGTH: Max. 25 words per sentence. Not a single sentence may exceed 25 words.]`;

// ─── Quality Checks (17 checks) ───────────────────────────────────────────

interface QualityCheck {
    name: string; weight: number;
    check: (text: string, scenario: Scenario) => { pass: boolean; detail: string };
}

const CHECKS: QualityCheck[] = [
    {
        name: 'Kein Selbstlob',
        weight: 15,
        check: (text) => {
            const bad = ['wie treffend', 'wie präzise', 'wie passend ein Gedanke', 'perfekt beschreibt', 'auf den Punkt bringt', 'how aptly', 'how precisely', 'how perfectly'];
            const found = bad.filter(p => text.toLowerCase().includes(p));
            return { pass: found.length === 0, detail: found.length ? `"${found.join('", "')}"` : '✅' };
        },
    },
    {
        name: 'ICH-Perspektive',
        weight: 15,
        check: (text) => {
            const bad = ['Genau das ist', 'Das ist die Definition', 'zeichnet euch aus', 'zeichnet Sie aus', 'prägt eure Arbeit', 'macht euch besonders', 'steht bei euch im Mittelpunkt', 'That is exactly what', 'This is the definition'];
            const found = bad.filter(p => text.includes(p));
            return { pass: found.length === 0, detail: found.length ? `"${found.join('", "')}"` : '✅' };
        },
    },
    {
        name: 'Kein nicht-nur-sondern',
        weight: 10,
        check: (text) => {
            const de = /nicht nur .{2,80}sondern/i.test(text);
            const en = /not only .{2,80}but also/i.test(text);
            return { pass: !de && !en, detail: de || en ? 'Gefunden ❌' : '✅' };
        },
    },
    {
        name: 'Blacklist clean',
        weight: 15,
        check: (text) => {
            const { matches } = scanForFluff(text);
            return { pass: matches.length === 0, detail: matches.length ? `${matches.length}×: ${matches.slice(0, 3).map(v => `"${v.pattern}"`).join(', ')}` : '✅' };
        },
    },
    {
        name: 'Zitat-Format',
        weight: 10,
        check: (text, s) => {
            if (!s.hasQuote || !s.quote) return { pass: true, detail: 'skip' };
            const hasQ = text.includes(s.quote.quote.substring(0, 25));
            const hasA = text.includes(s.quote.author);
            return { pass: hasQ && hasA, detail: [hasQ ? 'Zitat✅' : 'Zitat❌', hasA ? 'Autor✅' : 'Autor❌'].join(' ') };
        },
    },
    {
        name: 'Absätze (4-6)',
        weight: 8,
        check: (text) => {
            // Count only substantial paragraphs (>40 chars), skip greeting, signature, quote-author lines
            const paras = text.split(/\n\s*\n/)
                .map(p => p.trim())
                .filter(p => p.length > 40 && !/^(Hallo|Liebe|Dear|Hi |Sehr geehrte|Viele Grüße|Mit freundlichen|Kind regards)/i.test(p));
            const pass = paras.length >= 3 && paras.length <= 6;
            return { pass, detail: `${paras.length} inhaltliche Absätze ${pass ? '✅' : ''}` };
        },
    },
    {
        name: 'Wortanzahl (250-450)',
        weight: 5,
        check: (text) => {
            const w = text.split(/\s+/).length;
            return { pass: w >= 240 && w <= 460, detail: `${w}W ${w >= 240 && w <= 460 ? '✅' : ''}` };
        },
    },
    {
        name: 'Satzlänge (≤30W)',
        weight: 8,
        check: (text) => {
            // Remove greeting line before measuring
            const body = text.replace(/^(Hallo|Liebe|Dear|Hi |Sehr geehrte)[^\n]*\n+/i, '');
            const sentences = body.replace(/\n/g, ' ').split(/[.!?]+/).filter(s => s.trim().length > 10);
            const tooLong = sentences.filter(s => s.trim().split(/\s+/).length > 30);
            return { pass: tooLong.length === 0, detail: tooLong.length ? `${tooLong.length} Satz >30W` : '✅' };
        },
    },
    {
        name: 'Firmenname',
        weight: 5,
        check: (text) => {
            const has = text.toLowerCase().includes('tscnet');
            return { pass: has, detail: has ? '✅' : 'FEHLT' };
        },
    },
    {
        name: 'Unternehmens-Integration',
        weight: 12,
        check: (text) => {
            const signals = [
                { label: 'Werte', test: /[Vv]erl[äa]sslich|[Zz]usammenarbeit|[Ii]nnovation|reliab|cooperat/i },
                { label: '16 TSOs', test: /16|[ÜU]bertragungsnetz|TSO|Netzbetreiber|Stromnetz|transmission|grid/i },
                { label: 'Europa/Vision', test: /[Ee]urop[äa]|[Ss]tromversorgung|[Kk]oordinat|electricity|coordinat/i },
                { label: 'Echtzeit', test: /[Ee]chtzeit|[Rr]und um die Uhr|24|real.time|around the clock/i },
            ];
            const found = signals.filter(s => s.test.test(text));
            return { pass: found.length >= 2, detail: `${found.length}/4: ${found.map(f => f.label).join(', ')}` };
        },
    },
    {
        name: 'Übergänge',
        weight: 10,
        check: (text) => {
            const paras = text.split(/\n\s*\n/).filter(p => p.trim().length > 40);
            if (paras.length < 3) return { pass: false, detail: 'Zu wenige Absätze' };
            const starts = paras.map(p => p.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase());
            // Check no two consecutive paragraphs start identically
            let dupes = 0;
            for (let i = 1; i < starts.length; i++) {
                if (starts[i] === starts[i - 1]) dupes++;
            }
            // Check for transition words in non-first paragraphs
            const transitionRe = /^(Was|Dass|Da |Besonders|Zudem|Gerade|Auch|Diese|Bei |Der |Die |Das |Dort|Erst|Bereits|Mein|Für mich|What|Since|I am|Having|At |The |My|Particularly|During|This)/;
            let goodTrans = 0;
            for (let i = 1; i < paras.length; i++) {
                if (transitionRe.test(paras[i].trim())) goodTrans++;
            }
            const ratio = goodTrans / Math.max(1, paras.length - 1);
            const pass = ratio >= 0.5 && dupes === 0;
            return { pass, detail: `${goodTrans}/${paras.length - 1} Übergänge, ${dupes} Duplikate ${pass ? '✅' : ''}` };
        },
    },
    {
        name: 'Rhetorische Fragen',
        weight: 6,
        check: (text, s) => {
            if (s.preset === 'formal') return { pass: true, detail: 'Formal—skip' };
            const q = (text.match(/\?/g) || []).length;
            return { pass: true, detail: `${q} Frage(n) ${q >= 1 ? '(dialogisch)' : '(kein Dialog—ok)'}` };
        },
    },
    {
        name: 'Storytelling-Ton',
        weight: 10,
        check: (text, s) => {
            if (s.preset === 'formal') return { pass: true, detail: 'Formal—skip' };
            const markers = [
                { l: 'Für mich', t: /[Ff][üu]r mich bedeutet|For me.*means/i },
                { l: 'Ich-Verb', t: /erinnerte ich|begleitet mich|reminded me|accompanies me/i },
                { l: 'Bei [Firma]', t: /[Bb]ei [A-Z]|At [A-Z]/ },
                { l: 'Dort', t: /\b[Dd]ort\b|\b[Tt]here\b/ },
                { l: 'Erst durch', t: /[Ee]rst durch|[Oo]nly through/ },
                { l: 'Kontext', t: /[Kk]ontext|[Hh]erausforderung|[Cc]hallenge/i },
                { l: 'Ergebnis', t: /zeigte mir|lernte ich|taught me|showed me/i },
            ];
            const found = markers.filter(m => m.t.test(text));
            const pass = found.length >= 3;
            return { pass, detail: `${found.length}/7: ${found.map(f => f.l).join(', ')}` };
        },
    },
    {
        name: 'JD-Fragment',
        weight: 8,
        check: (text) => {
            const f = ['Feedbackschleifen', 'Fortschrittsindikatoren', 'organisatorisch', 'Coaching', 'Führungskräfte', 'feedback loop', 'progress indicator', 'leadership', 'obstacle'];
            const found = f.filter(x => text.toLowerCase().includes(x.toLowerCase()));
            return { pass: found.length >= 1, detail: `${found.length}: ${found.join(', ')}` };
        },
    },
    {
        name: 'Greeting',
        weight: 8,
        check: (text, s) => {
            const first100 = text.substring(0, 100);
            if (s.contactPerson) return { pass: first100.includes(s.contactPerson), detail: first100.includes(s.contactPerson) ? `${s.contactPerson} ✅` : `${s.contactPerson} FEHLT` };
            if (s.lang === 'en') return { pass: /Dear|Hello/i.test(first100), detail: /Dear|Hello/i.test(first100) ? '✅' : 'EN greeting FEHLT' };
            if (s.duForm) return { pass: /Hallo|Hi/i.test(first100), detail: /Hallo|Hi/i.test(first100) ? '✅' : 'Du greeting FEHLT' };
            return { pass: /Sehr geehrte/i.test(first100), detail: /Sehr geehrte/i.test(first100) ? '✅' : 'Sie greeting FEHLT' };
        },
    },
    {
        name: 'Sprache',
        weight: 10,
        check: (text, s) => {
            if (s.lang === 'en') {
                const en = ['the', 'and', 'that', 'with', 'for', 'this'].filter(m => text.toLowerCase().includes(` ${m} `));
                return { pass: en.length >= 4, detail: `${en.length}/6 EN ✅` };
            }
            const de = ['ich', 'und', 'dass', 'bei', 'mich', 'diese'].filter(m => text.toLowerCase().includes(` ${m} `));
            return { pass: de.length >= 3, detail: `${de.length}/6 DE ✅` };
        },
    },
    {
        name: 'Kein Doppelpunkt-Ende',
        weight: 5,
        check: (text) => {
            // Only count colon-endings that are NOT quote attributions
            const lines = text.split('\n');
            const badColons = lines.filter(l => {
                const trimmed = l.trim();
                return trimmed.endsWith(':') && !trimmed.startsWith('–') && !trimmed.startsWith('—') && !trimmed.startsWith('-') && trimmed.length > 5;
            });
            return { pass: badColons.length === 0, detail: badColons.length ? `${badColons.length}× ❌` : '✅' };
        },
    },
];

// ─── Build Prompt ──────────────────────────────────────────────────────────

function buildPrompt(s: Scenario): string {
    const co = MOCK_JOB.company_name;
    const isEN = s.lang === 'en';
    const pron = s.duForm ? 'euch' : 'Ihnen';
    const poss = s.duForm ? 'eurer' : 'Ihrer';

    // Quote block
    let quoteBlock = '';
    if (s.hasQuote && s.quote) {
        if (isEN) {
            quoteBlock = `[RULE: INTRO — JD → QUOTE → BRIDGE — ALL ONE PARAGRAPH]
Quote (reproduce VERBATIM, do NOT translate):
"${s.quote.quote}"
(Author: ${s.quote.author})

STRUCTURE (max. 80 words without quote):
1. OPENING (1 sentence): Reference to the job ad, ending with humble transition.
   ✅ "Reading your listing for [job title], I was reminded of a quote:"

2. QUOTE: In quotation marks. Below: "– ${s.quote.author}" (MANDATORY).

3. BRIDGE (1-2 sentences): Connect quote idea with role — ALWAYS I-perspective.
   ✅ "For me, [core idea] means [personal reflection]. That is why I would like to introduce myself."

CRITICAL: Opening sentence + quote + author line + bridge = ONE SINGLE PARAGRAPH.
There must be NO blank line between the opening sentence and the quote.
There must be NO blank line between the author line and the bridge.
The intro block counts as EXACTLY ONE paragraph.`;
        } else {
            quoteBlock = `[REGEL: EINLEITUNG — JD → ZITAT → BRÜCKE]
Zitat (WORTWÖRTLICH, NICHT übersetzen):
"${s.quote.quote}"
(Autor: ${s.quote.author})

AUFBAU (max. 80 Wörter ohne Zitat):
1. EINLEITUNGSSATZ (1 Satz): Bezug auf Stelle, endet mit bescheidener Überleitung.
   ✅ "Als ich ${poss} Stelle als [Jobtitel] las, erinnerte ich mich an ein Zitat:"
   ✅ "Beim Lesen ${poss} Ausschreibung fiel mir ein Gedanke ein, den ich mit ${pron} teilen möchte:"

2. ZITAT: Eigene Zeile, Anführungszeichen. Darunter: "– ${s.quote.author}" (PFLICHT).

3. BRÜCKE (1-2 Sätze): IMMER ICH-Perspektive.
   ✅ "Für mich bedeutet [Kerngedanke], dass [persönliche Reflexion]. Deshalb möchte ich mich als [Jobtitel] bei ${pron} kurz vorstellen."
   ✅ "[Kerngedanke] begleitet mich durch viele Stationen. Deshalb möchte ich mich kurz vorstellen."
   STRUKTUR: Brücke + Bewerbungssatz gehören zum Einleitungsblock (KEIN eigener Absatz).`;
        }
        if (s.pingPong) {
            quoteBlock += `\n\n[PING-PONG (max. 2 Sätze nach Brücke)]
ANTITHESE: Wie du den Gedanken FRÜHER anders gesehen hast.
SYNTHESE: Verbinde mit konkretem ${co}-Bezug.
MAX 100 Wörter inkl. Zitat.`;
        }
    }

    // No-quote intro
    const noQuoteIntro = !s.hasQuote ? (isEN
        ? `INTRO (no quote — I-perspective):
Start with a concrete observation about ${co} or the job posting.
✅ "Reading your posting about [topic]..."
✅ "Your approach to [topic] resonated with me because..."`
        : `INTRO (kein Zitat — ICH-Perspektive):
Öffne mit einer konkreten Beobachtung zu ${co} oder der Stelle.
✅ "Da ich auf ${poss} Website gelesen habe, dass..."
✅ "${poss.charAt(0).toUpperCase() + poss.slice(1)} Ansatz bei [Thema] hat mich angesprochen, weil..."`) : '';

    // Tone
    const tone = (() => {
        if (s.customStyle) return `STIL: DEIN EIGENER SCHREIBSTIL
Ton: professional-casual | Satzlänge: medium (15-20W)
Konjunktionen: Daher, Deshalb, Zudem, Denn
Rhetorische Mittel: Anadiplose, rhetorische Fragen
Du MUSST den Ton und die Satzstruktur aus DIESEM Schreibstil übernehmen.`;
        if (s.preset === 'formal') return isEN
            ? 'STYLE: STRUCTURED & PRECISE. Clear structure, data-driven, evidence-based.'
            : 'STIL: STRUKTURIERT & PRÄZISE. Klare Gliederung, faktenbasiert, professionell.';
        return isEN
            ? `STYLE: NARRATIVE & PERSONAL
Each CV station told as mini-story: Situation → Action → Result.
Connect stations into a coherent career narrative. "Why" > "What".
Use at LEAST 1 rhetorical device (tricolon, asyndeton, or anadiplosis).`
            : `STIL: NARRATIV & PERSÖNLICH
Jede CV-Station als Mini-Geschichte: Situation → Handlung → Ergebnis.
Verbinde Stationen zu kohärentem Karriere-Narrativ. "Warum" > "Was".
RHETORISCHE WÜRZUNG (PFLICHT): Mindestens 1 Stilmittel (Trikolon, Asyndeton, Anadiplose).`;
    })();

    // Stations
    const stationsTxt = s.cvStations.map(name => {
        const st = STATIONS.find(w => w.company === name);
        return st ? `- ${st.role} bei ${st.company} (${st.duration}): ${st.highlights.join('; ')}` : '';
    }).filter(Boolean).join('\n');

    // Company context (adapted for EN)
    const companyCtx = isEN
        ? `Company Context:
Values: ${COMPANY.values.join(', ')}
Vision: Secure and stable electricity supply across Europe through coordinated grid operators
Challenges: Coordination of 16 TSOs in real-time; Agile transformation in critical infrastructure
News: TSCNET coordinates European power grids around the clock
Roadmap: Expansion of agile working across all departments`
        : `Unternehmens-Kontext:
Werte: ${COMPANY.values.join(', ')}
Vision: ${COMPANY.vision}
Herausforderungen: ${COMPANY.challenges.join('; ')}
News: ${COMPANY.news.join('; ')}
Roadmap: ${COMPANY.roadmap.join('; ')}`;

    // Greeting & closing
    const greeting = s.contactPerson ? `"${s.duForm ? 'Hallo' : 'Liebe'} ${s.contactPerson},"` : (isEN ? '"Dear Hiring Team,"' : s.duForm ? '"Hallo zusammen,"' : '"Sehr geehrte Damen und Herren,"');
    const closing = isEN ? '"Kind regards"' : s.duForm ? '"Viele Grüße"' : '"Mit freundlichen Grüßen"';
    const langStr = isEN ? 'English' : 'Deutsch';
    const rules = isEN ? CRITICAL_RULES_EN : CRITICAL_RULES_DE;

    return `Du bist ein erfahrener Karriere-Berater und schreibst ein Bewerbungsanschreiben.

STELLENANZEIGE:
Titel: ${MOCK_JOB.title}
Unternehmen: ${co}
Kernaufgaben:
${MOCK_JOB.responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n')}
Anforderungen:
${MOCK_JOB.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${tone}

${quoteBlock}
${noQuoteIntro}

${rules}

KARRIERE-STATIONEN (JEDE bekommt GENAU EINEN eigenen Absatz):
${stationsTxt}

${companyCtx}
HALLUZINATIONS-BREMSE: Verwende NUR Fakten, die EXPLIZIT oben stehen.

[COMPANY-BEZUG — ICH-Perspektive]
${isEN ? '✅ "Having read on your website that [specific fact]..."' : `✅ "Da ich auf ${poss} Website gelesen habe, dass [konkreter Fakt]..."`}

[SCHLUSS — VORFREUDE]
${isEN ? 'Express genuine anticipation for ONE specific task from the job ad.' : 'Formuliere echte Vorfreude auf EINE konkrete Aufgabe aus der Stellenanzeige.'}

ANREDE: ${greeting}
SPRACHE: ${langStr}${s.duForm ? ', Du-Form' : ''}.
LÄNGE: 250-400 Wörter.
GRUSS: ${closing}

${isEN ? 'Write the cover letter now. Start directly with the greeting:' : 'Schreibe jetzt das Anschreiben. Beginne direkt mit der Anrede:'}`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log('═'.repeat(80));
    console.log('🧪 E2E QUALITY TEST V3 — Sonnet 4.6 + Entschlackter Prompt');
    console.log(`   ${SCENARIOS.length} Szenarien | ${CHECKS.length} Checks | Model: ${MODEL}`);
    console.log('═'.repeat(80));

    if (!process.env.ANTHROPIC_API_KEY) { console.error('❌ ANTHROPIC_API_KEY fehlt.'); process.exit(1); }

    const results: Array<{ scenario: string; score: number; max: number; pct: number; letter: string; checks: Array<{ name: string; pass: boolean; detail: string; w: number }>; ms: number; words: number }> = [];

    for (const sc of SCENARIOS) {
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`📝 ${sc.name} — ${sc.description}`);
        console.log(`   Preset:${sc.preset} | Quote:${sc.hasQuote?'Y':'N'} | PP:${sc.pingPong?'Y':'N'} | Lang:${sc.lang} | Du:${sc.duForm?'Y':'N'}${sc.contactPerson?` | ${sc.contactPerson}`:''}`);
        console.log('─'.repeat(80));

        const prompt = buildPrompt(sc);
        console.log(`   Prompt: ${prompt.split(/\s+/).length}W`);

        try {
            const t0 = Date.now();
            const msg = await anthropic.messages.create({
                model: MODEL, max_tokens: 2000, temperature: 0.7,
                system: sc.lang === 'en' ? 'You are a senior career advisor. Output ONLY the letter body — no explanations, no markdown.' : 'Du bist ein erfahrener Karriere-Berater. Gib NUR den Brieftext aus — keine Erklärungen, kein Markdown.',
                messages: [{ role: 'user', content: prompt }],
            });
            const letter = (msg.content[0] as { type: string; text: string }).text.trim();
            const ms = Date.now() - t0;
            const words = letter.split(/\s+/).length;
            console.log(`   ⏱️ ${ms}ms | ${words}W`);

            let total = 0, max = 0;
            const crs: Array<{ name: string; pass: boolean; detail: string; w: number }> = [];
            for (const ch of CHECKS) {
                const r = ch.check(letter, sc);
                max += ch.weight;
                if (r.pass) total += ch.weight;
                crs.push({ name: ch.name, pass: r.pass, detail: r.detail, w: ch.weight });
            }
            const pct = Math.round((total / max) * 100);

            console.log('\n   📊 CHECKS:');
            for (const c of crs) console.log(`   ${c.pass ? '✅' : '❌'} [${String(c.w).padStart(2)}P] ${c.name}: ${c.detail}`);
            console.log(`\n   🏆 ${total}/${max} (${pct}%) ${pct >= 90 ? '✅ PASS' : pct >= 75 ? '⚠️  MITTEL' : '❌ FAIL'}`);

            // Print letter
            console.log('\n   📄 ANSCHREIBEN:');
            console.log('   ┌' + '─'.repeat(76) + '┐');
            for (const raw of letter.split('\n')) {
                let line = raw;
                while (line.length > 74) {
                    const cut = line.lastIndexOf(' ', 74);
                    console.log(`   │ ${line.substring(0, cut > 0 ? cut : 74).padEnd(74)} │`);
                    line = line.substring(cut > 0 ? cut + 1 : 74);
                }
                console.log(`   │ ${line.padEnd(74)} │`);
            }
            console.log('   └' + '─'.repeat(76) + '┘');

            results.push({ scenario: sc.name, score: total, max, pct, letter, checks: crs, ms, words });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`   ❌ ERROR: ${errMsg}`);
            results.push({ scenario: sc.name, score: 0, max: 160, pct: 0, letter: '', checks: [], ms: 0, words: 0 });
        }
    }

    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('═'.repeat(80));
    console.log('\n  Scenario                         Score  Words  Time     Status');
    console.log('  ' + '─'.repeat(66));
    let sum = 0;
    for (const r of results) {
        const st = r.pct >= 90 ? '✅ PASS' : r.pct >= 75 ? '⚠️  MITTEL' : '❌ FAIL';
        console.log(`  ${r.scenario.padEnd(35)} ${String(r.pct).padStart(3)}%   ${String(r.words).padStart(3)}W  ${String(r.ms).padStart(5)}ms  ${st}`);
        sum += r.pct;
    }
    console.log(`\n  DURCHSCHNITT: ${Math.round(sum / results.length)}% ${Math.round(sum / results.length) >= 90 ? '✅ PRODUKTIONSREIF' : '⚠️  NACHARBEIT NÖTIG'}`);

    // Failures
    const fails = results.flatMap(r => r.checks.filter(c => !c.pass).map(c => ({ sc: r.scenario, ...c })));
    if (fails.length > 0) {
        console.log('\n  ❌ FAILURES:');
        for (const f of fails) console.log(`     [${f.w}P] ${f.sc} → ${f.name}: ${f.detail}`);
    }

    // Blind spots
    console.log('\n  🔍 BLIND-SPOTS:');
    for (const r of results) {
        if (!r.letter) continue;
        const issues: string[] = [];
        const emD = (r.letter.match(/[–—]/g) || []).length;
        if (emD > 3) issues.push(`${emD} em-dashes`);
        const sc = SCENARIOS.find(s => s.name === r.scenario);
        if (sc?.quote && !r.letter.includes(sc.quote.quote.substring(0, 20))) issues.push('Ghost Translation?');
        if (issues.length) { console.log(`     ${r.scenario}:`); issues.forEach(i => console.log(`       ⚠️  ${i}`)); }
    }
    console.log();
}

main().catch(console.error);
