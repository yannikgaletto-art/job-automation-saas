export type DiscoveryQuery = {
    branche: string;
    region: string;
    focus: string;
};

export type DiscoveryMatchReason = 'branche' | 'region' | 'focus';
export type DiscoveryConfidence = 'green' | 'yellow' | 'gray';

export type RawInitiativTrigger = {
    id: string;
    trigger_type: string;
    company_name: string;
    company_url: string | null;
    branche: string | null;
    region: string | null;
    source_url: string;
    source_name: string | null;
    trigger_date: string;
    trigger_summary: string | null;
};

export type InitiativDiscoverySignal = {
    id: string;
    triggerType: string;
    companyName: string;
    companyUrl: string | null;
    branche: string | null;
    region: string | null;
    sourceUrl: string;
    sourceName: string;
    triggerDate: string;
    summary: string;
    confidence: DiscoveryConfidence;
    matchReasons: DiscoveryMatchReason[];
};

const MAX_BRANCHE_LENGTH = 80;
const MAX_REGION_LENGTH = 80;
const MAX_FOCUS_LENGTH = 180;

function cleanField(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
}

function normalize(value: string | null | undefined): string {
    return (value ?? '').toLocaleLowerCase('de-DE');
}

function includesNeedle(haystack: string | null | undefined, needle: string): boolean {
    if (!needle) return false;
    return normalize(haystack).includes(normalize(needle));
}

function normalizedTerms(value: string | null | undefined): string[] {
    return normalize(value)
        .split(/[^\p{L}\p{N}]+/u)
        .map((term) => term.trim())
        .filter(Boolean);
}

function matchesBranche(rowBranche: string | null | undefined, queryBranche: string): boolean {
    if (!queryBranche) return false;

    const queryTerms = normalizedTerms(queryBranche);
    if (queryTerms.length === 1 && queryTerms[0].length <= 3) {
        return normalizedTerms(rowBranche).includes(queryTerms[0]);
    }

    return includesNeedle(rowBranche, queryBranche);
}

function normalizedRegionToken(region: string): string {
    return normalize(region)
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function isBroadDiscoveryRegion(region: string): boolean {
    const normalized = normalizedRegionToken(region);
    return [
        'de',
        'deutschland',
        'deutschlandweit',
        'germany',
        'bundesweit',
        'dach',
    ].includes(normalized);
}

export function shouldApplyStrictDiscoveryRegionFilter(region: string): boolean {
    return Boolean(region) && !isBroadDiscoveryRegion(region);
}

function matchesRegion(rowRegion: string | null | undefined, queryRegion: string): boolean {
    if (!queryRegion) return false;
    if (isBroadDiscoveryRegion(queryRegion)) return Boolean(rowRegion?.trim());
    return includesNeedle(rowRegion, queryRegion);
}

function focusTokens(focus: string): string[] {
    return focus
        .split(/\s+/)
        .map((token) => token.replace(/[^\p{L}\p{N}-]/gu, '').trim())
        .filter((token) => token.length >= 4)
        .slice(0, 8);
}

function confidenceFromReasons(reasons: DiscoveryMatchReason[]): DiscoveryConfidence {
    if (reasons.length >= 2) return 'green';
    if (reasons.length === 1) return 'yellow';
    return 'gray';
}

export function applyRegionMismatchPenalty(
    confidence: DiscoveryConfidence,
    matchReasons: DiscoveryMatchReason[],
    queryRegion: string,
): DiscoveryConfidence {
    if (!shouldApplyStrictDiscoveryRegionFilter(queryRegion)) return confidence;
    if (matchReasons.includes('region')) return confidence;
    return 'gray';
}

export function sanitizeDiscoveryQuery(input: {
    branche?: unknown;
    region?: unknown;
    focus?: unknown;
}): DiscoveryQuery {
    return {
        branche: cleanField(input.branche, MAX_BRANCHE_LENGTH),
        region: cleanField(input.region, MAX_REGION_LENGTH),
        focus: cleanField(input.focus, MAX_FOCUS_LENGTH),
    };
}

export function buildDiscoverySignals(
    rows: RawInitiativTrigger[],
    query: DiscoveryQuery,
): InitiativDiscoverySignal[] {
    const tokens = focusTokens(query.focus);

    return rows.map((row) => {
        const reasons: DiscoveryMatchReason[] = [];
        if (matchesBranche(row.branche, query.branche)) reasons.push('branche');
        if (matchesRegion(row.region, query.region)) reasons.push('region');

        const focusHaystack = [
            row.company_name,
            row.trigger_summary,
            row.branche,
            row.region,
        ].filter(Boolean).join(' ');
        if (tokens.some((token) => includesNeedle(focusHaystack, token))) reasons.push('focus');

        const baseConfidence = confidenceFromReasons(reasons);
        const confidence = applyRegionMismatchPenalty(baseConfidence, reasons, query.region);

        return {
            id: row.id,
            triggerType: row.trigger_type,
            companyName: row.company_name,
            companyUrl: row.company_url,
            branche: row.branche,
            region: row.region,
            sourceUrl: row.source_url,
            sourceName: row.source_name || 'Quelle',
            triggerDate: row.trigger_date,
            summary: row.trigger_summary || '',
            confidence,
            matchReasons: reasons,
        };
    }).sort((a, b) => {
        const confidenceWeight: Record<DiscoveryConfidence, number> = { green: 3, yellow: 2, gray: 1 };
        const confidenceDelta = confidenceWeight[b.confidence] - confidenceWeight[a.confidence];
        if (confidenceDelta !== 0) return confidenceDelta;

        const aHasRegion = a.matchReasons.includes('region') ? 1 : 0;
        const bHasRegion = b.matchReasons.includes('region') ? 1 : 0;
        if (aHasRegion !== bHasRegion) return bHasRegion - aHasRegion;

        return new Date(b.triggerDate).getTime() - new Date(a.triggerDate).getTime();
    });
}

export function filterDiscoverySignalsForQuery(
    rows: RawInitiativTrigger[],
    query: DiscoveryQuery,
): InitiativDiscoverySignal[] {
    return buildDiscoverySignals(rows, query)
        .filter((signal) => !query.branche || signal.matchReasons.includes('branche'));
}

export function shouldRetryDiscoveryWithoutRegion(
    query: DiscoveryQuery,
    signals: InitiativDiscoverySignal[],
): boolean {
    return Boolean(query.branche)
        && shouldApplyStrictDiscoveryRegionFilter(query.region)
        && signals.length === 0;
}
