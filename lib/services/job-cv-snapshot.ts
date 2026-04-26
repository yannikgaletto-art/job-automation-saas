/**
 * Job-pinned CV snapshot helpers — Welle B (CV-Auswahl Optimizer↔Analyzer-Sync).
 *
 * Problem solved: before this welle, Optimizer and Cover Letter always read
 * `user_profiles.cv_structured_data` (the user's master CV — the latest one
 * uploaded). When the user uploaded a new CV between CV Match and Optimizer,
 * the Optimizer would operate on a different CV than the one matched, leading
 * to mismatched scores, missing companies, and confusing diff lists.
 *
 * Fix: at CV Match time, snapshot the structured CV that was used for matching
 * into `job_queue.metadata.cv_snapshot`. Downstream readers (Optimizer, CL
 * Setup, CL Generator) prefer this snapshot over the master CV. Master CV
 * remains the fallback for jobs without a snapshot (legacy or pre-match).
 *
 * This file is the single SSoT for the snapshot shape and resolution logic.
 */

export interface JobCvSnapshot {
    /** The full CvStructuredData object — kept untyped here to avoid a circular import. */
    data: unknown;
    /** The documents table row id this snapshot was sourced from (null if unknown). */
    document_id: string | null;
    /** The CV's original filename when uploaded — for UI display only. */
    document_name: string | null;
    /** ISO datetime when the snapshot was pinned. */
    pinned_at: string;
}

export type JobCvSource = 'job_snapshot' | 'master';

export interface ResolvedJobCv<TCv = unknown> {
    cv: TCv | null;
    source: JobCvSource;
    pinnedAt: string | null;
    documentId: string | null;
    documentName: string | null;
}

/**
 * Reads `metadata.cv_snapshot` from a job's metadata blob and returns the
 * resolved CV that downstream features should operate on. Falls back to the
 * user's master CV when no snapshot exists.
 *
 * Pure function. Idempotent. Safe to call from any read path.
 */
export function resolveJobCv<TCv>(
    jobMetadata: Record<string, unknown> | null | undefined,
    masterCv: TCv | null | undefined,
): ResolvedJobCv<TCv> {
    const snapshot = (jobMetadata as { cv_snapshot?: JobCvSnapshot } | null | undefined)?.cv_snapshot;
    if (snapshot && snapshot.data && typeof snapshot.data === 'object') {
        return {
            cv: snapshot.data as TCv,
            source: 'job_snapshot',
            pinnedAt: snapshot.pinned_at ?? null,
            documentId: snapshot.document_id ?? null,
            documentName: snapshot.document_name ?? null,
        };
    }
    return {
        cv: (masterCv ?? null) as TCv | null,
        source: 'master',
        pinnedAt: null,
        documentId: null,
        documentName: null,
    };
}

/**
 * Builds a snapshot record. Use at CV Match time to capture the matched CV
 * into the job's metadata.
 */
export function buildJobCvSnapshot(
    cvData: unknown,
    documentId: string | null,
    documentName: string | null = null,
): JobCvSnapshot {
    return {
        data: cvData,
        document_id: documentId,
        document_name: documentName,
        pinned_at: new Date().toISOString(),
    };
}
