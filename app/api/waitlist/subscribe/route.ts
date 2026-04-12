import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';

/**
 * POST /api/waitlist/subscribe
 *
 * Public endpoint (no auth required) — called from the Marketing Website.
 * Stores email in waitlist_leads + sends DOI confirmation via Resend.
 *
 * Bot Protection: Honeypot field + Rate Limiting (3/min/IP)
 * DSGVO: Double-Opt-In for newsletter eligibility (Art. 7)
 * Cross-Origin: CORS for pathly-website domain
 */

// Client created lazily inside POST handler to avoid build-time env var requirement



// ─── CORS ────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
    process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://path-ly.eu',
    'http://localhost:3001', // Dev
];

function corsHeaders(origin: string | null) {
    const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

// Preflight
export async function OPTIONS(request: NextRequest) {
    const origin = request.headers.get('origin');
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ─── POST: Subscribe ─────────────────────────────────────────────────
export async function POST(request: NextRequest) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const origin = request.headers.get('origin');
    const headers = corsHeaders(origin);

    try {
        const body = await request.json();
        const { email, locale, honeypot, utmSource } = body as {
            email?: string;
            locale?: string;
            honeypot?: string;
            utmSource?: string;
        };

        // ── Honeypot: invisible field filled = bot ──────────────────
        if (honeypot) {
            // Return success to not reveal detection to bots
            console.log('[waitlist] Honeypot triggered — bot blocked');
            return NextResponse.json({ success: true }, { headers });
        }

        // ── Validation ──────────────────────────────────────────────
        if (!email || typeof email !== 'string') {
            return NextResponse.json({ error: 'email_required' }, { status: 400, headers });
        }

        const trimmed = email.trim().toLowerCase();
        // Basic email regex (server-side validation on top of browser `type="email"`)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmed)) {
            return NextResponse.json({ error: 'invalid_email' }, { status: 400, headers });
        }

        // ── Rate Limit (by IP hash) ─────────────────────────────────
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';
        const ipHash = createHash('sha256').update(ip).digest('hex').substring(0, 16);

        const rateLimited = await checkUpstashLimit(rateLimiters.waitlist, ipHash);
        if (rateLimited) {
            // Override CORS headers on the rate limit response
            const rlHeaders = new Headers(rateLimited.headers);
            Object.entries(headers).forEach(([k, v]) => rlHeaders.set(k, v));
            return new NextResponse(rateLimited.body, {
                status: rateLimited.status,
                headers: rlHeaders,
            });
        }

        // ── Atomic INSERT — race-condition-safe ──────────────────────
        const validLocale = locale && ['de', 'en', 'es'].includes(locale) ? locale : 'de';

        // Single atomic INSERT. ON CONFLICT (email) DO NOTHING means:
        // - New email  → row inserted, .data populated
        // - Duplicate  → no-op, .data is null, error code 23505
        // This is safe under concurrent requests — no race condition possible.
        const { data: lead, error: insertError } = await supabaseAdmin
            .from('waitlist_leads')
            .insert({
                email: trimmed,
                source: 'website',
                locale: validLocale,
                ip_hash: ipHash,
                utm_source: utmSource?.trim() || null,
            })
            .select('id, confirmation_token, confirmed_at')
            .maybeSingle(); // maybeSingle: null on conflict, not an error

        // PostgreSQL unique_violation (23505) = duplicate email
        if (insertError && (insertError as { code?: string }).code === '23505') {
            console.log(`[waitlist] Duplicate (race-safe): ${trimmed.substring(0, 4)}***`);
            return NextResponse.json({ success: true, duplicate: true }, { headers });
        }

        if (insertError) {
            console.error('[waitlist] Insert error:', insertError.message);
            return NextResponse.json({ error: 'save_failed' }, { status: 500, headers });
        }

        // Null data without error = ON CONFLICT DO NOTHING fired (duplicate)
        if (!lead) {
            console.log(`[waitlist] Duplicate (silent): ${trimmed.substring(0, 4)}***`);
            return NextResponse.json({ success: true, duplicate: true }, { headers });
        }

        // ── Fire-and-forget: Resend DOI Confirmation Mail ───────────
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey && lead.confirmation_token) {
            const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.path-ly.eu'}/api/waitlist/confirm?token=${lead.confirmation_token}`;

            const subjectMap: Record<string, string> = {
                de: 'Bitte bestätige deine E-Mail — Pathly Warteliste 🎯',
                en: 'Please confirm your email — Pathly Waitlist 🎯',
                es: 'Confirma tu correo — Lista de espera de Pathly 🎯',
            };

            const htmlMap: Record<string, string> = {
                de: `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FAFAF8;border-radius:12px;">
                      <h2 style="color:#012e7a;font-size:24px;font-weight:700;margin:0 0 8px 0;">Willkommen bei Pathly 🎯</h2>
                      <p style="color:#6B7280;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                        Du hast dich für den Early Access angemeldet. Bitte bestätige deine E-Mail-Adresse, damit wir dich bei Updates auf dem Laufenden halten können.
                      </p>
                      <a href="${confirmUrl}" style="display:inline-block;background:#012e7a;color:#fff;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px;">
                        E-Mail bestätigen →
                      </a>
                      <p style="color:#9CA3AF;font-size:13px;line-height:1.5;margin:24px 0 0 0;">
                        Falls du dich nicht angemeldet hast, ignoriere diese E-Mail einfach.
                      </p>
                      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
                      <p style="color:#9CA3AF;font-size:11px;margin:0;">
                        Pathly · Dein Weg. Deine Bewerbung. Deine KI.<br/>
                        <a href="https://path-ly.eu/impressum" style="color:#9CA3AF;">Impressum</a> · <a href="https://path-ly.eu/datenschutz" style="color:#9CA3AF;">Datenschutz</a>
                      </p>
                    </div>`,
                en: `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FAFAF8;border-radius:12px;">
                      <h2 style="color:#012e7a;font-size:24px;font-weight:700;margin:0 0 8px 0;">Welcome to Pathly 🎯</h2>
                      <p style="color:#6B7280;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                        You signed up for early access. Please confirm your email so we can keep you updated on our progress.
                      </p>
                      <a href="${confirmUrl}" style="display:inline-block;background:#012e7a;color:#fff;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px;">
                        Confirm Email →
                      </a>
                      <p style="color:#9CA3AF;font-size:13px;line-height:1.5;margin:24px 0 0 0;">
                        If you did not sign up, simply ignore this email.
                      </p>
                      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
                      <p style="color:#9CA3AF;font-size:11px;margin:0;">
                        Pathly · Your Path. Your Application. Your AI.<br/>
                        <a href="https://path-ly.eu/impressum" style="color:#9CA3AF;">Legal Notice</a> · <a href="https://path-ly.eu/datenschutz" style="color:#9CA3AF;">Privacy Policy</a>
                      </p>
                    </div>`,
                es: `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FAFAF8;border-radius:12px;">
                      <h2 style="color:#012e7a;font-size:24px;font-weight:700;margin:0 0 8px 0;">Bienvenido a Pathly 🎯</h2>
                      <p style="color:#6B7280;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
                        Te registraste para acceso anticipado. Confirma tu correo para mantenerte informado sobre nuestro progreso.
                      </p>
                      <a href="${confirmUrl}" style="display:inline-block;background:#012e7a;color:#fff;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px;">
                        Confirmar correo →
                      </a>
                      <p style="color:#9CA3AF;font-size:13px;line-height:1.5;margin:24px 0 0 0;">
                        Si no te registraste, simplemente ignora este correo.
                      </p>
                      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
                      <p style="color:#9CA3AF;font-size:11px;margin:0;">
                        Pathly · Tu Camino. Tu Candidatura. Tu IA.<br/>
                        <a href="https://path-ly.eu/impressum" style="color:#9CA3AF;">Aviso Legal</a> · <a href="https://path-ly.eu/datenschutz" style="color:#9CA3AF;">Privacidad</a>
                      </p>
                    </div>`,
            };

            fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: 'Pathly <contact@path-ly.eu>',
                    to: [trimmed],
                    subject: subjectMap[validLocale] || subjectMap.de,
                    html: htmlMap[validLocale] || htmlMap.de,
                }),
            }).catch((err) => console.warn('[waitlist] Resend failed (non-blocking):', err));
        }

        console.log(`✅ [waitlist] New lead: ${trimmed.substring(0, 4)}*** (${validLocale})`);

        return NextResponse.json({ success: true }, { headers });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[waitlist] Error:', errMsg);
        return NextResponse.json({ error: 'server_error' }, { status: 500, headers });
    }
}
