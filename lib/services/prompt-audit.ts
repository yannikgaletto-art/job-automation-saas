/**
 * Prompt Audit — Local-only diagnostic helper.
 *
 * Writes full cover-letter system prompts + metadata to /tmp/pathly-prompt-audits/
 * for manual inspection and token analysis.
 *
 * Activation: set COVER_LETTER_AUDIT=true in .env.local
 * Production: stays silent (no flag = no-op).
 *
 * Output lives outside the repo (/tmp) — never committed.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';

const AUDIT_DIR = path.join(os.tmpdir(), 'pathly-prompt-audits');

function isEnabled(): boolean {
    return process.env.COVER_LETTER_AUDIT === 'true';
}

function approxTokens(text: string): number {
    // Claude tokenizer averages ~3.8-4.2 chars/token for DE/EN mixed content.
    // Char/4 is a rough-but-sufficient approximation for Größenordnungen.
    return Math.round(text.length / 4);
}

export interface AuditMeta {
    jobId: string;
    iteration: number;
    feedbackAttached?: string[];
}

export function auditPrompt(
    prompt: string,
    ctx: CoverLetterSetupContext | undefined,
    meta: AuditMeta,
): void {
    if (!isEnabled()) return;

    try {
        fs.mkdirSync(AUDIT_DIR, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const shortJobId = meta.jobId.slice(0, 8);
        const preset = ctx?.tone?.preset ?? 'unknown';
        const filename = `audit-${timestamp}-${preset}-${shortJobId}-iter${meta.iteration}.json`;
        const filepath = path.join(AUDIT_DIR, filename);

        const activeModules = Object.entries(ctx?.optInModules ?? {})
            .filter(([, v]) => v === true)
            .map(([k]) => k);

        const payload = {
            timestamp: new Date().toISOString(),
            jobId: meta.jobId,
            iteration: meta.iteration,
            stats: {
                chars: prompt.length,
                lines: prompt.split('\n').length,
                approxTokens: approxTokens(prompt),
            },
            context: {
                preset,
                formality: ctx?.tone?.formality ?? null,
                locale: ctx?.tone?.targetLanguage ?? 'de',
                toneSource: ctx?.tone?.toneSource ?? null,
                introFocus: ctx?.introFocus ?? null,
                hasQuote: !!ctx?.selectedQuote,
                hasHook: !!ctx?.selectedHook,
                hasNews: !!ctx?.selectedNews,
                stationCount: ctx?.cvStations?.length ?? 0,
                activeModules,
                contactPerson: ctx?.tone?.contactPerson ?? null,
                feedbackCount: meta.feedbackAttached?.length ?? 0,
            },
            prompt,
        };

        fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf-8');

        // eslint-disable-next-line no-console
        console.log(
            `📊 [PromptAudit] ${filename}\n` +
            `   ${payload.stats.chars} chars · ${payload.stats.lines} lines · ~${payload.stats.approxTokens} tokens\n` +
            `   preset=${preset} · formality=${payload.context.formality} · locale=${payload.context.locale} · modules=[${activeModules.join(',')}]`
        );
    } catch (err) {
        // Never break generation — audit failures are non-fatal
        // eslint-disable-next-line no-console
        console.warn('⚠️ [PromptAudit] Write failed:', err instanceof Error ? err.message : err);
    }
}
