/**
 * Phase 0 — Multi-CV Audit Script
 *
 * Lists every user with more than 1 CV document and shows which document
 * is the current master (matched via user_profiles.cv_original_file_path).
 *
 * Output drives the Single-CV migration in supabase/migrations/20260428_*.
 *
 * Run: npx tsx scripts/_audit-multi-cv-users.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

type DocRow = {
    id: string;
    user_id: string;
    file_url_encrypted: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
};

(async () => {
    console.log('=== Phase 0 — Multi-CV Audit ===\n');

    // 1. Pull every CV document
    const { data: docs, error: docsErr } = await sb
        .from('documents')
        .select('id, user_id, file_url_encrypted, created_at, metadata')
        .eq('document_type', 'cv')
        .order('user_id', { ascending: true })
        .order('created_at', { ascending: false });

    if (docsErr) {
        console.error('Fehler beim Lesen documents:', docsErr.message);
        process.exit(1);
    }

    const docsByUser = new Map<string, DocRow[]>();
    for (const d of (docs ?? []) as DocRow[]) {
        const arr = docsByUser.get(d.user_id) ?? [];
        arr.push(d);
        docsByUser.set(d.user_id, arr);
    }

    // 2. Pull profile master pointers
    const userIds = [...docsByUser.keys()];
    const { data: profiles, error: profErr } = await sb
        .from('user_profiles')
        .select('id, cv_original_file_path')
        .in('id', userIds);

    if (profErr) {
        console.error('Fehler beim Lesen user_profiles:', profErr.message);
        process.exit(1);
    }

    const masterByUser = new Map<string, string | null>();
    for (const p of profiles ?? []) {
        masterByUser.set(p.id as string, (p.cv_original_file_path as string) ?? null);
    }

    // 3. Resolve emails for impacted users (visibility for User decision)
    const { data: { users: authUsers } } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const emailById = new Map<string, string>();
    for (const u of authUsers ?? []) {
        if (u.email) emailById.set(u.id, u.email);
    }

    // 4. Build report — only users with >1 CV
    const impacted: Array<{
        userId: string;
        email: string;
        docCount: number;
        masterPath: string | null;
        masterDocId: string | null;
        nonMasterDocs: Array<{ id: string; path: string | null; createdAt: string; name: string }>;
        ambiguousMaster: boolean;
    }> = [];

    for (const [userId, userDocs] of docsByUser) {
        if (userDocs.length <= 1) continue;

        const master = masterByUser.get(userId) ?? null;
        const masterDoc = master ? userDocs.find((d) => d.file_url_encrypted === master) : null;
        const nonMaster = userDocs
            .filter((d) => !masterDoc || d.id !== masterDoc.id)
            .map((d) => ({
                id: d.id,
                path: d.file_url_encrypted,
                createdAt: d.created_at,
                name: (d.metadata as { original_name?: string } | null)?.original_name ?? '(no name)',
            }));

        impacted.push({
            userId,
            email: emailById.get(userId) ?? '(unknown)',
            docCount: userDocs.length,
            masterPath: master,
            masterDocId: masterDoc?.id ?? null,
            nonMasterDocs: nonMaster,
            ambiguousMaster: !master || !masterDoc,
        });
    }

    // 5. Print report
    console.log(`Users insgesamt mit mindestens 1 CV: ${docsByUser.size}`);
    console.log(`Users mit > 1 CV (impacted):         ${impacted.length}\n`);

    if (impacted.length === 0) {
        console.log('Keine Multi-CV-User gefunden. Migration ist trivial.\n');
        process.exit(0);
    }

    for (const u of impacted) {
        console.log('---------------------------------------------------------');
        console.log(`User:           ${u.email} (id=${u.userId})`);
        console.log(`CV-Anzahl:      ${u.docCount}`);
        console.log(`Master-Pfad:    ${u.masterPath ?? '(none)'}`);
        console.log(`Master-Doc-ID:  ${u.masterDocId ?? '(no document matches master path)'}`);
        if (u.ambiguousMaster) {
            console.log('AMBIGUOUS:      Master-Pfad fehlt oder zeigt auf kein bestehendes Dokument.');
            console.log('                Phase-A-Migration kann nicht eindeutig wählen — User-Eingriff nötig.');
        }
        console.log(`Non-Master Docs (werden gedroppt unter Plan A):`);
        for (const nm of u.nonMasterDocs) {
            console.log(`  - id=${nm.id}  path=${nm.path ?? '(null)'}  created=${nm.createdAt}  name="${nm.name}"`);
        }
        console.log('');
    }

    // 6. Storage-File summary for cleanup planning
    const orphanPathCount = impacted.reduce(
        (n, u) => n + u.nonMasterDocs.filter((d) => !!d.path).length,
        0,
    );
    console.log('=== Cleanup-Plan-Summary ===');
    console.log(`Storage-Files die gelöscht werden (Non-Master): ${orphanPathCount}`);
    console.log(`Documents-Rows die gelöscht werden:             ${impacted.reduce((n, u) => n + u.nonMasterDocs.length, 0)}`);
    console.log(`Ambiguous-User die manuelle Auflösung brauchen: ${impacted.filter((u) => u.ambiguousMaster).length}`);
    console.log('');
})();
