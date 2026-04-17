/**
 * Account Deletion Service — Shared Logic
 *
 * Used by: Admin DELETE (/api/admin/users) + User Self-Delete (/api/account/delete)
 *
 * Chain: Stripe → Storage → auth.deleteUser()
 *
 * WHY SO SIMPLE:
 *   Every table that references auth.users has ON DELETE CASCADE (or SET NULL).
 *   Postgres handles the cascade automatically when auth.deleteUser() runs.
 *   We do NOT need to manually delete rows from each table — that is redundant.
 *
 *   DSGVO Exceptions (intentionally NOT deleted by cascade):
 *     - consent_history  → ON DELETE CASCADE (auto-deleted — DSGVO allows this)
 *     - credit_events    → ON DELETE CASCADE (auto-deleted — billing audit)
 *
 * PREREQUISITE:
 *   Migration 20260417_fix_auth_delete_fk.sql must be applied in Supabase.
 *   This fixes job_queue.reviewed_by + form_selectors.verified_by_user_id
 *   to use ON DELETE SET NULL (previously missing → blocked auth.deleteUser).
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ── Stripe Cleanup ────────────────────────────────────────────────────────────
// Done BEFORE auth.deleteUser so we can still read stripe_customer_id.
async function cleanupStripe(stripeCustomerId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { getStripe } = await import('@/lib/services/stripe-service');
        const stripe = getStripe();

        const [active, pastDue] = await Promise.all([
            stripe.subscriptions.list({ customer: stripeCustomerId, status: 'active' }),
            stripe.subscriptions.list({ customer: stripeCustomerId, status: 'past_due' }),
        ]);

        for (const sub of [...active.data, ...pastDue.data]) {
            await stripe.subscriptions.cancel(sub.id, { prorate: true });
            console.log(`[account-deletion] Cancelled subscription ${sub.id}`);
        }

        await stripe.customers.del(stripeCustomerId);
        console.log(`[account-deletion] Deleted Stripe customer ${stripeCustomerId}`);
        return { success: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown Stripe error';
        console.error(`[account-deletion] Stripe cleanup failed: ${msg}`);
        return { success: false, error: msg };
    }
}

// ── Storage Cleanup ───────────────────────────────────────────────────────────
// Done BEFORE auth.deleteUser so we still own the userId reference.
async function cleanupStorage(userId: string): Promise<void> {
    const admin = getSupabaseAdmin();
    try {
        for (const subdir of [undefined, 'cv', 'cover_letter'] as const) {
            const path = subdir ? `${userId}/${subdir}` : userId;
            const { data: files } = await admin.storage.from('documents').list(path);
            if (files && files.length > 0) {
                const paths = files.map(f => `${path}/${f.name}`);
                await admin.storage.from('documents').remove(paths);
            }
        }
    } catch (err) {
        // Non-blocking — storage cleanup failure must not prevent account deletion
        console.warn('[account-deletion] Storage cleanup warning:', err);
    }
}

// ── Public Interface ──────────────────────────────────────────────────────────

export interface AccountDeletionResult {
    success: boolean;
    error?: string;
    stripeCleanedUp: boolean;
    storageCleaned: boolean;
}

/**
 * Delete a user account completely.
 *
 * IMPORTANT: The calling route MUST authenticate the caller BEFORE invoking this.
 * Frontend must call supabase.auth.signOut() AFTER a successful response.
 */
export async function deleteUserAccount(userId: string): Promise<AccountDeletionResult> {
    const admin = getSupabaseAdmin();
    const result: AccountDeletionResult = {
        success: false,
        stripeCleanedUp: false,
        storageCleaned: false,
    };

    // ── Step 1: Stripe cleanup (read stripe_customer_id while row still exists) ──
    const { data: creditRow } = await admin
        .from('user_credits')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .maybeSingle();

    if (creditRow?.stripe_customer_id) {
        const stripe = await cleanupStripe(creditRow.stripe_customer_id);
        if (!stripe.success) {
            result.error = `Stripe-Bereinigung fehlgeschlagen: ${stripe.error}. Bitte kontaktiere contact@path-ly.eu`;
            return result;
        }
    }
    result.stripeCleanedUp = true;

    // ── Step 2: Storage cleanup ────────────────────────────────────────────────
    await cleanupStorage(userId);
    result.storageCleaned = true;

    // ── Step 3: Delete auth user (Postgres cascades all FKs automatically) ─────
    // PREREQUISITE: Migration 20260417_fix_auth_delete_fk.sql must be applied.
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) {
        console.error('[account-deletion] auth.deleteUser failed:', authError.message);
        result.error = `Auth-Löschung fehlgeschlagen: ${authError.message}`;
        return result;
    }

    result.success = true;
    console.log(`[account-deletion] ✅ User ${userId} fully deleted (stripe=${result.stripeCleanedUp}, storage=${result.storageCleaned})`);
    return result;
}
