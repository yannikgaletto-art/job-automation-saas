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
    recoverCertsFromRawSection,
    extractCertSectionLines,
    extractCertCandidates,
    stripGradeFromEducationDescription,
    dropExperienceDuplicatedAsCert,
    recoverMissingExperienceStation,
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

    // ──────────────────────────────────────────────────────────────────
    // Welle F (2026-04-27) — bullet-prefix stripping before validation.
    // Education recovery (Phase 5.2) writes descriptions WITH bullet
    // prefixes ("- Module A\n- Module B"), but raw OCR text only has the
    // newlines. Without stripping, the 5-word-window match would fail and
    // the validator would falsely drop a legitimate recovery.
    // ──────────────────────────────────────────────────────────────────

    test('Welle F: bullet-prefix description (realistic edu bullets) matches multi-line raw text', () => {
        // Mirrors the Yannik Phase-5.2 flow: recovery wrote bullets WITH "- " prefix,
        // raw OCR text has them on separate lines. Pre-Welle-F the validator dropped
        // legitimate recoveries because newline-separated raw never matches space-joined window.
        const rawText = `## Bildungsweg

Bachelor (B.A.) Universität Potsdam
2020 - 2023

Konzeption und Durchführung von zwölf Usability-Tests
Analyse qualitativer Daten und Erstellung von Handlungsempfehlungen
Reduktion der Fehlerquote durch iteratives Prototyping`;
        const recovered = [{
            id: 'edu-1',
            description:
                '- Konzeption und Durchführung von zwölf Usability-Tests\n- Analyse qualitativer Daten und Erstellung von Handlungsempfehlungen\n- Reduktion der Fehlerquote durch iteratives Prototyping',
        }];
        const out = validateDescriptionsAgainstRawText(recovered, rawText);
        expect(out[0].description).toContain('Konzeption');
        expect(out[0].description).toContain('Reduktion');
    });

    test('Welle F: in-line dash separator ("A - B - C") still matches plain raw', () => {
        const rawText =
            'Bachelor at Some University covering konzeption qualitativer daten reduktion durch iteratives prototyping in 2020-2023';
        const recovered = [{
            id: 'edu-1',
            description: 'Konzeption qualitativer Daten - Reduktion durch iteratives Prototyping',
        }];
        const out = validateDescriptionsAgainstRawText(recovered, rawText);
        // Normalised, "konzeption qualitativer daten reduktion durch" 5-word window matches raw.
        expect(out[0].description).toContain('Konzeption');
    });

    test('Welle F: hallucinated bulleted description still gets dropped', () => {
        const rawText =
            'Bachelor at Universität Potsdam covering general philosophy and applied logic in two thousand and twenty.';
        const fabricated = [{
            id: 'edu-1',
            description: '- Quantum Mechanics Advanced Theory\n- Cryptography Hardware Security\n- Astrophysics Field Studies',
        }];
        const out = validateDescriptionsAgainstRawText(fabricated, rawText);
        expect(out[0].description).toBeNull();
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

// ──────────────────────────────────────────────────────────────────────
// Phase 6 — Cert-Roundtrip-Recovery (2026-04-27)
// Yannik's Exxeta CV showed:
//   - "Managementberatung (Emory University)" present in raw, absent in output
//   - "Universität Potsdam: Projektmanagement (2022) Mediation (2021) ..."
//     present in raw with 4 sub-courses, only 3 made it to output
//   - Output cert "HR-Transformation" had issuer "ZF Friedrichshafen AG"
//     while raw said "ZF Getriebe Brandenburg GmbH"
// ──────────────────────────────────────────────────────────────────────

describe('extractCertSectionLines — section walker', () => {
    test('finds Zertifikate section, walks until next major header', () => {
        const text = `## Berufserfahrung

Some role 2020 - 2022

## Zertifikate

Managementberatung (Emory University)
Design Thinking Coach (Hasso-Plattner-Institut)

## Sprachen

Deutsch (C2)`;
        const lines = extractCertSectionLines(text);
        expect(lines).toContain('Managementberatung (Emory University)');
        expect(lines).toContain('Design Thinking Coach (Hasso-Plattner-Institut)');
        expect(lines).not.toContain('Deutsch (C2)');
    });

    test('returns empty array if no Zertifikate header found', () => {
        const text = `## Berufserfahrung

Some text only`;
        expect(extractCertSectionLines(text)).toEqual([]);
    });

    test('20-line defensive cap protects against runaway sections', () => {
        const lines = ['## Zertifikate', ...Array.from({ length: 50 }, (_, i) => `Cert ${i}`)].join('\n');
        const out = extractCertSectionLines(lines);
        expect(out.length).toBeLessThanOrEqual(30);
    });

    test('handles English "Certifications" header', () => {
        const text = `## Certifications

PMP (PMI)
Scrum Master (Scrum.org)

## Languages`;
        const out = extractCertSectionLines(text);
        expect(out).toContain('PMP (PMI)');
        expect(out).toContain('Scrum Master (Scrum.org)');
    });

    test('rawText below 50 chars returns empty', () => {
        expect(extractCertSectionLines('short')).toEqual([]);
    });
});

describe('extractCertCandidates — pattern parsing', () => {
    test('Pattern A: "Name (Issuer)" — Yannik regression', () => {
        const out = extractCertCandidates(['Managementberatung (Emory University)']);
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({
            name: 'Managementberatung',
            issuer: 'Emory University',
            dateText: null,
        });
    });

    test('Pattern A: "Name (Year)" — pure date', () => {
        const out = extractCertCandidates(['Old Cert (2019)']);
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({
            name: 'Old Cert',
            issuer: null,
            dateText: '2019',
        });
    });

    test('Pattern B: pipe-separated with date and issuer', () => {
        const out = extractCertCandidates(['TEDx-Coach I seit 2022 I Ehrenamtliche Tätigkeit']);
        expect(out).toHaveLength(1);
        expect(out[0].name).toBe('TEDx-Coach');
        expect(out[0].dateText).toContain('2022');
        expect(out[0].issuer).toContain('Ehrenamtliche');
    });

    test('Pattern C: multi-subject "Issuer: Subj (Year) Subj (Year) ..."', () => {
        const out = extractCertCandidates([
            'Universität Potsdam: Projektmanagement (2022) Mediation (2021) Präsenzkurs (2020) Rhetorik (2020)',
        ]);
        expect(out).toHaveLength(4);
        const names = out.map((c) => c.name);
        expect(names).toContain('Projektmanagement');
        expect(names).toContain('Mediation');
        expect(names).toContain('Präsenzkurs');
        expect(names).toContain('Rhetorik');
        for (const c of out) {
            expect(c.issuer).toBe('Universität Potsdam');
        }
        const projektmanagement = out.find((c) => c.name === 'Projektmanagement')!;
        expect(projektmanagement.dateText).toBe('2022');
    });

    test('Pattern C does NOT trigger with only 1 (Year) — falls back to Pattern A', () => {
        const out = extractCertCandidates(['Foo Bar: Baz (2022)']);
        expect(out).toHaveLength(1);
        // Falls into Pattern A (parens) — name="Foo Bar: Baz", dateText="2022"
        expect(out[0].dateText).toBe('2022');
    });

    test('Pattern D: bare line as name only', () => {
        const out = extractCertCandidates(['Just a Cert Name']);
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({
            name: 'Just a Cert Name',
            issuer: null,
            dateText: null,
        });
    });

    test('skips section-header noise', () => {
        const out = extractCertCandidates(['Zertifikate', 'Real Cert (Real Issuer)']);
        expect(out).toHaveLength(1);
        expect(out[0].name).toBe('Real Cert');
    });

    test('skips ultra-short and pure-numeric lines', () => {
        const out = extractCertCandidates(['ab', '2022', 'Real Cert (Issuer)']);
        expect(out).toHaveLength(1);
        expect(out[0].name).toBe('Real Cert');
    });
});

describe('recoverCertsFromRawSection — end-to-end roundtrip', () => {
    const exxetaRawText = `## Berufserfahrung

Some experience entries here.

## Zertifikate

Managementberatung (Emory University)
Design Thinking Coach (Hasso-Plattner-Institut)
TEDx-Coach I seit 2022 I Ehrenamtliche Tätigkeit
Universität Potsdam: Projektmanagement (2022) Mediation (2021) Präsenzkurs (2020) Rhetorik (2020)

## Sprachen

Deutsch (C2)
`;

    test('REGRESSION: Managementberatung missing from output → ADDED', () => {
        const existing = [
            { id: 'cert-1', name: 'Design Thinking Coach', issuer: 'Hasso-Plattner-Institut', dateText: null },
            { id: 'cert-2', name: 'TEDx-Coach', issuer: null, dateText: '2022' },
        ];
        const out = recoverCertsFromRawSection(existing, exxetaRawText);
        const names = out.map((c) => c.name);
        expect(names).toContain('Managementberatung');
        const managementberatung = out.find((c) => c.name === 'Managementberatung');
        expect(managementberatung?.issuer).toBe('Emory University');
    });

    test('REGRESSION: Universität Potsdam Projektmanagement missing → ADDED with issuer', () => {
        const existing = [
            { id: 'cert-1', name: 'Mediation', issuer: 'Universität Potsdam', dateText: '2021' },
            { id: 'cert-2', name: 'Präsenzkurs', issuer: 'Universität Potsdam', dateText: '2020' },
            { id: 'cert-3', name: 'Rhetorik', issuer: 'Universität Potsdam', dateText: '2020' },
        ];
        const out = recoverCertsFromRawSection(existing, exxetaRawText);
        const projektmanagement = out.find((c) => c.name === 'Projektmanagement');
        expect(projektmanagement).toBeDefined();
        expect(projektmanagement?.issuer).toBe('Universität Potsdam');
        expect(projektmanagement?.dateText).toBe('2022');
    });

    test('Issuer-Correct: hallucinated issuer with zero token-overlap is replaced', () => {
        const rawWithDifferentIssuer = `## Zertifikate

Innovation Award (Brandenburg Institute)

## Sprachen
`;
        const existing = [
            { id: 'cert-1', name: 'Innovation Award', issuer: 'Friedrichshafen Group', dateText: null },
        ];
        const out = recoverCertsFromRawSection(existing, rawWithDifferentIssuer);
        expect(out).toHaveLength(1);
        expect(out[0].issuer).toBe('Brandenburg Institute');
    });

    test('Issuer-Correct: existing issuer null → filled from raw', () => {
        const raw = `## Zertifikate

Scrum Master (Scrum Alliance)

## Sprachen
`;
        const existing = [
            { id: 'cert-1', name: 'Scrum Master', issuer: null, dateText: null },
        ];
        const out = recoverCertsFromRawSection(existing, raw);
        expect(out).toHaveLength(1);
        expect(out[0].issuer).toBe('Scrum Alliance');
    });

    test('Issuer-Correct: existing issuer overlaps raw issuer → kept', () => {
        const raw = `## Zertifikate

PMP (PMI Institute)

## Sprachen
`;
        const existing = [
            { id: 'cert-1', name: 'PMP', issuer: 'PMI', dateText: null },
        ];
        const out = recoverCertsFromRawSection(existing, raw);
        // "PMI" is a 3-char token, both share "pmi" stem → keep existing
        expect(out[0].issuer).toBe('PMI');
    });

    test('Conservative: hallucinated cert with no raw match is KEPT (no drop)', () => {
        const raw = `## Zertifikate

Real Cert (Real Issuer)

## Sprachen
`;
        const existing = [
            { id: 'cert-1', name: 'Real Cert', issuer: 'Real Issuer', dateText: null },
            { id: 'cert-2', name: 'Halluzinated Cert', issuer: 'Some Org', dateText: null },
        ];
        const out = recoverCertsFromRawSection(existing, raw);
        expect(out).toHaveLength(2);
        const names = out.map((c) => c.name);
        expect(names).toContain('Halluzinated Cert');
    });

    test('Idempotent: running twice on the same input yields the same output', () => {
        const existing = [
            { id: 'cert-1', name: 'Design Thinking Coach', issuer: 'Hasso-Plattner-Institut', dateText: null },
        ];
        const r1 = recoverCertsFromRawSection(existing, exxetaRawText);
        const r2 = recoverCertsFromRawSection(r1, exxetaRawText);
        expect(r2.length).toBe(r1.length);
        // Names set is identical
        expect(new Set(r2.map((c) => c.name))).toEqual(new Set(r1.map((c) => c.name)));
    });

    test('Empty array + raw with certs → all candidates added', () => {
        type CertShape = { id?: string; name?: string | null; issuer?: string | null; dateText?: string | null };
        const out = recoverCertsFromRawSection<CertShape>([], exxetaRawText);
        const names = out.map((c) => c.name);
        expect(names).toContain('Managementberatung');
        expect(names).toContain('Design Thinking Coach');
        expect(names).toContain('Projektmanagement');
    });

    test('No cert section in raw → returns array unchanged', () => {
        const out = recoverCertsFromRawSection(
            [{ id: 'cert-1', name: 'X', issuer: null, dateText: null }],
            'Some random text without a Zertifikate section',
        );
        expect(out).toHaveLength(1);
        expect(out[0].name).toBe('X');
    });

    test('Skips "Projekt-" prefixed candidates (handled by dropProjectLikeCerts)', () => {
        type CertShape = { id?: string; name?: string | null; issuer?: string | null; dateText?: string | null };
        const raw = `## Zertifikate

Projekt- ZF Getriebe Brandenburg GmbH HR-Transformation
Real Cert (Real Issuer)

## Sprachen
`;
        const out = recoverCertsFromRawSection<CertShape>([], raw);
        const names = out.map((c) => (c.name ?? '').toString());
        expect(names).toContain('Real Cert');
        expect(names.some((n) => n.toLowerCase().includes('projekt'))).toBe(false);
    });

    test('Skips status-word names (Ehrenamtliche Tätigkeit etc.)', () => {
        type CertShape = { id?: string; name?: string | null; issuer?: string | null; dateText?: string | null };
        const raw = `## Zertifikate

Ehrenamtliche Tätigkeit
Real Cert (Real Issuer)

## Sprachen
`;
        const out = recoverCertsFromRawSection<CertShape>([], raw);
        const names = out.map((c) => (c.name ?? '').toString());
        expect(names).toContain('Real Cert');
        expect(names).not.toContain('Ehrenamtliche Tätigkeit');
    });

    test('No raw text → array returned unchanged', () => {
        const existing = [{ id: 'cert-1', name: 'X', issuer: null, dateText: null }];
        expect(recoverCertsFromRawSection(existing, '')).toEqual(existing);
    });

    test('Preserves all extra fields (description, credentialUrl) on existing certs', () => {
        const raw = `## Zertifikate

Real Cert (Real Issuer)

## Sprachen
`;
        const existing = [
            {
                id: 'cert-1',
                name: 'Real Cert',
                issuer: 'Real Issuer',
                dateText: null,
                description: 'Some description',
                credentialUrl: 'https://example.com',
            },
        ];
        const out = recoverCertsFromRawSection(existing, raw);
        expect(out[0].description).toBe('Some description');
        expect(out[0].credentialUrl).toBe('https://example.com');
    });
});

// ──────────────────────────────────────────────────────────────────────
// Phase 8 (2026-04-27) — stripGradeFromEducationDescription
// Yannik's M.Sc. description had "- Abschlussnote: 1,3" as the first bullet
// AND a separate bold "Abschlussnote: 1,3" line above. Render duplicated
// the value visibly. The grade belongs in education[].grade, not in description.
// ──────────────────────────────────────────────────────────────────────

describe('stripGradeFromEducationDescription — Phase 8', () => {
    test('REGRESSION: extracts "Abschlussnote: 1,3" from description into grade', () => {
        const edu = [{
            id: 'edu-1',
            degree: 'M.Sc.',
            description: '- Abschlussnote: 1,3\n- Schwerpunkte: Medienrecht und Kulturökonomie\n- Masterthesis: Analyse von Nutzerbedürfnissen',
            grade: null,
        }];
        const out = stripGradeFromEducationDescription(edu);
        expect(out[0].grade).toBe('1,3');
        expect(out[0].description).not.toContain('Abschlussnote');
        expect(out[0].description).toContain('Schwerpunkte');
        expect(out[0].description).toContain('Masterthesis');
    });

    test('does not overwrite existing grade', () => {
        const edu = [{
            id: 'edu-1',
            degree: 'B.A.',
            description: '- Abschlussnote: 2,0\n- Schwerpunkte: Medienanalyse',
            grade: '1,3',
        }];
        const out = stripGradeFromEducationDescription(edu);
        expect(out[0].grade).toBe('1,3'); // existing kept
        expect(out[0].description).not.toContain('Abschlussnote');
    });

    test('handles bare grade line (no bullet prefix)', () => {
        const edu = [{
            id: 'edu-1',
            degree: 'M.Sc.',
            description: 'Abschlussnote: 1,7\n- Schwerpunkte: Strategy',
            grade: null,
        }];
        const out = stripGradeFromEducationDescription(edu);
        expect(out[0].grade).toBe('1,7');
        expect(out[0].description).toBe('- Schwerpunkte: Strategy');
    });

    test('handles English "Grade:" / "GPA:" labels', () => {
        const edu = [{
            id: 'edu-1',
            degree: 'B.Sc.',
            description: '- Grade: 3.7\n- Focus: Computer Science',
            grade: null,
        }];
        const out = stripGradeFromEducationDescription(edu);
        expect(out[0].grade).toBe('3.7');
    });

    test('Idempotent — running twice yields same result', () => {
        const edu = [{
            id: 'edu-1',
            degree: 'M.Sc.',
            description: '- Abschlussnote: 1,3\n- Bullet B',
            grade: null,
        }];
        const r1 = stripGradeFromEducationDescription(edu);
        const r2 = stripGradeFromEducationDescription(r1);
        expect(r2[0].grade).toBe(r1[0].grade);
        expect(r2[0].description).toBe(r1[0].description);
    });

    test('description = null when only grade line was present', () => {
        const edu = [{
            id: 'edu-1',
            degree: 'M.Sc.',
            description: '- Abschlussnote: 1,3',
            grade: null,
        }];
        const out = stripGradeFromEducationDescription(edu);
        expect(out[0].grade).toBe('1,3');
        expect(out[0].description).toBeNull();
    });

    test('preserves all other fields', () => {
        const edu = [{
            id: 'edu-1',
            degree: 'M.Sc.',
            institution: 'BSP',
            dateRangeText: '2020 - 2022',
            description: '- Abschlussnote: 1,3\n- Schwerpunkte',
            grade: null,
        }];
        const out = stripGradeFromEducationDescription(edu);
        expect(out[0].institution).toBe('BSP');
        expect(out[0].dateRangeText).toBe('2020 - 2022');
        expect(out[0].degree).toBe('M.Sc.');
    });

    test('handles empty array', () => {
        expect(stripGradeFromEducationDescription([])).toEqual([]);
    });
});

// ──────────────────────────────────────────────────────────────────────
// Phase 8 (2026-04-27) — Tier-1 smart name fallback stop-list expansion.
// Repro: extracted_text "Exxeta 04.08.1996 in Berlin   Familienstatus: ledig"
// → Tier-1-fallback picked "Berlin Familienstatus" because both tokens are
// TitleCase, ≥3 chars, and "Familienstatus" was not in INSTITUTIONAL_SUFFIX.
// ──────────────────────────────────────────────────────────────────────

describe('parseCvTextToJson — Phase 8 Tier-1 smart name fallback stop-list', () => {
    beforeEach(() => {
        (complete as jest.Mock).mockReset();
    });

    test('REGRESSION: rejects "Berlin Familienstatus", picks real name later in tokens', async () => {
        // Mock the LLM to return null name (worst-case forcing Tier-1 fallback).
        // The PII sanitizer marks `Berlin`, `Familienstatus`, and `Yannik Galetto`
        // as NAME tokens — we need to verify "Berlin Familienstatus" is rejected.
        (complete as jest.Mock).mockResolvedValue({
            text: JSON.stringify({
                personalInfo: { name: null, email: null, phone: null, location: null, summary: null, targetRole: 'Innovation Manager' },
                experience: [],
                education: [],
                skills: [],
                certifications: [],
                languages: [],
            }),
            model: 'claude-haiku-4-5',
            tokensUsed: 100,
            costCents: 1,
            latencyMs: 100,
        });

        const rawText = `Exxeta 04.08.1996 in Berlin   Familienstatus: ledig
Borsigstraße 12   10115 Berlin   +49 1590 136 24 18
yannik.galetto@gmail.com   Yannik Galetto

## Berufserfahrung

Innovation Manager at Ingrano Solutions
2025 - present

Implemented optimizations using Python and Make
Designed scalable B2B workflows for clients in DACH region
`;
        const result = await parseCvTextToJson(rawText);
        // The picked name MUST NOT be "Berlin Familienstatus" or any city+noun combination.
        expect(result.personalInfo?.name).not.toBe('Berlin Familienstatus');
        expect(result.personalInfo?.name).not.toMatch(/Berlin\s+Familienstatus/i);
        // Ideally it picks "Yannik Galetto" — but at minimum, it should not be the city+noun.
        if (result.personalInfo?.name) {
            const firstToken = result.personalInfo.name.split(/\s+/)[0].toLowerCase();
            expect(firstToken).not.toBe('berlin');
            expect(firstToken).not.toBe('münchen');
            expect(firstToken).not.toBe('hamburg');
        }
    });

    test('rejects "München Geburtstag" (Munich + birth-date label)', async () => {
        (complete as jest.Mock).mockResolvedValue({
            text: JSON.stringify({
                personalInfo: { name: null, email: null, phone: null },
                experience: [], education: [], skills: [], certifications: [], languages: [],
            }),
            model: 'claude-haiku-4-5', tokensUsed: 100, costCents: 1, latencyMs: 100,
        });

        const rawText = `München Geburtstag: 04.08.1996
Maria Schmidt
maria@example.com

## Berufserfahrung
Some role here.
`;
        const result = await parseCvTextToJson(rawText);
        expect(result.personalInfo?.name).not.toMatch(/München\s+Geburtstag/i);
    });

    test('still picks valid TitleCase TitleCase name (Maria Schmidt)', async () => {
        (complete as jest.Mock).mockResolvedValue({
            text: JSON.stringify({
                personalInfo: { name: null, email: null, phone: null },
                experience: [], education: [], skills: [], certifications: [], languages: [],
            }),
            model: 'claude-haiku-4-5', tokensUsed: 100, costCents: 1, latencyMs: 100,
        });

        const rawText = `Maria Schmidt
maria@example.com
+49 175 1234567

## Berufserfahrung
Project Manager at Some Company.
2020 - 2023
Led various initiatives.
`;
        const result = await parseCvTextToJson(rawText);
        // Real name should be picked
        expect(result.personalInfo?.name).toBeTruthy();
        expect(result.personalInfo?.name).not.toMatch(/Berlin|München|Familienstatus/i);
    });
});

// ──────────────────────────────────────────────────────────────────────
// Welle 2A (2026-04-27) — dropExperienceDuplicatedAsCert
// Bug: Parser-LLM occasionally promotes a cert ("HR-Transformation @ ZF GmbH")
// into experience, polluting the optimizer output with a 6th hallucinated
// station. Drop experience entries whose role+company match a cert by token
// overlap. Conservative thresholds to avoid dropping legitimate stations.
// ──────────────────────────────────────────────────────────────────────

describe('dropExperienceDuplicatedAsCert — Welle 2A', () => {
    test('REGRESSION: ZF cert wrongly classified as experience is dropped', () => {
        const exp = [
            { id: 'e1', role: 'Innovation Consultant', company: 'Fraunhofer FOKUS' },
            { id: 'e2', role: 'HR-Transformation & Organisationsentwicklung', company: 'ZF' },
        ];
        const certs = [
            { id: 'c1', name: 'HR-Transformation & Organisationsentwicklung', issuer: 'ZF GmbH' },
        ];
        const result = dropExperienceDuplicatedAsCert(exp, certs);
        expect(result.length).toBe(1);
        expect(result[0].role).toBe('Innovation Consultant');
    });

    test('drops when role overlap >= 0.85 even without issuer agreement', () => {
        const exp = [
            { id: 'e1', role: 'Design Thinking Coach Programm Hasso Plattner', company: null },
        ];
        const certs = [
            { id: 'c1', name: 'Design Thinking Coach Programm Hasso Plattner Institut', issuer: null },
        ];
        const result = dropExperienceDuplicatedAsCert(exp, certs);
        expect(result.length).toBe(0);
    });

    test('keeps legitimate experience when role overlap with cert is below 0.7', () => {
        const exp = [
            { id: 'e1', role: 'Innovation Consultant', company: 'Fraunhofer FOKUS' },
        ];
        const certs = [
            { id: 'c1', name: 'Design Thinking Coach', issuer: 'Hasso-Plattner-Institut' },
        ];
        const result = dropExperienceDuplicatedAsCert(exp, certs);
        expect(result.length).toBe(1);
    });

    test('keeps experience when role partially overlaps a cert but company differs', () => {
        const exp = [
            { id: 'e1', role: 'Manager', company: 'Acme Corp' },
        ];
        const certs = [
            { id: 'c1', name: 'Project Manager Certification', issuer: 'PMI' },
        ];
        // role overlap is moderate (just "manager"), company differs → keep
        const result = dropExperienceDuplicatedAsCert(exp, certs);
        expect(result.length).toBe(1);
    });

    test('idempotent: running twice yields same result', () => {
        const exp = [
            { id: 'e1', role: 'Innovation Consultant', company: 'Fraunhofer FOKUS' },
            { id: 'e2', role: 'HR-Transformation & Organisationsentwicklung', company: 'ZF' },
        ];
        const certs = [
            { id: 'c1', name: 'HR-Transformation & Organisationsentwicklung', issuer: 'ZF GmbH' },
        ];
        const once = dropExperienceDuplicatedAsCert(exp, certs);
        const twice = dropExperienceDuplicatedAsCert(once, certs);
        expect(twice).toEqual(once);
    });

    test('empty certifications: noop', () => {
        const exp = [
            { id: 'e1', role: 'Innovation Consultant', company: 'Fraunhofer FOKUS' },
        ];
        const result = dropExperienceDuplicatedAsCert(exp, []);
        expect(result).toEqual(exp);
    });

    test('empty experience: noop', () => {
        const result = dropExperienceDuplicatedAsCert([], [{ id: 'c1', name: 'X', issuer: 'Y' }]);
        expect(result).toEqual([]);
    });

    test('experience with no role: kept (cannot compare)', () => {
        const exp = [{ id: 'e1', role: null, company: 'X' }];
        const certs = [{ id: 'c1', name: 'Some Cert', issuer: 'X' }];
        const result = dropExperienceDuplicatedAsCert(exp, certs);
        expect(result.length).toBe(1);
    });
});

// ──────────────────────────────────────────────────────────────────────
// Welle 2B (2026-04-27) — recoverMissingExperienceStation
// Bug: Parser-LLM occasionally drops a whole experience station when the
// raw text is column-flattened. Repro: "Ingrano Solutions I Innovation Manager"
// in Yannik's Exxeta CV is wedged between an education line and a bullet
// list, and the LLM skips it. Pipe pattern + job-title-suffix detection.
// ──────────────────────────────────────────────────────────────────────

describe('recoverMissingExperienceStation — Welle 2B', () => {
    test('REGRESSION: Ingrano Solutions I Innovation Manager is recovered when missing', () => {
        const exp = [
            { id: 'e1', role: 'Innovation Consultant', company: 'Fraunhofer FOKUS' },
        ];
        const rawText = `Ingrano Solutions I Innovation Manager  Tech-Driven Efficiency: Optimierung von Arbeitsprozessen.`;
        const result = recoverMissingExperienceStation(exp, rawText);
        expect(result.length).toBe(2);
        const ingrano = result.find((e: any) => /ingrano/i.test(e.company || ''));
        expect(ingrano).toBeTruthy();
        expect(ingrano!.role).toMatch(/Innovation Manager/);
    });

    test('does NOT add when station already exists (fuzzy company match)', () => {
        const exp = [
            { id: 'e1', role: 'Manager', company: 'Ingrano Solutions GmbH' },
        ];
        const rawText = `Ingrano Solutions I Innovation Manager`;
        const result = recoverMissingExperienceStation(exp, rawText);
        expect(result.length).toBe(1);
    });

    test('skips pipe patterns without a job-title suffix', () => {
        const exp: Array<{ role?: string | null; company?: string | null }> = [];
        const rawText = `IT-Kenntnisse I Programming  Some bullet text here.`;
        const result = recoverMissingExperienceStation(exp, rawText);
        expect(result.length).toBe(0);
    });

    test('skips when role + company combined exceeds 80 chars', () => {
        const exp: Array<{ role?: string | null; company?: string | null }> = [];
        const rawText = `A Very Long Company Name With Many Words That Goes On And On I A Very Long Role Title Manager`;
        const result = recoverMissingExperienceStation(exp, rawText);
        expect(result.length).toBe(0);
    });

    test('idempotent: running twice yields same result', () => {
        const exp = [
            { id: 'e1', role: 'Innovation Consultant', company: 'Fraunhofer FOKUS' },
        ];
        const rawText = `Ingrano Solutions I Innovation Manager  Tech-Driven Efficiency.`;
        const once = recoverMissingExperienceStation(exp, rawText);
        const twice = recoverMissingExperienceStation(once, rawText);
        expect(twice.length).toBe(once.length);
    });

    test('empty raw text: noop', () => {
        const exp = [{ id: 'e1', role: 'Manager', company: 'Acme' }];
        const result = recoverMissingExperienceStation(exp, '');
        expect(result).toEqual(exp);
    });

    test('preserves existing experience entries (no mutation, only append)', () => {
        const exp = [
            { id: 'e1', role: 'Innovation Consultant', company: 'Fraunhofer FOKUS' },
            { id: 'e2', role: 'Co-Founder', company: 'Xorder Menues' },
        ];
        const rawText = `Ingrano Solutions I Innovation Manager  Some bullet.`;
        const result = recoverMissingExperienceStation(exp, rawText);
        expect(result.length).toBe(3);
        expect(result[0].role).toBe('Innovation Consultant');
        expect(result[1].role).toBe('Co-Founder');
        expect(result[2].role).toMatch(/Innovation Manager/);
    });

    test('rejects pure-numeric company like "2022 I Manager"', () => {
        const exp: Array<{ role?: string | null; company?: string | null }> = [];
        const rawText = `2022 I Innovation Manager  Some bullet.`;
        const result = recoverMissingExperienceStation(exp, rawText);
        expect(result.length).toBe(0);
    });
});
