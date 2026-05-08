export type InsightStrengthSource = 'professional_results' | 'peer_perspective' | 'profile_fallback';

export type InsightSignal = {
    id: string;
    companyName: string;
    sourceUrl: string;
    sourceName: string;
    triggerDate: string;
    summary: string;
    branche: string | null;
    region: string | null;
    confidence: 'green' | 'yellow' | 'gray';
};

export type BuildInitiativInsightInput = {
    signal: InsightSignal;
    professionalResults?: string;
    peerPerspective?: string;
    focus?: string;
};

export type InitiativInsight = {
    signalId: string;
    companyName: string;
    sourceName: string;
    sourceUrl: string;
    triggerDate: string;
    signalAnchor: string;
    strengthText: string | null;
    strengthSource: InsightStrengthSource;
    bridgeTheme: string;
    hasConcreteStrength: boolean;
    confidence: InsightSignal['confidence'];
};

function normalize(value: string | null | undefined): string {
    return (value ?? '').toLocaleLowerCase('de-DE');
}

function asLines(value: string | undefined): string[] {
    if (!value) return [];

    const seen = new Set<string>();
    const lines: string[] = [];

    for (const line of value.split(/\r?\n/)) {
        const clean = line.replace(/\s+/g, ' ').trim();
        if (!clean) continue;

        const key = normalize(clean);
        if (seen.has(key)) continue;

        seen.add(key);
        lines.push(clean);
        if (lines.length >= 8) break;
    }

    return lines;
}

function tokens(value: string): string[] {
    return normalize(value)
        .split(/\s+/)
        .map((token) => token.replace(/[^\p{L}\p{N}-]/gu, '').trim())
        .filter((token) => token.length >= 5)
        .slice(0, 12);
}

const VAGUE_STRENGTH_PATTERNS = [
    /\b(vieles|alles|diverses|verschiedenes|einiges)\s+gemacht\b/i,
    /\b(sehr|ziemlich)\s+(gut|stark)\b/i,
    /\bmotiviert\b/i,
    /\bteamfaehig\b/i,
    /\bteamfähig\b/i,
];

const CONCRETE_RESULT_PATTERNS = [
    /\b(aufgebaut|entwickelt|bewertet|implementiert|optimiert|moderiert|gefuehrt|geführt|begleitet|uebersetzt|übersetzt|analysiert|befaehigt|befähigt|verantwortet|skaliert)\b/i,
    /\b(projekt|strategie|partnerschaft|transformation|automatisierung|design thinking|workshop|kpi|daten|ki|stakeholder|prozess)\b/i,
    /\d/,
];

function isVagueStrengthLine(line: string): boolean {
    const clean = normalize(line);
    const tokenCount = tokens(clean).length;
    if (tokenCount < 3) return true;

    return VAGUE_STRENGTH_PATTERNS.some((pattern) => pattern.test(clean));
}

function isConcreteProfessionalLine(line: string): boolean {
    if (isVagueStrengthLine(line)) return false;
    return CONCRETE_RESULT_PATTERNS.some((pattern) => pattern.test(line));
}

function pickBestLine(
    lines: string[],
    haystack: string,
    options: { requireConcreteResult?: boolean } = {},
): string | null {
    const usableLines = lines.filter((line) =>
        options.requireConcreteResult ? isConcreteProfessionalLine(line) : !isVagueStrengthLine(line)
    );
    if (usableLines.length === 0) return null;

    const haystackTokens = new Set(tokens(haystack));
    let best = usableLines[0];
    let bestScore = -1;

    for (const line of usableLines) {
        const score = tokens(line).filter((token) => haystackTokens.has(token)).length;
        if (score > bestScore) {
            best = line;
            bestScore = score;
        }
    }

    return best;
}

function pickBridgeTheme(input: BuildInitiativInsightInput): string {
    const focus = input.focus?.trim();
    if (focus) return focus;

    const firstBranch = input.signal.branche?.split(',').map((part) => part.trim()).find(Boolean);
    if (firstBranch) return firstBranch;

    return input.signal.summary || input.signal.companyName;
}

export function buildInitiativInsight(input: BuildInitiativInsightInput): InitiativInsight {
    const haystack = [
        input.signal.companyName,
        input.signal.summary,
        input.signal.branche,
        input.signal.region,
        input.focus,
    ].filter(Boolean).join(' ');

    const professionalLine = pickBestLine(asLines(input.professionalResults), haystack, { requireConcreteResult: true });
    const peerLine = professionalLine ? null : pickBestLine(asLines(input.peerPerspective), haystack);

    return {
        signalId: input.signal.id,
        companyName: input.signal.companyName,
        sourceName: input.signal.sourceName,
        sourceUrl: input.signal.sourceUrl,
        triggerDate: input.signal.triggerDate,
        signalAnchor: input.signal.summary,
        strengthText: professionalLine ?? peerLine,
        strengthSource: professionalLine
            ? 'professional_results'
            : peerLine
                ? 'peer_perspective'
                : 'profile_fallback',
        bridgeTheme: pickBridgeTheme(input),
        hasConcreteStrength: Boolean(professionalLine ?? peerLine),
        confidence: input.signal.confidence,
    };
}
