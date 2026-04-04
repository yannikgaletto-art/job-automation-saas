/**
 * CV Match — Deterministic Content Hash (Single Source of Truth)
 * Feature-Silo: CV Match
 *
 * Computes a SHA-256 hash over normalized CV text + job description + requirements.
 * Used in both:
 *   - app/api/cv/match/route.ts (cache check before triggering LLM)
 *   - lib/inngest/cv-match-pipeline.ts (store hash after LLM completes)
 *
 * ⚠️ SYNC CONTRACT: Any change to normalization logic here affects cache validity.
 *    Changing this function invalidates all existing cached hashes — which is safe
 *    (causes cache-miss → re-analysis), but should be intentional.
 */

import { createHash } from 'crypto';

/**
 * Compute a deterministic SHA-256 content hash for CV Match inputs.
 * Hash is stored in metadata.cv_match.input_hash on every completed analysis.
 * On re-analysis: if hash matches AND status is 'done', return cached result.
 *
 * Normalization:
 *   - Trim + lowercase + collapse whitespace → prevents hash drift from formatting changes
 *   - Requirements sorted alphabetically → prevents hash drift from ordering changes
 *   - Joined with '|||' separator → prevents collision between fields
 *   - Truncated to 32 hex chars (128 bits) → sufficient for dedup, compact for JSONB storage
 */
export function computeInputHash(cvText: string, jobDescription: string, requirements: string[]): string {
    const normalized = [
        cvText.trim().toLowerCase().replace(/\s+/g, ' '),
        jobDescription.trim().toLowerCase().replace(/\s+/g, ' '),
        [...requirements].sort().join('|').toLowerCase(),
    ].join('|||');
    return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}
