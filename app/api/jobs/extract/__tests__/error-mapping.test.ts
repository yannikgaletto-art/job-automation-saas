/**
 * Stress tests for the AI-error → user-message mapping introduced in
 * /api/jobs/extract route after the Anthropic-quota incident on 2026-04-27.
 * Pure-function-style: no LLM call, no DB, no Next.js — just verify the
 * mapping table.
 */

function mapAiErrorToUserMessage(aiMsg: string): string {
    return aiMsg.includes('usage limits') || aiMsg.includes('quota') || aiMsg.includes('credit balance')
        ? 'Anthropic API-Limit erreicht. Bitte in console.anthropic.com unter Settings → Limits erhöhen.'
        : aiMsg.includes('rate limit')
            ? 'AI-Provider Rate-Limit erreicht. Bitte 1 Minute warten und erneut versuchen.'
            : aiMsg.includes('Invalid API Key') || aiMsg.includes('authentication')
                ? 'AI-Provider API-Key ungültig. Bitte .env.local prüfen.'
                : `AI-Provider-Fehler: ${aiMsg}`;
}

describe('extract error-mapping — Anthropic quota incident regression', () => {
    describe('STRESSTEST 1 — Anthropic quota exhaustion (the bug Yannik hit)', () => {
        it('maps real Anthropic quota error to actionable user message', () => {
            const real = 'You have reached your specified API usage limits. You will regain access on 2026-05-01 at 00:00 UTC.';
            expect(mapAiErrorToUserMessage(real)).toContain('console.anthropic.com');
            expect(mapAiErrorToUserMessage(real)).toContain('Settings → Limits');
        });

        it('also catches "quota" wording', () => {
            expect(mapAiErrorToUserMessage('Your account quota is exceeded')).toContain('console.anthropic.com');
        });

        it('also catches "credit balance" wording (alternative Anthropic phrasing)', () => {
            expect(mapAiErrorToUserMessage('Your credit balance is too low to access the API')).toContain('console.anthropic.com');
        });

        it('produces deterministic output across 3 invocations (idempotent mapping)', () => {
            const real = 'You have reached your specified API usage limits.';
            const r1 = mapAiErrorToUserMessage(real);
            const r2 = mapAiErrorToUserMessage(real);
            const r3 = mapAiErrorToUserMessage(real);
            expect(r1).toBe(r2);
            expect(r2).toBe(r3);
        });
    });

    describe('STRESSTEST 2 — Rate limit (different from quota)', () => {
        it('maps rate-limit error to wait-message', () => {
            const result = mapAiErrorToUserMessage('Anthropic returned 429: rate limit exceeded');
            expect(result).toContain('Rate-Limit');
            expect(result).toContain('1 Minute');
        });

        it('does NOT confuse rate-limit with quota', () => {
            const result = mapAiErrorToUserMessage('Anthropic returned 429: rate limit exceeded');
            expect(result).not.toContain('console.anthropic.com');
        });
    });

    describe('STRESSTEST 3 — Auth-Error path', () => {
        it('maps Invalid API Key', () => {
            expect(mapAiErrorToUserMessage('Invalid API Key')).toContain('.env.local');
        });

        it('maps authentication error', () => {
            expect(mapAiErrorToUserMessage('authentication failed')).toContain('.env.local');
        });
    });

    describe('Defensive guards', () => {
        it('falls through to generic message for unknown errors', () => {
            const result = mapAiErrorToUserMessage('Some unknown weird error');
            expect(result).toContain('AI-Provider-Fehler');
            expect(result).toContain('Some unknown weird error');
        });

        it('handles empty string', () => {
            expect(mapAiErrorToUserMessage('')).toBe('AI-Provider-Fehler: ');
        });

        it('priority order: quota beats rate-limit', () => {
            // If both appear, quota should win because it's the more specific actionable issue
            const both = 'You have reached your specified API usage limits and the rate limit';
            expect(mapAiErrorToUserMessage(both)).toContain('console.anthropic.com');
        });
    });
});
