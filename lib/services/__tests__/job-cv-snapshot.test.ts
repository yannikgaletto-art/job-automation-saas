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
