/**
 * CV Payload Pruner — Cost Optimization Layer
 *
 * Removes fields the CV Optimizer never modifies before sending to Sonnet.
 * This reduces input tokens by 10-25% without affecting output quality.
 *
 * SAFE TO REMOVE (optimizer prompt explicitly says "keep 1:1"):
 * - languages
 * - hobbies / interests
 * - publications
 * - certificates beyond top 8 (optimizer keeps max 6)
 *
 * NEVER REMOVE (optimizer actively modifies):
 * - personalInfo, experience, education, skills
 * - IDs (entityId, bulletId) — breaking these crashes the diff system
 *
 * Created: 2026-03-30
 */

import type { CvStructuredData } from '@/types/cv';

/**
 * Returns a pruned deep-clone of the CV JSON.
 * The original object is never mutated.
 *
 * @param cv - The full CV structured data
 * @param jobBuzzwords - Optional ATS keywords from the job for relevance-sorting certificates
 */
export function pruneForOptimizer(
    cv: CvStructuredData,
    jobBuzzwords?: string[],
): CvStructuredData {
    // Deep clone to avoid mutating the original
    const pruned: CvStructuredData = JSON.parse(JSON.stringify(cv));

    // 1. Remove languages (optimizer never touches these)
    if ('languages' in pruned) {
        (pruned as any).languages = [];
    }

    // 2. Remove hobbies/interests (optimizer never touches these)
    if ('hobbies' in pruned) {
        (pruned as any).hobbies = [];
    }
    if ('interests' in pruned) {
        (pruned as any).interests = [];
    }

    // 3. Remove publications (optimizer never touches these)
    if ('publications' in pruned) {
        (pruned as any).publications = [];
    }

    // 4. Cap certificates at 8 (optimizer keeps max 6, needs selection pool)
    if ('certificates' in pruned && Array.isArray((pruned as any).certificates)) {
        const certs = (pruned as any).certificates as Array<{ name?: string; id?: string; [key: string]: unknown }>;
        if (certs.length > 8) {
            if (jobBuzzwords && jobBuzzwords.length > 0) {
                // Sort by relevance: certs matching job buzzwords first
                const buzzLower = jobBuzzwords.map(b => b.toLowerCase());
                certs.sort((a, b) => {
                    const aMatch = buzzLower.some(bw => (a.name || '').toLowerCase().includes(bw));
                    const bMatch = buzzLower.some(bw => (b.name || '').toLowerCase().includes(bw));
                    if (aMatch && !bMatch) return -1;
                    if (!aMatch && bMatch) return 1;
                    return 0;
                });
            }
            (pruned as any).certificates = certs.slice(0, 8);
        }
    }

    // 5. Trim verbose metadata fields on requirementRows (if accidentally attached to CV)
    // These are UI-only fields that waste tokens
    if ('requirementRows' in pruned) {
        delete (pruned as any).requirementRows;
    }

    return pruned;
}
