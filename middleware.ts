import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

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
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
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
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    response.cookies.set({
                        name,
                        value: '',
                        ...options,
                    })
                },
            },
        }
    )

    const { data: { session } } = await supabase.auth.getSession()

    // Public routes that don't require auth
    const publicRoutes = ['/login', '/signup']
    const isPublicRoute = publicRoutes.some(route =>
        request.nextUrl.pathname.startsWith(route)
    )

    // If not logged in and trying to access protected route
    if (!session && !isPublicRoute && request.nextUrl.pathname.startsWith('/dashboard')) {
        const redirectUrl = new URL('/login', request.url)
        console.log("⚠️ Unauthorized access, redirecting to login")
        return NextResponse.redirect(redirectUrl)
    }

    // If logged in and trying to access login/signup
    if (session && isPublicRoute) {
        const redirectUrl = new URL('/dashboard', request.url)
        console.log("✅ Already logged in, redirecting to dashboard")
        return NextResponse.redirect(redirectUrl)
    }

    // Onboarding gate: if logged in and accessing /dashboard, check onboarding status
    // Uses a separate SSR client with SERVICE_ROLE_KEY to bypass RLS (Edge-compatible)
    if (session && request.nextUrl.pathname.startsWith('/dashboard')) {
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
                .eq('user_id', session.user.id)
                .maybeSingle()

            // If no settings row or onboarding not completed → redirect to onboarding
            if (!settings || settings.onboarding_completed !== true) {
                const redirectUrl = new URL('/onboarding', request.url)
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
         */
        '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}

