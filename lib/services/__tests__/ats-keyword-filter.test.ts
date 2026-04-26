import { filterAtsKeywords, filterByVerbatimJDPresence, ATS_STOP_LIST, KNOWN_HALLUCINATIONS } from '../ats-keyword-filter';

describe('ats-keyword-filter', () => {

    describe('ATS_STOP_LIST', () => {
        it('contains the canonical "Bürozeit" trigger that motivated this fix', () => {
            expect(ATS_STOP_LIST.has('bürozeit')).toBe(true);
        });

        it('is non-trivial (>= 180 entries after PDF Sektion 9 + medical/format extension)', () => {
            expect(ATS_STOP_LIST.size).toBeGreaterThanOrEqual(180);
        });

        it('blocks medical conditions / disease names (Tinnitus / Vorhofflimmern / AFib)', () => {
            expect(ATS_STOP_LIST.has('tinnitus')).toBe(true);
            expect(ATS_STOP_LIST.has('vorhofflimmern')).toBe(true);
            expect(ATS_STOP_LIST.has('afib')).toBe(true);
            expect(ATS_STOP_LIST.has('herzinsuffizienz')).toBe(true);
            expect(ATS_STOP_LIST.has('cardiovascular')).toBe(true);
        });

        it('blocks delivery-format terms (Webinare / Workshops / Konferenzen)', () => {
            expect(ATS_STOP_LIST.has('webinare')).toBe(true);
            expect(ATS_STOP_LIST.has('webinar')).toBe(true);
            expect(ATS_STOP_LIST.has('workshops')).toBe(true);
            expect(ATS_STOP_LIST.has('seminare')).toBe(true);
            expect(ATS_STOP_LIST.has('konferenzen')).toBe(true);
        });

        it('still allows legitimate healthcare ATS keywords (PDF Sektion 4 ## Healthcare)', () => {
            // These must NOT be stopped — they are PDF-listed valid healthcare ATS terms
            expect(ATS_STOP_LIST.has('patient care')).toBe(false);
            expect(ATS_STOP_LIST.has('clinical documentation')).toBe(false);
            expect(ATS_STOP_LIST.has('hipaa compliance')).toBe(false);
            expect(ATS_STOP_LIST.has('telehealth')).toBe(false);
            expect(ATS_STOP_LIST.has('medical affairs')).toBe(false);
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

    // ────────────────────────────────────────────────────────────────────
    // filterByVerbatimJDPresence — Surgical hallucination filter (v2, 2026-04-26)
    //
    // SEMANTICS: only keywords on the curated KNOWN_HALLUCINATIONS allowlist
    // (DSGVO, ISO 27001, PCI DSS, etc.) are verified against the JD text.
    // All other keywords pass through unchanged so cross-locale translations
    // like "Arztbeziehungen" (for English JD "physician relations") survive.
    //
    // Reproduces SAP-Job 2026-04-26 hallucination set + cross-locale guard.
    // ────────────────────────────────────────────────────────────────────
    describe('KNOWN_HALLUCINATIONS — allowlist sanity', () => {
        it('contains the canonical compliance halluzinations from SAP/EY tests', () => {
            expect(KNOWN_HALLUCINATIONS.has('dsgvo')).toBe(true);
            expect(KNOWN_HALLUCINATIONS.has('iso 27001')).toBe(true);
            expect(KNOWN_HALLUCINATIONS.has('iso 9001')).toBe(true);
            expect(KNOWN_HALLUCINATIONS.has('iso 26262')).toBe(true);
            expect(KNOWN_HALLUCINATIONS.has('pci dss')).toBe(true);
            expect(KNOWN_HALLUCINATIONS.has('cloud computing')).toBe(true);
        });

        it('all entries are normalized (lowercased, no diacritics)', () => {
            for (const entry of KNOWN_HALLUCINATIONS) {
                expect(entry).toBe(entry.toLowerCase());
                // NFKD-normalized form should equal the entry (no combining marks left)
                expect(entry.normalize('NFKD').replace(/[̀-ͯ]/g, '')).toBe(entry);
            }
        });
    });

    describe('filterByVerbatimJDPresence — empty / null guards', () => {
        it('returns empty arrays when keywords are null/undefined/empty', () => {
            expect(filterByVerbatimJDPresence(null, 'long enough description text here')).toEqual({ kept: [], removed: [] });
            expect(filterByVerbatimJDPresence(undefined, 'long enough description text here')).toEqual({ kept: [], removed: [] });
            expect(filterByVerbatimJDPresence([], 'long enough description text here')).toEqual({ kept: [], removed: [] });
        });

        it('keeps all keywords when JD is missing or too short (avoids false rejection)', () => {
            const kws = ['DSGVO', 'ISO 27001', 'AnythingGoes'];
            expect(filterByVerbatimJDPresence(kws, null)).toEqual({ kept: kws, removed: [] });
            expect(filterByVerbatimJDPresence(kws, '')).toEqual({ kept: kws, removed: [] });
            expect(filterByVerbatimJDPresence(kws, 'too short')).toEqual({ kept: kws, removed: [] });
        });
    });

    describe('filterByVerbatimJDPresence — SAP-Job 2026-04-26 hallucination reproduction', () => {
        const SAP_JD = `Bei SAP halten wir es einfach: Du bringst dein Bestes mit, und wir holen das Beste aus dir heraus.
Wir sind Macher, die über 20 Branchen und 80% des weltweiten Handels beeinflussen.
Gestalte die digitale Zukunft der öffentlichen Verwaltung mit uns.
Die Digitalisierung der öffentlichen Verwaltung ist eine der zentralen gesellschaftlichen Aufgaben unserer Zeit.
Als Senior Solution Advisor mit Fokus Business Development für Länder & Kommunen gestaltest du die strategische
Weiterentwicklung unseres Public Sector-Geschäfts. Du identifizierst neue Marktpotenziale, entwickelst skalierbare
Use Cases und positionierst das ganzheitliche Lösungsportfolio der SAP – von Cloud ERP über unsere
Technologie-Plattform bis zu Daten und KI. Dabei baust du nachhaltige Partnerschaften mit öffentlichen
Auftraggebern, Institutionen und unserem Partner-Ökosystem auf.
Identifikation, Strukturierung und Priorisierung neuer Geschäftspotenziale, Themenfelder und Use Cases für SAP
im öffentlichen Sektor – mit Fokus auf Länder und Kommunen.
Entwicklung und Umsetzung von Go-to-Market-Initiativen und Wachstumsstrategien.
Definition von Use Cases für unsere Kunden und Herausstellung der Wettbewerbsvorteile von SAP sowie deren
Positionierung bei den Kunden.
Aufbau und Pflege eines belastbaren Stakeholder-Netzwerks und strategischen Partnerschaften.
Unterstützung bei Demand Generation Maßnahmen, Kundeninitiativen, Pilotprojekten und Leuchtturmvorhaben.
Unterstützung komplexer Vertriebszyklen inkl. Ausschreibungen, Business Cases und Entscheidungspräsentationen.
Erfolgreich abgeschlossenes Studium in Wirtschaft, Verwaltung, Informatik, Politik oder vergleichbar.
Mehrjährige Erfahrung in Business Development, Consulting, Vertrieb oder strategischer Geschäftsentwicklung.`;

        it('REJECTS DSGVO when JD has no compliance reference', () => {
            const r = filterByVerbatimJDPresence(['DSGVO'], SAP_JD);
            expect(r.removed).toContain('DSGVO');
            expect(r.kept).not.toContain('DSGVO');
        });

        it('REJECTS ISO 27001 when JD has no ISO reference', () => {
            const r = filterByVerbatimJDPresence(['ISO 27001'], SAP_JD);
            expect(r.removed).toContain('ISO 27001');
        });

        it('REJECTS Cloud Computing when JD only mentions Cloud ERP (computing absent)', () => {
            const r = filterByVerbatimJDPresence(['Cloud Computing'], SAP_JD);
            expect(r.removed).toContain('Cloud Computing');
        });

        it('REJECTS PCI DSS when JD has no payment-card reference', () => {
            const r = filterByVerbatimJDPresence(['PCI DSS'], SAP_JD);
            expect(r.removed).toContain('PCI DSS');
        });

        it('KEEPS Ausschreibungen (verbatim in JD)', () => {
            const r = filterByVerbatimJDPresence(['Ausschreibungen'], SAP_JD);
            expect(r.kept).toContain('Ausschreibungen');
        });

        it('KEEPS Vertrieb (verbatim in JD)', () => {
            const r = filterByVerbatimJDPresence(['Vertrieb'], SAP_JD);
            expect(r.kept).toContain('Vertrieb');
        });

        it('KEEPS Go-to-Market (verbatim in JD as "Go-to-Market-Initiativen")', () => {
            const r = filterByVerbatimJDPresence(['Go-to-Market'], SAP_JD);
            expect(r.kept).toContain('Go-to-Market');
        });

        it('KEEPS Pilotprojekte (German declension — JD has "Pilotprojekten")', () => {
            const r = filterByVerbatimJDPresence(['Pilotprojekte'], SAP_JD);
            expect(r.kept).toContain('Pilotprojekte');
        });

        it('KEEPS SAP ERP (both 3-char tokens present in JD: SAP and ERP via "Cloud ERP")', () => {
            const r = filterByVerbatimJDPresence(['SAP ERP'], SAP_JD);
            expect(r.kept).toContain('SAP ERP');
        });

        it('KEEPS KI (2-char abbreviation, word-boundary in JD)', () => {
            const r = filterByVerbatimJDPresence(['KI'], SAP_JD);
            expect(r.kept).toContain('KI');
        });

        it('KEEPS Öffentlicher Sektor (umlaut + declension — JD has "öffentlichen Sektors")', () => {
            const r = filterByVerbatimJDPresence(['Öffentlicher Sektor'], SAP_JD);
            expect(r.kept).toContain('Öffentlicher Sektor');
        });

        it('end-to-end: from the actual SAP-Job hallucination set, compliance halluzinations are dropped', () => {
            const fromHallucinatedOutput = [
                'Ausschreibungen',          // ✓ pass-through (not in allowlist)
                'Cloud Computing',          // ✗ allowlist + not in JD → REMOVED
                'Digitale Transformation',  // ✓ pass-through
                'DSGVO',                    // ✗ allowlist + not in JD → REMOVED
                'ERP',                      // ✓ pass-through
                'Go-to-Market',             // ✓ pass-through
                'ISO 27001',                // ✗ allowlist + not in JD → REMOVED
                'KI',                       // ✓ pass-through
                'Öffentlicher Sektor',      // ✓ pass-through
                'Pilotprojekte',            // ✓ pass-through
                'Projektmanagement',        // ✓ pass-through (NOT in allowlist v2 — common term)
                'SAP ERP',                  // ✓ pass-through
                'Stakeholder-Management',   // ✓ pass-through (translations preserved)
                'Strategieentwicklung',     // ✓ pass-through
                'Vertrieb',                 // ✓ pass-through
            ];
            const r = filterByVerbatimJDPresence(fromHallucinatedOutput, SAP_JD);
            // Confirm the 3 compliance halluzinations are gone
            expect(r.removed).toContain('DSGVO');
            expect(r.removed).toContain('ISO 27001');
            expect(r.removed).toContain('Cloud Computing');
            // PCI DSS would also be dropped if present (in allowlist)
            // Confirm pass-through keywords survived (cross-locale safety)
            expect(r.kept).toContain('Ausschreibungen');
            expect(r.kept).toContain('Vertrieb');
            expect(r.kept).toContain('Go-to-Market');
            expect(r.kept).toContain('Pilotprojekte');
            expect(r.kept).toContain('SAP ERP');
            expect(r.kept).toContain('Projektmanagement');     // pass-through, not in allowlist
            expect(r.kept).toContain('Stakeholder-Management'); // pass-through
            expect(r.kept).toContain('Strategieentwicklung');   // pass-through
        });
    });

    // Cross-Locale Regression Suite (Sonova/Tinnitus 2026-04-26)
    // Mistral correctly translates English JD → German keywords for de-locale users.
    // Phase-3 v1 falsely rejected those translations; v2 must preserve them.
    describe('filterByVerbatimJDPresence — cross-locale translation safety', () => {
        const SONOVA_EN_JD = `As Senior Medical Engagement Manager you will drive growth and engagement for Sonova's tinnitus-focused digital health services. You will build trusted relationships with healthcare professionals, plan and deliver trainings, webinars, clinical discussions, site visits and community engagement events. Define and execute clinically relevant content strategies. Collaborate with product, medical affairs and marketing teams. Monitor engagement metrics, app adoption and ROI. 5+ years of experience in healthcare marketing, medical engagement, physician relations, medical affairs or digital health.`;

        it('KEEPS German translations of English JD terms (Arztbeziehungen for physician relations)', () => {
            const r = filterByVerbatimJDPresence(['Arztbeziehungen'], SONOVA_EN_JD);
            expect(r.kept).toContain('Arztbeziehungen');
            expect(r.removed).not.toContain('Arztbeziehungen');
        });

        it('KEEPS Digitale Gesundheit (translation of "digital health")', () => {
            const r = filterByVerbatimJDPresence(['Digitale Gesundheit'], SONOVA_EN_JD);
            expect(r.kept).toContain('Digitale Gesundheit');
        });

        it('KEEPS Klinische Inhalte (translation of "clinical content")', () => {
            const r = filterByVerbatimJDPresence(['Klinische Inhalte'], SONOVA_EN_JD);
            expect(r.kept).toContain('Klinische Inhalte');
        });

        it('KEEPS Gesundheitsmarketing (translation of "healthcare marketing")', () => {
            const r = filterByVerbatimJDPresence(['Gesundheitsmarketing'], SONOVA_EN_JD);
            expect(r.kept).toContain('Gesundheitsmarketing');
        });

        it('KEEPS Hybrides Arbeiten (translation of "hybrid working")', () => {
            const r = filterByVerbatimJDPresence(['Hybrides Arbeiten'], SONOVA_EN_JD);
            expect(r.kept).toContain('Hybrides Arbeiten');
        });

        it('KEEPS ROI-Analyse even when only "ROI" appears in JD (pass-through)', () => {
            const r = filterByVerbatimJDPresence(['ROI-Analyse'], SONOVA_EN_JD);
            expect(r.kept).toContain('ROI-Analyse');
        });

        it('still REMOVES DSGVO from English JD (allowlist verification path)', () => {
            const r = filterByVerbatimJDPresence(['DSGVO', 'Arztbeziehungen'], SONOVA_EN_JD);
            expect(r.removed).toContain('DSGVO');
            expect(r.kept).toContain('Arztbeziehungen');
        });

        it('end-to-end Sonova: pass-through translations, drop compliance halluzinations', () => {
            const mistralOutput = [
                'Arztbeziehungen',
                'Digitale Gesundheit',
                'Klinische Inhalte',
                'Hybrides Arbeiten',
                'ROI-Analyse',
                'Gesundheitsmarketing',
                'Medical Affairs',
                'DSGVO',          // halluzinated
                'ISO 27001',      // halluzinated
                'PCI DSS',        // halluzinated
            ];
            const r = filterByVerbatimJDPresence(mistralOutput, SONOVA_EN_JD);
            expect(r.removed).toEqual(expect.arrayContaining(['DSGVO', 'ISO 27001', 'PCI DSS']));
            expect(r.kept).toEqual(expect.arrayContaining([
                'Arztbeziehungen',
                'Digitale Gesundheit',
                'Klinische Inhalte',
                'Hybrides Arbeiten',
                'ROI-Analyse',
                'Gesundheitsmarketing',
                'Medical Affairs',
            ]));
        });
    });

    describe('filterByVerbatimJDPresence — pass-through behavior (v2)', () => {
        const TECH_JD = `We are looking for a Senior Software Engineer with strong Python and TypeScript experience.
You will work on Salesforce integrations using SAP, build microservices with Node.js, and deploy to AWS.
Experience with Scrum, OKR and PMP certification is a plus.
Familiarity with PostgreSQL and Redis is required.
You will collaborate with stakeholders across product and engineering teams.`;

        it('KEEPS tech keywords (pass-through, not in allowlist)', () => {
            const r = filterByVerbatimJDPresence(['Salesforce', 'Python', 'TypeScript'], TECH_JD);
            expect(r.kept).toEqual(['Salesforce', 'Python', 'TypeScript']);
        });

        it('KEEPS short-token brand names (pass-through)', () => {
            const r = filterByVerbatimJDPresence(['SAP', 'AWS', 'OKR', 'PMP'], TECH_JD);
            expect(r.kept).toEqual(['SAP', 'AWS', 'OKR', 'PMP']);
        });

        it('KEEPS Stakeholder Management (pass-through — translations preserved)', () => {
            const r = filterByVerbatimJDPresence(['Stakeholder Management'], TECH_JD);
            expect(r.kept).toContain('Stakeholder Management');
        });

        it('KEEPS arbitrary German keyword on English JD (cross-locale pass-through)', () => {
            const r = filterByVerbatimJDPresence(['Stakeholder-Beziehungen', 'Vertriebsmanagement'], TECH_JD);
            expect(r.kept).toEqual(['Stakeholder-Beziehungen', 'Vertriebsmanagement']);
        });

        it('handles diacritics in pass-through path', () => {
            const r = filterByVerbatimJDPresence(['Übersetzung'], 'Wir suchen jemanden für Übersetzungen.');
            expect(r.kept).toContain('Übersetzung');
        });

        it('REMOVES DSGVO when not in JD (allowlist enforcement on Tech-JD)', () => {
            const r = filterByVerbatimJDPresence(['Salesforce', 'DSGVO', 'Python'], TECH_JD);
            expect(r.kept).toContain('Salesforce');
            expect(r.kept).toContain('Python');
            expect(r.removed).toContain('DSGVO');
        });

        it('KEEPS DSGVO when JD actually mentions Datenschutz-Grundverordnung', () => {
            const complianceJD = `${TECH_JD}\nKnowledge of DSGVO and Datenschutz-Grundverordnung is required.`;
            const r = filterByVerbatimJDPresence(['DSGVO'], complianceJD);
            expect(r.kept).toContain('DSGVO');
        });
    });
});
