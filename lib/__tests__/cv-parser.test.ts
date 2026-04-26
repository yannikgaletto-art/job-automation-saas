import {
    parseCvTextToJson,
    recoverMissingExperienceCompany,
    recoverMissingEducationInstitution,
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
