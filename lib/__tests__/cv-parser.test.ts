import {
    parseCvTextToJson,
    recoverMissingExperienceCompany,
    recoverMissingEducationInstitution,
    recoverMissingLanguages,
    cleanSkillCategories,
    cleanCertificationNames,
    sanitizeCertIssuer,
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
