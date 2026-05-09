import {
    applyRegionMismatchPenalty,
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

describe('applyRegionMismatchPenalty', () => {
    it('caps confidence to gray for city queries with no region match', () => {
        expect(applyRegionMismatchPenalty('green', ['branche', 'focus'], 'München')).toBe('gray');
        expect(applyRegionMismatchPenalty('yellow', ['branche'], 'Berlin')).toBe('gray');
    });

    it('preserves confidence when region matches', () => {
        expect(applyRegionMismatchPenalty('green', ['branche', 'region'], 'Berlin')).toBe('green');
        expect(applyRegionMismatchPenalty('yellow', ['region'], 'Berlin')).toBe('yellow');
    });

    it('does not penalize broad regions (DACH, Deutschland, bundesweit)', () => {
        expect(applyRegionMismatchPenalty('green', ['branche', 'focus'], 'DACH')).toBe('green');
        expect(applyRegionMismatchPenalty('green', ['branche', 'focus'], 'Deutschland')).toBe('green');
        expect(applyRegionMismatchPenalty('yellow', ['branche'], 'bundesweit')).toBe('yellow');
    });

    it('does not penalize empty region queries', () => {
        expect(applyRegionMismatchPenalty('green', ['branche', 'focus'], '')).toBe('green');
    });

    it('end-to-end regression: München query against Berlin row downgrades to gray', () => {
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
                trigger_summary: 'Berliner KI-Beratungsunternehmen begleitet Beratung und Prozessautomatisierung.',
            },
        ], {
            branche: 'KI',
            region: 'München',
            focus: 'Beratung',
        });

        expect(signals).toHaveLength(1);
        expect(signals[0].matchReasons).toEqual(['branche', 'focus']);
        expect(signals[0].confidence).toBe('gray');
    });

    it('sort tiebreaker: region-match signals appear before region-mismatch at same confidence', () => {
        const signals = buildDiscoverySignals([
            {
                id: 'mismatch',
                trigger_type: 'press_release',
                company_name: 'Berlin Co',
                company_url: null,
                branche: 'KI Beratung',
                region: 'Berlin',
                source_url: 'https://example.com/berlin',
                source_name: 'Presseportal',
                trigger_date: '2026-01-01T00:00:00.000Z',
                trigger_summary: 'Beratung-Thema.',
            },
            {
                id: 'match',
                trigger_type: 'press_release',
                company_name: 'München Co',
                company_url: null,
                branche: 'Logistik',
                region: 'München',
                source_url: 'https://example.com/muenchen',
                source_name: 'Presseportal',
                trigger_date: '2025-12-01T00:00:00.000Z',
                trigger_summary: 'Logistik-Thema.',
            },
        ], {
            branche: '',
            region: 'München',
            focus: '',
        });

        expect(signals[0].id).toBe('match');
        expect(signals[0].matchReasons).toContain('region');
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
