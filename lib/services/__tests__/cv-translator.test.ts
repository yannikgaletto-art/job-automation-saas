/**
 * Tests for cv-translator.needsTranslation()
 *
 * Focus: the sampling-bias bug from 2026-04-25 (Preview-Render CTO-Analyse)
 * where pre-fix code only sampled the first 8 experience bullets and skipped
 * education + skills entirely if exp had ≥8 bullets. Result: mixed-language
 * CVs (German experience + English education) were never flagged for translation.
 */

import { needsTranslation, restoreImmutableFields, detectStringLanguage, countLanguageMarkers, capArrayLengthsToSource } from '../cv-translator';
import type { CvStructuredData } from '@/types/cv';

const baseCv: CvStructuredData = {
    version: '2.0',
    personalInfo: {},
    experience: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
};

function makeBullet(text: string, idx: number) {
    return { id: `b-${idx}`, text };
}

describe('needsTranslation — sampling-bias regression (2026-04-25)', () => {
    test('German experience + English education → flags for German target (was missed pre-fix)', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    id: 'exp-1',
                    role: 'Berater',
                    description: [
                        makeBullet('Beratung von Kunden zur Einführung neuer Prozesse', 1),
                        makeBullet('Aufbau einer Wissensplattform für das Unternehmen', 2),
                        makeBullet('Durchführung von Workshops mit interdisziplinären Teams', 3),
                    ],
                },
                {
                    id: 'exp-2',
                    role: 'Werkstudent',
                    description: [
                        makeBullet('Entwicklung interner Tools zur Datenanalyse', 4),
                        makeBullet('Erstellung von Reports für die Geschäftsleitung', 5),
                    ],
                },
            ],
            education: [
                {
                    id: 'edu-1',
                    institution: 'BSP',
                    degree: 'Business Innovation & Entrepreneurship (M.Sc.)',
                    description: 'Development and implementation of innovative project and business strategies. Focus on innovation and project management. Leading and steering interdisciplinary teams in the development of innovative business models.',
                },
            ],
        };

        // Pre-fix: returned false because samples were 100% German experience.
        // Post-fix: education sampling kicks in → English markers detected → true.
        expect(needsTranslation(cv, 'German')).toBe(true);
    });

    test('German experience + German education → does NOT flag for German target', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    id: 'exp-1',
                    description: [
                        makeBullet('Beratung von Kunden zur Einführung neuer Prozesse', 1),
                        makeBullet('Aufbau einer Wissensplattform für das Unternehmen', 2),
                        makeBullet('Durchführung von Workshops für Teams', 3),
                    ],
                },
            ],
            education: [
                {
                    id: 'edu-1',
                    institution: 'Universität Potsdam',
                    degree: 'Europäische Medienwissenschaft (B.A.)',
                    description: 'Schwerpunkt auf Medienrecht und Kulturökonomie. Methoden der Medienanalyse.',
                },
            ],
        };

        expect(needsTranslation(cv, 'German')).toBe(false);
    });

    test('English experience + German education → flags for English target', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    id: 'exp-1',
                    description: [
                        makeBullet('Developed backend services for payment processing', 1),
                        makeBullet('Designed APIs and managed deployment pipelines', 2),
                    ],
                },
            ],
            education: [
                {
                    id: 'edu-1',
                    description: 'Schwerpunkt auf Softwaretechnik und verteilte Systeme. Erstellung einer Bachelorarbeit über Microservices.',
                },
            ],
        };

        expect(needsTranslation(cv, 'English')).toBe(true);
    });

    test('No content at all → returns false (no-op safe)', () => {
        expect(needsTranslation(baseCv, 'German')).toBe(false);
    });

    test('Long German experience (10 bullets) does NOT starve education sampling', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    id: 'exp-1',
                    description: Array.from({ length: 10 }, (_, i) =>
                        makeBullet(`Beratung von Kunden im Bereich der digitalen Transformation Schritt ${i + 1}`, i + 1)
                    ),
                },
            ],
            education: [
                {
                    id: 'edu-1',
                    description: 'The program included business strategy, innovation, design thinking and the development of leadership skills through interdisciplinary projects.',
                },
            ],
        };

        // Critical regression case: pre-fix the 10 German bullets would block
        // education from ever being sampled. Post-fix: only 3 exp bullets + ALL edu.
        expect(needsTranslation(cv, 'German')).toBe(true);
    });

    test('Round-robin across multiple experience entries (not just the first)', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    id: 'exp-1',
                    description: [makeBullet('Lorem ipsum text only', 1)],
                },
                {
                    id: 'exp-2',
                    description: [makeBullet('developed and managed scalable systems', 2)],
                },
                {
                    id: 'exp-3',
                    description: [makeBullet('led teams through transformation', 3)],
                },
            ],
        };

        // Round-robin samples first bullet of each entry → catches English markers
        // in exp-2/exp-3 even when exp-1 is short or noise.
        expect(needsTranslation(cv, 'German')).toBe(true);
    });

    test('Personal summary is sampled (catches lonely-summary mismatch)', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            personalInfo: {
                summary: 'Experienced software engineer with deep expertise in built and developed systems for the financial sector.',
            },
            experience: [
                {
                    id: 'exp-1',
                    description: [makeBullet('Beratung von Kunden im Bereich SAP', 1)],
                },
            ],
        };

        expect(needsTranslation(cv, 'German')).toBe(true);
    });

    test('Skills items are sampled in addition to category labels', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    id: 'exp-1',
                    description: [makeBullet('Beratung der Kunden bei der Auswahl', 1)],
                },
            ],
            skills: [
                {
                    id: 'skill-1',
                    category: 'Communication & Facilitation',
                    items: [
                        'Translating content for retrospective sessions and team workshops',
                        'Moderation of teams led by senior managers',
                    ],
                },
            ],
        };

        // Long English skill items overwhelm a single German exp bullet:
        // "for" + "and" + "led" + "by" — multiple markers in one slice.
        expect(needsTranslation(cv, 'German')).toBe(true);
    });

    test('Single English company name does not trigger false positive (≥2 markers required)', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    id: 'exp-1',
                    company: 'The Boston Consulting Group',
                    role: 'Berater',
                    description: [
                        makeBullet('Beratung von Kunden zur Strategieentwicklung', 1),
                        makeBullet('Durchführung von Workshops für Führungskräfte', 2),
                    ],
                },
            ],
        };

        // "The" alone (in company name, not sampled anyway) shouldn't be enough.
        // Plus the role + bullets are clearly German.
        expect(needsTranslation(cv, 'German')).toBe(false);
    });
});

describe('restoreImmutableFields — Bug 3 regression (Medieninnovationszentrum 2026-04-26)', () => {
    test('restores experience.role from original (Projektleitung must not become Project Lead)', () => {
        const orig: CvStructuredData = {
            ...baseCv,
            experience: [{ id: 'exp-1', role: 'Projektleitung', company: 'Medieninnovationszentrum', description: [] }],
        };
        const translated: CvStructuredData = {
            ...baseCv,
            experience: [{ id: 'exp-1', role: 'Project Lead', company: 'Media Innovation Centre', description: [] }],
        };
        restoreImmutableFields(orig, translated);
        expect(translated.experience[0].role).toBe('Projektleitung');
        expect(translated.experience[0].company).toBe('Medieninnovationszentrum');
    });

    test('restores education.degree (B.Sc. Informatik must not become B.Sc. Computer Science)', () => {
        const orig: CvStructuredData = {
            ...baseCv,
            education: [{ id: 'edu-1', degree: 'B.Sc. Informatik', institution: 'TU München' }],
        };
        const translated: CvStructuredData = {
            ...baseCv,
            education: [{ id: 'edu-1', degree: 'B.Sc. Computer Science', institution: 'Technical University Munich' }],
        };
        restoreImmutableFields(orig, translated);
        expect(translated.education[0].degree).toBe('B.Sc. Informatik');
        expect(translated.education[0].institution).toBe('TU München');
    });

    test('restores personalInfo.targetRole (Innovation Manager stays as-is)', () => {
        const orig: CvStructuredData = {
            ...baseCv,
            personalInfo: { name: 'Yannik Galetto', targetRole: 'Innovation Manager', email: 'a@b.c' },
        };
        const translated: CvStructuredData = {
            ...baseCv,
            personalInfo: { name: 'Yannik Galetto', targetRole: 'Innovationsmanager', email: 'a@b.c' },
        };
        restoreImmutableFields(orig, translated);
        expect(translated.personalInfo.targetRole).toBe('Innovation Manager');
    });

    test('idempotent — when AI kept original, restore is a no-op', () => {
        const orig: CvStructuredData = {
            ...baseCv,
            experience: [{ id: 'exp-1', role: 'Projektleitung', company: 'Medieninnovationszentrum', description: [] }],
        };
        const translated: CvStructuredData = {
            ...baseCv,
            experience: [{ id: 'exp-1', role: 'Projektleitung', company: 'Medieninnovationszentrum', description: [] }],
        };
        restoreImmutableFields(orig, translated);
        expect(translated.experience[0].role).toBe('Projektleitung');
        expect(translated.experience[0].company).toBe('Medieninnovationszentrum');
    });

    test('skips restore when original field is null (does not crash, keeps translated value)', () => {
        const orig: CvStructuredData = {
            ...baseCv,
            experience: [{ id: 'exp-1', role: 'Innovation Manager', description: [] }], // company missing in source
        };
        const translated: CvStructuredData = {
            ...baseCv,
            experience: [{ id: 'exp-1', role: 'Innovationsmanager', company: 'Some AI-guessed company', description: [] }],
        };
        restoreImmutableFields(orig, translated);
        // role gets restored because orig has it
        expect(translated.experience[0].role).toBe('Innovation Manager');
        // company stays as translated (because orig had no value)
        expect(translated.experience[0].company).toBe('Some AI-guessed company');
    });

    test('restores languages array when AI dropped it entirely', () => {
        const orig: CvStructuredData = {
            ...baseCv,
            languages: [
                { id: 'lang-1', language: 'Deutsch', proficiency: 'Muttersprache' },
                { id: 'lang-2', language: 'Englisch', proficiency: 'C1' },
            ],
        };
        const translated: CvStructuredData = { ...baseCv, languages: [] };
        restoreImmutableFields(orig, translated);
        expect(translated.languages).toHaveLength(2);
        expect(translated.languages[0].language).toBe('Deutsch');
    });

    test('PII fields restored (email/phone/location must not change in translation)', () => {
        const orig: CvStructuredData = {
            ...baseCv,
            personalInfo: {
                name: 'Yannik Galetto',
                email: 'yannik.galetto@gmail.com',
                phone: '+49 1590 136 24 18',
                location: 'Berlin',
            },
        };
        const translated: CvStructuredData = {
            ...baseCv,
            personalInfo: {
                name: 'Yannik G.',          // AI shortened — must be restored
                email: 'translated@example.com', // AI changed — must be restored
                phone: '+49 1590 136 24 18',
                location: 'Berlino',         // AI translated — must be restored
            },
        };
        restoreImmutableFields(orig, translated);
        expect(translated.personalInfo.name).toBe('Yannik Galetto');
        expect(translated.personalInfo.email).toBe('yannik.galetto@gmail.com');
        expect(translated.personalInfo.location).toBe('Berlin');
    });
});

// ═══════════════════════════════════════════════════════════════════
// Welle Re-1 (2026-04-27) — broader marker set + stress on EN-CV regression
// ═══════════════════════════════════════════════════════════════════

describe('needsTranslation — Welle Re-1 EN-CV regression (Yannik PwC mishmasch)', () => {
    test('EN bullets with German company names → flags for German target (was missed pre-fix)', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    id: 'e1',
                    role: 'Sales & Business Development Manager',
                    company: 'Ingrano Solutions',
                    description: [
                        makeBullet('Leading a NIS2 cybersecurity project across multiple stakeholders, achieving compliance for critical infrastructures', 0),
                        makeBullet('Established quantum-computing initiative and orchestrated cross-functional collaboration', 1),
                    ],
                } as any,
                {
                    id: 'e2',
                    role: 'Innovation Manager',
                    company: 'Fraunhofer',
                    description: [
                        makeBullet('Developed AR-based food-tech platform, reducing time-to-market by 30%', 0),
                    ],
                } as any,
                {
                    id: 'e3',
                    role: 'Co-Founder',
                    company: 'Xorder Menues',
                    description: [
                        makeBullet('Co-responsible for business model conceptualization; implementing revenue-boosting pricing models', 0),
                    ],
                } as any,
            ],
        };
        expect(needsTranslation(cv, 'German')).toBe(true);
    });

    test('Single English action verb + many German company names → does NOT trigger (still ≥2 required)', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: [
                {
                    id: 'e1',
                    role: 'Berater',
                    company: 'The Boston Consulting Group',
                    description: [makeBullet('Beratung und Konzeption für Großkunden im Bereich Energie', 0)],
                } as any,
            ],
        };
        expect(needsTranslation(cv, 'German')).toBe(false);
    });

    test('All-German bullets across 5 entries → does NOT trigger', () => {
        const cv: CvStructuredData = {
            ...baseCv,
            experience: Array.from({ length: 5 }, (_, i) => ({
                id: `e${i}`,
                role: `Beraterin ${i}`,
                company: `Firma ${i}`,
                description: [
                    makeBullet('Geleitet Projekte zur Prozessoptimierung und Stakeholder-Koordination im Konzernumfeld', 0),
                    makeBullet('Konzipiert und umgesetzt eine Migrationsstrategie für die Cloud-Infrastruktur', 1),
                ],
            } as any)),
        };
        expect(needsTranslation(cv, 'German')).toBe(false);
    });
});

describe('detectStringLanguage — pure function for Optimizer output validator', () => {
    test('clean English bullet → wrong-language for DE target', () => {
        const txt = 'Led the cross-functional team and delivered the migration on time';
        expect(detectStringLanguage(txt, 'de')).toBe('wrong-language');
    });

    test('clean German bullet → matches-target for DE target', () => {
        const txt = 'Geleitet das Team und erfolgreich die Migration durchgeführt';
        expect(detectStringLanguage(txt, 'de')).toBe('matches-target');
    });

    test('clean English bullet → matches-target for EN target', () => {
        const txt = 'Implemented and managed the new pipeline with the engineering team';
        expect(detectStringLanguage(txt, 'en')).toBe('matches-target');
    });

    test('mixed-language bullet (DE bullet with English company) → matches-target for DE', () => {
        // Single English company name should NOT flip the verdict — DE markers dominate
        const txt = 'Geleitet die Migration für The Boston Consulting Group im Konzern';
        expect(detectStringLanguage(txt, 'de')).toBe('matches-target');
    });

    test('language-neutral string (proper nouns only) → unknown', () => {
        expect(detectStringLanguage('Salesforce, HubSpot, Make.com', 'de')).toBe('unknown');
    });

    test('very short string → unknown', () => {
        expect(detectStringLanguage('OK', 'de')).toBe('unknown');
    });

    test('empty / null defensive guards', () => {
        expect(detectStringLanguage('', 'de')).toBe('unknown');
        expect(detectStringLanguage(null as unknown as string, 'de')).toBe('unknown');
        expect(detectStringLanguage(undefined as unknown as string, 'de')).toBe('unknown');
    });

    test('Spanish bullet → wrong-language for DE target', () => {
        expect(detectStringLanguage('Implementé el sistema y gestioné el equipo entre los proyectos', 'de')).toBe('wrong-language');
    });

    test('the PwC repro: "Co-responsible for business model conceptualization; implementing revenue-boosting pricing models" → wrong-language for DE', () => {
        const bullet = 'Co-responsible for business model conceptualization; implementing revenue-boosting pricing models';
        expect(detectStringLanguage(bullet, 'de')).toBe('wrong-language');
    });
});

describe('countLanguageMarkers — primitive used by detect', () => {
    test('counts EN action verbs', () => {
        const txt = 'led developed managed implemented delivered';
        expect(countLanguageMarkers(txt, 'en')).toBe(5);
    });

    test('counts DE action verbs', () => {
        const txt = 'geleitet entwickelt verantwortet umgesetzt';
        expect(countLanguageMarkers(txt, 'de')).toBe(4);
    });

    test('case-insensitive', () => {
        expect(countLanguageMarkers('LED Managed', 'en')).toBe(2);
    });
});

// ──────────────────────────────────────────────────────────────────────
// Welle 2 Phase 2 (2026-04-27) — capArrayLengthsToSource
// Bug: Translator-LLM hallucinated a 6th experience entry on Yannik's
// Exxeta CV (5 stations in source). Hard-cap deterministically.
// ──────────────────────────────────────────────────────────────────────

describe('capArrayLengthsToSource — Welle 2 Phase 2', () => {
    const mkExp = (id: string, role: string) => ({ id, role, company: 'X', dateRangeText: '', description: [] });

    test('REGRESSION: drops 6th hallucinated experience entry to source length 5', () => {
        const orig: CvStructuredData = {
            ...baseCv,
            experience: [mkExp('e1', 'A'), mkExp('e2', 'B'), mkExp('e3', 'C'), mkExp('e4', 'D'), mkExp('e5', 'E')],
        };
        const translated: CvStructuredData = {
            ...baseCv,
            experience: [mkExp('e1', 'A'), mkExp('e2', 'B'), mkExp('e3', 'C'), mkExp('e4', 'D'), mkExp('e5', 'E'), mkExp('e6', 'HALLUCINATED ZF')],
        };
        capArrayLengthsToSource(orig, translated);
        expect(translated.experience.length).toBe(5);
        expect(translated.experience.some(e => e.role === 'HALLUCINATED ZF')).toBe(false);
    });

    test('does not grow when translated has fewer entries than source', () => {
        const orig: CvStructuredData = { ...baseCv, experience: [mkExp('e1', 'A'), mkExp('e2', 'B')] };
        const translated: CvStructuredData = { ...baseCv, experience: [mkExp('e1', 'A')] };
        capArrayLengthsToSource(orig, translated);
        expect(translated.experience.length).toBe(1); // unchanged
    });

    test('caps education when LLM grows it', () => {
        const orig: CvStructuredData = { ...baseCv, education: [{ id: 'edu-1', degree: 'BA', institution: 'X' }] as any };
        const translated: CvStructuredData = {
            ...baseCv,
            education: [{ id: 'edu-1', degree: 'BA', institution: 'X' }, { id: 'edu-fake', degree: 'PhD', institution: 'fake' }] as any,
        };
        capArrayLengthsToSource(orig, translated);
        expect(translated.education.length).toBe(1);
    });

    test('caps certifications when LLM grows it', () => {
        const orig: CvStructuredData = { ...baseCv, certifications: [{ id: 'c1', name: 'A' } as any] };
        const translated: CvStructuredData = {
            ...baseCv,
            certifications: [{ id: 'c1', name: 'A' }, { id: 'c-fake', name: 'fake' }] as any,
        };
        capArrayLengthsToSource(orig, translated);
        expect(translated.certifications!.length).toBe(1);
    });

    test('idempotent: running twice yields same result', () => {
        const orig: CvStructuredData = { ...baseCv, experience: [mkExp('e1', 'A'), mkExp('e2', 'B')] };
        const translated: CvStructuredData = {
            ...baseCv,
            experience: [mkExp('e1', 'A'), mkExp('e2', 'B'), mkExp('e3', 'C')],
        };
        capArrayLengthsToSource(orig, translated);
        const after1 = translated.experience.length;
        capArrayLengthsToSource(orig, translated);
        expect(translated.experience.length).toBe(after1);
        expect(translated.experience.length).toBe(2);
    });

    test('empty translated arrays: noop', () => {
        const orig: CvStructuredData = { ...baseCv, experience: [mkExp('e1', 'A')] };
        const translated: CvStructuredData = { ...baseCv, experience: [] };
        capArrayLengthsToSource(orig, translated);
        expect(translated.experience.length).toBe(0);
    });
});
