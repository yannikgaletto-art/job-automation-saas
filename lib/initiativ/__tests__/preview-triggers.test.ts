import { buildDiscoverySignals, type RawInitiativTrigger } from '../discovery';
import {
    buildPreviewTriggerRows,
    PREVIEW_INITIATIV_TRIGGERS,
    validatePreviewTriggers,
} from '../preview-triggers';

describe('initiativ preview trigger seed', () => {
    it('keeps every preview signal source-backed', () => {
        expect(validatePreviewTriggers()).toEqual([]);

        for (const trigger of PREVIEW_INITIATIV_TRIGGERS) {
            expect(trigger.source_url).toMatch(/^https:\/\//);
            expect(trigger.source_name).toBeTruthy();
            expect(trigger.trigger_summary.length).toBeGreaterThan(80);
        }
    });

    it('covers the preview query for innovation consulting in Berlin', () => {
        const rows = buildPreviewTriggerRows(new Date('2026-05-08T12:00:00.000Z'));
        const dbFilteredRows = rows.filter((row) =>
            row.branche.toLocaleLowerCase('de-DE').includes('innovationsberatung')
            && row.region.toLocaleLowerCase('de-DE').includes('berlin')
        );

        const signals = buildDiscoverySignals(
            dbFilteredRows.map((row, index) => ({
                id: `preview-${index}`,
                trigger_type: row.trigger_type,
                company_name: row.company_name,
                company_url: row.company_url,
                branche: row.branche,
                region: row.region,
                source_url: row.source_url,
                source_name: row.source_name,
                trigger_date: row.trigger_date,
                trigger_summary: row.trigger_summary,
            })) satisfies RawInitiativTrigger[],
            {
                branche: 'Innovationsberatung',
                region: 'Berlin',
                focus: 'Design Thinking',
            },
        );

        expect(signals).toHaveLength(4);
        expect(signals.every((signal) => signal.confidence === 'green')).toBe(true);
        expect(signals.every((signal) => signal.sourceUrl.startsWith('https://'))).toBe(true);
    });

    it('covers the preview query for finance consulting in Berlin', () => {
        const rows = buildPreviewTriggerRows(new Date('2026-05-08T12:00:00.000Z'));
        const dbFilteredRows = rows.filter((row) =>
            row.branche.toLocaleLowerCase('de-DE').includes('finanzen')
            && row.region.toLocaleLowerCase('de-DE').includes('berlin')
        );

        const signals = buildDiscoverySignals(
            dbFilteredRows.map((row, index) => ({
                id: `preview-finance-${index}`,
                trigger_type: row.trigger_type,
                company_name: row.company_name,
                company_url: row.company_url,
                branche: row.branche,
                region: row.region,
                source_url: row.source_url,
                source_name: row.source_name,
                trigger_date: row.trigger_date,
                trigger_summary: row.trigger_summary,
            })) satisfies RawInitiativTrigger[],
            {
                branche: 'Finanzen',
                region: 'Berlin',
                focus: 'Consulting',
            },
        );

        expect(signals).toHaveLength(3);
        expect(signals.map((signal) => signal.companyName)).toEqual([
            'Berlin Hyp',
            're:cap',
            'Pliant',
        ]);
        expect(signals.every((signal) => signal.confidence === 'green')).toBe(true);
        expect(signals.every((signal) => signal.sourceUrl.startsWith('https://'))).toBe(true);
    });

    it('covers the broad preview query for AI consulting in Germany', () => {
        const rows = buildPreviewTriggerRows(new Date('2026-05-09T12:00:00.000Z'));

        const signals = buildDiscoverySignals(
            rows.map((row, index) => ({
                id: `preview-ai-germany-${index}`,
                trigger_type: row.trigger_type,
                company_name: row.company_name,
                company_url: row.company_url,
                branche: row.branche,
                region: row.region,
                source_url: row.source_url,
                source_name: row.source_name,
                trigger_date: row.trigger_date,
                trigger_summary: row.trigger_summary,
            })) satisfies RawInitiativTrigger[],
            {
                branche: 'KI',
                region: 'Deutschland',
                focus: 'Beratung',
            },
        ).filter((signal) => signal.matchReasons.includes('branche'));

        expect(signals).toHaveLength(2);
        expect(signals.some((signal) => signal.companyName === '9X')).toBe(true);
        expect(signals.some((signal) => signal.companyName === 'wirDesign communication AG')).toBe(true);
        expect(signals.some((signal) => signal.companyName === 'Berlin Hyp')).toBe(false);
        expect(signals.every((signal) => signal.matchReasons.includes('region'))).toBe(true);
        expect(signals.every((signal) => signal.sourceUrl.startsWith('https://'))).toBe(true);
    });
});
