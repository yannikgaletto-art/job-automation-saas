import {
    isCsvTokenActive,
    localeForVoice,
    toggleCsvToken,
} from '../discovery-form-helpers';

describe('localeForVoice', () => {
    it('returns the locale itself for the supported set', () => {
        expect(localeForVoice('de')).toBe('de');
        expect(localeForVoice('en')).toBe('en');
        expect(localeForVoice('es')).toBe('es');
    });

    it('falls back to de for unknown / partial locales', () => {
        expect(localeForVoice('de-DE')).toBe('de');
        expect(localeForVoice('fr')).toBe('de');
        expect(localeForVoice('')).toBe('de');
    });
});

describe('toggleCsvToken', () => {
    it('appends a token to an empty value', () => {
        expect(toggleCsvToken('', 'KI')).toBe('KI');
    });

    it('appends a token after existing values with comma + space separator', () => {
        expect(toggleCsvToken('KI', 'Beratung')).toBe('KI, Beratung');
        expect(toggleCsvToken('KI, Beratung', 'Nachhaltigkeit')).toBe('KI, Beratung, Nachhaltigkeit');
    });

    it('removes an existing token (case-insensitive)', () => {
        expect(toggleCsvToken('KI, Beratung', 'KI')).toBe('Beratung');
        expect(toggleCsvToken('KI, Beratung', 'ki')).toBe('Beratung');
        expect(toggleCsvToken('München, Berlin', 'münchen')).toBe('Berlin');
    });

    it('normalises whitespace around tokens', () => {
        expect(toggleCsvToken('  KI  ,   Beratung  ', 'Nachhaltigkeit')).toBe('KI, Beratung, Nachhaltigkeit');
        expect(toggleCsvToken('  ki  , beratung', 'KI')).toBe('beratung');
    });

    it('drops empty fragments before deciding', () => {
        expect(toggleCsvToken(', , ,', 'KI')).toBe('KI');
        expect(toggleCsvToken('KI, , Beratung,', 'Beratung')).toBe('KI');
    });
});

describe('isCsvTokenActive', () => {
    it('finds a token by exact match', () => {
        expect(isCsvTokenActive('KI', 'KI')).toBe(true);
        expect(isCsvTokenActive('KI, Beratung', 'Beratung')).toBe(true);
    });

    it('matches case-insensitively', () => {
        expect(isCsvTokenActive('KI, Beratung', 'ki')).toBe(true);
        expect(isCsvTokenActive('München, Berlin', 'münchen')).toBe(true);
    });

    it('does not match prefix-style substrings', () => {
        expect(isCsvTokenActive('KI', 'K')).toBe(false);
        expect(isCsvTokenActive('Berlin', 'Berl')).toBe(false);
    });

    it('returns false for empty input', () => {
        expect(isCsvTokenActive('', 'KI')).toBe(false);
        expect(isCsvTokenActive('   ', 'KI')).toBe(false);
    });
});
