import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/waitlist/confirm?token=<uuid>
 *
 * Double-Opt-In confirmation endpoint.
 * When user clicks the link in their DOI email, this marks them as confirmed.
 * Redirects to the marketing website with a success message.
 */

// Client created lazily inside GET handler to avoid build-time env var requirement

export async function GET(request: NextRequest) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://path-ly.eu';

    if (!token) {
        return NextResponse.redirect(`${websiteUrl}?waitlist=invalid`);
    }

    // Validate UUID format to prevent SQL injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
        return NextResponse.redirect(`${websiteUrl}?waitlist=invalid`);
    }

    // Find lead by token
    const { data: lead, error: findError } = await supabaseAdmin
        .from('waitlist_leads')
        .select('id, email, confirmed_at')
        .eq('confirmation_token', token)
        .single();

    if (findError || !lead) {
        console.warn(`[waitlist/confirm] Invalid token: ${token.substring(0, 8)}...`);
        return NextResponse.redirect(`${websiteUrl}?waitlist=invalid`);
    }

    // Already confirmed — skip update, still redirect to success
    if (lead.confirmed_at) {
        console.log(`[waitlist/confirm] Already confirmed: ${lead.email.substring(0, 4)}***`);
        return NextResponse.redirect(`${websiteUrl}?waitlist=confirmed`);
    }

    // Confirm the lead
    const { error: updateError } = await supabaseAdmin
        .from('waitlist_leads')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', lead.id);

    if (updateError) {
        console.error('[waitlist/confirm] Update error:', updateError.message);
        return NextResponse.redirect(`${websiteUrl}?waitlist=error`);
    }

    console.log(`✅ [waitlist/confirm] Confirmed: ${lead.email.substring(0, 4)}***`);
    return NextResponse.redirect(`${websiteUrl}?waitlist=confirmed`);
}
