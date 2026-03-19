export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/complete
 * Marks onboarding as completed in user_settings.
 * Implements Write→Read-Back→Validate pattern (SICHERHEITSARCHITEKTUR.md Section 1).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ── Parse request body ONCE (QA fix: request.json() can only be called once) ──
        const body = await request.json();
        const { step, language, onboarding_goals, consents } = body;

        // ── 1. Save onboarding_goals to user_profiles (optional, non-blocking) ──
        if (onboarding_goals && Array.isArray(onboarding_goals)) {
            const { error: goalsError } = await supabaseAdmin
                .from('user_profiles')
                .update({ onboarding_goals })
                .eq('id', user.id);

            if (goalsError) {
                // Silent failure — goals are analytics-only, never block onboarding
                console.warn('[onboarding/complete] Goals update failed (non-blocking):', goalsError.message);
            }
        }

        // ── 2. Record DSGVO consents (BLOCKING — compliance-critical) ──
        // Auth-guarded here instead of /api/consent/record (which has no auth check)
        if (consents && Array.isArray(consents) && consents.length > 0) {
            const consentRecords = consents.map((c: { document_type: string; document_version: string; consent_given: boolean }) => ({
                user_id: user.id,
                document_type: c.document_type,
                document_version: c.document_version,
                consent_given: c.consent_given,
                ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
                user_agent: request.headers.get('user-agent') || 'unknown',
                consented_at: new Date().toISOString(),
            }));

            const { error: consentError } = await supabaseAdmin
                .from('consent_history')
                .upsert(consentRecords, {
                    onConflict: 'user_id,document_type,document_version',
                    ignoreDuplicates: false, // Update consented_at on retry — most recent wins
                });

            if (consentError) {
                // BLOCKING — DSGVO requires valid consent records before proceeding
                console.error('[onboarding/complete] Consent recording FAILED:', consentError.message);
                return NextResponse.json(
                    { error: 'Consent recording failed. Please try again.', success: false },
                    { status: 500 }
                );
            }
        }

        // ── 3. Mark onboarding as complete in user_settings ──
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin
            .from('user_settings')
            .upsert(
                {
                    user_id: user.id,
                    onboarding_completed: true,
                    onboarding_step: step || 2, // V2: 2 steps (was 5)
                    onboarding_completed_at: now,
                    // i18n: save user-selected language (default: 'de')
                    ...(language && ['de', 'en', 'es'].includes(language) ? { language } : {}),
                    updated_at: now,
                },
                { onConflict: 'user_id' }
            );

        if (error) {
            console.error('[onboarding/complete] Upsert error:', error);
            return NextResponse.json({ error: error.message, success: false }, { status: 500 });
        }

        // ✅ READ-BACK: Verify both flag AND timestamp were written (SICHERHEITSARCHITEKTUR.md §1)
        const { data: verify, error: verifyError } = await supabaseAdmin
            .from('user_settings')
            .select('onboarding_completed, onboarding_completed_at')
            .eq('user_id', user.id)
            .single();

        if (verifyError || !verify?.onboarding_completed || !verify?.onboarding_completed_at) {
            console.error('[onboarding/complete] Read-back failed:', verifyError);
            return NextResponse.json({ error: 'Verification failed', success: false }, { status: 500 });
        }

        return NextResponse.json({ success: true }); // NUR hier — nach verifiziertem Read-Back
    } catch (error: unknown) {
        console.error('[onboarding/complete] Fatal:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

