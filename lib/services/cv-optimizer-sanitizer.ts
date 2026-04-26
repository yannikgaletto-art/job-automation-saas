/**
 * CV Optimizer Sanitizer — defense against AI changes that touch identity fields.
 *
 * The AI optimizer is allowed to rewrite CONTENT (bullets, summaries, skills items,
 * cert descriptions) but NOT IDENTITY (job titles, company names, dates, institutions,
 * grades, PII). Identity fields are facts; rewriting them is hallucination.
 *
 * This module is the single source of truth for which fields are protected. It is
 * called from `app/api/cv/optimize/route.ts` after the AI returns its diff list and
 * before the diff is applied to the CV.
 */

/** Fields that the AI optimizer must NEVER modify. Mirrors the PROMPT rule "1b. IDENTITY-LOCK". */
export const FORBIDDEN_FIELDS: ReadonlySet<string> = new Set([
    // Experience identity
    'role', 'company', 'dateRangeText', 'location',
    // Education identity
    'institution', 'degree', 'grade',
    // PII (also stripped by cv-payload-pruner before AI sees it; this is defense-in-depth)
    'name', 'email', 'phone', 'linkedin', 'website',
    // Languages identity
    'language', 'proficiency', 'level',
    // Certifications identity
    'issuer', 'dateText', 'credentialUrl',
]);

/** Sections where entity-level removal is forbidden (work history must not be deleted by AI). */
const ENTITY_REMOVE_PROTECTED_SECTIONS: ReadonlySet<string> = new Set(['experience', 'education']);

/** Minimal shape of an AI-emitted change, for predicate purposes. */
interface RawChangeLike {
    id?: string;
    type?: string;
    target?: {
        section?: string;
        entityId?: string | null;
        field?: string | null;
        bulletId?: string | null;
    };
}

/** Returns true when the change targets an immutable identity field. */
export function isIdentityFieldChange(c: RawChangeLike): boolean {
    return !!c.target?.field && FORBIDDEN_FIELDS.has(c.target.field);
}

/**
 * Returns true when the change attempts to remove a whole experience or education entry.
 * Bullet-level removes (entityId + bulletId + field='description') stay allowed —
 * those are normal "drop the weak bullet" optimizations.
 */
export function isProtectedEntityRemove(c: RawChangeLike): boolean {
    if (c.type !== 'remove') return false;
    if (!c.target?.section || !ENTITY_REMOVE_PROTECTED_SECTIONS.has(c.target.section)) return false;
    if (!c.target.entityId) return false;
    // Field/bulletId both empty → remove targets the whole entity
    return !c.target.field && !c.target.bulletId;
}

/** Returns true when the change is missing the section field — silent misrouting risk. */
export function isMissingSection(c: RawChangeLike): boolean {
    return !c.target?.section;
}

/** Drop reason for telemetry/logging. */
export type DropReason = 'missing_section' | 'identity_field' | 'protected_entity_remove';

/**
 * Single-pass triage for the optimizer's raw change list.
 * Returns the surviving changes plus a parallel array of drop reasons (for logging).
 *
 * Pure function — no IO, deterministic. Logger is the caller's responsibility.
 */
export function sanitizeOptimizerChanges<T extends RawChangeLike>(
    rawChanges: T[],
): { kept: T[]; dropped: Array<{ change: T; reason: DropReason }> } {
    const kept: T[] = [];
    const dropped: Array<{ change: T; reason: DropReason }> = [];

    for (const c of rawChanges) {
        if (isMissingSection(c)) {
            dropped.push({ change: c, reason: 'missing_section' });
            continue;
        }
        if (isIdentityFieldChange(c)) {
            dropped.push({ change: c, reason: 'identity_field' });
            continue;
        }
        if (isProtectedEntityRemove(c)) {
            dropped.push({ change: c, reason: 'protected_entity_remove' });
            continue;
        }
        kept.push(c);
    }

    return { kept, dropped };
}
