import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);



/**
 * POST /api/feedback/submit
 *
 * Stores user feedback in EU-only Supabase (Frankfurt).
 * Fire-and-forget Resend email notification to Yannik.
 * Contracts: §8 (Auth Guard), §3 (user-scoped INSERT)
 */
export async function POST(request: NextRequest) {
    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limit (Upstash Redis)
        const rateLimited = await checkUpstashLimit(rateLimiters.feedback, user.id);
        if (rateLimited) return rateLimited;

        // Input validation
        const body = await request.json();
        const { feedback, name, locale } = body as {
            feedback?: string;
            name?: string;
            locale?: string;
        };

        if (!feedback || typeof feedback !== 'string') {
            return NextResponse.json({ error: 'Missing feedback' }, { status: 400 });
        }

        const trimmed = feedback.trim();
        if (trimmed.length < 10) {
            return NextResponse.json({ error: 'Feedback must be at least 10 characters' }, { status: 400 });
        }
        if (trimmed.length > 5000) {
            return NextResponse.json({ error: 'Feedback too long (max 5000 characters)' }, { status: 400 });
        }

        // Insert — user-scoped via RLS + explicit user_id
        const { error: insertError } = await supabaseAdmin
            .from('user_feedback')
            .insert({
                user_id: user.id,
                feedback: trimmed,
                name: name?.trim() || null,
                locale: locale && ['de', 'en', 'es'].includes(locale) ? locale : 'de',
            });

        if (insertError) {
            console.error('[feedback/submit] Insert error:', insertError.message);
            return NextResponse.json({ error: 'save_failed' }, { status: 500 });
        }

        // ── Fire-and-forget: Resend email notification ──────────────────────────
        // Failure here does NOT block the 200 response to the user.
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
            const fullName = name?.trim() || user.email || 'Anonymous';
            const senderDisplay = fullName.split(' ')[0]; // First name only
            const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

            fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: 'Pathly Feedback <noreply@path-ly.eu>',
                    to: ['galettoyannik7@gmail.com', 'contact@path-ly.eu'],
                    subject: `💬 Neues Feedback von ${senderDisplay}`,
                    html: `
                        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FAFAF8;border-radius:12px;">
                          <h2 style="color:#1C1917;font-size:22px;font-weight:600;margin:0 0 4px 0;">Neues Feedback erhalten 💬</h2>
                          <p style="color:#9A9086;font-size:13px;margin:0 0 24px 0;">${timestamp} · ${locale?.toUpperCase() ?? 'DE'}</p>
                          <div style="background:#fff;border:1px solid #E0DDD8;border-radius:10px;padding:20px 24px;margin-bottom:24px;">
                            <p style="color:#1C1917;font-size:15px;line-height:1.75;margin:0;">${trimmed.replace(/\n/g, '<br>')}</p>
                          </div>
                          <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <tr><td style="padding:5px 0;color:#9A9086;width:80px;">Von</td><td style="padding:5px 0;color:#1C1917;font-weight:500;">${senderDisplay}</td></tr>
                            <tr><td style="padding:5px 0;color:#9A9086;">E-Mail</td><td style="padding:5px 0;color:#1C1917;">${user.email ?? '—'}</td></tr>
                            <tr><td style="padding:5px 0;color:#9A9086;">User ID</td><td style="padding:5px 0;color:#A8A29E;font-size:11px;font-family:monospace;">${user.id}</td></tr>
                          </table>
                        </div>
                    `,
                }),
            }).catch((err) => console.warn('[feedback/submit] Resend failed (non-blocking):', err));
        }

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[feedback/submit] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
