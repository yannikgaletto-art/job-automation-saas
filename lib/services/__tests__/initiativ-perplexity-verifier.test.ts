/**
 * Regression-Suite für initiativ-perplexity-verifier.ts
 *
 * Drei Schichten:
 *   1. Pure functions: buildVerifierPrompt + parseVerifierResponse
 *   2. verifyTriggersBatch: Mock fetch (success, http-error, timeout, malformed-json)
 *   3. Cost-cap + DSGVO-Pflichten (no-PII in prompt, batch-size respected)
 */

import {
    buildVerifierPrompt,
    parseVerifierResponse,
    verifyTriggersBatch,
    VERIFIER_BATCH_SIZE,
    type VerifierInputSignal,
} from '../initiativ-perplexity-verifier';

const sampleInput: VerifierInputSignal = {
    id: 'sig-1',
    companyName: 'Acme GmbH',
    triggerType: 'funding',
    sourceUrl: 'https://example.com/news/1',
    triggerSummary: 'Berliner Startup sammelt 5 Mio Euro',
};

// ============================================================================
// buildVerifierPrompt
// ============================================================================

describe('buildVerifierPrompt', () => {
    it('enthält System-Constraints (JSON, Schema, Anti-Markdown)', () => {
        const { system } = buildVerifierPrompt([sampleInput]);
        expect(system).toMatch(/JSON/i);
        expect(system).toMatch(/no.*markdown/i);
        expect(system).toMatch(/isStillActive/);
        expect(system).toMatch(/painSignal/);
        expect(system).toMatch(/sourceUrls/);
    });

    it('enthält ALLE input-Signale im User-Prompt', () => {
        const inputs: VerifierInputSignal[] = [
            sampleInput,
            { ...sampleInput, id: 'sig-2', companyName: 'Beta AG' },
        ];
        const { user } = buildVerifierPrompt(inputs);
        expect(user).toContain('sig-1');
        expect(user).toContain('Acme GmbH');
        expect(user).toContain('sig-2');
        expect(user).toContain('Beta AG');
    });

    it('DSGVO: enthält KEINE PII (kein User-ID, kein E-Mail-Pattern)', () => {
        const { system, user } = buildVerifierPrompt([sampleInput]);
        const both = system + user;
        // Beispielhafte PII-Hinweise: User-UUID, E-Mail-Pattern
        expect(both).not.toMatch(/user[-_]?id/i);
        expect(both).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    });

    it('leeres Array → minimaler User-Prompt ohne Crash', () => {
        const { system, user } = buildVerifierPrompt([]);
        expect(system.length).toBeGreaterThan(0);
        expect(user.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// parseVerifierResponse
// ============================================================================

describe('parseVerifierResponse', () => {
    const validJson = JSON.stringify([
        {
            id: 'sig-1',
            isStillActive: true,
            painSignal: 'Hiring 12 senior engineers in Q3 to scale platform',
            sourceUrls: ['https://acme.example/careers', 'https://acme.example/about'],
        },
        {
            id: 'sig-2',
            isStillActive: false,
            painSignal: '',
            sourceUrls: ['https://news.example/closure'],
        },
    ]);

    it('happy path: 2 valide Items', () => {
        const result = parseVerifierResponse(validJson, new Set(['sig-1', 'sig-2']));
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('sig-1');
        expect(result[0].confidenceBoost).toBe('green-boost'); // active + painSignal >= 20 chars
        expect(result[1].id).toBe('sig-2');
        expect(result[1].confidenceBoost).toBe('gray-degrade'); // !isStillActive
    });

    it('strippt Markdown-Code-Fence wrapper', () => {
        const fenced = '```json\n' + validJson + '\n```';
        const result = parseVerifierResponse(fenced, new Set(['sig-1', 'sig-2']));
        expect(result).toHaveLength(2);
    });

    it('leerer String / undefined → []', () => {
        expect(parseVerifierResponse('', new Set())).toEqual([]);
        expect(parseVerifierResponse(undefined as unknown as string, new Set())).toEqual([]);
    });

    it('malformed JSON → versucht Array-Substring zu retten', () => {
        const messy = 'Here is the result:\n[{"id":"sig-1","isStillActive":true,"painSignal":"Looking for senior PM","sourceUrls":["https://x.example"]}]\nThanks!';
        const result = parseVerifierResponse(messy, new Set(['sig-1']));
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('sig-1');
    });

    it('komplett invalides JSON → []', () => {
        expect(parseVerifierResponse('not even json', new Set(['sig-1']))).toEqual([]);
    });

    it('drops items mit unbekannter ID (nicht im Input-Set)', () => {
        const result = parseVerifierResponse(validJson, new Set(['sig-1'])); // sig-2 nicht erwartet
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('sig-1');
    });

    it('drops items ohne sourceUrls (DSGVO/Quellen-Pflicht)', () => {
        const noUrls = JSON.stringify([
            { id: 'sig-1', isStillActive: true, painSignal: 'Pain', sourceUrls: [] },
        ]);
        expect(parseVerifierResponse(noUrls, new Set(['sig-1']))).toEqual([]);
    });

    it('drops non-https sourceUrls', () => {
        const fileUrls = JSON.stringify([
            { id: 'sig-1', isStillActive: true, painSignal: 'Pain', sourceUrls: ['file:///etc/passwd', 'ftp://x'] },
        ]);
        expect(parseVerifierResponse(fileUrls, new Set(['sig-1']))).toEqual([]);
    });

    it('cap auf 3 sourceUrls', () => {
        const many = JSON.stringify([
            {
                id: 'sig-1',
                isStillActive: true,
                painSignal: 'Pain',
                sourceUrls: [
                    'https://a.example',
                    'https://b.example',
                    'https://c.example',
                    'https://d.example',
                    'https://e.example',
                ],
            },
        ]);
        const result = parseVerifierResponse(many, new Set(['sig-1']));
        expect(result[0].sourceUrls).toHaveLength(3);
    });

    it('confidenceBoost yellow-keep: aktiv aber painSignal kurz', () => {
        const json = JSON.stringify([
            { id: 'sig-1', isStillActive: true, painSignal: 'Hi.', sourceUrls: ['https://x.example'] },
        ]);
        const result = parseVerifierResponse(json, new Set(['sig-1']));
        expect(result[0].confidenceBoost).toBe('yellow-keep');
    });

    it('permissive default: isStillActive missing → true', () => {
        const json = JSON.stringify([
            { id: 'sig-1', painSignal: 'Hiring senior PM for new initiative now', sourceUrls: ['https://x.example'] },
        ]);
        const result = parseVerifierResponse(json, new Set(['sig-1']));
        expect(result[0].isStillActive).toBe(true);
    });

    it('painSignal auf 240 chars gecappt', () => {
        const longPain = 'a'.repeat(500);
        const json = JSON.stringify([
            { id: 'sig-1', isStillActive: true, painSignal: longPain, sourceUrls: ['https://x.example'] },
        ]);
        const result = parseVerifierResponse(json, new Set(['sig-1']));
        expect(result[0].painSignal.length).toBeLessThanOrEqual(240);
    });
});

// ============================================================================
// verifyTriggersBatch
// ============================================================================

describe('verifyTriggersBatch', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('leeres signal-Array → sofort {verified: []}, kein API-Call', async () => {
        const fetchSpy = jest.fn();
        global.fetch = fetchSpy as unknown as typeof fetch;
        const result = await verifyTriggersBatch([], 'fake-key');
        expect(result.verified).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws wenn API-Key fehlt (für Refund-Pfad)', async () => {
        await expect(verifyTriggersBatch([sampleInput], '')).rejects.toThrow(/PERPLEXITY_API_KEY/);
    });

    it('happy path: parsed valide Antwort', async () => {
        global.fetch = jest.fn(async () => new Response(
            JSON.stringify({
                choices: [{
                    message: {
                        content: JSON.stringify([
                            { id: 'sig-1', isStillActive: true, painSignal: 'Hiring senior engineers for AI team', sourceUrls: ['https://acme.example/careers'] },
                        ]),
                    },
                }],
                usage: { prompt_tokens: 800, completion_tokens: 120 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        )) as unknown as typeof fetch;

        const result = await verifyTriggersBatch([sampleInput], 'fake-key');
        expect(result.verified).toHaveLength(1);
        expect(result.verified[0].id).toBe('sig-1');
        expect(result.promptTokens).toBe(800);
        expect(result.completionTokens).toBe(120);
        expect(result.droppedCount).toBe(0);
    });

    it('HTTP-Error → throws (für Credit-Refund)', async () => {
        global.fetch = jest.fn(async () => new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
        await expect(verifyTriggersBatch([sampleInput], 'fake-key')).rejects.toThrow(/HTTP 429/);
    });

    it('Cost-Cap: nur erste 10 Signale werden gesendet', async () => {
        let capturedBody: string | null = null;
        global.fetch = jest.fn(async (_url: any, init: any) => {
            capturedBody = init.body;
            return new Response(
                JSON.stringify({
                    choices: [{ message: { content: '[]' } }],
                    usage: { prompt_tokens: 100, completion_tokens: 10 },
                }),
                { status: 200 },
            );
        }) as unknown as typeof fetch;

        const oversized: VerifierInputSignal[] = Array.from({ length: 25 }, (_, i) => ({
            ...sampleInput,
            id: `sig-${i}`,
            companyName: `Co${i}`,
        }));
        await verifyTriggersBatch(oversized, 'fake-key');

        // Body sollte 10 Signale enthalten, nicht 25
        const body = JSON.parse(capturedBody!);
        const userPrompt = body.messages.find((m: any) => m.role === 'user').content;
        for (let i = 0; i < VERIFIER_BATCH_SIZE; i++) {
            expect(userPrompt).toContain(`sig-${i}`);
        }
        expect(userPrompt).not.toContain('sig-10'); // 11. Signal wurde gedroppt
    });

    it('malformed JSON in response → verified=[], NICHT throws', async () => {
        global.fetch = jest.fn(async () => new Response(
            JSON.stringify({
                choices: [{ message: { content: 'oops not json' } }],
                usage: { prompt_tokens: 100, completion_tokens: 5 },
            }),
            { status: 200 },
        )) as unknown as typeof fetch;

        const result = await verifyTriggersBatch([sampleInput], 'fake-key');
        expect(result.verified).toEqual([]);
        expect(result.droppedCount).toBe(1);
    });

    it('Sonar (NICHT sonar-pro) wird verwendet', async () => {
        let capturedBody: string | null = null;
        global.fetch = jest.fn(async (_url: any, init: any) => {
            capturedBody = init.body;
            return new Response(
                JSON.stringify({
                    choices: [{ message: { content: '[]' } }],
                    usage: { prompt_tokens: 100, completion_tokens: 10 },
                }),
                { status: 200 },
            );
        }) as unknown as typeof fetch;

        await verifyTriggersBatch([sampleInput], 'fake-key');
        const body = JSON.parse(capturedBody!);
        expect(body.model).toBe('sonar');
        expect(body.model).not.toBe('sonar-pro');
        expect(body.temperature).toBe(0); // Determinismus für Cost-Predictability
    });
});
