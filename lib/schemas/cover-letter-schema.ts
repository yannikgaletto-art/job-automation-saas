/**
 * Zod Schema: Cover Letter Generate API Input
 *
 * Strategy: SANITIZE, never block.
 * Uses .default() and .transform() — repairs bad input rather than returning 400s.
 * Only validates the 5 fields that directly influence the prompt builder.
 * All other fields pass through unmodified via .passthrough().
 *
 * IMPORTANT: The output type is intentionally Record<string, unknown> for setupContext
 * because `CoverLetterSetupContext` has many required fields that the frontend fills
 * but Zod should NOT enforce (reduce complexity). We sanitize only the 5 critical fields;
 * the rest is passthrough. The consumer casts to CoverLetterSetupContext.
 */

import { z } from 'zod';

// ─── Tone preset ──────────────────────────────────────────────────────────────
const TonePresetSchema = z.enum(['formal', 'storytelling'])
    .default('formal');

const TargetLanguageSchema = z.enum(['de', 'en', 'es']).default('de');

// ─── Selected Quote: empty string → undefined (prevents ghost-quote injection) ─
const SelectedQuoteSchema = z.object({
    quote: z.string().transform(v => v.trim() === '' ? undefined : v),
    author: z.string().optional(),
    source: z.string().optional(),
}).passthrough().optional();

// ─── Setup Context (only critical fields validated, rest passthrough) ─────────
const SetupContextSchema = z.object({
    tone: z.object({
        preset: TonePresetSchema,
        targetLanguage: TargetLanguageSchema,
        formality: z.enum(['du', 'sie']).default('sie'),
        toneSource: z.string().optional(),
    }).passthrough().default({ preset: 'formal', targetLanguage: 'de', formality: 'sie' }),

    // Filter out empty/malformed stations; keep only those with company + role
    cvStations: z.array(z.unknown()).transform(arr =>
        arr.filter((s): s is Record<string, unknown> => {
            if (!s || typeof s !== 'object') return false;
            const obj = s as Record<string, unknown>;
            return typeof obj.company === 'string' && obj.company.trim() !== ''
                && typeof obj.role === 'string' && obj.role.trim() !== '';
        })
    ).default([]),

    selectedQuote: SelectedQuoteSchema,
    optInModules: z.object({}).passthrough().default({}),
}).passthrough().optional();

// ─── API Request Schema ───────────────────────────────────────────────────────
export const GenerateRequestSchema = z.object({
    jobId: z.string().min(1, 'jobId is required'),
    setupContext: SetupContextSchema,
    fixMode: z.enum(['full', 'targeted']).optional(),
    targetFix: z.string().optional(),
    currentLetter: z.string().optional(),
}).passthrough();

// Output type — consumer uses `as CoverLetterSetupContext` for the setupContext field
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

/**
 * Parse + sanitize API input.
 * Returns { data, warnings } — data is always populated (uses defaults on failure).
 */
export function parseGenerateRequest(raw: unknown): {
    data: GenerateRequest;
    warnings: string[];
} {
    const warnings: string[] = [];

    const result = GenerateRequestSchema.safeParse(raw);

    if (result.success) {
        // Check for sanitized values and log warnings
        const input = raw as Record<string, unknown>;
        const ctx = input?.setupContext as Record<string, unknown> | undefined;

        if (ctx?.tone === undefined || ctx?.tone === null) {
            warnings.push('setupContext.tone was missing — defaulted to { preset: formal, targetLanguage: de }');
        }
        if (ctx?.tone && (ctx.tone as Record<string, unknown>)?.preset === undefined) {
            warnings.push('setupContext.tone.preset was missing — defaulted to formal');
        }

        const quote = ctx?.selectedQuote as Record<string, unknown> | undefined;
        if (quote?.quote === '') {
            warnings.push('selectedQuote.quote was empty string — suppressed to prevent ghost-quote injection');
        }

        const rawStations = ctx?.cvStations;
        if (Array.isArray(rawStations)) {
            const filtered = result.data.setupContext?.cvStations ?? [];
            const removed = rawStations.length - filtered.length;
            if (removed > 0) {
                warnings.push(`${removed} cvStation(s) removed — missing company or role field`);
            }
        }

        if (warnings.length > 0) {
            console.warn('⚠️ [Zod:CoverLetter] Sanitization warnings:', warnings);
        }

        return { data: result.data, warnings };
    }

    // Fallback: use raw data with critical defaults injected
    console.error('❌ [Zod:CoverLetter] Parse failed — applying emergency defaults:', result.error.issues);

    const fallback: GenerateRequest = {
        jobId: (raw as Record<string, unknown>)?.jobId as string ?? '',
        setupContext: {
            tone: { preset: 'formal', targetLanguage: 'de', formality: 'sie' },
            cvStations: [],
            optInModules: {},
        },
    };

    warnings.push(`Zod parse failed (${result.error.issues.length} issues) — emergency defaults applied`);
    return { data: fallback, warnings };
}
