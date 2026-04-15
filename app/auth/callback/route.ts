import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Auth Callback Route — handles the email confirmation redirect from Supabase.
 *
 * Flow: User clicks confirmation link in email → Supabase redirects here with `code` param
 * → We exchange the code for a session → Redirect to /{locale}/onboarding (or dashboard).
 *
 * IMPORTANT: This route is excluded from middleware locale-handling (see middleware matcher).
 * We must manually detect locale from the `next` param or default to 'de'.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // `next` is passed from the signup emailRedirectTo URL if explicitly set
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

        console.error('❌ [auth/callback] Code exchange failed:', error.message)
    }

    // If code exchange fails, redirect to login with error hint
    console.error('❌ [auth/callback] No code or exchange failed, redirecting to login')
    return NextResponse.redirect(`${origin}/de/login?error=auth_callback_failed`)
}
