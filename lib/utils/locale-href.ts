/**
 * Builds a locale-prefixed href for Next.js App Router navigation.
 * External URLs (http/https) are returned unchanged.
 *
 * Examples:
 *   localizedHref('/dashboard/profil', 'de') → '/de/dashboard/profil'
 *   localizedHref('https://external.com', 'de') → 'https://external.com'
 *   localizedHref('', 'de') → '/de'
 */
export function localizedHref(path: string, locale: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    if (!path) return `/${locale}`;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `/${locale}${normalizedPath}`;
}
