/**
 * Initiativ Perplexity Verifier — Tier-3 Discovery Pipeline.
 *
 * Holt für maximal 10 Trigger pro Discovery-Aufruf in EINEM Batch-Call
 * eine Perplexity-Sonar-Verifikation:
 *   - companyName            (für Selbst-Konsistenzprüfung)
 *   - isStillActive          (false bei liquidiert/website-tot/insolvenz)
 *   - painSignal             (1-Satz Hiring-Bedarf, oder leer)
 *   - sourceUrls             (max 3 öffentliche Quellen-URLs)
 *
 * Cost-Profil bei `model: 'sonar'` (NICHT sonar-pro):
 *   - Input  ~3000 tok × $1.00/M  = ~0.3 ct
 *   - Output ~2000 tok × $1.00/M  = ~0.2 ct
 *   - Request fee Low-Context     = 0.5 ct
 *   - Total  ≈ 1.0 ct pro Discovery
 *
 * DSGVO:
 *   - PROMPT enthält NUR public Firmen-Daten (companyName, sourceUrl,
 *     triggerType, summary). KEINE User-PII (kein Name, kein E-Mail,
 *     kein User-ID).
 *   - Perplexity Auftragsverarbeitung wird in
 *     `docs/SICHERHEITSARCHITEKTUR.md §14` geführt.
 */

import type { RegulatoryTrigger } from './regulatory-triggers';

export const VERIFIER_BATCH_SIZE = 10;
export const VERIFIER_TIMEOUT_MS = 25_000;
export const VERIFIER_MAX_OUTPUT_TOKENS = 2500;

export interface VerifierInputSignal {
    id: string;
    companyName: string;
    triggerType: string;
    sourceUrl: string;
    triggerSummary: string;
}

export interface VerifiedSignal {
    id: string;
    isStillActive: boolean;
    painSignal: string;
    sourceUrls: string[];
    confidenceBoost: 'green-boost' | 'yellow-keep' | 'gray-degrade';
}

export interface VerifierResult {
    verified: VerifiedSignal[];
    droppedCount: number;
    promptTokens: number;
    completionTokens: number;
    elapsedMs: number;
}

/**
 * Build the system + user prompt for the batch verifier.
 *
 * Pure function — no PII, no user-context. Easy to test, easy to log
 * for DSGVO-Audit. The model is told to return ONLY raw JSON (no
 * markdown), one object per input signal, keyed by `id`.
 */
export function buildVerifierPrompt(signals: VerifierInputSignal[]): {
    system: string;
    user: string;
} {
    const system = [
        'You are verifying business signals for an unsolicited-application platform.',
        'Output: pure JSON array. No prose, no markdown, no code fences.',
        'Each item must include EXACTLY the keys: id (string), isStillActive (boolean), painSignal (string), sourceUrls (string[] of max 3 public URLs).',
        'painSignal: ONE short sentence (max 25 words) about a current hiring need or growth phase. Empty string "" if you have no info.',
        'isStillActive: false ONLY if you find clear evidence of liquidation, insolvency, dead website, or "Geschäftsbetrieb eingestellt".',
        'sourceUrls: only public, non-paywalled sources. Drop the entry if you cannot find at least 1 public source.',
    ].join('\n');

    const user = [
        'Verify these companies. Return JSON array, one entry per id below.',
        '',
        ...signals.map((s, i) =>
            `[${i + 1}] id="${s.id}" company="${s.companyName}" type="${s.triggerType}" source="${s.sourceUrl}"`,
        ),
    ].join('\n');

    return { system, user };
}

/**
 * Parse Perplexity's response and validate against our schema.
 * Strict-drop: any entry that doesn't match the schema is dropped silently
 * (logged), not coerced. Better to verify fewer signals than to surface
 * malformed data.
 */
export function parseVerifierResponse(
    raw: string,
    inputIds: Set<string>,
): VerifiedSignal[] {
    if (!raw || typeof raw !== 'string') return [];

    // Strip code-fence wrappers if Perplexity ignored the prompt rule.
    const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

    let parsed: unknown;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        // Try to find the first array in the string (defensive)
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (!arrayMatch) return [];
        try {
            parsed = JSON.parse(arrayMatch[0]);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsed)) return [];

    const verified: VerifiedSignal[] = [];

    for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;

        const id = typeof obj.id === 'string' ? obj.id : null;
        if (!id || !inputIds.has(id)) continue;

        const isStillActive = typeof obj.isStillActive === 'boolean'
            ? obj.isStillActive
            : true; // permissive default — only drop on explicit false

        const painSignal = typeof obj.painSignal === 'string'
            ? obj.painSignal.trim().slice(0, 240)
            : '';

        const rawUrls = Array.isArray(obj.sourceUrls) ? obj.sourceUrls : [];
        const sourceUrls = rawUrls
            .filter((u): u is string => typeof u === 'string')
            .map((u) => u.trim())
            .filter((u) => /^https?:\/\//i.test(u))
            .slice(0, 3);

        if (sourceUrls.length === 0) continue;

        const confidenceBoost: VerifiedSignal['confidenceBoost'] =
            !isStillActive
                ? 'gray-degrade'
                : painSignal.length >= 20
                    ? 'green-boost'
                    : 'yellow-keep';

        verified.push({
            id,
            isStillActive,
            painSignal,
            sourceUrls,
            confidenceBoost,
        });
    }

    return verified;
}

/**
 * Call Perplexity sonar with the batch prompt. Returns parsed/validated
 * signals plus telemetry. Caller must wrap in withCreditGate(...).
 *
 * Throws on network/timeout/auth so withCreditGate refunds the credit.
 * Empty result (Perplexity returned malformed JSON) is NOT thrown — it
 * returns `verified: []` so the user still sees the un-verified DB
 * signals.
 */
export async function verifyTriggersBatch(
    signals: VerifierInputSignal[],
    apiKey: string,
): Promise<VerifierResult> {
    if (signals.length === 0) {
        return { verified: [], droppedCount: 0, promptTokens: 0, completionTokens: 0, elapsedMs: 0 };
    }

    if (!apiKey) {
        throw new Error('PERPLEXITY_API_KEY is missing');
    }

    const slice = signals.slice(0, VERIFIER_BATCH_SIZE);
    const inputIds = new Set(slice.map((s) => s.id));
    const { system, user } = buildVerifierPrompt(slice);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VERIFIER_TIMEOUT_MS);
    const start = Date.now();

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
                temperature: 0,
                max_tokens: VERIFIER_MAX_OUTPUT_TOKENS,
                return_citations: false,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const elapsedMs = Date.now() - start;

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`Perplexity HTTP ${response.status}: ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content ?? '';
        const promptTokens = data?.usage?.prompt_tokens ?? 0;
        const completionTokens = data?.usage?.completion_tokens ?? 0;

        const verified = parseVerifierResponse(content, inputIds);
        const droppedCount = slice.length - verified.length;

        return { verified, droppedCount, promptTokens, completionTokens, elapsedMs };
    } catch (err) {
        clearTimeout(timeoutId);
        // Network/timeout errors propagate so withCreditGate refunds.
        throw err;
    }
}

/**
 * Helper: derive the `RegulatoryTrigger`-like overlay for the API
 * response. Keeps the discovery route lean.
 */
export function buildVerifierOverlayMap(
    verified: VerifiedSignal[],
): Map<string, VerifiedSignal> {
    return new Map(verified.map((v) => [v.id, v]));
}

// Keep the regulatory-trigger import linked so changes to that file
// surface here at compile time (useful for future cross-feature edits).
export type _RegulatoryTriggerLink = RegulatoryTrigger;
