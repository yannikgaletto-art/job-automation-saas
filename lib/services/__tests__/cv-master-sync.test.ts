/**
 * cv-master-sync stress tests — Welle Re-1 LITE (2026-04-27).
 *
 * Verifies the SSoT helper that DEV (cv/match/route.ts) and PROD (Inngest)
 * both call. Three core stress patterns plus defensive guards.
 */

import { syncMasterCvFromDocument } from '../cv-master-sync';

jest.mock('@/lib/services/cv-parser', () => ({
    parseCvTextToJson: jest.fn(async (text: string) => ({
        personalInfo: { name: null, email: null },
        experience: [{ role: 'Parsed Role', company: 'Parsed Co', descriptions: [`from text len=${text.length}`] }],
        education: [],
        skills: [],
        certifications: [],
        languages: [],
    })),
}));

interface MockTable {
    rows: any[];
    updates: any[];
}

interface MockState {
    user_profiles: MockTable;
    documents: MockTable;
}

function makeSupabaseMock(state: MockState) {
    const fromImpl = (table: keyof MockState) => {
        const t = state[table];
        const ctx: any = { _eqs: [] as Array<[string, any]> };
        const builder: any = {
            select: () => builder,
            eq: (col: string, val: any) => {
                ctx._eqs.push([col, val]);
                return builder;
            },
            update: (patch: any) => {
                const updateBuilder: any = {
                    _eqs: [] as Array<[string, any]>,
                    eq(col: string, val: any) {
                        this._eqs.push([col, val]);
                        return this;
                    },
                    then(resolve: any) {
                        const target = t.rows.find(r => updateBuilder._eqs.every(([c, v]: [string, any]) => r[c] === v));
                        if (target) Object.assign(target, patch);
                        t.updates.push({ patch, eqs: updateBuilder._eqs.slice() });
                        resolve({ error: null });
                        return Promise.resolve({ error: null });
                    },
                };
                return updateBuilder;
            },
            single: () => Promise.resolve({ data: t.rows.find(r => ctx._eqs.every(([c, v]: [string, any]) => r[c] === v)) ?? null, error: null }),
            maybeSingle: () => Promise.resolve({ data: t.rows.find(r => ctx._eqs.every(([c, v]: [string, any]) => r[c] === v)) ?? null, error: null }),
        };
        return builder;
    };
    return { from: fromImpl } as any;
}

describe('syncMasterCvFromDocument — Welle Re-1 LITE', () => {
    const USER_ID = 'user-1';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('STRESSTEST 1 — PwC repro (DEV path with stale master)', () => {
        it('master holds EN-CV path but user picked Exxeta → re-parses + writes Exxeta master', async () => {
            const state: MockState = {
                user_profiles: {
                    rows: [{
                        id: USER_ID,
                        cv_original_file_path: 'user-1/en-cv.pdf',
                        full_name: 'Yannik Galetto',
                        cv_structured_data: { personalInfo: { name: 'Yannik Galetto' }, experience: [{ role: 'Sales & BD Manager', company: 'Ingrano' }] },
                    }],
                    updates: [],
                },
                documents: {
                    rows: [
                        { id: 'doc-exxeta', user_id: USER_ID, file_url_encrypted: 'user-1/exxeta.pdf', metadata: { extracted_text: 'Exxeta Yannik Galetto Innovation Manager Berlin since 2024…'.repeat(3) } },
                        { id: 'doc-en', user_id: USER_ID, file_url_encrypted: 'user-1/en-cv.pdf', metadata: { extracted_text: 'EN CV here' } },
                    ],
                    updates: [],
                },
            };
            const supabase = makeSupabaseMock(state);

            const result = await syncMasterCvFromDocument(USER_ID, 'doc-exxeta', supabase);

            expect(result.status).toBe('synced');
            expect(state.user_profiles.updates).toHaveLength(1);
            const patch = state.user_profiles.updates[0].patch;
            expect(patch.cv_original_file_path).toBe('user-1/exxeta.pdf');
            expect(patch.cv_structured_data.experience[0].role).toBe('Parsed Role');
            expect(patch.cv_structured_data.personalInfo.name).toBe('Yannik Galetto');
        });
    });

    describe('STRESSTEST 2 — Idempotency (master already synced)', () => {
        it('skips re-parse when profile.cv_original_file_path === doc.file_url_encrypted', async () => {
            const state: MockState = {
                user_profiles: {
                    rows: [{
                        id: USER_ID,
                        cv_original_file_path: 'user-1/exxeta.pdf',
                        full_name: 'Yannik Galetto',
                        cv_structured_data: { existing: true },
                    }],
                    updates: [],
                },
                documents: {
                    rows: [{ id: 'doc-exxeta', user_id: USER_ID, file_url_encrypted: 'user-1/exxeta.pdf', metadata: { extracted_text: 'long enough text here ' + 'x'.repeat(100) } }],
                    updates: [],
                },
            };
            const supabase = makeSupabaseMock(state);
            const { parseCvTextToJson } = await import('@/lib/services/cv-parser');

            const result = await syncMasterCvFromDocument(USER_ID, 'doc-exxeta', supabase);

            expect(result.status).toBe('skipped');
            expect(state.user_profiles.updates).toHaveLength(0);
            expect(parseCvTextToJson).not.toHaveBeenCalled();
        });

        it('three consecutive calls produce stable state (no re-parse, no extra writes)', async () => {
            const state: MockState = {
                user_profiles: {
                    rows: [{
                        id: USER_ID,
                        cv_original_file_path: 'user-1/cv.pdf',
                        full_name: 'Test User',
                        cv_structured_data: { stable: true },
                    }],
                    updates: [],
                },
                documents: {
                    rows: [{ id: 'doc-stable', user_id: USER_ID, file_url_encrypted: 'user-1/cv.pdf', metadata: { extracted_text: 'a'.repeat(200) } }],
                    updates: [],
                },
            };
            const supabase = makeSupabaseMock(state);

            const r1 = await syncMasterCvFromDocument(USER_ID, 'doc-stable', supabase);
            const r2 = await syncMasterCvFromDocument(USER_ID, 'doc-stable', supabase);
            const r3 = await syncMasterCvFromDocument(USER_ID, 'doc-stable', supabase);

            expect([r1, r2, r3].every(r => r.status === 'skipped')).toBe(true);
            expect(state.user_profiles.updates).toHaveLength(0);
        });
    });

    describe('STRESSTEST 3 — Multi-document switching (3 CVs, alternating picks)', () => {
        it('Job1=A, Job2=B, Job3=A produces master following the picker', async () => {
            const state: MockState = {
                user_profiles: {
                    rows: [{
                        id: USER_ID,
                        cv_original_file_path: 'user-1/initial.pdf',
                        full_name: 'Multi User',
                        cv_structured_data: { initial: true },
                    }],
                    updates: [],
                },
                documents: {
                    rows: [
                        { id: 'doc-a', user_id: USER_ID, file_url_encrypted: 'user-1/cv-a.pdf', metadata: { extracted_text: 'CV A '.repeat(20) } },
                        { id: 'doc-b', user_id: USER_ID, file_url_encrypted: 'user-1/cv-b.pdf', metadata: { extracted_text: 'CV B '.repeat(20) } },
                    ],
                    updates: [],
                },
            };
            const supabase = makeSupabaseMock(state);

            const r1 = await syncMasterCvFromDocument(USER_ID, 'doc-a', supabase);
            expect(r1.status).toBe('synced');
            expect(state.user_profiles.rows[0].cv_original_file_path).toBe('user-1/cv-a.pdf');

            const r2 = await syncMasterCvFromDocument(USER_ID, 'doc-b', supabase);
            expect(r2.status).toBe('synced');
            expect(state.user_profiles.rows[0].cv_original_file_path).toBe('user-1/cv-b.pdf');

            const r3 = await syncMasterCvFromDocument(USER_ID, 'doc-a', supabase);
            expect(r3.status).toBe('synced');
            expect(state.user_profiles.rows[0].cv_original_file_path).toBe('user-1/cv-a.pdf');

            expect(state.user_profiles.updates).toHaveLength(3);
        });
    });

    describe('Defensive guards', () => {
        it('returns no-document when cvDocumentId is unknown', async () => {
            const state: MockState = {
                user_profiles: { rows: [{ id: USER_ID, cv_original_file_path: 'x', full_name: 'U' }], updates: [] },
                documents: { rows: [], updates: [] },
            };
            const result = await syncMasterCvFromDocument(USER_ID, 'doc-missing', makeSupabaseMock(state));
            expect(result.status).toBe('no-document');
        });

        it('returns no-text when document has empty extracted_text', async () => {
            const state: MockState = {
                user_profiles: { rows: [{ id: USER_ID, cv_original_file_path: 'old', full_name: 'U' }], updates: [] },
                documents: {
                    rows: [{ id: 'doc-empty', user_id: USER_ID, file_url_encrypted: 'new', metadata: { extracted_text: '' } }],
                    updates: [],
                },
            };
            const result = await syncMasterCvFromDocument(USER_ID, 'doc-empty', makeSupabaseMock(state));
            expect(result.status).toBe('no-text');
        });

        it('returns no-text when extracted_text is too short (<50 chars)', async () => {
            const state: MockState = {
                user_profiles: { rows: [{ id: USER_ID, cv_original_file_path: 'old', full_name: 'U' }], updates: [] },
                documents: {
                    rows: [{ id: 'doc-short', user_id: USER_ID, file_url_encrypted: 'new', metadata: { extracted_text: 'tiny' } }],
                    updates: [],
                },
            };
            const result = await syncMasterCvFromDocument(USER_ID, 'doc-short', makeSupabaseMock(state));
            expect(result.status).toBe('no-text');
        });

        it('handles missing profile gracefully (no full_name, no original_path)', async () => {
            const state: MockState = {
                user_profiles: { rows: [], updates: [] },
                documents: {
                    rows: [{ id: 'doc-x', user_id: USER_ID, file_url_encrypted: 'new', metadata: { extracted_text: 'a'.repeat(200) } }],
                    updates: [],
                },
            };
            const result = await syncMasterCvFromDocument(USER_ID, 'doc-x', makeSupabaseMock(state));
            // profile is null → cv_original_file_path undefined → !== doc.file_url_encrypted → re-parse
            expect(result.status).toBe('synced');
        });
    });
});
