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

/** Sections where entity-level ADDS are forbidden (AI must NEVER invent new work stations or degrees).
 *  Phase 8 (2026-04-27): "KI-GTM-Beratung" Halluzinations-Bug — the LLM hallucinated
 *  a whole experience entry that was nowhere in the source CV. Bullet-level adds
 *  (entityId + bulletId + field='description') stay allowed — those are normal
 *  "add a missing achievement bullet" optimizations. */
const ENTITY_ADD_PROTECTED_SECTIONS: ReadonlySet<string> = new Set(['experience', 'education']);

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

/**
 * Phase 8 (2026-04-27): returns true when the change tries to ADD a whole experience
 * or education entry — i.e. the LLM is inventing a new work station or degree.
 * Repro: "KI-GTM-Beratung" appeared in the optimizer output for Yannik's Avenga
 * job, but no such entry existed in his source CV.
 *
 * Bullet-level adds (entityId + field='description' + bulletId or no bulletId on
 * an existing entity) stay allowed — those are legitimate "add a missing
 * achievement" suggestions on a real station the user already has.
 */
export function isProtectedEntityAdd(c: RawChangeLike): boolean {
    if (c.type !== 'add') return false;
    if (!c.target?.section || !ENTITY_ADD_PROTECTED_SECTIONS.has(c.target.section)) return false;
    // entity-level add = no entityId yet (LLM proposes a NEW entry).
    // If entityId is present, the add targets a sub-field of an existing entry → allowed.
    return !c.target.entityId;
}

/** Returns true when the change is missing the section field — silent misrouting risk. */
export function isMissingSection(c: RawChangeLike): boolean {
    return !c.target?.section;
}

/** Drop reason for telemetry/logging. */
export type DropReason = 'missing_section' | 'identity_field' | 'protected_entity_remove' | 'protected_entity_add';

/** Lookup failure record for the before-text sanitizer (telemetry). */
export interface BeforeTextLookupFailure {
    changeId: string;
    reason: string;
    path: string;
}

/** Result of the before-text sanitizer pass. */
export interface BeforeTextSanitizeResult<T> {
    verified: T[];
    failures: BeforeTextLookupFailure[];
}

/** Loose shape of a change that has been triaged and may carry before/after text. */
export interface ChangeWithText extends RawChangeLike {
    id?: string;
    type?: string;
    before?: string;
    after?: string;
}

/** Loose shape of the CV structure consumed by the sanitizer. Kept untyped to keep the test surface small. */
export interface CvSanitizerInput {
    personalInfo?: Record<string, unknown> | null;
    experience?: Array<Record<string, any>> | null;
    education?: Array<Record<string, any>> | null;
    skills?: Array<Record<string, any>> | null;
    languages?: Array<Record<string, any>> | null;
    certifications?: Array<Record<string, any>> | null;
    [key: string]: unknown;
}

function coerceArrayValueToText(realValue: unknown): string {
    if (realValue == null) return '';
    if (Array.isArray(realValue)) {
        return realValue
            .map((x: any) => (typeof x === 'string' ? x : x?.text))
            .filter(Boolean)
            .join(', ');
    }
    return String(realValue);
}

/**
 * Replaces AI-hallucinated `before` values with ground-truth from the CV and
 * drops changes whose target path cannot be resolved.
 *
 * Phase 7 fix (2026-04-27): when a `personalInfo` field is empty in the CV
 * but the LLM proposes a non-empty `after`, we treat the change as a
 * semantic ADD (regardless of what `change.type` says). This restores the
 * "create the missing summary" flow which was silently dropped before.
 *
 * Pure function — no IO, deterministic. Mutates the input change objects in place
 * (sets `change.before` and may upgrade `change.type` to 'add').
 */
export function sanitizeBeforeText<T extends ChangeWithText>(
    changes: T[],
    cv: CvSanitizerInput,
): BeforeTextSanitizeResult<T> {
    const verified: T[] = [];
    const failures: BeforeTextLookupFailure[] = [];

    for (const change of changes) {
        // ADD changes have no 'before' — always pass through
        if (change.type === 'add') {
            verified.push(change);
            continue;
        }

        const section = change.target?.section;
        const entityId = change.target?.entityId ?? null;
        const field = change.target?.field ?? null;
        const bulletId = change.target?.bulletId ?? null;
        const changeId = change.id ?? '';

        // personalInfo — flat object, no arrays
        if (section === 'personalInfo' && field) {
            const realBefore = (cv?.personalInfo as any)?.[field];
            const realBeforeText = realBefore == null ? '' : String(realBefore);
            const afterText = typeof change.after === 'string' ? change.after : '';

            if (realBeforeText.trim().length > 0) {
                change.before = realBeforeText;
                verified.push(change);
            } else if (afterText.trim().length > 0) {
                // PHASE 7: empty existing personalInfo field + non-empty proposal
                // = effective ADD. LLM may have emitted type='modify' but
                // semantically this is a create-from-nothing. Treating it as ADD
                // avoids dropping legitimate "create the missing summary" diffs.
                change.before = '';
                change.type = 'add';
                verified.push(change);
            } else {
                failures.push({
                    changeId,
                    reason: 'personalInfo field empty or missing',
                    path: `personalInfo.${field}`,
                });
            }
            continue;
        }

        // Array sections — experience, education, skills, languages, certifications
        const sectionArray = section ? (cv as any)?.[section] : undefined;
        if (!Array.isArray(sectionArray) || !entityId) {
            failures.push({
                changeId,
                reason: 'section not array or entityId missing',
                path: `${section ?? '?'}.${entityId ?? '?'}`,
            });
            continue;
        }

        const entity = sectionArray.find((e: any) => e?.id === entityId);
        if (!entity) {
            failures.push({
                changeId,
                reason: 'entityId not found',
                path: `${section}.${entityId}`,
            });
            continue;
        }

        // Bullet-level lookup (experience.description)
        if (bulletId && Array.isArray(entity.description)) {
            const bullet = entity.description.find((b: any) => b?.id === bulletId);
            if (bullet) {
                change.before = bullet.text;
                verified.push(change);
            } else {
                failures.push({
                    changeId,
                    reason: 'bulletId not found',
                    path: `${section}.${entityId}.description.${bulletId}`,
                });
            }
            continue;
        }

        // Field-level lookup
        if (field) {
            const beforeText = coerceArrayValueToText(entity[field]);
            if (beforeText.trim().length > 0) {
                change.before = beforeText;
                verified.push(change);
            } else {
                failures.push({
                    changeId,
                    reason: 'field empty or missing',
                    path: `${section}.${entityId}.${field}`,
                });
            }
        } else {
            failures.push({
                changeId,
                reason: 'no field or bulletId specified',
                path: `${section}.${entityId}`,
            });
        }
    }

    return { verified, failures };
}

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
        if (isProtectedEntityAdd(c)) {
            dropped.push({ change: c, reason: 'protected_entity_add' });
            continue;
        }
        kept.push(c);
    }

    return { kept, dropped };
}
