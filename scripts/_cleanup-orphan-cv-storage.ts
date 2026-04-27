/**
 * Phase 1 — Orphan CV Storage Cleanup
 *
 * Run after the Single-CV migration has applied. Compares the backup table
 * documents_backup_pre_singlecv against the live documents table; every
 * file path that exists in backup but no longer in live is an orphan
 * storage object and gets removed from the `cvs` bucket.
 *
 * Idempotent: safe to re-run. Removes only files actually orphaned at the
 * moment of execution.
 *
 * Run: npx tsx scripts/_cleanup-orphan-cv-storage.ts
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

(async () => {
    console.log('=== Storage-Cleanup Orphan CVs ===\n');

    const { data: backup, error: bErr } = await sb
        .from('documents_backup_pre_singlecv')
        .select('id, file_url_encrypted')
        .eq('document_type', 'cv');

    if (bErr) {
        console.error('Backup-Tabelle nicht lesbar:', bErr.message);
        console.error('Migration evtl. noch nicht ausgeführt oder Backup-Tabelle nicht erzeugt.');
        process.exit(1);
    }

    const { data: live, error: lErr } = await sb
        .from('documents')
        .select('id')
        .eq('document_type', 'cv');

    if (lErr) {
        console.error('documents-Tabelle nicht lesbar:', lErr.message);
        process.exit(1);
    }

    const liveIds = new Set((live ?? []).map((d) => d.id as string));
    const orphans = (backup ?? [])
        .filter((b) => !liveIds.has(b.id as string) && b.file_url_encrypted)
        .map((b) => b.file_url_encrypted as string);

    console.log(`Backup rows: ${(backup ?? []).length}`);
    console.log(`Live rows:   ${liveIds.size}`);
    console.log(`Orphan paths to delete from storage: ${orphans.length}\n`);

    if (orphans.length === 0) {
        console.log('Nichts zu tun.');
        process.exit(0);
    }

    let removed = 0;
    let failed = 0;
    for (let i = 0; i < orphans.length; i += 100) {
        const batch = orphans.slice(i, i + 100);
        const { error: rmErr } = await sb.storage.from('cvs').remove(batch);
        if (rmErr) {
            console.error(`Batch ${i}-${i + batch.length}: ${rmErr.message}`);
            failed += batch.length;
        } else {
            removed += batch.length;
            console.log(`Cleaned ${removed}/${orphans.length}`);
        }
    }

    console.log('');
    console.log(`Removed: ${removed}`);
    console.log(`Failed:  ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
})();
