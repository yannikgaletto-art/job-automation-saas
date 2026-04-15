/**
 * Account Deletion Service — Shared Logic
 *
 * Extracted from app/api/admin/users/route.ts (DRY principle).
 * Used by both Admin Delete and User Self-Delete routes.
 *
 * Chain: Stripe Cleanup → Storage Cleanup → DB Cascade → Auth User Delete
 *
 * DSGVO Art. 17: Right to Erasure — complete data deletion.
 * KRITISCH #1 Fix: Shared service prevents code duplication.
 * KRITISCH #3 Fix: Stripe subscriptions are cancelled before DB deletion.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ── Stripe Cleanup (Conditional Import) ───────────────────────────────────
// Stripe is only needed if the user has a subscription.
// We import lazily to avoid breaking if Stripe keys aren't configured.

async function cleanupStripe(stripeCustomerId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { getStripe } = await import('@/lib/services/stripe-service');
        const stripe = getStripe();

        // 1. Cancel all active subscriptions
        const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: 'active',
        });

        for (const sub of subscriptions.data) {
            await stripe.subscriptions.cancel(sub.id, {
                prorate: true,
            });
            console.log(`[account-deletion] Cancelled subscription ${sub.id}`);
        }

        // Also cancel any past_due subscriptions
        const pastDueSubs = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: 'past_due',
        });

        for (const sub of pastDueSubs.data) {
            await stripe.subscriptions.cancel(sub.id);
        }

        // 2. Delete the Stripe customer entirely
        await stripe.customers.del(stripeCustomerId);
        console.log(`[account-deletion] Deleted Stripe customer ${stripeCustomerId}`);

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Stripe error';
        console.error(`[account-deletion] Stripe cleanup failed: ${message}`);
        return { success: false, error: message };
    }
}

// ── Table Deletion Order ──────────────────────────────────────────────────
// Leaf tables first, then parent tables. Matches the 27-table cascade from
// the admin route but consolidated into a single source of truth.

const CASCADE_TABLES = [
    // NOTE: consent_history and credit_events are INTENTIONALLY EXCLUDED.
    // DSGVO Art. 7: Consent proof must be retained for 3 years after deletion.
    // DSGVO Art. 15: Credit events are audit trail — retained for legal compliance.
    // The pg_cron cleanup job mirrors this exclusion.
    'processed_stripe_events',
    'generation_logs',
    'validation_logs',
    'coaching_sessions',
    'job_certificates',
    'video_scripts',
    'video_approaches',
    'script_block_templates',
    'mood_checkins',
    'daily_energy',
    'daily_briefings',
    'pomodoro_sessions',
    'tasks',
    'community_upvotes',
    'community_comments',
    'community_posts',
    'volunteering_bookmarks',
    'volunteering_votes',
    'application_history',
    'company_research',
    'saved_job_searches',
    'job_queue',
    'documents',
    'user_credits',
    'user_feedback',
    'user_profiles',
    'user_values',
    'user_settings',
] as const;

// ── Main Deletion Function ────────────────────────────────────────────────

export interface AccountDeletionResult {
    success: boolean;
    error?: string;
    stripeCleanedUp: boolean;
    tablesDeleted: string[];
    storageCleaned: boolean;
}

/**
 * Delete a user account completely.
 *
 * @param userId - The user ID to delete
 * @returns Result with success status and details
 *
 * IMPORTANT: The calling route MUST authenticate the user BEFORE calling this.
 * signOut must happen AFTER this function returns successfully.
 */
export async function deleteUserAccount(userId: string): Promise<AccountDeletionResult> {
    const admin = getSupabaseAdmin();
    const result: AccountDeletionResult = {
        success: false,
        stripeCleanedUp: false,
        tablesDeleted: [],
        storageCleaned: false,
    };

    // ── Step 1: Stripe Cleanup (BEFORE DB deletion) ───────────────────
    // Read stripe_customer_id before we delete the row
    const { data: creditData } = await admin
        .from('user_credits')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .maybeSingle();

    if (creditData?.stripe_customer_id) {
        const stripeResult = await cleanupStripe(creditData.stripe_customer_id);
        if (!stripeResult.success) {
            // KRITISCH #3: If Stripe fails, abort — don't orphan the subscription
            result.error = `Stripe-Bereinigung fehlgeschlagen: ${stripeResult.error}. Bitte kontaktiere contact@path-ly.eu`;
            return result;
        }
        result.stripeCleanedUp = true;
    } else {
        result.stripeCleanedUp = true; // No Stripe to clean up — that's fine
    }

    // ── Step 2: Storage Cleanup ───────────────────────────────────────
    // Delete all files in the user's storage folder
    try {
        const { data: files } = await admin.storage
            .from('documents')
            .list(userId);

        if (files && files.length > 0) {
            const paths = files.map(f => `${userId}/${f.name}`);
            await admin.storage.from('documents').remove(paths);
        }

        // Also try nested subdirectories (cv/, cover_letter/)
        for (const subdir of ['cv', 'cover_letter']) {
            const { data: subFiles } = await admin.storage
                .from('documents')
                .list(`${userId}/${subdir}`);

            if (subFiles && subFiles.length > 0) {
                const subPaths = subFiles.map(f => `${userId}/${subdir}/${f.name}`);
                await admin.storage.from('documents').remove(subPaths);
            }
        }

        result.storageCleaned = true;
    } catch (storageErr) {
        // Non-blocking: storage cleanup failure shouldn't prevent account deletion
        console.warn('[account-deletion] Storage cleanup warning:', storageErr);
        result.storageCleaned = false;
    }

    // ── Step 3: DB Cascade (all user-scoped tables) ───────────────────
    for (const table of CASCADE_TABLES) {
        const { error: delErr } = await admin.from(table).delete().eq('user_id', userId);
        if (delErr) {
            // Log but continue — table may not have rows or may not exist
            console.warn(`[account-deletion] cascade warn (${table}):`, delErr.message);
        } else {
            result.tablesDeleted.push(table);
        }
    }

    // ── Step 4: Delete auth user ──────────────────────────────────────
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) {
        console.error('[account-deletion] auth.deleteUser failed:', authError.message);
        result.error = `Auth-Löschung fehlgeschlagen: ${authError.message}`;
        return result;
    }

    result.success = true;
    console.log(`[account-deletion] ✅ User ${userId} fully deleted (${result.tablesDeleted.length} tables, stripe=${result.stripeCleanedUp}, storage=${result.storageCleaned})`);

    return result;
}
