import {
    parseCvTextToJson,
    recoverMissingExperienceCompany,
    recoverMissingEducationInstitution,
    recoverMissingEducationDescription,
    recoverMissingLanguages,
    cleanSkillCategories,
    cleanCertificationNames,
    sanitizeCertIssuer,
    validateDescriptionsAgainstRawText,
    cleanLanguageProficiency,
    splitMergedSkillGroups,
    dropProjectLikeCerts,
    truncateCertDescriptionAtNewline,
    rolesAreFuzzyEqual,
} from '../services/cv-parser';
import { complete } from '@/lib/ai/model-router';

jest.mock('@/lib/ai/model-router', () => ({
    complete: jest.fn()
}));

describe('cv-parser', () => {
    it('should parse valid JSON from Claude and return structured data', async () => {
        const mockResponse = {
            version: "1.0",
            personalInfo: {
                name: "John Doe",
                email: "john@example.com"
            },
            experience: [
                {
                    id: "exp-1",
                    company: "Tech Corp",
                    description: [{ id: "bullet-1", text: "Did things" }]
                }
            ],
            education: [],
            skills: [],
            languages: []
        };

        (complete as jest.Mock).mockResolvedValue({
            text: JSON.stringify(mockResponse),
            model: 'claude-3-haiku-20240307',
            tokensUsed: 100,
            costCents: 0,
            latencyMs: 100
        });

        const result = await parseCvTextToJson("raw text");
        expect(result.personalInfo.name).toBe("John Doe");
        expect(result.experience[0].id).toBe("exp-1");
        expect(result.experience[0].description[0].text).toBe("Did things");
    });
});

describe('recoverMissingExperienceCompany — Yannik Exxeta CV regression (2026-04-26)', () => {
    const yannikRawText = `
## Berufserfahrung

09.2025
Ingrano Solutions I Innovation Manager
Heute
Tech-Driven Efficiency: ...

11.2023
Fraunhofer FOKUS I Innovation Consultant I Werkstudent
09.2025
Deep Tech Strategy: ...

07.2022 Co-Founder - Xorder Menues
08.2024
End-to-End Verantwortung: ...

01.2023
KPMG - Public Sector Consulting I Intern
03.2023
Consulting Experience: ...

2020
Medieninnovationszentrum I Projektleitung I Werkstudent
2022
Agiles Projektmanagement: ...
`;

    test('recovers Ingrano Solutions from "Firma I Rolle" pattern', () => {
        const exp = [{ role: 'Innovation Manager', company: null }];
        const out = recoverMissingExperienceCompany(exp, yannikRawText);
        expect(out[0].company).toBe('Ingrano Solutions');
    });

    test('recovers Xorder Menues from "Job-Title - Firma" dash pattern', () => {
        const exp = [{ role: 'Co-Founder', company: null }];
        const out = recoverMissingExperienceCompany(exp, yannikRawText);
        expect(out[0].company).toBe('Xorder Menues');
    });

    test('recovers Fraunhofer FOKUS from 3-pipe pattern (Firma I Rolle I Werkstudent)', () => {
        const exp = [{ role: 'Innovation Consultant', company: null }];
        const out = recoverMissingExperienceCompany(exp, yannikRawText);
        expect(out[0].company).toBe('Fraunhofer FOKUS');
    });

    test('recovers Medieninnovationszentrum from 3-pipe pattern', () => {
        const exp = [{ role: 'Projektleitung', company: null }];
        const out = recoverMissingExperienceCompany(exp, yannikRawText);
        expect(out[0].company).toBe('Medieninnovationszentrum');
    });

    test('idempotent: existing company is not overwritten', () => {
        const exp = [{ role: 'Innovation Manager', company: 'Already Set Inc.' }];
        const out = recoverMissingExperienceCompany(exp, yannikRawText);
        expect(out[0].company).toBe('Already Set Inc.');
    });

    test('does not invent a company when role is unrecognised', () => {
        const exp = [{ role: 'Some Random Job Title That Does Not Appear', company: null }];
        const out = recoverMissingExperienceCompany(exp, yannikRawText);
        expect(out[0].company).toBeFalsy();
    });

    test('rejects date-only tokens as company candidates', () => {
        const text = '09.2025 I Innovation Manager Heute';
        const exp = [{ role: 'Innovation Manager', company: null }];
        const out = recoverMissingExperienceCompany(exp, text);
        // "09.2025" is rejected by isPlausibleCompanyToken
        expect(out[0].company).toBeFalsy();
    });

    test('handles empty experience array gracefully', () => {
        expect(recoverMissingExperienceCompany([], yannikRawText)).toEqual([]);
    });

    test('handles empty role without crashing', () => {
        const exp = [{ role: '', company: null }];
        const out = recoverMissingExperienceCompany(exp, yannikRawText);
        expect(out[0].company).toBeFalsy();
    });
});

describe('recoverMissingEducationInstitution — Universität Potsdam regression (2026-04-26)', () => {
    const yannikRawText = `
## Bildungsweg

2023
Business Innovation & Entrepreneurship (M.Sc.) BSP
2025
Thesis: ...

2018
Europäische Medienwissenschaften (B.A.) Universität Potsdam
2022
Medienrecht ...
`;

    test('recovers Universität Potsdam from "Studiengang (X.A.) Universität ..." pattern', () => {
        const edu = [{ degree: 'Europäische Medienwissenschaften (B.A.)', institution: null }];
        const out = recoverMissingEducationInstitution(edu, yannikRawText);
        expect(out[0].institution).toBe('Universität Potsdam');
    });

    test('recovers BSP (acronym) when degree is followed by all-caps token', () => {
        const edu = [{ degree: 'Business Innovation & Entrepreneurship (M.Sc.)', institution: null }];
        const out = recoverMissingEducationInstitution(edu, yannikRawText);
        expect(out[0].institution).toBe('BSP');
    });

    test('idempotent: existing institution is not overwritten', () => {
        const edu = [{ degree: 'Europäische Medienwissenschaften (B.A.)', institution: 'Some Other University' }];
        const out = recoverMissingEducationInstitution(edu, yannikRawText);
        expect(out[0].institution).toBe('Some Other University');
    });

    test('does not invent institution when degree is missing from raw text', () => {
        const edu = [{ degree: 'Nonexistent Studiengang', institution: null }];
        const out = recoverMissingEducationInstitution(edu, yannikRawText);
        expect(out[0].institution).toBeFalsy();
    });

    test('rejects bogus tail (no university hint, no acronym)', () => {
        const text = 'B.Sc. Computer Science just some random words';
        const edu = [{ degree: 'B.Sc. Computer Science', institution: null }];
        const out = recoverMissingEducationInstitution(edu, text);
        expect(out[0].institution).toBeFalsy();
    });
});

describe('recoverMissingLanguages — Phase 4 Welle A (2026-04-26)', () => {
    const yannikSprachenSection = `
## Sprachen

Deutsch I Muttersprache
Englisch I Verhandlungssicher
Französisch I Konversation
Spanisch I Grundkenntnisse

## Zertifikate
`;

    test('recovers all 4 Yannik languages from "Sprache I Niveau" pattern', () => {
        const out = recoverMissingLanguages(yannikSprachenSection);
        expect(out).toHaveLength(4);
        expect(out[0]).toMatchObject({ language: 'Deutsch', proficiency: 'Muttersprache' });
        expect(out[1]).toMatchObject({ language: 'Englisch', proficiency: 'Verhandlungssicher' });
        expect(out[2]).toMatchObject({ language: 'Französisch', proficiency: 'Konversation' });
        expect(out[3]).toMatchObject({ language: 'Spanisch', proficiency: 'Grundkenntnisse' });
    });

    test('generates stable lang-recovered-N ids', () => {
        const out = recoverMissingLanguages(yannikSprachenSection);
        expect(out.map((l) => l.id)).toEqual([
            'lang-recovered-1',
            'lang-recovered-2',
            'lang-recovered-3',
            'lang-recovered-4',
        ]);
    });

    test('returns empty array when no Languages section is present', () => {
        const text = '## Berufserfahrung\nFoo Bar\n## Bildung\nBaz';
        expect(recoverMissingLanguages(text)).toEqual([]);
    });

    test('stops at next section header (does not bleed into Zertifikate)', () => {
        const text = `Sprachen
Deutsch I Muttersprache
Zertifikate
Microsoft Azure I Cloud Practitioner`;
        const out = recoverMissingLanguages(text);
        expect(out).toHaveLength(1);
        expect(out[0].language).toBe('Deutsch');
    });

    test('handles parens-style proficiency: "English (C2)"', () => {
        const text = `Languages
English (C2)
German (Native)`;
        const out = recoverMissingLanguages(text);
        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ language: 'English', proficiency: 'C2' });
        expect(out[1]).toMatchObject({ language: 'German', proficiency: 'Native' });
    });

    test('handles colon separator: "Deutsch: Muttersprache"', () => {
        const text = `Sprachen
Deutsch: Muttersprache`;
        const out = recoverMissingLanguages(text);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ language: 'Deutsch', proficiency: 'Muttersprache' });
    });

    test('handles em-dash separator', () => {
        const text = `Sprachen
Deutsch — Muttersprache`;
        const out = recoverMissingLanguages(text);
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ language: 'Deutsch', proficiency: 'Muttersprache' });
    });

    test('rejects non-language tokens (Microsoft, TÜV, Niveau)', () => {
        const text = `Sprachen
Microsoft I Azure
TÜV I Zertifiziert
Niveau I C2
Deutsch I Muttersprache`;
        const out = recoverMissingLanguages(text);
        expect(out).toHaveLength(1);
        expect(out[0].language).toBe('Deutsch');
    });

    test('dedupes duplicate language entries', () => {
        const text = `Sprachen
Deutsch I Muttersprache
Deutsch I C2`;
        const out = recoverMissingLanguages(text);
        expect(out).toHaveLength(1);
    });

    test('parses bare language name (no separator)', () => {
        const text = `Sprachen
English
German`;
        const out = recoverMissingLanguages(text);
        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ language: 'English', proficiency: null });
    });

    test('case-insensitive section header match (SPRACHEN, sprachen, Sprachen)', () => {
        const variants = ['SPRACHEN', 'sprachen', 'Sprachen', 'Sprachkenntnisse'];
        for (const header of variants) {
            const text = `${header}\nDeutsch I Muttersprache`;
            const out = recoverMissingLanguages(text);
            expect(out).toHaveLength(1);
        }
    });

    test('English section header (Languages) works for EN CVs', () => {
        const text = `Languages
English I Native
Spanish I Fluent`;
        const out = recoverMissingLanguages(text);
        expect(out).toHaveLength(2);
        expect(out[0].language).toBe('English');
    });

    test('Spanish section header (Idiomas) works for ES CVs', () => {
        const text = `Idiomas
Español I Nativo
Inglés I Avanzado`;
        const out = recoverMissingLanguages(text);
        expect(out).toHaveLength(2);
        expect(out[0].language).toBe('Español');
        expect(out[1].language).toBe('Inglés');
    });
});

describe('cleanSkillCategories — Phase 4 Welle A (2026-04-26)', () => {
    test('strips literal \\n from category and keeps first non-empty line', () => {
        const skills = [
            { id: 'skill-1', category: 'IT-Kenntnisse\n\nProgrammierkenntnisse', items: ['Python', 'Java'] },
        ];
        const out = cleanSkillCategories(skills);
        expect(out[0].category).toBe('IT-Kenntnisse');
        expect(out[0].items).toEqual(['Python', 'Java']);
    });

    test('idempotent: a clean category is untouched', () => {
        const skills = [{ id: 'skill-1', category: 'Programmiersprachen', items: ['Python'] }];
        const out = cleanSkillCategories(skills);
        expect(out[0].category).toBe('Programmiersprachen');
        expect(out).toEqual(skills);
    });

    test('handles category that is only whitespace + newlines', () => {
        const skills = [{ id: 'skill-1', category: '\n\n\n', items: ['Python'] }];
        const out = cleanSkillCategories(skills);
        expect(out[0].category).toBeNull();
    });

    test('preserves other fields on the skill object', () => {
        const skills = [{
            id: 'skill-1',
            category: 'IT-Kenntnisse\nProgrammierkenntnisse',
            items: ['Python'],
            displayMode: 'tags' as const,
        }];
        const out = cleanSkillCategories(skills);
        expect(out[0].id).toBe('skill-1');
        expect(out[0].displayMode).toBe('tags');
    });

    test('handles empty array gracefully', () => {
        expect(cleanSkillCategories([])).toEqual([]);
    });

    test('handles null category', () => {
        const skills = [{ id: 'skill-1', category: null, items: ['Python'] }];
        const out = cleanSkillCategories(skills);
        expect(out[0].category).toBeNull();
    });
});

describe('cleanCertificationNames — Phase 4 Welle A (2026-04-26)', () => {
    test('strips "Zertifikate\\n" prefix when LLM concatenated section header', () => {
        const certs = [{ id: 'cert-1', name: 'Zertifikate\nManagementberatung', issuer: null }];
        const out = cleanCertificationNames(certs);
        expect(out[0].name).toBe('Managementberatung');
    });

    test('strips "Certifications" prefix (English variant)', () => {
        const certs = [{ id: 'cert-1', name: 'Certifications\nAWS Solutions Architect', issuer: null }];
        const out = cleanCertificationNames(certs);
        expect(out[0].name).toBe('AWS Solutions Architect');
    });

    test('strips "Weiterbildungen" prefix', () => {
        const certs = [{ id: 'cert-1', name: 'Weiterbildungen\nSAP Beraterzertifikat', issuer: null }];
        const out = cleanCertificationNames(certs);
        expect(out[0].name).toBe('SAP Beraterzertifikat');
    });

    test('idempotent: a clean name is untouched', () => {
        const certs = [{ id: 'cert-1', name: 'Managementberatung', issuer: 'IHK' }];
        const out = cleanCertificationNames(certs);
        expect(out).toEqual(certs);
    });

    test('collapses multi-line name even when first line is not a known header', () => {
        const certs = [{ id: 'cert-1', name: 'AWS\nSolutions Architect', issuer: null }];
        const out = cleanCertificationNames(certs);
        expect(out[0].name).toBe('AWS');
    });

    test('preserves other fields on the cert object', () => {
        const certs = [{
            id: 'cert-1',
            name: 'Zertifikate\nManagementberatung',
            issuer: 'IHK',
            dateText: '2024',
        }];
        const out = cleanCertificationNames(certs);
        expect(out[0].issuer).toBe('IHK');
        expect(out[0].dateText).toBe('2024');
    });

    test('handles empty array gracefully', () => {
        expect(cleanCertificationNames([])).toEqual([]);
    });

    test('handles null name', () => {
        const certs = [{ id: 'cert-1', name: null, issuer: null }];
        const out = cleanCertificationNames(certs);
        expect(out).toEqual(certs);
    });
});

describe('sanitizeCertIssuer — Phase 4 Welle A (2026-04-26)', () => {
    test('drops issuer when value is "Ehrenamtliche Tätigkeit" (TEDx-Coach regression)', () => {
        const certs = [{ id: 'cert-1', name: 'TEDx Coaching', issuer: 'Ehrenamtliche Tätigkeit' }];
        const out = sanitizeCertIssuer(certs);
        expect(out[0].issuer).toBeNull();
    });

    test('drops issuer when value is "Werkstudent"', () => {
        const certs = [{ id: 'cert-1', name: 'Some Cert', issuer: 'Werkstudent' }];
        const out = sanitizeCertIssuer(certs);
        expect(out[0].issuer).toBeNull();
    });

    test('drops issuer when value is "Hobby" or "Volunteer"', () => {
        const certs = [
            { id: 'cert-1', name: 'A', issuer: 'Hobby' },
            { id: 'cert-2', name: 'B', issuer: 'Volunteer' },
        ];
        const out = sanitizeCertIssuer(certs);
        expect(out[0].issuer).toBeNull();
        expect(out[1].issuer).toBeNull();
    });

    test('case-insensitive match (EHRENAMT, Ehrenamt, ehrenamt)', () => {
        const certs = [
            { id: 'c1', name: 'A', issuer: 'EHRENAMT' },
            { id: 'c2', name: 'B', issuer: 'Ehrenamt' },
            { id: 'c3', name: 'C', issuer: 'ehrenamt' },
        ];
        const out = sanitizeCertIssuer(certs);
        expect(out.every((c) => c.issuer === null)).toBe(true);
    });

    test('idempotent: a real organization issuer is preserved', () => {
        const certs = [
            { id: 'c1', name: 'A', issuer: 'IHK' },
            { id: 'c2', name: 'B', issuer: 'Microsoft' },
            { id: 'c3', name: 'C', issuer: 'AWS Training' },
        ];
        const out = sanitizeCertIssuer(certs);
        expect(out).toEqual(certs);
    });

    test('preserves other fields when dropping issuer', () => {
        const certs = [{
            id: 'cert-1',
            name: 'TEDx Coaching',
            issuer: 'Ehrenamtliche Tätigkeit',
            dateText: '2023',
        }];
        const out = sanitizeCertIssuer(certs);
        expect(out[0].name).toBe('TEDx Coaching');
        expect(out[0].dateText).toBe('2023');
    });

    test('handles empty array', () => {
        expect(sanitizeCertIssuer([])).toEqual([]);
    });

    test('handles null issuer', () => {
        const certs = [{ id: 'cert-1', name: 'A', issuer: null }];
        const out = sanitizeCertIssuer(certs);
        expect(out[0].issuer).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// validateDescriptionsAgainstRawText — Welle A.5 hallucination validator
// ---------------------------------------------------------------------------

describe('validateDescriptionsAgainstRawText', () => {

    // Yannik's actual TEDx regression: cert had description="Coaching von TEDx-Redner:innen;
    // Übersetzung von Inhalten in überzeugende Narrationen" but the PDF only shows
    // "TEDx-Coach / seit 2022" — zero description text present.
    test('drops fully-fabricated TEDx description (no 5-word match in rawText)', () => {
        const rawText = 'TEDx-Coach\nseit 2022\n\nDesign Thinking Coach\nZertifizierter Design Thinking Coach';
        const certs = [{
            id: 'cert-1',
            name: 'TEDx-Coach',
            description: 'Coaching von TEDx-Redner:innen; Übersetzung von Inhalten in überzeugende Narrationen',
        }];
        const out = validateDescriptionsAgainstRawText(certs, rawText);
        expect(out[0].description).toBeNull();
    });

    // A cert whose description text IS present in the OCR raw text should be kept.
    test('keeps description when 5-word window matches rawText', () => {
        const rawText = 'Design Thinking Coach\nZertifizierter Design Thinking Coach\nIDEO method, Datenanalyse für unternehmerische Entscheidungen und Change-Management-Prozesse';
        const certs = [{
            id: 'cert-2',
            name: 'Design Thinking Coach',
            description: 'Datenanalyse für unternehmerische Entscheidungen und Change-Management-Prozesse',
        }];
        const out = validateDescriptionsAgainstRawText(certs, rawText);
        expect(out[0].description).toBe('Datenanalyse für unternehmerische Entscheidungen und Change-Management-Prozesse');
    });

    // Education entry with a grounded description should survive.
    test('keeps education description grounded in rawText', () => {
        const rawText = 'Europäische Medienwissenschaften (B.A.)\nUniversität Potsdam\nSchwerpunkte: Medienproduktion und digitale Transformation';
        const edu = [{
            id: 'edu-1',
            degree: 'Europäische Medienwissenschaften (B.A.)',
            institution: 'Universität Potsdam',
            description: 'Schwerpunkte: Medienproduktion und digitale Transformation',
        }];
        const out = validateDescriptionsAgainstRawText(edu, rawText);
        expect(out[0].description).toBe('Schwerpunkte: Medienproduktion und digitale Transformation');
    });

    // Education entry with a fabricated description should be dropped.
    test('drops fabricated education description', () => {
        const rawText = 'Europäische Medienwissenschaften (B.A.)\nUniversität Potsdam';
        const edu = [{
            id: 'edu-1',
            degree: 'Europäische Medienwissenschaften (B.A.)',
            institution: 'Universität Potsdam',
            description: 'Kritisches Denken und methodische Analyse komplexer Medienphänomene',
        }];
        const out = validateDescriptionsAgainstRawText(edu, rawText);
        expect(out[0].description).toBeNull();
    });

    // No description → untouched.
    test('leaves null description untouched', () => {
        const certs = [{ id: 'cert-1', name: 'A', description: null }];
        const out = validateDescriptionsAgainstRawText(certs, 'some raw text here for context');
        expect(out[0].description).toBeNull();
    });

    // Empty description string → untouched.
    test('leaves empty description string untouched', () => {
        const certs = [{ id: 'cert-1', name: 'A', description: '' }];
        const out = validateDescriptionsAgainstRawText(certs, 'some raw text here for context');
        expect(out[0].description).toBe('');
    });

    // rawText too short (<50 chars) → keep all descriptions regardless.
    test('keeps all when rawText too short to validate against', () => {
        const certs = [{ id: 'cert-1', name: 'A', description: 'völlig erfunden und nicht im Text vorhanden' }];
        const out = validateDescriptionsAgainstRawText(certs, 'kurz');
        expect(out[0].description).toBe('völlig erfunden und nicht im Text vorhanden');
    });

    // Empty array → returns empty array.
    test('handles empty array', () => {
        expect(validateDescriptionsAgainstRawText([], 'some raw text')).toEqual([]);
    });

    // Short description (3 words) — uses 3-word window, keeps when matching.
    test('keeps short 3-word description when matching rawText', () => {
        const rawText = 'TEDx Coaching Zertifikat erhalten 2021';
        const certs = [{ id: 'cert-1', name: 'TEDx', description: 'TEDx Coaching Zertifikat' }];
        const out = validateDescriptionsAgainstRawText(certs, rawText);
        expect(out[0].description).toBe('TEDx Coaching Zertifikat');
    });

    // Other fields (name, id, issuer) on the item are preserved when description is dropped.
    test('preserves other item fields when dropping description', () => {
        const rawText = 'TEDx-Coach\nseit 2022\nEhrenamtliche Tätigkeit\nweitere Aktivitäten und Interessen';
        const certs = [{
            id: 'cert-1',
            name: 'TEDx-Coach',
            issuer: 'TED Conferences',
            dateText: 'seit 2022',
            description: 'Halluzinierter Text über internationale Redner und inspirierende Geschichten',
        }];
        const out = validateDescriptionsAgainstRawText(certs, rawText);
        expect(out[0].description).toBeNull();
        expect(out[0].id).toBe('cert-1');
        expect(out[0].name).toBe('TEDx-Coach');
        expect(out[0].issuer).toBe('TED Conferences');
        expect(out[0].dateText).toBe('seit 2022');
    });
});

// ---------------------------------------------------------------------------
// cleanLanguageProficiency — Welle A.6 separator-artifact stripper
// ---------------------------------------------------------------------------

describe('cleanLanguageProficiency', () => {

    // Yannik's actual regression — Azure DI's "I" pipe replacement leaks into proficiency.
    test('strips "I " prefix from proficiency (Yannik regression)', () => {
        const langs = [
            { id: 'lang-1', language: 'Deutsch', proficiency: 'I Muttersprache' },
            { id: 'lang-2', language: 'Englisch', proficiency: 'I C1 Niveau' },
        ];
        const out = cleanLanguageProficiency(langs);
        expect(out[0].proficiency).toBe('Muttersprache');
        expect(out[1].proficiency).toBe('C1 Niveau');
    });

    test('strips pipe "| ", em/en-dash, plain dash, colon prefixes', () => {
        const langs = [
            { id: 'lang-1', language: 'A', proficiency: '| Native' },
            { id: 'lang-2', language: 'B', proficiency: '— C1' },
            { id: 'lang-3', language: 'C', proficiency: '– B2' },
            { id: 'lang-4', language: 'D', proficiency: '- A2' },
            { id: 'lang-5', language: 'E', proficiency: ': Fluent' },
        ];
        const out = cleanLanguageProficiency(langs);
        expect(out[0].proficiency).toBe('Native');
        expect(out[1].proficiency).toBe('C1');
        expect(out[2].proficiency).toBe('B2');
        expect(out[3].proficiency).toBe('A2');
        expect(out[4].proficiency).toBe('Fluent');
    });

    test('keeps clean proficiency value untouched (idempotent)', () => {
        const langs = [
            { id: 'lang-1', language: 'Deutsch', proficiency: 'Muttersprache' },
            { id: 'lang-2', language: 'Englisch', proficiency: 'C1' },
        ];
        const out = cleanLanguageProficiency(langs);
        expect(out[0].proficiency).toBe('Muttersprache');
        expect(out[1].proficiency).toBe('C1');
    });

    test('does not strip "I" inside language names like "Italian"', () => {
        // Italian starts with "I" but no following space — must not be stripped.
        const langs = [{ id: 'lang-1', language: 'English', proficiency: 'Italian B2' }];
        const out = cleanLanguageProficiency(langs);
        expect(out[0].proficiency).toBe('Italian B2');
    });

    test('handles null and empty proficiency', () => {
        const langs = [
            { id: 'lang-1', language: 'A', proficiency: null },
            { id: 'lang-2', language: 'B', proficiency: '' },
        ];
        const out = cleanLanguageProficiency(langs);
        expect(out[0].proficiency).toBeNull();
        expect(out[1].proficiency).toBe('');
    });

    test('sets proficiency to null when only the separator is present', () => {
        const langs = [{ id: 'lang-1', language: 'A', proficiency: 'I ' }];
        const out = cleanLanguageProficiency(langs);
        expect(out[0].proficiency).toBeNull();
    });

    test('preserves other fields when stripping prefix', () => {
        const langs = [{ id: 'lang-1', language: 'Deutsch', proficiency: 'I Muttersprache' }];
        const out = cleanLanguageProficiency(langs);
        expect(out[0].id).toBe('lang-1');
        expect(out[0].language).toBe('Deutsch');
    });
});

// ---------------------------------------------------------------------------
// splitMergedSkillGroups — Welle A.7 sub-section header recovery
// ---------------------------------------------------------------------------

describe('splitMergedSkillGroups', () => {

    // Yannik's actual regression: Adobe + Microsoft headers stuck inside items[].
    test('splits IT-Kenntnisse / Adobe / Microsoft from Yannik raw output', () => {
        const skills = [{
            id: 'skill-1',
            category: 'IT-Kenntnisse',
            items: [
                'Python Grundkenntnisse',
                'Antigravity',
                'Make No-Code',
                'Low-Code Plattformen',
                'Bubble\nAdobe',
                'Creative Cloud',
                'Premiere Pro',
                'After Effects',
                'Lightroom\nMicrosoft',
            ],
        }];
        const out = splitMergedSkillGroups(skills);
        // Three groups: IT-Kenntnisse (with Bubble), Adobe (with Lightroom), Microsoft (empty → dropped)
        expect(out).toHaveLength(2);
        expect(out[0].category).toBe('IT-Kenntnisse');
        expect(out[0].items).toEqual([
            'Python Grundkenntnisse',
            'Antigravity',
            'Make No-Code',
            'Low-Code Plattformen',
            'Bubble',
        ]);
        expect(out[1].category).toBe('Adobe');
        expect(out[1].items).toEqual([
            'Creative Cloud',
            'Premiere Pro',
            'After Effects',
            'Lightroom',
        ]);
    });

    // No \n → idempotent passthrough.
    test('passes clean groups through unchanged', () => {
        const skills = [
            { id: 'skill-1', category: 'IT', items: ['Python', 'Java'] },
            { id: 'skill-2', category: 'Office', items: ['Excel', 'PowerPoint'] },
        ];
        const out = splitMergedSkillGroups(skills);
        expect(out).toHaveLength(2);
        expect(out[0]).toEqual({ id: 'skill-1', category: 'IT', items: ['Python', 'Java'] });
        expect(out[1]).toEqual({ id: 'skill-2', category: 'Office', items: ['Excel', 'PowerPoint'] });
    });

    // Empty array → empty result.
    test('handles empty input', () => {
        expect(splitMergedSkillGroups([])).toEqual([]);
    });

    // Group with no items is dropped (nothing to flush).
    test('drops empty groups', () => {
        const skills = [{ id: 'skill-1', category: 'Empty', items: [] }];
        const out = splitMergedSkillGroups(skills);
        expect(out).toEqual([]);
    });

    // Multi-\n in one item: A\nB\nC means A finishes prev group, B becomes empty (dropped), C is new category.
    test('handles multi-\\n splits with empty-group drop', () => {
        const skills = [{
            id: 'skill-1',
            category: 'First',
            items: ['Alpha', 'Beta\nMiddle\nLast', 'Omega'],
        }];
        const out = splitMergedSkillGroups(skills);
        // Beta finishes "First". "Middle" group has no items (dropped). "Last" group gets "Omega".
        expect(out).toHaveLength(2);
        expect(out[0].category).toBe('First');
        expect(out[0].items).toEqual(['Alpha', 'Beta']);
        expect(out[1].category).toBe('Last');
        expect(out[1].items).toEqual(['Omega']);
    });

    // Newline at start of item ("\nFoo") — empty pre-split, full text after becomes new category.
    test('handles leading newline in item', () => {
        const skills = [{
            id: 'skill-1',
            category: 'IT',
            items: ['Python', '\nNewSection', 'Item1'],
        }];
        const out = splitMergedSkillGroups(skills);
        expect(out).toHaveLength(2);
        expect(out[0].category).toBe('IT');
        expect(out[0].items).toEqual(['Python']);
        expect(out[1].category).toBe('NewSection');
        expect(out[1].items).toEqual(['Item1']);
    });

    // Other fields on the group object are preserved.
    test('preserves non-items fields on each group', () => {
        const skills = [{ id: 'skill-1', category: 'A', items: ['x\nB', 'y'], _custom: 'meta' }];
        const out = splitMergedSkillGroups(skills);
        expect(out).toHaveLength(2);
        expect((out[0] as any)._custom).toBe('meta');
        expect((out[1] as any)._custom).toBe('meta');
    });

    // ID generation: split groups get suffixed IDs (-split-1, -split-2).
    test('generates unique ids for split groups', () => {
        const skills = [{ id: 'skill-1', category: 'A', items: ['x\nB', 'y\nC', 'z'] }];
        const out = splitMergedSkillGroups(skills);
        expect(out).toHaveLength(3);
        expect(out[0].id).toBe('skill-1');
        expect(out[1].id).toBe('skill-1-split-1');
        expect(out[2].id).toBe('skill-1-split-2');
    });

    // Whitespace-only fragments still mark boundaries, but trailing empty
    // groups are dropped — matches the Microsoft-without-items case in
    // Yannik's CV (header with no following content).
    test('handles whitespace-only fragments and drops trailing empty groups', () => {
        const skills = [{ id: 'skill-1', category: 'A', items: ['x\n  \nB'] }];
        const out = splitMergedSkillGroups(skills);
        // "x\n  \nB" → x stays in A; "" boundary closes A; "B" starts new group with no items → dropped.
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({ category: 'A', items: ['x'] });
    });
});

// ---------------------------------------------------------------------------
// dropProjectLikeCerts — Welle A.8 cert-name validator
// ---------------------------------------------------------------------------

describe('dropProjectLikeCerts', () => {

    // Yannik's actual regression: a project description bucketed into certs.
    test('drops "Projekt- ZF Getriebe Brandenburg GmbH HR- Transformation..."', () => {
        const certs = [
            { id: 'cert-1', name: 'Design Thinking', issuer: 'HPI' },
            { id: 'cert-2', name: 'Projekt- ZF Getriebe Brandenburg GmbH HR- Transformation & Organisationsentwicklung', issuer: 'ZF Getriebe Brandenburg GmbH' },
            { id: 'cert-3', name: 'TEDx-Coach', issuer: null },
        ];
        const out = dropProjectLikeCerts(certs);
        expect(out).toHaveLength(2);
        expect(out.map(c => c.name)).toEqual(['Design Thinking', 'TEDx-Coach']);
    });

    test('keeps real short cert names', () => {
        const certs = [
            { id: 'a', name: 'PMP' },
            { id: 'b', name: 'Scrum Master' },
            { id: 'c', name: 'Design Thinking Coach' },
            { id: 'd', name: 'Präsenz & Persönlichkeitsprofilierung' },
            { id: 'e', name: 'ISO 27001' },
        ];
        const out = dropProjectLikeCerts(certs);
        expect(out).toHaveLength(5);
    });

    test('drops names starting with "Projekt-", "Projekt:", "Projekt "', () => {
        const certs = [
            { id: 'a', name: 'Projekt- Test' },
            { id: 'b', name: 'Projekt: Mein Projekt' },
            { id: 'c', name: 'Projekt Datenmigration' },
            { id: 'd', name: 'Projektmanagement' }, // word boundary — should KEEP (real cert)
        ];
        const out = dropProjectLikeCerts(certs);
        expect(out.map(c => c.name)).toEqual(['Projektmanagement']);
    });

    test('drops long names with company suffix even without Projekt prefix', () => {
        const certs = [
            { id: 'a', name: 'HR-Transformation und Beratung Bayer AG Niederlassung München' },
            { id: 'b', name: 'Strategie Workshop Volkswagen Group Services GmbH Berlin' },
        ];
        const out = dropProjectLikeCerts(certs);
        expect(out).toHaveLength(0);
    });

    test('drops empty / null names', () => {
        const certs = [
            { id: 'a', name: '' },
            { id: 'b', name: null },
            { id: 'c', name: 'Real Cert' },
        ];
        const out = dropProjectLikeCerts(certs);
        expect(out).toHaveLength(1);
        expect(out[0].name).toBe('Real Cert');
    });

    test('handles empty array', () => {
        expect(dropProjectLikeCerts([])).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// truncateCertDescriptionAtNewline — Welle A.8 cert-description sanitizer
// ---------------------------------------------------------------------------

describe('truncateCertDescriptionAtNewline', () => {

    // Yannik's regression: "kritisches Denken\nDesign Thinking Coach"
    test('keeps only first paragraph; drops next-cert-name absorbed after \\n', () => {
        const certs = [{
            id: 'cert-1',
            name: 'Managementberatung',
            description: 'Datenanalyse für unternehmerische Entscheidungen Führung & Management Strategisches und kritisches Denken\nDesign Thinking Coach',
        }];
        const out = truncateCertDescriptionAtNewline(certs);
        expect(out[0].description).toBe('Datenanalyse für unternehmerische Entscheidungen Führung & Management Strategisches und kritisches Denken');
    });

    // Yannik's TEDx regression: 3-line absorption.
    test('truncates multi-line absorption to first paragraph', () => {
        const certs = [{
            id: 'cert-1',
            name: 'TEDx-Coach',
            description: 'Ganzheitliches Coaching von TEDx-Redner:innen Übersetzung von Inhalten in überzeugende Erzählstrukturen Moderation retrospektiver Team-Sessions mit dem TEDx-Team\nUniversität Potsdam\nProjektmanagement',
        }];
        const out = truncateCertDescriptionAtNewline(certs);
        expect(out[0].description).toBe('Ganzheitliches Coaching von TEDx-Redner:innen Übersetzung von Inhalten in überzeugende Erzählstrukturen Moderation retrospektiver Team-Sessions mit dem TEDx-Team');
    });

    test('keeps clean description (idempotent)', () => {
        const certs = [{ id: 'a', name: 'Design Thinking', description: 'Anwendung von Design Thinking-Prozessen' }];
        const out = truncateCertDescriptionAtNewline(certs);
        expect(out[0].description).toBe('Anwendung von Design Thinking-Prozessen');
    });

    test('handles null and empty description', () => {
        const certs = [
            { id: 'a', description: null },
            { id: 'b', description: '' },
        ];
        const out = truncateCertDescriptionAtNewline(certs);
        expect(out[0].description).toBeNull();
        expect(out[1].description).toBe('');
    });

    test('sets description to null when first line is whitespace only', () => {
        const certs = [{ id: 'a', description: '   \nReal content' }];
        const out = truncateCertDescriptionAtNewline(certs);
        expect(out[0].description).toBeNull();
    });

    test('preserves other cert fields', () => {
        const certs = [{ id: 'cert-1', name: 'X', issuer: 'Y', description: 'first\nsecond' }];
        const out = truncateCertDescriptionAtNewline(certs);
        expect(out[0].id).toBe('cert-1');
        expect(out[0].name).toBe('X');
        expect(out[0].issuer).toBe('Y');
        expect(out[0].description).toBe('first');
    });

    test('handles empty array', () => {
        expect(truncateCertDescriptionAtNewline([])).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════════════════
// Phase 5 — AI TI CV regression (2026-04-27)
// ═══════════════════════════════════════════════════════════════════

const aiTiRawText = `AI Transformation Institute
Yannik Galetto
04.08.1996 in Berlin

## Berufserfahrung

09.2025
Ingrano Solutions I Sales & Business Development Manager
02.2026
Vertriebsautomatisierung: Konzeption und Implementierung automatisierter Workflows
11.2023
Fraunhofer I Innovation Management Consultant
09.2025
KI-GTM-Beratung: Steuerung von Transformationsprojekten
07.2022
Co-Founder & Product Owner - Xorder Menues
08.2024
Strategie: Aufbau digitaler Prozesse

## Bildungsweg

2018 Europäische Medienwissenschaften (B.A.) Universität Potsdam
2022
Abschlussnote: 1,3
- Medienrecht und Kulturökonomie
- Medienanalyse- und Evaluation
- Interkulturelle Kompetenz`;

describe('rolesAreFuzzyEqual — fuzzy role token matching', () => {
    test('exact match returns true', () => {
        expect(rolesAreFuzzyEqual('Sales Manager', 'Sales Manager')).toBe(true);
    });

    test('truncated role matches longer candidate (Yannik AI TI repro)', () => {
        expect(rolesAreFuzzyEqual('Sales & Manager', 'Sales & Business Development Manager')).toBe(true);
    });

    test('Innovation Consultant matches Innovation Management Consultant', () => {
        expect(rolesAreFuzzyEqual('Innovation Consultant', 'Innovation Management Consultant')).toBe(true);
    });

    test('Co-Founder matches Co-Founder & Product Owner', () => {
        expect(rolesAreFuzzyEqual('Co-Founder', 'Co-Founder & Product Owner')).toBe(true);
    });

    test('totally different roles return false', () => {
        expect(rolesAreFuzzyEqual('Designer', 'Manager')).toBe(false);
    });

    test('empty inputs return false', () => {
        expect(rolesAreFuzzyEqual('', 'Manager')).toBe(false);
        expect(rolesAreFuzzyEqual('Manager', '')).toBe(false);
        expect(rolesAreFuzzyEqual('', '')).toBe(false);
    });

    test('case-insensitive', () => {
        expect(rolesAreFuzzyEqual('SALES MANAGER', 'sales manager')).toBe(true);
    });
});

describe('recoverMissingExperienceCompany — Phase 5.1 fuzzy match (Yannik AI TI 2026-04-27)', () => {
    test('LLM-truncated role + missing company → restores both from rawText', () => {
        const exp = [{ id: 'e1', role: 'Sales & Manager', company: null }];
        const out = recoverMissingExperienceCompany(exp, aiTiRawText);
        expect(out[0].company).toBe('Ingrano Solutions');
        expect(out[0].role).toBe('Sales & Business Development Manager');
    });

    test('Truncated "Innovation Consultant" recovers full role from "Innovation Management Consultant"', () => {
        const exp = [{ id: 'e2', role: 'Innovation Consultant', company: 'Fraunhofer' }];
        const out = recoverMissingExperienceCompany(exp, aiTiRawText);
        expect(out[0].role).toBe('Innovation Management Consultant');
    });

    test('Co-Founder dash pattern with "& Product Owner" suffix → company recovered', () => {
        const exp = [{ id: 'e3', role: 'Co-Founder', company: null }];
        const out = recoverMissingExperienceCompany(exp, aiTiRawText);
        expect(out[0].company).toBe('Xorder Menues');
        expect(out[0].role).toBe('Co-Founder & Product Owner');
    });

    test('Idempotent: entry already has both → no mutation', () => {
        const exp = [{ id: 'e1', role: 'Sales & Business Development Manager', company: 'Ingrano Solutions' }];
        const out = recoverMissingExperienceCompany(exp, aiTiRawText);
        expect(out[0].company).toBe('Ingrano Solutions');
        expect(out[0].role).toBe('Sales & Business Development Manager');
    });
});

describe('recoverMissingEducationDescription — Phase 5.2 (Yannik AI TI 2026-04-27)', () => {
    test('Bullet list under Bachelor degree is recovered', () => {
        const edu = [{
            id: 'edu-1',
            degree: 'Europäische Medienwissenschaften (B.A.)',
            description: null,
        }];
        const out = recoverMissingEducationDescription(edu, aiTiRawText);
        expect(out[0].description).toContain('Medienrecht und Kulturökonomie');
        expect(out[0].description).toContain('Medienanalyse');
        expect(out[0].description).toContain('Interkulturelle Kompetenz');
    });

    test('Idempotent: existing description is untouched', () => {
        const edu = [{
            id: 'edu-1',
            degree: 'Europäische Medienwissenschaften (B.A.)',
            description: 'Already filled in by user',
        }];
        const out = recoverMissingEducationDescription(edu, aiTiRawText);
        expect(out[0].description).toBe('Already filled in by user');
    });

    test('Returns null when degree not found in raw text', () => {
        const edu = [{ id: 'edu-1', degree: 'Mythical Studies (M.A.)', description: null }];
        const out = recoverMissingEducationDescription(edu, aiTiRawText);
        expect(out[0].description).toBeNull();
    });

    test('Returns null when no bullets follow the degree line', () => {
        const noBullets = `## Bildungsweg

Europäische Medienwissenschaften (B.A.) Universität Potsdam
Abschlussnote: 1,3`;
        const edu = [{ id: 'edu-1', degree: 'Europäische Medienwissenschaften (B.A.)', description: null }];
        const out = recoverMissingEducationDescription(edu, noBullets);
        expect(out[0].description).toBeNull();
    });

    test('Handles empty array', () => {
        expect(recoverMissingEducationDescription([], aiTiRawText)).toEqual([]);
    });

    test('Multiple bullet styles (-, •, –) are all recognized', () => {
        const text = `Bachelor (B.A.) Test University

- Module A
• Module B
– Module C`;
        const edu = [{ id: 'edu-1', degree: 'Bachelor (B.A.)', description: null }];
        const out = recoverMissingEducationDescription(edu, text);
        expect(out[0].description).toContain('Module A');
        expect(out[0].description).toContain('Module B');
        expect(out[0].description).toContain('Module C');
    });
});
