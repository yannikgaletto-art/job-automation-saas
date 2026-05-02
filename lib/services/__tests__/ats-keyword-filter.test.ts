import {
    ATS_STOP_LIST,
    KNOWN_HALLUCINATIONS,
    buildAtsKeywordPrompt,
    cleanAtsKeywords,
    filterAtsKeywords,
    filterByVerbatimJDPresence,
} from '../ats-keyword-filter';

describe('ats-keyword-filter', () => {
    describe('buildAtsKeywordPrompt', () => {
        it('contains the central grounding rule without concrete compliance examples', () => {
            const prompt = buildAtsKeywordPrompt('German');

            expect(prompt).toMatch(/HARD RULE/);
            expect(prompt).toMatch(/TARGET 14-18/);
            expect(prompt).toMatch(/MAXIMUM 18/);
            expect(prompt).toMatch(/MUST appear verbatim/);
            expect(prompt).toMatch(/MUST NOT include/);
            expect(prompt).toMatch(/Project Management/);
            expect(prompt).not.toMatch(/ISO 9001|ISO 27001|ISO 26262|PCI DSS|DSGVO|GDPR/);
        });
    });

    describe('ATS_STOP_LIST', () => {
        it('contains high-signal blockers from the ATS master doc', () => {
            expect(ATS_STOP_LIST.size).toBeGreaterThanOrEqual(130);
            expect(ATS_STOP_LIST.has('bürozeit')).toBe(true);
            expect(ATS_STOP_LIST.has('teamfähigkeit')).toBe(true);
            expect(ATS_STOP_LIST.has('homeoffice')).toBe(true);
            expect(ATS_STOP_LIST.has('ms office')).toBe(true);
        });

        it('does not block valid ATS skill terms', () => {
            expect(ATS_STOP_LIST.has('project management')).toBe(false);
            expect(ATS_STOP_LIST.has('stakeholder management')).toBe(false);
            expect(ATS_STOP_LIST.has('pmp')).toBe(false);
            expect(ATS_STOP_LIST.has('datev')).toBe(false);
        });
    });

    describe('filterAtsKeywords', () => {
        it('removes generic, benefit and filler terms before persistence', () => {
            const result = filterAtsKeywords([
                'Bürozeit',
                'Teamfähigkeit',
                'Homeoffice',
                'Wir bieten',
                'MS Office',
                'Salesforce',
                'Stakeholder Management',
            ]);

            expect(result.removed).toEqual(expect.arrayContaining([
                'Bürozeit',
                'Teamfähigkeit',
                'Homeoffice',
                'Wir bieten',
                'MS Office',
            ]));
            expect(result.kept).toEqual(['Salesforce', 'Stakeholder Management']);
        });

        it('rewrites German compound experience terms to indexable base terms', () => {
            const result = filterAtsKeywords([
                'Projektleitungserfahrung',
                'Buchhaltungskenntnisse',
                'SAP S/4HANA',
                'C++',
                'Node.js',
            ]);

            expect(result.kept).toEqual(['Projektleitung', 'Buchhaltung', 'SAP S/4HANA', 'C++', 'Node.js']);
            expect(result.rewritten).toEqual(expect.arrayContaining([
                { from: 'Projektleitungserfahrung', to: 'Projektleitung' },
                { from: 'Buchhaltungskenntnisse', to: 'Buchhaltung' },
            ]));
        });

        it('drops job titles while preserving skill-noun forms', () => {
            const result = filterAtsKeywords([
                'Project Manager',
                'Account Executive',
                'Project Management',
                'Account Management',
            ]);

            expect(result.removed).toEqual(expect.arrayContaining(['Project Manager', 'Account Executive']));
            expect(result.kept).toEqual(['Project Management', 'Account Management']);
        });
    });

    describe('filterByVerbatimJDPresence', () => {
        const sapPublicSectorJob = `Gestalte die digitale Zukunft der öffentlichen Verwaltung mit SAP.
Du entwickelst Use Cases, Go-to-Market-Initiativen und Pilotprojekte fuer Laender und Kommunen.
Dabei positionierst du Cloud ERP, Daten und KI im oeffentlichen Sektor und baust ein Stakeholder-Netzwerk auf.
Mehrjaehrige Erfahrung in Business Development, Consulting, Vertrieb oder strategischer Geschaeftsentwicklung ist erforderlich.`;

        it('knows the canonical compliance hallucination set', () => {
            expect(KNOWN_HALLUCINATIONS.has('dsgvo')).toBe(true);
            expect(KNOWN_HALLUCINATIONS.has('iso 27001')).toBe(true);
            expect(KNOWN_HALLUCINATIONS.has('pci dss')).toBe(true);
            expect(KNOWN_HALLUCINATIONS.has('cloud computing')).toBe(true);
        });

        it('removes known hallucinations when the job description does not substantiate them', () => {
            const result = filterByVerbatimJDPresence([
                'DSGVO',
                'ISO 27001',
                'PCI DSS',
                'Cloud Computing',
                'SAP ERP',
                'Go-to-Market',
                'Vertrieb',
            ], sapPublicSectorJob);

            expect(result.removed).toEqual(expect.arrayContaining([
                'DSGVO',
                'ISO 27001',
                'PCI DSS',
                'Cloud Computing',
            ]));
            expect(result.kept).toEqual(expect.arrayContaining([
                'SAP ERP',
                'Go-to-Market',
                'Vertrieb',
            ]));
        });

        it('keeps a compliance keyword when the job description actually mentions it', () => {
            const complianceJob = `${sapPublicSectorJob}
Die Rolle verlangt Erfahrung mit Datenschutz-Grundverordnung, DSGVO und Informationssicherheit in regulierten Umgebungen.`;

            const result = filterByVerbatimJDPresence(['DSGVO'], complianceJob);
            expect(result.kept).toEqual(['DSGVO']);
            expect(result.removed).toEqual([]);
        });

        it('keeps translated compliance variants when the source text substantiates them', () => {
            const englishComplianceJob = `${sapPublicSectorJob}
The role requires privacy controls, GDPR implementation experience and regulated public-sector data governance.`;

            const result = filterByVerbatimJDPresence(['DSGVO'], englishComplianceJob);
            expect(result.kept).toEqual(['DSGVO']);
            expect(result.removed).toEqual([]);
        });
    });

    describe('cleanAtsKeywords', () => {
        it('combines normalization, stop-list filtering and hallucination filtering', () => {
            const jd = `Wir suchen Erfahrung mit SAP S/4HANA, DATEV, Projektleitung und Stakeholder Management.
Die Position fokussiert Controlling, IFRS und Go-to-Market im B2B SaaS Umfeld.`;

            const result = cleanAtsKeywords([
                'Teamfähigkeit',
                'SAP S/4HANA',
                'Projektleitungserfahrung',
                'DSGVO',
                'DATEV',
                'Stakeholder Management',
                'SAP S/4HANA',
            ], jd);

            expect(result.kept).toEqual([
                'DATEV',
                'Projektleitung',
                'SAP S/4HANA',
                'Stakeholder Management',
            ]);
            expect(result.stopListRemoved).toContain('Teamfähigkeit');
            expect(result.hallucinationRemoved).toContain('DSGVO');
        });
    });
});
