/**
 * Regulatory Triggers — Pflicht-Trigger aus Gesetzen für Initiativ-Discovery (Tier-1).
 *
 * Statische Liste der wichtigsten DACH/EU-Regulierungen, die Stellen-Bedarf
 * implizieren (Compliance-Officer, ESG-Manager, KI-Governance, etc.).
 *
 * Wird vom Discovery-Endpoint zusätzlich zu den DB-RSS-Triggern ausgeliefert.
 * Pure Functions, kein DB-Zugriff.
 */

export type RegulatoryCompanySize =
    | 'all'
    | 'mid_to_large'
    | 'over_250_employees'
    | 'platforms_marketplaces'
    | 'companies_with_ai_systems';

export interface RegulatoryTrigger {
    id: string;
    name: string;
    inkraft: string; // ISO date
    affectedRoles: string[];
    affectedBranches: string[];
    affectedCompanySize: RegulatoryCompanySize;
    sourceUrl: string;
    sourceTitle: string;
    shortDescription: string;
}

/**
 * Stand 2026-05-10. Bei neuen EU-Verordnungen hier ergänzen.
 *
 * Quellen sind ausschließlich offizielle Stellen (eur-lex, bsi.bund.de) —
 * keine Sekundärquellen, weil der User die URL einsehen können muss.
 */
export const REGULATORY_TRIGGERS_DACH: RegulatoryTrigger[] = [
    {
        id: 'eu_ai_act',
        name: 'EU AI Act',
        inkraft: '2026-08-02',
        affectedRoles: [
            'KI-Officer',
            'KI-Compliance-Beauftragte',
            'KI-Risikomanager',
            'AI Governance Lead',
        ],
        affectedBranches: ['tech', 'finance', 'healthcare', 'manufacturing', 'public_sector'],
        affectedCompanySize: 'companies_with_ai_systems',
        sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2024/1689',
        sourceTitle: 'Verordnung (EU) 2024/1689 — KI-Verordnung',
        shortDescription:
            'KI-Systeme erfordern menschliche Aufsicht, Transparenz und Risikobewertung. Pflicht ab 02.08.2026.',
    },
    {
        id: 'nis2',
        name: 'NIS-2-Richtlinie',
        inkraft: '2024-10-17',
        affectedRoles: [
            'IT-Sicherheits-Beauftragte',
            'CISO',
            'Incident-Response-Manager',
        ],
        affectedBranches: ['tech', 'finance', 'healthcare', 'energy', 'transport', 'manufacturing'],
        affectedCompanySize: 'mid_to_large',
        sourceUrl: 'https://www.bsi.bund.de/DE/Themen/Regulierte-Wirtschaft/NIS-2/nis-2_node.html',
        sourceTitle: 'BSI — NIS-2-Richtlinie',
        shortDescription:
            'Mittelständische Firmen brauchen IT-Sicherheits-Verantwortliche und Incident-Response-Pläne.',
    },
    {
        id: 'csrd',
        name: 'CSRD Sustainability Reporting',
        inkraft: '2025-01-01',
        affectedRoles: [
            'ESG-Manager',
            'Sustainability-Officer',
            'Reporting-Manager',
            'Nachhaltigkeitsmanager',
        ],
        affectedBranches: ['all'],
        affectedCompanySize: 'over_250_employees',
        sourceUrl: 'https://eur-lex.europa.eu/eli/dir/2022/2464',
        sourceTitle: 'Corporate Sustainability Reporting Directive',
        shortDescription:
            'Firmen mit mehr als 250 Mitarbeitenden müssen jährlich detailliert über ESG-Themen berichten.',
    },
    {
        id: 'dsa',
        name: 'Digital Services Act',
        inkraft: '2024-02-17',
        affectedRoles: [
            'Compliance-Officer Digital Services',
            'Trust & Safety Manager',
            'Content-Moderator',
        ],
        affectedBranches: ['tech', 'media', 'platforms'],
        affectedCompanySize: 'platforms_marketplaces',
        sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2022/2065',
        sourceTitle: 'Digital Services Act',
        shortDescription:
            'Online-Plattformen brauchen Compliance-Strukturen und Content-Moderation.',
    },
];

const AI_AFFINE_BRANCHES = new Set(['tech', 'finance', 'healthcare', 'manufacturing']);

function normalize(value: string | null | undefined): string {
    return (value ?? '').toLocaleLowerCase('de-DE').trim();
}

/**
 * Prüft ob die Branche der User-Query auf eine der affectedBranches eines
 * Triggers passt. 'all' ist immer Match. Substring-Match damit z.B.
 * "B2B SaaS Tech" auf 'tech' matched.
 */
export function brancheMatches(
    queryBranche: string,
    affectedBranches: string[],
): boolean {
    if (affectedBranches.includes('all')) return true;
    const normalizedQuery = normalize(queryBranche);
    if (!normalizedQuery) return false;
    return affectedBranches.some((b) => normalizedQuery.includes(normalize(b)));
}

/**
 * Prüft ob die Company-Size auf den Trigger passt.
 *
 * Wenn companySize undefined ist (Discovery-Form hat keinen Size-Input),
 * sind wir PERMISSIVE: alles außer den ultra-spezifischen Größen-Kategorien
 * matched. Sonst hätten 99% der User 0 Treffer.
 *
 * Spezielle AI-Logik: 'companies_with_ai_systems' matched, wenn die Branche
 * AI-affin ist (tech/finance/healthcare/manufacturing) — das EU AI Act greift
 * dort de facto immer.
 */
export function companySizeMatches(
    affectedCompanySize: RegulatoryCompanySize,
    queryBranche: string,
    companySize?: string,
): boolean {
    if (affectedCompanySize === 'all') return true;

    if (affectedCompanySize === 'companies_with_ai_systems') {
        const normalizedQuery = normalize(queryBranche);
        for (const aiBranche of AI_AFFINE_BRANCHES) {
            if (normalizedQuery.includes(aiBranche)) return true;
        }
        return false;
    }

    if (companySize === undefined) {
        // Permissive default: nur wirklich enge Size-Kategorien droppen
        if (affectedCompanySize === 'over_250_employees') return false;
        if (affectedCompanySize === 'platforms_marketplaces') return false;
        return true;
    }

    return affectedCompanySize === companySize;
}

/**
 * Hauptfunktion: gibt alle Regulatory-Trigger zurück, die für die Branche
 * (und optional Company-Size) der User-Query relevant sind.
 *
 * Für die Discovery-API: einmalig pro Request aufgerufen, Result als
 * separate Section in der Response geliefert (NICHT pro Firma).
 */
export function findRegulatoryTriggersForCompany(
    queryBranche: string,
    companySize?: string,
): RegulatoryTrigger[] {
    if (!queryBranche || !queryBranche.trim()) return [];

    return REGULATORY_TRIGGERS_DACH.filter((trigger) => {
        if (!brancheMatches(queryBranche, trigger.affectedBranches)) return false;
        if (!companySizeMatches(trigger.affectedCompanySize, queryBranche, companySize)) {
            return false;
        }
        return true;
    });
}
