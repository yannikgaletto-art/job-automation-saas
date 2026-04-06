/**
 * Feedback Credit Grant — API Route
 * POST /api/feedback/credit-grant
 *
 * Feature-Silo: billing
 *
 * Allows free users to earn 5 bonus credits by submitting feedback.
 * Uses atomic RPC (grant_feedback_credits) — no race condition possible.
 * One-time per user lifetime.
 *
 * Fixes applied:
 *   B3: Accept locale from frontend instead of hardcoding 'de'
 *   B4: Beta fallback no longer claims success when credits weren't actually granted
 *   B5: RPC runs BEFORE feedback insert — credits come first, because that's the
 *       commitment. Feedback is auxiliary: if it fails, we still granted the credits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';

const feedbackSchema = z.object({
    rating: z.number().int().min(1).max(5),
    tags: z.array(z.string().max(50)).max(10).optional().default([]),
    message: z.string().max(500).optional().default(''),
    locale: z.enum(['de', 'en', 'es']).optional().default('de'),
});

export async function POST(request: NextRequest) {
    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse + validate input
        const body = await request.json();
        const parsed = feedbackSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { rating, tags, message, locale } = parsed.data;
        const admin = getSupabaseAdmin();

        // ── STEP 1: Atomic credit grant (B5 fix: credits FIRST, feedback is auxiliary) ──
        // Using FOR UPDATE lock + flag check in one transaction.
        // If the RPC fails, we return an error BEFORE touching feedback.
        const { data: rpcResult, error: rpcError } = await admin.rpc('grant_feedback_credits', {
            p_user_id: user.id,
            p_amount: 5.0,
        });

        if (rpcError) {
            // RPC not deployed yet → surface it clearly (B4 fix: no silent success)
            const isMissing = rpcError.code === 'PGRST202' || rpcError.code === '42883';
            if (isMissing) {
                console.warn('⚠️ [FeedbackCredits] RPC grant_feedback_credits not deployed — migration pending');
                // Return 503 so the frontend can inform the user properly
                return NextResponse.json(
                    { error: 'service_unavailable', hint: 'Run migration 20260405_feedback_credits.sql' },
                    { status: 503 }
                );
            }
            console.error('❌ [FeedbackCredits] RPC error:', rpcError.message);
            return NextResponse.json({ error: 'grant_failed' }, { status: 500 });
        }

        const result = rpcResult?.[0] ?? { success: false, new_balance: 0 };

        if (!result.success) {
            // Flag was already true → already claimed (idempotent rejection from RPC)
            return NextResponse.json(
                { success: false, alreadyClaimed: true, error: 'ALREADY_CLAIMED' },
                { status: 409 }
            );
        }

        console.log(`🎁 [FeedbackCredits] Granted 5 credits to user ${user.id.slice(0, 8)}… | New balance: ${result.new_balance}`);

        // ── STEP 2: Save feedback (B3 fix: uses locale from frontend, B5: non-blocking) ──
        // Fire-and-forget: feedback storage is auxiliary. Credits were already granted.
        // If this fails, we log but don't roll back the credit transaction.
        admin.from('user_feedback').insert({
            user_id: user.id,
            feedback: message || `Rating: ${rating}/5`,
            rating,
            tags,
            source: 'credit_gate',
            locale,
        }).then(({ error: feedbackError }) => {
            if (feedbackError) {
                console.error('⚠️ [FeedbackCredits] Feedback insert failed (non-fatal, credits already granted):', feedbackError.message);
            }
        });

        return NextResponse.json({
            success: true,
            creditsGranted: 5,
            newBalance: result.new_balance,
            alreadyClaimed: false,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [FeedbackCredits] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
