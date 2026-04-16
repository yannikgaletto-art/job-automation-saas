/**
 * Beta Credit Refill — API Route
 * POST /api/billing/beta-grant
 *
 * Feature-Silo: billing
 *
 * "Fake-Door" monetization: When a user clicks "Upgrade" or "Topup",
 * we track the purchase intent in PostHog and refill their credits
 * for free as a Beta gift. No Stripe, no money.
 *
 * Flow:
 *   1. Auth guard
 *   2. Validate input (plan: starter | durchstarter | topup)
 *   3. Call atomic RPC beta_refill_credits (resets credits_used to 0)
 *   4. Track intent in PostHog (fire-and-forget, AFTER grant)
 *   5. Return result
 *
 * Security:
 *   - Server-only feature flag: BETA_CREDIT_MODE=true
 *   - Auth guard (§8 SICHERHEITSARCHITEKTUR.md)
 *   - Atomic RPC with FOR UPDATE lock (no double-click exploit)
 *   - 1x per user lifetime (beta_refill_claimed flag in DB)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';

const betaGrantSchema = z.object({
    plan: z.enum(['starter', 'durchstarter', 'topup']),
});

export async function POST(request: NextRequest) {
    // ── Feature flag (server-only — not exposed to client) ────────────
    if (process.env.BETA_CREDIT_MODE !== 'true') {
        return NextResponse.json(
            { error: 'Beta mode is not active' },
            { status: 404 }
        );
    }

    try {
        // ── 1. Auth guard ────────────────────────────────────────────
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ── 2. Parse + validate input ────────────────────────────────
        const body = await request.json();
        const parsed = betaGrantSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { plan } = parsed.data;
        const admin = getSupabaseAdmin();

        // ── 3. Atomic credit refill via RPC ──────────────────────────
        const { data: rpcResult, error: rpcError } = await admin.rpc('beta_refill_credits', {
            p_user_id: user.id,
            p_intent_plan: plan,
        });

        if (rpcError) {
            // RPC not deployed yet → surface it clearly
            const isMissing = rpcError.code === 'PGRST202' || rpcError.code === '42883';
            if (isMissing) {
                console.warn('⚠️ [BetaGrant] RPC beta_refill_credits not deployed — run migration 20260416_beta_refill.sql');
                return NextResponse.json(
                    { error: 'service_unavailable', hint: 'Run migration 20260416_beta_refill.sql' },
                    { status: 503 }
                );
            }
            console.error('❌ [BetaGrant] RPC error:', rpcError.message);
            return NextResponse.json({ error: 'grant_failed' }, { status: 500 });
        }

        const result = rpcResult?.[0] ?? { success: false, refilled_amount: 0, new_balance: 0 };

        if (!result.success) {
            // Already claimed — idempotent rejection
            return NextResponse.json(
                { success: false, alreadyClaimed: true },
                { status: 409 }
            );
        }

        console.log(`🎁 [BetaGrant] Refilled ${result.refilled_amount} credits for user ${user.id.slice(0, 8)}… (intent: ${plan}) | New balance: ${result.new_balance}`);

        // ── 4. Track intent in PostHog (fire-and-forget, AFTER grant) ─
        // Non-blocking: if PostHog is down, credits were already granted
        try {
            const { captureServerEvent } = await import('@/lib/posthog/server');
            captureServerEvent(user.id, 'upgrade_intent', {
                intent_plan: plan,
                refilled_amount: result.refilled_amount,
                new_balance: result.new_balance,
                is_beta: true,
            });
        } catch {
            // Silent — analytics is auxiliary
        }

        return NextResponse.json({
            success: true,
            refilledAmount: result.refilled_amount,
            newBalance: result.new_balance,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [BetaGrant] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
