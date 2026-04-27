import { resolveJobCv, buildJobCvSnapshot } from '../job-cv-snapshot';

describe('buildJobCvSnapshot', () => {
    test('builds a well-formed snapshot with current ISO timestamp', () => {
        const cv = { personalInfo: { name: 'Test' }, experience: [] };
        const snap = buildJobCvSnapshot(cv, 'doc-123', 'cv.pdf');
        expect(snap.data).toBe(cv);
        expect(snap.document_id).toBe('doc-123');
        expect(snap.document_name).toBe('cv.pdf');
        expect(typeof snap.pinned_at).toBe('string');
        expect(new Date(snap.pinned_at).toString()).not.toBe('Invalid Date');
    });

    test('accepts null document_id and null document_name', () => {
        const snap = buildJobCvSnapshot({ x: 1 }, null);
        expect(snap.document_id).toBeNull();
        expect(snap.document_name).toBeNull();
        expect(snap.data).toEqual({ x: 1 });
    });
});

describe('resolveJobCv', () => {
    test('returns the job-pinned snapshot when present', () => {
        const masterCv = { id: 'master', personalInfo: { name: 'Old' } };
        const snapshot = {
            data: { id: 'snapshot', personalInfo: { name: 'New' } },
            document_id: 'doc-1',
            document_name: 'mycv.pdf',
            pinned_at: '2026-04-26T20:00:00Z',
        };
        const metadata = { cv_snapshot: snapshot, otherStuff: 'x' };
        const result = resolveJobCv(metadata, masterCv);
        expect(result.source).toBe('job_snapshot');
        expect((result.cv as any).id).toBe('snapshot');
        expect(result.documentId).toBe('doc-1');
        expect(result.documentName).toBe('mycv.pdf');
        expect(result.pinnedAt).toBe('2026-04-26T20:00:00Z');
    });

    test('falls back to master CV when no snapshot exists', () => {
        const masterCv = { id: 'master' };
        const result = resolveJobCv({ unrelatedKey: 1 }, masterCv);
        expect(result.source).toBe('master');
        expect((result.cv as any).id).toBe('master');
        expect(result.documentId).toBeNull();
        expect(result.documentName).toBeNull();
        expect(result.pinnedAt).toBeNull();
    });

    test('falls back to master when metadata is null/undefined', () => {
        const masterCv = { id: 'master' };
        expect(resolveJobCv(null, masterCv).source).toBe('master');
        expect(resolveJobCv(undefined, masterCv).source).toBe('master');
    });

    test('returns null cv when both snapshot and master are missing', () => {
        const result = resolveJobCv(null, null);
        expect(result.source).toBe('master');
        expect(result.cv).toBeNull();
    });

    test('falls back to master when snapshot.data is malformed (string instead of object)', () => {
        const masterCv = { id: 'master' };
        const metadata = { cv_snapshot: { data: 'not-an-object', pinned_at: '2026-01-01' } };
        const result = resolveJobCv(metadata, masterCv);
        expect(result.source).toBe('master');
        expect((result.cv as any).id).toBe('master');
    });

    test('falls back to master when snapshot.data is null', () => {
        const masterCv = { id: 'master' };
        const metadata = { cv_snapshot: { data: null, pinned_at: '2026-01-01' } };
        const result = resolveJobCv(metadata, masterCv);
        expect(result.source).toBe('master');
    });

    test('returns snapshot even if document_id and document_name are null', () => {
        const masterCv = { id: 'master' };
        const metadata = {
            cv_snapshot: {
                data: { id: 'snap' },
                document_id: null,
                document_name: null,
                pinned_at: '2026-04-26T00:00:00Z',
            },
        };
        const result = resolveJobCv(metadata, masterCv);
        expect(result.source).toBe('job_snapshot');
        expect((result.cv as any).id).toBe('snap');
        expect(result.documentId).toBeNull();
        expect(result.documentName).toBeNull();
    });

    test('preserves snapshot data identity (no clone)', () => {
        const innerData = { unique: Symbol('cv') };
        const metadata = { cv_snapshot: { data: innerData, pinned_at: '2026-04-26T00:00:00Z' } };
        const result = resolveJobCv(metadata, null);
        // Snapshot should pass through by reference — caller may mutate freely (current contract).
        expect(result.cv).toBe(innerData);
    });
});

/**
 * Single-CV invariant (2026-04-28): after the migration, the user has at most
 * one CV at any moment. In-flight jobs (CV Match, Optimizer, CL generation)
 * must keep working even if the user deletes their CV mid-flow, because the
 * snapshot persists the full CvStructuredData JSON inside job_queue.metadata.
 *
 * These tests exercise the resolver under the post-delete state where master
 * is null but a snapshot still exists.
 */
describe('resolveJobCv — Single-CV invariant robustness', () => {
    test('in-flight job survives master-CV deletion via snapshot fallback', () => {
        // Scenario: user deleted their CV (master=null) but Optimizer is mid-run
        // on a job whose snapshot was pinned at CV-Match time.
        const snapshot = {
            data: {
                personalInfo: { name: 'Yannik Galetto', email: 'y@example.com' },
                experience: [{ company: 'Pathly', role: 'CTO' }],
            },
            document_id: 'doc-deleted-since',
            document_name: 'cv-pre-delete.pdf',
            pinned_at: '2026-04-28T08:00:00Z',
        };
        const result = resolveJobCv({ cv_snapshot: snapshot }, null);
        expect(result.source).toBe('job_snapshot');
        expect((result.cv as unknown as { personalInfo: { name: string } })?.personalInfo.name).toBe('Yannik Galetto');
        expect(result.documentName).toBe('cv-pre-delete.pdf');
    });

    test('snapshot wins over freshly uploaded master (post-delete-then-re-upload)', () => {
        // Scenario: user deleted CV, uploaded a different one, but in-flight job
        // still resolves to the original CV that was snapshotted at match time.
        const oldSnapshot = {
            data: { personalInfo: { name: 'Old' } },
            document_id: 'doc-old',
            document_name: 'old.pdf',
            pinned_at: '2026-04-28T08:00:00Z',
        };
        const newMaster = { personalInfo: { name: 'New' } };
        const result = resolveJobCv({ cv_snapshot: oldSnapshot }, newMaster);
        expect(result.source).toBe('job_snapshot');
        expect((result.cv as unknown as { personalInfo: { name: string } })?.personalInfo.name).toBe('Old');
    });

    test('post-delete fresh job (no snapshot, no master) returns null source=master', () => {
        // Scenario: user deleted CV, then opens a job whose CV-Match never ran.
        // Caller must handle null cv (UI shows "upload a CV first").
        const result = resolveJobCv(null, null);
        expect(result.source).toBe('master');
        expect(result.cv).toBeNull();
    });

    test('snapshot with valid pinned_at survives null master', () => {
        const snapshot = {
            data: { personalInfo: { name: 'Snapshot only' } },
            document_id: null,
            document_name: null,
            pinned_at: '2026-04-28T08:00:00Z',
        };
        const result = resolveJobCv({ cv_snapshot: snapshot }, null);
        expect(result.source).toBe('job_snapshot');
        expect(result.pinnedAt).toBe('2026-04-28T08:00:00Z');
    });

    test('builds a snapshot whose data round-trips through resolveJobCv', () => {
        const cv = {
            personalInfo: { name: 'RT', email: 'rt@example.com' },
            experience: [{ company: 'X', role: 'Y' }],
        };
        const snap = buildJobCvSnapshot(cv, 'doc-rt', 'rt.pdf');
        const result = resolveJobCv({ cv_snapshot: snap }, null);
        expect(result.cv).toBe(cv);
        expect(result.documentId).toBe('doc-rt');
        expect(result.documentName).toBe('rt.pdf');
        expect(result.source).toBe('job_snapshot');
    });
});
