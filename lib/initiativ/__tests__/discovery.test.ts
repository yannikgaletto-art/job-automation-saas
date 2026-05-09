import {
    buildDiscoverySignals,
    filterDiscoverySignalsForQuery,
    sanitizeDiscoveryQuery,
    shouldApplyStrictDiscoveryRegionFilter,
    shouldRetryDiscoveryWithoutRegion,
} from '../discovery';

describe('sanitizeDiscoveryQuery', () => {
    it('trims and limits user input', () => {
        const result = sanitizeDiscoveryQuery({
            branche: '  KI Beratung  ',
            region: '  Berlin   Brandenburg  ',
            focus: '  Prozessautomatisierung  '.repeat(20),
        });

        expect(result.branche).toBe('KI Beratung');
        expect(result.region).toBe('Berlin Brandenburg');
        expect(result.focus.length).toBeLessThanOrEqual(180);
    });
});

describe('buildDiscoverySignals', () => {
    it('scores branche and focus matches above unrelated signals', () => {
        const signals = buildDiscoverySignals([
            {
                id: '1',
                trigger_type: 'press_release',
                company_name: 'Ingrano Solutions',
                company_url: null,
                branche: 'KI Beratung',
                region: 'Berlin',
                source_url: 'https://example.com/ingrano',
                source_name: 'Presseportal',
                trigger_date: '2026-05-01T00:00:00.000Z',
                trigger_summary: 'Neue Initiative fuer Prozessautomatisierung gestartet.',
            },
            {
                id: '2',
                trigger_type: 'funding',
                company_name: 'Andere GmbH',
                company_url: null,
                branche: 'Logistik',
                region: 'Hamburg',
                source_url: 'https://example.com/andere',
                source_name: 'deutsche-startups.de',
                trigger_date: '2026-05-07T00:00:00.000Z',
                trigger_summary: 'Finanzierungsrunde abgeschlossen.',
            },
        ], {
            branche: 'KI',
            region: '',
            focus: 'Prozessautomatisierung',
        });

        expect(signals[0].id).toBe('1');
        expect(signals[0].confidence).toBe('green');
        expect(signals[0].matchReasons).toEqual(['branche', 'focus']);
    });

    it('treats Germany as a broad region for German city-level preview signals', () => {
        const signals = buildDiscoverySignals([
            {
                id: '1',
                trigger_type: 'press_release',
                company_name: '9X',
                company_url: null,
                branche: 'Innovationsberatung, KI-Beratung, Prozessautomatisierung',
                region: 'Berlin',
                source_url: 'https://example.com/9x',
                source_name: 'Presseportal',
                trigger_date: '2025-12-08T00:00:00.000Z',
                trigger_summary: 'Berliner KI-Beratungsunternehmen begleitet Prozessautomatisierung.',
            },
        ], {
            branche: 'KI',
            region: 'Deutschland',
            focus: 'Beratung',
        });

        expect(signals).toHaveLength(1);
        expect(signals[0].confidence).toBe('green');
        expect(signals[0].matchReasons).toEqual(['branche', 'region', 'focus']);
    });

    it('does not match short branch queries inside unrelated words', () => {
        const signals = buildDiscoverySignals([
            {
                id: '1',
                trigger_type: 'press_release',
                company_name: 'Berlin Hyp',
                company_url: null,
                branche: 'Finanzen, Immobilienfinanzierung, Banking, Consulting',
                region: 'Berlin',
                source_url: 'https://example.com/berlin-hyp',
                source_name: 'LBBW',
                trigger_date: '2025-08-01T00:00:00.000Z',
                trigger_summary: 'Integration und Prozessvereinfachung im Finanzumfeld.',
            },
        ], {
            branche: 'KI',
            region: 'Deutschland',
            focus: 'Beratung',
        });

        expect(signals).toHaveLength(1);
        expect(signals[0].matchReasons).toEqual(['region']);
        expect(signals[0].confidence).toBe('yellow');
    });
});

describe('shouldApplyStrictDiscoveryRegionFilter', () => {
    it('does not apply a city-level database filter for broad regions', () => {
        expect(shouldApplyStrictDiscoveryRegionFilter('Deutschland')).toBe(false);
        expect(shouldApplyStrictDiscoveryRegionFilter('DACH')).toBe(false);
        expect(shouldApplyStrictDiscoveryRegionFilter('Berlin')).toBe(true);
    });
});

describe('shouldRetryDiscoveryWithoutRegion', () => {
    it('retries only when a concrete region blocks all branch matches', () => {
        const query = {
            branche: 'KI',
            region: 'München',
            focus: 'Consulting',
        };

        expect(shouldRetryDiscoveryWithoutRegion(query, [])).toBe(true);

        const fallbackSignals = filterDiscoverySignalsForQuery([
            {
                id: '1',
                trigger_type: 'press_release',
                company_name: '9X',
                company_url: null,
                branche: 'Innovationsberatung, KI-Beratung, Prozessautomatisierung',
                region: 'Berlin',
                source_url: 'https://example.com/9x',
                source_name: 'Presseportal',
                trigger_date: '2025-12-08T00:00:00.000Z',
                trigger_summary: 'Berliner KI-Beratungsunternehmen begleitet Prozessautomatisierung.',
            },
        ], query);

        expect(fallbackSignals).toHaveLength(1);
        expect(fallbackSignals[0].matchReasons).toEqual(['branche']);
        expect(shouldRetryDiscoveryWithoutRegion(query, fallbackSignals)).toBe(false);
        expect(shouldRetryDiscoveryWithoutRegion({ ...query, region: 'Deutschland' }, [])).toBe(false);
    });
});
