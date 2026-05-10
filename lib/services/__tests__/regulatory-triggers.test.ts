/**
 * Regression-Suite für regulatory-triggers.ts
 *
 * Testet die Pure-Function-Schicht der Tier-1-Regulatory-Trigger für die
 * Initiativ-Discovery. Keine externen Dependencies, keine Mocks nötig.
 */

import {
    REGULATORY_TRIGGERS_DACH,
    brancheMatches,
    companySizeMatches,
    findRegulatoryTriggersForCompany,
} from '../regulatory-triggers';

describe('regulatory-triggers — REGULATORY_TRIGGERS_DACH', () => {
    it('enthält die 4 Pflicht-Trigger für DACH/EU', () => {
        const ids = REGULATORY_TRIGGERS_DACH.map((t) => t.id).sort();
        expect(ids).toEqual(['csrd', 'dsa', 'eu_ai_act', 'nis2']);
    });

    it('jeder Trigger hat eine offizielle eur-lex/bsi.bund.de Quelle', () => {
        for (const trigger of REGULATORY_TRIGGERS_DACH) {
            expect(trigger.sourceUrl).toMatch(/^https:\/\/(eur-lex\.europa\.eu|www\.bsi\.bund\.de)/);
            expect(trigger.sourceTitle.length).toBeGreaterThan(10);
        }
    });

    it('jeder Trigger hat ein gültiges ISO-Datum + nicht-leere Pflichtfelder', () => {
        for (const trigger of REGULATORY_TRIGGERS_DACH) {
            expect(trigger.inkraft).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(Number.isNaN(new Date(trigger.inkraft).getTime())).toBe(false);
            expect(trigger.name.length).toBeGreaterThan(0);
            expect(trigger.shortDescription.length).toBeGreaterThan(20);
            expect(trigger.affectedRoles.length).toBeGreaterThan(0);
            expect(trigger.affectedBranches.length).toBeGreaterThan(0);
        }
    });
});

describe('regulatory-triggers — brancheMatches', () => {
    it('all matched immer', () => {
        expect(brancheMatches('tech', ['all'])).toBe(true);
        expect(brancheMatches('xyz123', ['all'])).toBe(true);
        expect(brancheMatches('', ['all'])).toBe(true);
    });

    it('exakter Match', () => {
        expect(brancheMatches('tech', ['tech', 'finance'])).toBe(true);
        expect(brancheMatches('finance', ['tech', 'finance'])).toBe(true);
    });

    it('Substring-Match (User schreibt "B2B SaaS Tech")', () => {
        expect(brancheMatches('B2B SaaS Tech', ['tech'])).toBe(true);
        expect(brancheMatches('Health-Tech-Startup', ['tech'])).toBe(true);
    });

    it('Case-insensitive', () => {
        expect(brancheMatches('TECH', ['tech'])).toBe(true);
        expect(brancheMatches('Finance', ['finance'])).toBe(true);
    });

    it('kein Match wenn Branche fremd', () => {
        expect(brancheMatches('agriculture', ['tech', 'finance'])).toBe(false);
        expect(brancheMatches('retail', ['healthcare'])).toBe(false);
    });

    it('leere Query matched nichts (außer all)', () => {
        expect(brancheMatches('', ['tech'])).toBe(false);
        expect(brancheMatches('   ', ['tech'])).toBe(false);
    });
});

describe('regulatory-triggers — companySizeMatches', () => {
    describe('all', () => {
        it('matched immer, egal welche Größe', () => {
            expect(companySizeMatches('all', 'tech')).toBe(true);
            expect(companySizeMatches('all', 'finance', 'mid_to_large')).toBe(true);
            expect(companySizeMatches('all', '', undefined)).toBe(true);
        });
    });

    describe('companies_with_ai_systems (EU AI Act)', () => {
        it('matched bei AI-affinen Branchen', () => {
            expect(companySizeMatches('companies_with_ai_systems', 'tech')).toBe(true);
            expect(companySizeMatches('companies_with_ai_systems', 'finance')).toBe(true);
            expect(companySizeMatches('companies_with_ai_systems', 'healthcare')).toBe(true);
            expect(companySizeMatches('companies_with_ai_systems', 'manufacturing')).toBe(true);
        });

        it('matched NICHT bei nicht-AI-affinen Branchen', () => {
            expect(companySizeMatches('companies_with_ai_systems', 'retail')).toBe(false);
            expect(companySizeMatches('companies_with_ai_systems', 'agriculture')).toBe(false);
        });
    });

    describe('Permissive default wenn companySize undefined', () => {
        it('over_250_employees wird gedroppt (zu eng)', () => {
            expect(companySizeMatches('over_250_employees', 'tech')).toBe(false);
        });

        it('platforms_marketplaces wird gedroppt (zu eng)', () => {
            expect(companySizeMatches('platforms_marketplaces', 'tech')).toBe(false);
        });

        it('mid_to_large bleibt drin (häufige Größe in DACH)', () => {
            expect(companySizeMatches('mid_to_large', 'tech')).toBe(true);
        });
    });

    describe('Mit explizitem companySize', () => {
        it('exakter Match', () => {
            expect(companySizeMatches('mid_to_large', 'tech', 'mid_to_large')).toBe(true);
            expect(companySizeMatches('over_250_employees', 'tech', 'over_250_employees')).toBe(true);
        });

        it('Mismatch', () => {
            expect(companySizeMatches('over_250_employees', 'tech', 'mid_to_large')).toBe(false);
        });
    });
});

describe('regulatory-triggers — findRegulatoryTriggersForCompany', () => {
    it('Tech-Branche bekommt EU AI Act + NIS-2 + CSRD (3 Treffer ohne size)', () => {
        const triggers = findRegulatoryTriggersForCompany('tech');
        const ids = triggers.map((t) => t.id).sort();
        // tech matched: eu_ai_act (AI-affin), nis2 (mid_to_large permissive), csrd (all aber over_250 gedroppt → fällt raus)
        // dsa (platforms_marketplaces) wird gedroppt
        expect(ids).toContain('eu_ai_act');
        expect(ids).toContain('nis2');
        expect(ids).not.toContain('dsa'); // platforms_marketplaces ohne size = drop
        expect(ids).not.toContain('csrd'); // over_250_employees ohne size = drop
    });

    it('Finance-Branche bekommt EU AI Act + NIS-2', () => {
        const triggers = findRegulatoryTriggersForCompany('finance');
        const ids = triggers.map((t) => t.id);
        expect(ids).toContain('eu_ai_act');
        expect(ids).toContain('nis2');
    });

    it('Über over_250_employees wird CSRD inkludiert', () => {
        const triggers = findRegulatoryTriggersForCompany('retail', 'over_250_employees');
        const ids = triggers.map((t) => t.id);
        expect(ids).toContain('csrd'); // all branches, matched size
    });

    it('platforms_marketplaces inkludiert DSA für tech', () => {
        const triggers = findRegulatoryTriggersForCompany('tech', 'platforms_marketplaces');
        const ids = triggers.map((t) => t.id);
        expect(ids).toContain('dsa');
    });

    it('Agriculture (nicht-tech) ohne size: 0 Treffer (CSRD braucht 250+ MA)', () => {
        const triggers = findRegulatoryTriggersForCompany('agriculture');
        expect(triggers).toHaveLength(0);
    });

    it('Leere Branche: keine Trigger', () => {
        expect(findRegulatoryTriggersForCompany('')).toEqual([]);
        expect(findRegulatoryTriggersForCompany('   ')).toEqual([]);
    });

    it('Substring-Match: "B2B SaaS Tech-Startup" wird wie tech behandelt', () => {
        const triggers = findRegulatoryTriggersForCompany('B2B SaaS Tech-Startup');
        const ids = triggers.map((t) => t.id);
        expect(ids).toContain('eu_ai_act');
    });

    it('Idempotenz: gleiche Eingabe → gleiche Ausgabe', () => {
        const a = findRegulatoryTriggersForCompany('tech');
        const b = findRegulatoryTriggersForCompany('tech');
        expect(a).toEqual(b);
    });
});
