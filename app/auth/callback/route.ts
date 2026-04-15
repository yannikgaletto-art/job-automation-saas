import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Auth Callback Route — handles the email confirmation redirect from Supabase.
 *
 * TWO scenarios:
 *
 * 1. SAME DEVICE: User signed up on this browser, clicks confirmation link here.
 *    → code_verifier exists in cookies → exchangeCodeForSession succeeds
 *    → Session established, redirect to /onboarding ✅
 *
 * 2. CROSS DEVICE: User signed up on desktop, clicks link on phone.
 *    → code_verifier NOT in this browser → exchangeCodeForSession FAILS
 *    → BUT: Supabase still marks the email as confirmed when the link is visited!
 *    → The desktop polling will detect this and sign in automatically.
 *    → Show a "return to your original browser" message instead of login page.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/onboarding'

    // Detect locale from the `next` param, or fall back to 'de'
    const localeMatch = next.match(/^\/(de|en|es)\//)
    const locale = localeMatch ? localeMatch[1] : 'de'

    // Build the locale-prefixed target path
    const localizedNext = next.startsWith(`/${locale}`) ? next : `/${locale}${next}`

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            console.log('✅ [auth/callback] Session established, redirecting to', localizedNext)
            return NextResponse.redirect(`${origin}${localizedNext}`)
        }

        // Code exchange failed — most likely cross-device PKCE mismatch.
        // The email IS confirmed in Supabase, but we can't establish a session here.
        // Redirect to a friendly page instead of login.
        console.log('⚠️ [auth/callback] Code exchange failed (likely cross-device):', error.message)

        // Redirect to login with a special flag that shows a helpful message
        return NextResponse.redirect(
            `${origin}/${locale}/login?confirmed=true`
        )
    }

    // No code at all — shouldn't happen normally
    console.error('❌ [auth/callback] No code provided')
    return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback_failed`)
}
