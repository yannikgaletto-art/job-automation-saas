import * as fs from 'fs';
import * as path from 'path';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import {
    buildQuoteStyleMoveSection,
    buildSystemPrompt,
    type CompanyResearchData,
    type JobData,
    type UserProfileData,
} from '../cover-letter-prompt-builder';

type SetupOverrides = Partial<Omit<CoverLetterSetupContext, 'tone' | 'optInModules'>> & {
    tone?: Partial<CoverLetterSetupContext['tone']>;
    optInModules?: Partial<NonNullable<CoverLetterSetupContext['optInModules']>>;
};

function createSetupContext(overrides: SetupOverrides = {}): CoverLetterSetupContext {
    const base: CoverLetterSetupContext = {
        jobId: 'job-ottobock-001',
        companyName: 'Ottobock',
        selectedHook: {
            id: 'manual-skip',
            type: 'manual',
            label: 'Skip',
            content: '',
            sourceName: '',
            sourceUrl: '',
            sourceAge: '',
            relevanceScore: 0,
        },
        selectedQuote: {
            quote: 'Bevor du sagst, du kannst etwas nicht tun, versuche es.',
            author: 'Sakichi Toyoda',
            source: 'Toyota',
            matchedValue: 'Lernen',
            relevanceScore: 0.92,
        },
        cvStations: [
            {
                stationIndex: 1,
                company: 'Ingrano Solutions',
                role: 'Innovation Manager',
                period: '2024',
                keyBullet: 'NIS-2 in operative Prozesse uebersetzt',
                matchedRequirement: 'Strategische Analyse',
                intent: 'Beweist strukturiertes Uebersetzen von Komplexitaet',
                bullets: [
                    'Analysierte NIS-2 und leitete Handlungsfelder fuer KMU ab',
                    'Moderierte Stakeholder-Gespraeche mit Entscheidungstraegern',
                ],
            },
        ],
        tone: {
            preset: 'storytelling',
            toneSource: 'preset',
            targetLanguage: 'de',
            hasStyleSample: false,
            styleWarningAcknowledged: false,
            formality: 'du',
        },
        completedAt: '2026-05-07T00:00:00.000Z',
        optInModules: {
            first90DaysHypothesis: false,
            painPointMatching: true,
            vulnerabilityInjector: false,
            pingPong: false,
            stationsSelector: true,
        },
        introFocus: 'quote',
    };

    return {
        ...base,
        ...overrides,
        tone: {
            ...base.tone,
            ...(overrides.tone ?? {}),
        },
        optInModules: {
            ...base.optInModules!,
            ...(overrides.optInModules ?? {}),
        },
    };
}

const profile: UserProfileData = {};
const job: JobData = {
    job_title: 'Associate Corporate Strategy and M&A',
    company_name: 'Ottobock',
    requirements: ['Akquisitionsziele bewerten', 'Integrationskonzepte entwickeln'],
    responsibilities: ['Akquisitionsziele bewerten', 'Unternehmensbewertungen erstellen'],
};
const company: CompanyResearchData = {
    company_values: ['Human Empowerment', 'Technology'],
    current_challenges: ['Digitale Transformation in der Medizintechnik'],
};
const repoRoot = path.resolve(__dirname, '../../..');

function readLocale(locale: 'de' | 'en' | 'es') {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'locales', `${locale}.json`), 'utf-8'));
}

describe('Cover Letter Prompt Builder quote style moves', () => {
    it('builds deterministic move cards with opening, bridge, and closing guidance', () => {
        const args = {
            isEnglish: false,
            isDuForm: true,
            companyName: 'Ottobock',
            jobTitle: 'Associate Corporate Strategy and M&A',
            quoteAuthor: 'Sakichi Toyoda',
            seed: 'job-ottobock-001|Ottobock|Associate Corporate Strategy and M&A|Sakichi Toyoda',
        };

        const section = buildQuoteStyleMoveSection(args);

        expect(section).toBe(buildQuoteStyleMoveSection(args));
        expect(section).toContain('[STYLE-MOVE-CARDS');
        expect(section).toMatch(/^OPENING opening-/m);
        expect(section).toMatch(/^QUOTE-BRIDGE bridge-/m);
        expect(section).toMatch(/^CLOSING closing-/m);
        expect(section).not.toContain('hatte recht; aber');
        expect(section).not.toContain('Dieser Gedanke begleitet mich');
        expect(section).not.toContain('wird dieser Gedanke praktisch');
        expect(section).not.toContain('echte Orientierung');
    });

    it('varies move choices across different seeds without runtime randomness', () => {
        const sections = Array.from({ length: 20 }, (_, index) =>
            buildQuoteStyleMoveSection({
                isEnglish: false,
                isDuForm: true,
                companyName: 'Company',
                jobTitle: 'Consultant',
                quoteAuthor: 'Author',
                seed: `job-${index}|Company|Consultant|Author|Quote ${index}`,
            })
        );

        const idsFor = (label: 'OPENING' | 'QUOTE-BRIDGE' | 'CLOSING') =>
            new Set(
                sections.map(section => section.match(new RegExp(`^${label} ([^:]+):`, 'm'))?.[1])
            );

        expect(idsFor('OPENING').size).toBeGreaterThan(1);
        expect(idsFor('QUOTE-BRIDGE').size).toBeGreaterThan(1);
        expect(idsFor('CLOSING').size).toBeGreaterThan(1);
    });

    it('adds move cards only for storytelling quote intros and removes repeated template anchors', () => {
        const prompt = buildSystemPrompt(profile, job, company, null, createSetupContext(), [], 0);

        expect(prompt).toContain('[STYLE-MOVE-CARDS');
        expect(prompt).toContain('PFLICHT: Nutze den OPENING-Move');
        expect(prompt).toContain('PFLICHT: Nutze den QUOTE-BRIDGE-Move');
        expect(prompt).toContain('PFLICHT: Nutze den CLOSING-Move');
        expect(prompt).toContain('INFORMELL: Kein formeller Bewerbungssatz');
        expect(prompt).toContain('ROTER-FADEN-FRAGE');
        expect(prompt).toContain('MEIDE CHATGPT-VERSTAERKER');
        expect(prompt).not.toContain('hatte recht; aber');
        expect(prompt).not.toContain('Dieser Gedanke begleitet mich');
        expect(prompt).not.toContain('Beim Lesen eurer Ausschreibung fiel mir ein Gedanke ein');
        expect(prompt).not.toContain('wird dieser Gedanke praktisch');
        expect(prompt).not.toContain('Loesen wir das, was der Nutzer wirklich braucht');
        expect(prompt).not.toContain('Menschen wirklich nutzen');
    });

    it('does not affect formal quote prompts', () => {
        const prompt = buildSystemPrompt(
            profile,
            job,
            company,
            null,
            createSetupContext({
                tone: {
                    preset: 'formal',
                    formality: 'sie',
                },
            }),
            [],
            0
        );

        expect(prompt).not.toContain('[STYLE-MOVE-CARDS');
        expect(prompt).not.toContain('PFLICHT: Nutze den OPENING-Move');
        expect(prompt).not.toContain('PFLICHT: Nutze den QUOTE-BRIDGE-Move');
        expect(prompt).not.toContain('PFLICHT: Nutze den CLOSING-Move');
    });

    it('does not affect storytelling when the quote is moved out of the intro', () => {
        const prompt = buildSystemPrompt(
            profile,
            job,
            company,
            null,
            createSetupContext({ introFocus: 'hook' }),
            [],
            0
        );

        expect(prompt).not.toContain('[STYLE-MOVE-CARDS');
        expect(prompt).not.toContain('PFLICHT: Nutze den OPENING-Move');
    });
});

describe('Cover Letter tone labels', () => {
    it('renames the visible storytelling/formal presets without changing internal keys', () => {
        expect(readLocale('de').cover_letter.tone_storytelling).toBe('Informell');
        expect(readLocale('de').cover_letter.tone_formal).toBe('Formell');
        expect(readLocale('en').cover_letter.tone_storytelling).toBe('Informal');
        expect(readLocale('en').cover_letter.tone_formal).toBe('Formal');
        expect(readLocale('es').cover_letter.tone_storytelling).toBe('Informal');
        expect(readLocale('es').cover_letter.tone_formal).toBe('Formal');
    });
});
