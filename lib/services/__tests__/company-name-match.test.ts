import { isSameCompanyName, normalizeCompanyNameForMatch } from '../company-name-match';

describe('company-name-match', () => {
    it('treats localized country suffixes as the same company entity', () => {
        expect(isSameCompanyName('PwC Germany', 'PwC Deutschland')).toBe(true);
        expect(isSameCompanyName('Deloitte Deutschland GmbH', 'Deloitte Germany')).toBe(true);
    });

    it('still blocks genuinely different companies', () => {
        expect(isSameCompanyName('PwC Germany', 'EY Deutschland')).toBe(false);
        expect(isSameCompanyName('Cassini Consulting', 'Capgemini Deutschland')).toBe(false);
    });

    it('normalizes legal suffixes without collapsing brand identity', () => {
        expect(normalizeCompanyNameForMatch('Simon-Kucher GmbH')).toBe('simon kucher');
        expect(normalizeCompanyNameForMatch('PwC Deutschland GmbH')).toBe('pwc germany');
    });
});
