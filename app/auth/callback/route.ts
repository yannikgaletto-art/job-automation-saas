import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Auth Callback Route — handles the email confirmation redirect from Supabase.
 * 
 * Flow: User clicks confirmation link in email → Supabase redirects here with `code` param
 * → We exchange the code for a session → Redirect to /onboarding (or /dashboard if onboarding done).
 * 
 * Required by SICHERHEITSARCHITEKTUR.md Section 1: Server-side session establishment.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/onboarding'

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            console.log('✅ [auth/callback] Session established, redirecting to', next)
            return NextResponse.redirect(`${origin}${next}`)
        }

        console.error('❌ [auth/callback] Code exchange failed:', error.message)
    }

    // If code exchange fails, redirect to login with error hint
    console.error('❌ [auth/callback] No code or exchange failed, redirecting to login')
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
