import { buildDiscoverySignals, sanitizeDiscoveryQuery } from '../discovery';

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
});
