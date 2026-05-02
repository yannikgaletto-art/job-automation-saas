const COUNTRY_EQUIVALENTS: Record<string, string> = {
    deutschland: 'germany',
    germany: 'germany',
    deutschlandes: 'germany',
    german: 'germany',
    schweiz: 'switzerland',
    suisse: 'switzerland',
    switzerland: 'switzerland',
    österreich: 'austria',
    oesterreich: 'austria',
    osterreich: 'austria',
    austria: 'austria',
    uk: 'united kingdom',
    'u k': 'united kingdom',
    gb: 'united kingdom',
    'great britain': 'united kingdom',
    'united kingdom': 'united kingdom',
};

const LEGAL_SUFFIXES = [
    'ag', 'gmbh', 'mbh', 'kg', 'kgaa', 'se', 'ug', 'ohg', 'gbr',
    'ltd', 'limited', 'plc', 'inc', 'corp', 'corporation', 'llc',
    'group', 'gruppe',
];

function normalizeToken(token: string): string {
    return COUNTRY_EQUIVALENTS[token] || token;
}

export function normalizeCompanyNameForMatch(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map(normalizeToken)
        .filter(token => !LEGAL_SUFFIXES.includes(token))
        .join(' ')
        .trim();
}

export function isSameCompanyName(expectedName: string, actualName: string): boolean {
    const expected = normalizeCompanyNameForMatch(expectedName);
    const actual = normalizeCompanyNameForMatch(actualName);

    if (!expected || !actual) return false;
    if (expected === actual) return true;
    return expected.includes(actual) || actual.includes(expected);
}
