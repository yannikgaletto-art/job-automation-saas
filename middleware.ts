import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

// next-intl middleware for locale detection and routing
const intlMiddleware = createIntlMiddleware(routing)

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // ─── Skip locale handling for non-page routes ──────────────────────
    // API routes, auth callbacks, static files — no locale prefix
    if (
        pathname.startsWith('/api') ||
        pathname.startsWith('/auth') ||
        pathname.startsWith('/v/') ||
        pathname.startsWith('/_next') ||
        pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
    ) {
        return NextResponse.next()
    }

    // ─── Extract locale from pathname ──────────────────────────────────
    // Matches /de, /en, /es with optional trailing content
    const localeMatch = pathname.match(/^\/(de|en|es)(\/|$)/)
    const locale = localeMatch ? localeMatch[1] : routing.defaultLocale

    // Strip locale prefix for route matching
    const pathnameWithoutLocale = localeMatch
        ? pathname.slice(localeMatch[1].length + 1) // e.g. /de/dashboard → /dashboard
        : pathname

    // ─── Supabase Auth Client ──────────────────────────────────────────
    let response = intlMiddleware(request)

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                    response = intlMiddleware(request)
                    response.cookies.set({
                        name,
                        value,
                        ...options,
                    })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                    response = intlMiddleware(request)
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // ─── Public routes that don't require auth ─────────────────────────
    const publicPathnames = ['/login', '/signup', '/legal']
    const isPublicRoute = publicPathnames.some(route =>
        pathnameWithoutLocale.startsWith(route) || pathnameWithoutLocale === ''
    )

    // ─── Protected routes that require auth ────────────────────────────
    const isProtectedRoute = pathnameWithoutLocale.startsWith('/dashboard') ||
        pathnameWithoutLocale.startsWith('/onboarding')

    // If not logged in and trying to access protected route → redirect to login
    if (!user && !isPublicRoute && isProtectedRoute) {
        const redirectUrl = new URL(`/${locale}/login`, request.url)
        console.log("⚠️ Unauthorized access, redirecting to login")
        return NextResponse.redirect(redirectUrl)
    }

    // If logged in and trying to access login/signup → redirect to dashboard
    if (user && (pathnameWithoutLocale === '/login' || pathnameWithoutLocale === '/signup')) {
        const redirectUrl = new URL(`/${locale}/dashboard`, request.url)
        console.log("✅ Already logged in, redirecting to dashboard")
        return NextResponse.redirect(redirectUrl)
    }

    // ─── Onboarding gate: check if onboarding is completed ────────────
    if (user && pathnameWithoutLocale.startsWith('/dashboard')) {
        try {
            const supabaseAdmin = createServerClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                {
                    cookies: {
                        get() { return undefined },
                        set() { },
                        remove() { },
                    },
                }
            )

            const { data: settings } = await supabaseAdmin
                .from('user_settings')
                .select('onboarding_completed')
                .eq('user_id', user.id)
                .maybeSingle()

            // If no settings row or onboarding not completed → redirect to onboarding
            if (!settings || settings.onboarding_completed !== true) {
                const redirectUrl = new URL(`/${locale}/onboarding`, request.url)
                return NextResponse.redirect(redirectUrl)
            }
        } catch (err) {
            // Don't block dashboard access on settings query failure
            console.error('[middleware] Onboarding check failed:', err)
        }
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - api (API routes)
         * - auth (Supabase auth callbacks)
         * - v/ (video sharing pages)
         */
        '/((?!_next/static|_next/image|favicon.ico|api|auth|v/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
