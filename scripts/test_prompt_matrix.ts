/**
 * Mini-Testmatrix: Prompt Snapshot für 6 Kombinationen
 * Prüft Struktur/Presence der generierten Prompt-Blöcke (nicht "Schönheit").
 */

import { buildSystemPrompt } from '../lib/services/cover-letter-prompt-builder';
import type { CoverLetterSetupContext, SelectedHook, SelectedQuote, ToneConfig, SelectedCVStation } from '../types/cover-letter-setup';

// ─── Shared Fixtures ──────────────────────────────────────────────────────────
const profile = { cv_structured_data: { experience: ['Ingrano', 'Fraunhofer', 'MIZ'] } };
const job = { job_title: 'Innovation Manager', company_name: 'JobTeaser', requirements: ['Netzwerkausbau', 'Kommunikation', 'Projektmanagement'] };
const company = { company_values: ['Innovation', 'Junge Talente'], tech_stack: [] };

const hook: SelectedHook = {
    id: '1', type: 'vision', label: 'Vision',
    content: 'JobTeaser sieht die neue Generation als Zukunft der Unternehmen und will jungen Talenten Raum geben.',
    sourceName: 'Website', sourceUrl: '', sourceAge: '', relevanceScore: 0.9
};

const quote: SelectedQuote = {
    quote: 'The best way to predict the future is to create it.',
    author: 'Peter Drucker', source: 'General', matchedValue: 'Innovation', relevanceScore: 0.9
};

const stations: SelectedCVStation[] = [{
    stationIndex: 1, company: 'Ingrano Solutions', role: 'Innovation & Process Manager',
    period: '2020 - 2022', keyBullet: 'Netzwerk aufgebaut', matchedRequirement: 'Netzwerkausbau',
    intent: 'Zeigen, dass ich 2 Welten zusammenbringen kann'
}];

const baseTone = (preset: string, formality: 'du' | 'sie' = 'du'): ToneConfig => ({
    preset: preset as any, targetLanguage: 'de', hasStyleSample: false,
    styleWarningAcknowledged: true, formality
});

function makeCtx(overrides: Partial<CoverLetterSetupContext>): CoverLetterSetupContext {
    return {
        jobId: 'test', companyName: 'JobTeaser',
        selectedHook: hook, cvStations: stations,
        tone: baseTone('formal'), autoFilled: false, completedAt: 'now',
        introFocus: 'quote', ...overrides
    };
}

// ─── Test Cases ───────────────────────────────────────────────────────────────
interface TestCase {
    name: string;
    ctx: CoverLetterSetupContext;
    checks: { label: string; test: (prompt: string) => boolean }[];
}

const tests: TestCase[] = [
    {
        name: '1. Quote only',
        ctx: makeCtx({ selectedQuote: quote, selectedHook: { ...hook, content: '' } }),
        checks: [
            { label: 'Quote text present', test: p => p.includes(quote.quote) },
            { label: 'No hookBodyBlock', test: p => !p.includes('ABSATZ 2') },
        ]
    },
    {
        name: '2. Hook only',
        ctx: makeCtx({ selectedQuote: undefined }),
        checks: [
            { label: 'Hook in intro', test: p => p.includes('Unternehmens-Fakt') },
            { label: 'No quote block', test: p => !p.includes('ZITAT-BRIDGING') },
        ]
    },
    {
        name: '3. Quote + Hook (focus=quote)',
        ctx: makeCtx({ selectedQuote: quote, introFocus: 'quote' }),
        checks: [
            { label: 'Quote in intro (ZITAT-BRIDGING)', test: p => p.includes('ZITAT-BRIDGING') },
            { label: 'Hook in body (ABSATZ 2)', test: p => p.includes('ABSATZ 2') },
            { label: 'No rigid "Als ich gesehen habe"', test: p => !p.includes('Als ich gesehen habe') },
            { label: 'Dynamic sentence limit (5 SÄTZE)', test: p => p.includes('5 SÄTZE') },
        ]
    },
    {
        name: '4. Quote + Hook + Philosophisch',
        ctx: makeCtx({ selectedQuote: quote, introFocus: 'quote', tone: baseTone('philosophisch') }),
        checks: [
            { label: 'Quote in intro', test: p => p.includes('ZITAT-BRIDGING') },
            { label: 'Hook in body', test: p => p.includes('ABSATZ 2') },
            { label: 'Philosophisch preset active', test: p => p.includes('INTELLEKTUELL') },
            { label: 'No competing quote format in preset', test: p => !p.includes('Starte mit einem relevanten Zitat') },
            { label: 'Preset defers to Sektion 3', test: p => p.includes('Sektion 3 (Aufhänger) gesteuert') },
            { label: 'Dynamic sentence limit', test: p => p.includes('5 SÄTZE') },
        ]
    },
    {
        name: '5. Quote + Philosophisch (no hook)',
        ctx: makeCtx({ selectedQuote: quote, selectedHook: { ...hook, content: '' }, tone: baseTone('philosophisch') }),
        checks: [
            { label: 'Quote in intro', test: p => p.includes(quote.quote) },
            { label: 'No hookBody block', test: p => !p.includes('ABSATZ 2') },
            { label: 'Preset defers to Sektion 3', test: p => p.includes('Sektion 3 (Aufhänger) gesteuert') },
        ]
    },
    {
        name: '6. Hook + Philosophisch (no quote)',
        ctx: makeCtx({ selectedQuote: undefined, tone: baseTone('philosophisch') }),
        checks: [
            { label: 'Hook in intro', test: p => p.includes('Unternehmens-Fakt') },
            { label: 'No quote block', test: p => !p.includes('ZITAT-BRIDGING') },
            { label: 'Preset uses full opening (Beobachtung)', test: p => p.includes('relevanten Beobachtung') },
            { label: 'Standard 2 SÄTZE limit', test: p => p.includes('MAXIMAL 2 SÄTZE') },
        ]
    },
];

// ─── Runner ───────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log(' MINI-TESTMATRIX: Prompt Constraint Validation');
console.log('═══════════════════════════════════════════════════════\n');

let totalPassed = 0;
let totalFailed = 0;

for (const tc of tests) {
    const prompt = buildSystemPrompt(profile as any, job as any, company as any, null, tc.ctx, [], 0);
    console.log(`▸ ${tc.name}`);
    for (const check of tc.checks) {
        const pass = check.test(prompt);
        console.log(`  ${pass ? '✅' : '❌'} ${check.label}`);
        if (pass) totalPassed++; else totalFailed++;
    }
    console.log();
}

console.log('═══════════════════════════════════════════════════════');
console.log(` RESULT: ${totalPassed} passed, ${totalFailed} failed`);
console.log('═══════════════════════════════════════════════════════');

if (totalFailed > 0) process.exit(1);
