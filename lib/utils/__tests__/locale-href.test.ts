import { localizedHref } from '../locale-href';

describe('localizedHref', () => {
    describe('internal paths', () => {
        it('prepends locale to absolute path', () => {
            expect(localizedHref('/dashboard/profil', 'de')).toBe('/de/dashboard/profil');
        });

        it('prepends locale for EN locale', () => {
            expect(localizedHref('/dashboard/profil', 'en')).toBe('/en/dashboard/profil');
        });

        it('prepends locale for ES locale', () => {
            expect(localizedHref('/dashboard/profil', 'es')).toBe('/es/dashboard/profil');
        });

        it('handles path with query string', () => {
            expect(localizedHref('/dashboard/job-queue?highlight=123', 'de')).toBe('/de/dashboard/job-queue?highlight=123');
        });

        it('normalizes path without leading slash', () => {
            expect(localizedHref('dashboard/profil', 'de')).toBe('/de/dashboard/profil');
        });

        it('handles empty path (returns /locale)', () => {
            expect(localizedHref('', 'de')).toBe('/de');
        });
    });

    describe('external URLs', () => {
        it('leaves https URLs unchanged', () => {
            expect(localizedHref('https://external.com/path', 'de')).toBe('https://external.com/path');
        });

        it('leaves http URLs unchanged', () => {
            expect(localizedHref('http://localhost:3000/test', 'de')).toBe('http://localhost:3000/test');
        });
    });
});
