/**
 * scrapers-parser.ts (formerly lib/scrapers/parser.ts) — Pathly V2.0
 *
 * @deprecated 2026-04-26 — DEPRECATED.
 * `parseJobHTML()` had 0 production callers (verified via repo-wide grep) when the
 * Mistral → Haiku migration shipped (commit 451fd39). Archived here together with
 * its now-removed `parse_html` TaskType from `lib/ai/model-router.ts`.
 *
 * Kept for potential future reactivation if a HTML→JSON title/company/location
 * parser is needed again (e.g. for a Browser Extension v2 fallback path).
 * Do NOT delete (FEATURE_COMPAT_MATRIX §0.1).
 *
 * If reactivated:
 *   1. Move file back to its production location.
 *   2. Re-add `parse_html` to TaskType union + routing map in model-router.ts
 *      (route to Mistral or Haiku as cost/quality demands).
 *   3. Re-import `complete` from `@/lib/ai/model-router` and restore the call below.
 */

// import { complete } from '@/lib/ai/model-router';

export async function parseJobHTML(_html: string): Promise<never> {
    throw new Error('parseJobHTML is archived — see _archive/scrapers-parser.ts header for re-activation steps');
    // const result = await complete({
    //     taskType: 'parse_html',
    //     prompt: `Extract job details from this HTML and return ONLY valid JSON:\n\nHTML:\n${_html}\n\nRequired JSON structure: { title, company, location, salary, requirements[] }`,
    //     systemPrompt: 'You are a precise HTML parser. Output ONLY valid JSON, no explanation.',
    //     temperature: 0,
    // });
    // try { return JSON.parse(result.text); } catch { throw new Error('Failed to parse job HTML'); }
}
