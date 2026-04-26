/**
 * Tests for cv-translator.needsTranslation()
 *
 * Focus: the sampling-bias bug from 2026-04-25 (Preview-Render CTO-Analyse)
 * where pre-fix code only sampled the first 8 experience bullets and skipped
 * education + skills entirely if exp had ≥8 bullets. Result: mixed-language
 * CVs (German experience + English education) were never flagged for translation.
 */

import { needsTranslation, restoreImmutableFields } from '../cv-translator';
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
