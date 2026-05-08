type PreviewTriggerType =
    | 'funding'
    | 'gf_change'
    | 'kapitalerhoehung'
    | 'merger'
    | 'press_release'
    | 'regulatory'
    | 'product_launch';

export type PreviewInitiativTriggerRow = {
    trigger_type: PreviewTriggerType;
    company_name: string;
    company_url: string | null;
    branche: string;
    region: string;
    source_url: string;
    source_name: string;
    trigger_date: string;
    trigger_summary: string;
    raw_content: Record<string, unknown>;
};

export const PREVIEW_INITIATIV_TRIGGERS: PreviewInitiativTriggerRow[] = [
    {
        trigger_type: 'press_release',
        company_name: '9X',
        company_url: 'https://go9x.com/',
        branche: 'Innovationsberatung, KI-Beratung, Prozessautomatisierung, Design Thinking',
        region: 'Berlin',
        source_url: 'https://www.presseportal.de/pm/178349/6174534',
        source_name: 'Presseportal',
        trigger_date: '2025-12-08T11:01:00.000Z',
        trigger_summary:
            'RM Equity Partners berichtet ueber einen Hackathon mit dem Berliner KI-Beratungsunternehmen 9X. Das Signal passt zu KI-Enablement, Prozessautomatisierung und Workshop-Umsetzung.',
        raw_content: {
            seed: 'initiativ_preview',
            source_kind: 'public_press_release',
            match_terms: ['Innovationsberatung', 'Berlin', 'Design Thinking', 'KI-Beratung', 'Prozessautomatisierung'],
        },
    },
    {
        trigger_type: 'product_launch',
        company_name: 'wirDesign communication AG',
        company_url: 'https://www.wirdesign.de/ai',
        branche: 'Innovationsberatung, Designberatung, Markenstrategie, Design Thinking, KI',
        region: 'Berlin',
        source_url: 'https://www.pressebox.de/pressemitteilung/wirdesign-communications-ag/wirDesign-AI-Die-KI-Tool-Suite-fr-erfolgreiche-Markenfhrung/boxid/1269725',
        source_name: 'PresseBox',
        trigger_date: '2025-10-15T00:00:00.000Z',
        trigger_summary:
            'wirDesign stellt eine KI-Tool-Suite fuer Markenfuehrung vor. Das Signal verbindet Designberatung, Strategie und operative KI-Umsetzung an einem Berliner Standort.',
        raw_content: {
            seed: 'initiativ_preview',
            source_kind: 'public_press_release',
            match_terms: ['Innovationsberatung', 'Berlin', 'Design Thinking', 'Designberatung', 'KI'],
        },
    },
    {
        trigger_type: 'press_release',
        company_name: 'LIGANOVA',
        company_url: 'https://liganova.com/',
        branche: 'Innovationsberatung, Designberatung, Brand Experience, digitale Innovation, Design Thinking',
        region: 'Berlin',
        source_url: 'https://liganova.com/de/liganova-staerkt-kreativfuehrung-mit-internationaler-design-expertin-nasim-sehat/',
        source_name: 'LIGANOVA Press News',
        trigger_date: '2025-11-12T00:00:00.000Z',
        trigger_summary:
            'LIGANOVA erweitert die Kreativfuehrung am Berliner Standort. Das Signal spricht fuer digitale Innovation, Experience Design und interdisziplinaere Konzeptentwicklung.',
        raw_content: {
            seed: 'initiativ_preview',
            source_kind: 'public_press_release',
            match_terms: ['Innovationsberatung', 'Berlin', 'Design Thinking', 'Experience Design'],
        },
    },
    {
        trigger_type: 'press_release',
        company_name: 'GovTech Deutschland',
        company_url: 'https://govtech-deutschland.de/',
        branche: 'Innovationsberatung, GovTech, Verwaltung, Digitalisierung, Design Thinking',
        region: 'Berlin',
        source_url: 'https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1663819.php',
        source_name: 'Berlin.de',
        trigger_date: '2026-04-23T00:00:00.000Z',
        trigger_summary:
            'Berlin und GovTech Deutschland gruenden die Unit GovTech Berlin. Das Signal passt zu Innovationsbedarfen, Marktscreening und Umsetzung digitaler Loesungen in der Verwaltung.',
        raw_content: {
            seed: 'initiativ_preview',
            source_kind: 'public_press_release',
            match_terms: ['Innovationsberatung', 'Berlin', 'Design Thinking', 'GovTech', 'Digitalisierung'],
        },
    },
    {
        trigger_type: 'gf_change',
        company_name: 're:cap',
        company_url: 'https://www.re-cap.com/',
        branche: 'Finanzen, Fintech, Corporate Finance, Consulting, Prozessautomatisierung',
        region: 'Berlin',
        source_url: 'https://www.re-cap.com/en-gb/press/fintech-expert-philipp-schaaf-becomes-the-new-coo-of-re-cap',
        source_name: 're:cap Press',
        trigger_date: '2025-05-21T00:00:00.000Z',
        trigger_summary:
            're:cap ernennt einen neuen COO, um Struktur, Prozessmodell und Skalierung weiterzuentwickeln. Das Signal passt zu Finanzen, Consulting, Operations und automatisierten Finanzprozessen.',
        raw_content: {
            seed: 'initiativ_preview',
            source_kind: 'public_press_release',
            match_terms: ['Finanzen', 'Berlin', 'Consulting', 'Fintech', 'Prozessautomatisierung'],
        },
    },
    {
        trigger_type: 'funding',
        company_name: 'Pliant',
        company_url: 'https://www.getpliant.com/',
        branche: 'Finanzen, Fintech, B2B Payments, Consulting, Prozessautomatisierung',
        region: 'Berlin',
        source_url: 'https://www.getpliant.com/en/press/series-b',
        source_name: 'Pliant Press',
        trigger_date: '2025-04-28T00:00:00.000Z',
        trigger_summary:
            'Pliant meldet eine Series-B-Finanzierung ueber 40 Millionen US-Dollar und internationale Expansion. Das Signal passt zu Finanzen, Payment-Prozessen, Consulting und Skalierung.',
        raw_content: {
            seed: 'initiativ_preview',
            source_kind: 'public_press_release',
            match_terms: ['Finanzen', 'Berlin', 'Consulting', 'Payments', 'Expansion'],
        },
    },
    {
        trigger_type: 'press_release',
        company_name: 'Berlin Hyp',
        company_url: 'https://www.berlinhyp.de/',
        branche: 'Finanzen, Immobilienfinanzierung, Banking, Consulting, Transformation',
        region: 'Berlin',
        source_url: 'https://www.lbbw.de/artikel/pressemitteilung/lbbw-schliesst-rechtliche-intergation-der-berlin-hyp-erfolgreich-ab_akgdxyae4x_d.html',
        source_name: 'LBBW / Berlin Hyp',
        trigger_date: '2025-08-01T00:00:00.000Z',
        trigger_summary:
            'LBBW buendelt die gewerbliche Immobilienfinanzierung unter Berlin Hyp und beschreibt Integration, Prozessvereinfachung und Synergien. Das Signal passt zu Finanzen, Consulting und Transformation.',
        raw_content: {
            seed: 'initiativ_preview',
            source_kind: 'public_press_release',
            match_terms: ['Finanzen', 'Berlin', 'Consulting', 'Immobilienfinanzierung', 'Transformation'],
        },
    },
];

export function buildPreviewTriggerRows(seedDate = new Date()): PreviewInitiativTriggerRow[] {
    return PREVIEW_INITIATIV_TRIGGERS.map((row) => ({
        ...row,
        raw_content: {
            ...row.raw_content,
            seeded_at: seedDate.toISOString(),
        },
    }));
}

export function validatePreviewTriggers(rows = PREVIEW_INITIATIV_TRIGGERS): string[] {
    const errors: string[] = [];

    rows.forEach((row, index) => {
        const label = `row ${index + 1} (${row.company_name || 'unknown'})`;

        if (!row.company_name.trim()) errors.push(`${label}: company_name missing`);
        if (!row.source_url.startsWith('https://')) errors.push(`${label}: source_url must be https`);
        if (!row.source_name.trim()) errors.push(`${label}: source_name missing`);
        if (!row.trigger_summary.trim()) errors.push(`${label}: trigger_summary missing`);
        if (Number.isNaN(new Date(row.trigger_date).getTime())) errors.push(`${label}: trigger_date invalid`);
    });

    return errors;
}
