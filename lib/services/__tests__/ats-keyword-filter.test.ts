import { filterAtsKeywords, ATS_STOP_LIST } from '../ats-keyword-filter';

describe('ats-keyword-filter', () => {

    describe('ATS_STOP_LIST', () => {
        it('contains the canonical "Bürozeit" trigger that motivated this fix', () => {
            expect(ATS_STOP_LIST.has('bürozeit')).toBe(true);
        });

        it('is non-trivial (>= 130 entries after PDF Sektion 9 alignment)', () => {
            expect(ATS_STOP_LIST.size).toBeGreaterThanOrEqual(130);
        });

        it('all entries are lowercased and trimmed', () => {
            for (const entry of ATS_STOP_LIST) {
                expect(entry).toBe(entry.toLowerCase().trim());
            }
        });
    });

    describe('filterAtsKeywords — empty / null guards', () => {
        it('returns empty arrays for null', () => {
            expect(filterAtsKeywords(null)).toEqual({ kept: [], removed: [] });
        });
        it('returns empty arrays for undefined', () => {
            expect(filterAtsKeywords(undefined)).toEqual({ kept: [], removed: [] });
        });
        it('returns empty arrays for []', () => {
            expect(filterAtsKeywords([])).toEqual({ kept: [], removed: [] });
        });
    });

    describe('filterAtsKeywords — should KEEP valid ATS keywords', () => {
        const validKeywords = [
            'Salesforce',
            'Python',
            'SAP S/4HANA',
            'TypeScript',
            'Scrum',
            'OKR',
            'Six Sigma',
            'SQL',
            'Machine Learning',
            'API-Design',
            'PMP',
            'AWS Solutions Architect',
            'Bilanzbuchhalter IHK',
            'B2B SaaS',
            'FinTech',
            'Stakeholder Management',
            'Account Executive',
        ];

        it.each(validKeywords)('keeps "%s" (valid ATS keyword)', (kw) => {
            const result = filterAtsKeywords([kw]);
            expect(result.kept).toEqual([kw]);
            expect(result.removed).toEqual([]);
        });

        it('preserves original casing on kept keywords', () => {
            const result = filterAtsKeywords(['Salesforce', 'PYTHON', 'TypeScript']);
            expect(result.kept).toEqual(['Salesforce', 'PYTHON', 'TypeScript']);
        });
    });

    // PDF Sektion 6 — VALIDE Soft Skills (echte ATS-Filter-Terme)
    describe('filterAtsKeywords — Sektion 6 valid soft-skill phrases', () => {
        const validSoftSkills = [
            'Stakeholder Management',
            'Cross-Functional Collaboration',
            'Change Management',
            'P&L Management',
            'Budget Ownership',
            'Strategic Thinking',
            'Executive Communication',
            'Decision-Making',
            'Mentoring',
            'Coaching',
            'Conflict Resolution',
            'Negotiation',
            'Client Relations',
            'Relationship Building',
        ];

        it.each(validSoftSkills)('keeps "%s" (VALIDE Soft-Skill per PDF Sektion 6)', (kw) => {
            const result = filterAtsKeywords([kw]);
            expect(result.kept).toEqual([kw]);
        });
    });

    // PDF Sektion 10 — DACH-spezifische valide Keywords
    describe('filterAtsKeywords — Sektion 10 DACH-specific valid keywords', () => {
        const dachKeywords = [
            'DATEV',
            'Lexware',
            'Personio',
            'Softgarden',
            'HRworks',
            'Bilanzbuchhaltung',
            'Anlagenbuchhaltung',
            'Finanzbuchhaltung',
            'Controlling',
            'Kostenrechnung',
            'Prokura',
            'Tarifvertrag',
            'Kaufmännisch',
        ];

        it.each(dachKeywords)('keeps "%s" (DACH-specific ATS keyword)', (kw) => {
            const result = filterAtsKeywords([kw]);
            expect(result.kept).toEqual([kw]);
        });
    });

    describe('filterAtsKeywords — should REMOVE garbage', () => {
        const garbage = [
            // The original "Bürozeit" bug
            'Bürozeit',
            // Soft-skill floskeln
            'Teamfähigkeit',
            'Eigenverantwortung',
            'Kommunikationsstärke',
            'Flexibilität',
            // Benefits
            'Homeoffice',
            'Bonus',
            '30 Urlaubstage',
            'Jobticket',
            'Betriebliche Altersvorsorge',
            // Generic adjectives
            'dynamisch',
            'innovativ',
            'modern',
            // Filler phrases
            'Wir bieten',
            'Du bringst mit',
            // Conjunctions (formerly LOW_SIGNAL)
            'und',
            'oder',
            'etc',
        ];

        it.each(garbage)('removes "%s" (stop-list match)', (kw) => {
            const result = filterAtsKeywords([kw]);
            expect(result.kept).toEqual([]);
            expect(result.removed).toEqual([kw]);
        });
    });

    // PDF Sektion 9 — Ergänzungen aus dem Master-Dokument
    describe('filterAtsKeywords — PDF Sektion 9 additions', () => {
        const additionalGarbage = [
            // Soft-Skill-Floskeln (additions)
            'Selbstständigkeit',
            'Proaktivität',
            'Hands-on-Mentalität',
            'Detailverliebt',
            'Ergebnisorientiert',
            'Self-starter',
            'Results-driven',
            'Fast learner',
            // Adjektive (additions)
            'Zukunftsorientiert',
            'Namhaft',
            'Renommiert',
            // Phrasen (additions)
            'Wir suchen',
            'Das erwartet dich',
            'Dein Profil',
            'Ab sofort',
            // Benefits (additions)
            'Vollzeit',
            'Teilzeit',
            'Unbefristet',
        ];

        it.each(additionalGarbage)('removes "%s" (PDF Sektion 9)', (kw) => {
            const result = filterAtsKeywords([kw]);
            expect(result.kept).toEqual([]);
            expect(result.removed).toEqual([kw]);
        });
    });

    // PDF Sektion 9 — Überholte Tech-Terme (NEW category)
    describe('filterAtsKeywords — outdated tech terms (PDF Sektion 9)', () => {
        const outdatedTech = [
            'MS Office',
            'MS Office Suite',
            'Microsoft Office Suite',
            'Social Media',
            'Web 2.0',
            'EDV-Kenntnisse',
            'Internet-Kenntnisse',
            'PC-Kenntnisse',
            'Computerkenntnisse',
        ];

        it.each(outdatedTech)('removes outdated tech term "%s"', (kw) => {
            const result = filterAtsKeywords([kw]);
            expect(result.kept).toEqual([]);
            expect(result.removed).toEqual([kw]);
        });

        it('keeps specific MS tools (Excel/Word/PowerPoint stay valid)', () => {
            const result = filterAtsKeywords(['Excel', 'Word', 'PowerPoint', 'Outlook']);
            expect(result.kept).toEqual(['Excel', 'Word', 'PowerPoint', 'Outlook']);
        });
    });

    describe('filterAtsKeywords — case insensitivity', () => {
        it('removes BÜROZEIT regardless of case', () => {
            const result = filterAtsKeywords(['BÜROZEIT', 'bürozeit', 'Bürozeit']);
            expect(result.kept).toEqual([]);
            expect(result.removed).toHaveLength(3);
        });

        it('removes Teamfähigkeit case-insensitive', () => {
            const result = filterAtsKeywords(['TEAMFÄHIGKEIT']);
            expect(result.kept).toEqual([]);
            expect(result.removed).toEqual(['TEAMFÄHIGKEIT']);
        });
    });

    describe('filterAtsKeywords — length & format guards', () => {
        it('drops entries < 2 chars', () => {
            const result = filterAtsKeywords(['A', '']);
            expect(result.kept).toEqual([]);
            expect(result.removed.length).toBeGreaterThanOrEqual(1);
        });

        it('drops entries > 60 chars (sentence leakage from Haiku)', () => {
            const longGarbage = 'Du bist verantwortlich für die strategische Weiterentwicklung des gesamten Bereichs';
            const result = filterAtsKeywords([longGarbage]);
            expect(result.kept).toEqual([]);
            expect(result.removed).toEqual([longGarbage]);
        });

        it('drops entries with > 5 words', () => {
            const tooLong = 'one two three four five six';
            const result = filterAtsKeywords([tooLong]);
            expect(result.kept).toEqual([]);
        });

        it('drops numbers-only entries', () => {
            const result = filterAtsKeywords(['100', '30', '2024']);
            expect(result.kept).toEqual([]);
            expect(result.removed).toHaveLength(3);
        });

        it('drops non-string entries gracefully', () => {
            // @ts-expect-error — testing runtime resilience
            const result = filterAtsKeywords([null, undefined, 42, 'Salesforce']);
            expect(result.kept).toEqual(['Salesforce']);
            expect(result.removed.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('filterAtsKeywords — substring match for filler phrases', () => {
        it('removes "Wir bieten dir 30 Urlaubstage" via filler-substring match', () => {
            const result = filterAtsKeywords(['Wir bieten dir 30 Urlaubstage']);
            expect(result.kept).toEqual([]);
        });

        it('does NOT block legitimate keyword via single-word stop-entry', () => {
            // "Salesforce" must not be killed by some accidental "force" stop-entry.
            // Our rule: substring match only fires for multi-word stop-entries.
            const result = filterAtsKeywords(['Salesforce']);
            expect(result.kept).toEqual(['Salesforce']);
        });
    });

    describe('filterAtsKeywords — deduplication', () => {
        it('removes case-insensitive duplicates, keeps first occurrence', () => {
            const result = filterAtsKeywords(['Salesforce', 'salesforce', 'SALESFORCE']);
            expect(result.kept).toEqual(['Salesforce']);
            expect(result.removed).toHaveLength(2);
        });
    });

    // Investigate Report 2026-04-25 — Leak #1: Adjektiv-Prefix Bypass
    describe('filterAtsKeywords — Leak #1 Adjektiv-Prefix Regression', () => {
        const adjektivPrefixGarbage = [
            'Hohe Flexibilität',
            'Hohes Engagement',
            'Hohe Eigenverantwortung',
            'Ausgeprägte Belastbarkeit',
            'Starke Kommunikationsstärke',
            'Sehr gute Teamfähigkeit',
            'Gute Eigeninitiative',
            'Hervorragende Kundenorientierung',
        ];

        it.each(adjektivPrefixGarbage)('removes "%s" via adjektiv-prefix detection', (kw) => {
            const result = filterAtsKeywords([kw]);
            expect(result.kept).toEqual([]);
            expect(result.removed).toEqual([kw]);
        });

        it('does NOT block legitimate phrases starting with adjektivs', () => {
            // "Gute Software" — "Software" not in stop-list → must pass
            const result = filterAtsKeywords(['Gute Software', 'Hohe Verfügbarkeit']);
            // "Verfügbarkeit" is not in our stop-list, so "Hohe Verfügbarkeit" should pass
            expect(result.kept).toContain('Gute Software');
            expect(result.kept).toContain('Hohe Verfügbarkeit');
        });
    });

    // Investigate Report 2026-04-25 — Leak #2: Kompositum-Suffix-Stripping
    describe('filterAtsKeywords — Leak #2 Kompositum-Suffix Regression', () => {
        it('rewrites "Projektleitungserfahrung" → "Projektleitung"', () => {
            const result = filterAtsKeywords(['Projektleitungserfahrung']);
            expect(result.kept).toEqual(['Projektleitung']);
            expect(result.rewritten).toEqual([
                { from: 'Projektleitungserfahrung', to: 'Projektleitung' },
            ]);
        });

        it('rewrites "Buchhaltungskenntnisse" → "Buchhaltung"', () => {
            const result = filterAtsKeywords(['Buchhaltungskenntnisse']);
            expect(result.kept).toEqual(['Buchhaltung']);
            expect(result.rewritten?.[0]).toEqual({
                from: 'Buchhaltungskenntnisse',
                to: 'Buchhaltung',
            });
        });

        it('rewrites "Führungskompetenz" → "Führung"', () => {
            const result = filterAtsKeywords(['Führungskompetenz']);
            expect(result.kept).toEqual(['Führung']);
        });

        it('rewrites "Programmierkenntnisse" → "Programmier"', () => {
            // Edge case — produces shorter core. Acceptable: index "Programmier" is searchable.
            const result = filterAtsKeywords(['Programmierkenntnisse']);
            expect(result.kept[0]?.toLowerCase()).toContain('programmier');
        });

        it('does NOT strip when core would be too short', () => {
            // "Erfahrung" alone — endsWith "erfahrung" but stripping leaves nothing meaningful
            const result = filterAtsKeywords(['Erfahrung']);
            // Should pass through unchanged (length guard kicks in: lower.length <= suffix.length + 3)
            expect(result.rewritten).toBeUndefined();
        });

        it('dedupes when both compound and core appear', () => {
            // Real-world: Haiku might output both "Projektleitung" AND "Projektleitungserfahrung"
            const result = filterAtsKeywords(['Projektleitung', 'Projektleitungserfahrung']);
            expect(result.kept).toEqual(['Projektleitung']); // first wins, second deduped after stripping
        });
    });

    describe('filterAtsKeywords — realistic mixed input from Haiku', () => {
        it('cleans a realistic Steckbrief output', () => {
            const harvested = [
                'Salesforce',           // ✓ tool
                'Python',               // ✓ tool
                'Teamfähigkeit',        // ✗ soft-skill
                'Bürozeit',             // ✗ benefit
                'Stakeholder Management', // ✓ hard-skill
                'dynamisch',            // ✗ adjective
                'Scrum',                // ✓ method
                'Wir bieten',           // ✗ filler
                'PMP',                  // ✓ cert
                'und',                  // ✗ conjunction
            ];
            const result = filterAtsKeywords(harvested);
            expect(result.kept).toEqual([
                'Salesforce',
                'Python',
                'Stakeholder Management',
                'Scrum',
                'PMP',
            ]);
            expect(result.removed).toEqual([
                'Teamfähigkeit',
                'Bürozeit',
                'dynamisch',
                'Wir bieten',
                'und',
            ]);
        });
    });

    /**
     * v1.0.6 parity guard: the Browser Extension import path
     * (app/api/jobs/import/route.ts) MUST run buzzwords through filterAtsKeywords
     * before persisting them. Until v1.0.5 the extension popup used a hardcoded
     * regex that diverged from the server filter. v1.0.6 removes the popup
     * regex; the server is now the single source of truth. These tests pin the
     * contract so a regression here would silently restore the old divergence.
     */
    describe('Extension import path parity', () => {
        it('strips Bürozeit-style noise even when extension submits raw Mistral output', () => {
            // Realistic shape of what the import-route Mistral prompt returns
            // before filterAtsKeywords runs (mixed valid + noise + filler).
            const mistralRawBuzzwords = [
                'Salesforce',
                'Bürozeit',
                'Homeoffice',
                'TypeScript',
                'Teamfähigkeit',
                'flexible Arbeitszeit',
                'Scrum',
                'Eigenverantwortung',
            ];
            const result = filterAtsKeywords(mistralRawBuzzwords);
            expect(result.kept).toContain('Salesforce');
            expect(result.kept).toContain('TypeScript');
            expect(result.kept).toContain('Scrum');
            expect(result.removed).toEqual(
                expect.arrayContaining(['Bürozeit', 'Homeoffice', 'Teamfähigkeit', 'Eigenverantwortung']),
            );
        });

        it('returns empty kept[] when extension submits a garbage description', () => {
            // Pure stop-list noise: benefits + soft skills + filler. None should survive.
            const allNoise = ['Bürozeit', 'Teamfähigkeit', 'dynamisch', 'Wir suchen', 'Homeoffice'];
            const result = filterAtsKeywords(allNoise);
            expect(result.kept).toEqual([]);
            expect(result.removed.length).toBe(allNoise.length);
        });

        it('preserves DACH-specific tools that the extension scrapes from German JDs', () => {
            const dachKeywords = ['DATEV', 'SAP S/4HANA', 'Personio', 'Lexware', 'ITIL 4 Foundation'];
            const result = filterAtsKeywords(dachKeywords);
            // All five should survive — the filter must not over-strip German tools.
            expect(result.kept.length).toBe(5);
            expect(result.removed).toEqual([]);
        });
    });
});
