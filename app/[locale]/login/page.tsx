"use client"

import { useState, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/motion/button"
import { Input } from "@/components/ui/input"
import { Link } from "@/i18n/navigation"

type View = 'login' | 'forgot' | 'forgot_sent'

/**
 * LoginForm — handles Login + "Passwort vergessen" as view states.
 * Reduce Complexity: No separate /forgot-password route needed.
 * Requires Suspense boundary due to useSearchParams.
 */
function LoginForm() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [view, setView] = useState<View>('login')

    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const t = useTranslations('auth')

    // ── Login Handler ──────────────────────────────────────────────
    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) throw error

            console.log("✅ Login successful")

            // Respect returnTo — critical for extension PKCE auth flow
            const returnTo = searchParams.get('returnTo')
            if (returnTo) {
                window.location.href = decodeURIComponent(returnTo)
            } else {
                router.push("/dashboard")
                router.refresh()
            }

        } catch (err: any) {
            console.error("❌ Login failed:", err.message)
            setError(err.message || t('login.error_invalid'))
        } finally {
            setLoading(false)
        }
    }

    // ── Forgot Password Handler ────────────────────────────────────
    async function handleForgotPassword(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError("")

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
            })

            if (error) throw error

            setView('forgot_sent')
        } catch (err: any) {
            console.error("❌ Password reset failed:", err.message)
            setError(err.message || t('forgot_password.error'))
        } finally {
            setLoading(false)
        }
    }

    // ── Shared Header ──────────────────────────────────────────────
    const header = (
        <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#012e7a] to-[#1a4a9a] flex items-center justify-center">
                    <span className="text-white font-bold text-xl">P</span>
                </div>
                <h1 className="text-3xl font-bold text-[#37352F]">Pathly</h1>
            </div>
            <h2 className="text-2xl font-semibold text-[#37352F]">
                {view === 'login' ? t('login.welcome') : t('forgot_password.title')}
            </h2>
            <p className="text-[#73726E] mt-2">
                {view === 'login' ? t('login.subtitle') : t('forgot_password.subtitle')}
            </p>
        </div>
    )

    // ── Banners ────────────────────────────────────────────────────
    const confirmationBanner = searchParams.get('confirmed') === 'true' && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-medium text-green-800 mb-1">E-Mail bestätigt!</p>
            <p className="text-xs text-green-700">
                Dein Konto ist verifiziert. Bitte kehre zu deinem Hauptbildschirm zurück. Der Onboarding-Prozess wartet schon auf dich.
            </p>
        </div>
    )

    const resetExpiredBanner = searchParams.get('error') === 'reset_link_expired' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-800 mb-1">{t('forgot_password.link_expired_title')}</p>
            <p className="text-xs text-amber-700">{t('forgot_password.link_expired_message')}</p>
        </div>
    )

    // ── Error Display ──────────────────────────────────────────────
    const errorDisplay = error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
        </div>
    )

    // ── VIEW: Forgot Password — Sent Confirmation ──────────────────
    if (view === 'forgot_sent') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
                <div className="max-w-md w-full bg-white p-8 rounded-xl border border-[#E7E7E5] shadow-sm">
                    {header}
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-6">
                        <p className="text-sm font-medium text-green-800 mb-1">
                            {t('forgot_password.success_title')}
                        </p>
                        <p className="text-xs text-green-700">
                            {t('forgot_password.success_message')}
                        </p>
                    </div>
                    <button
                        onClick={() => { setView('login'); setError("") }}
                        className="text-sm text-[#012e7a] hover:underline font-medium"
                    >
                        {t('forgot_password.back_to_login')}
                    </button>
                </div>
            </div>
        )
    }

    // ── VIEW: Forgot Password — Email Input ────────────────────────
    if (view === 'forgot') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
                <div className="max-w-md w-full bg-white p-8 rounded-xl border border-[#E7E7E5] shadow-sm">
                    {header}

                    <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2 text-[#37352F]">{t('login.email_label')}</label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder={t('login.email_placeholder')}
                                className="border-[#E7E7E5]"
                            />
                        </div>

                        {errorDisplay}

                        <Button type="submit" disabled={loading} className="w-full" variant="primary">
                            {loading ? t('forgot_password.submitting') : t('forgot_password.submit')}
                        </Button>
                    </form>

                    <button
                        onClick={() => { setView('login'); setError("") }}
                        className="mt-6 text-sm text-[#012e7a] hover:underline font-medium block mx-auto"
                    >
                        {t('forgot_password.back_to_login')}
                    </button>
                </div>
            </div>
        )
    }

    // ── VIEW: Login (Default) ──────────────────────────────────────
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
            <div className="max-w-md w-full bg-white p-8 rounded-xl border border-[#E7E7E5] shadow-sm">
                {header}

                {confirmationBanner}
                {resetExpiredBanner}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2 text-[#37352F]">{t('login.email_label')}</label>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder={t('login.email_placeholder')}
                            className="border-[#E7E7E5]"
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-[#37352F]">{t('login.password_label')}</label>
                            <button
                                type="button"
                                onClick={() => { setView('forgot'); setError("") }}
                                className="text-xs text-[#012e7a] hover:underline font-medium"
                            >
                                {t('login.forgot_password')}
                            </button>
                        </div>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            className="border-[#E7E7E5]"
                        />
                    </div>

                    {errorDisplay}

                    <Button type="submit" disabled={loading} className="w-full" variant="primary">
                        {loading ? t('login.submitting') : t('login.submit')}
                    </Button>
                </form>

                <p className="mt-6 text-sm text-center text-[#73726E]">
                    {t('login.no_account')}{" "}
                    <Link href="/signup" className="text-[#012e7a] hover:underline font-medium">
                        {t('login.sign_up')}
                    </Link>
                </p>
            </div>
        </div>
    )
}

/**
 * LoginPage — Suspense boundary required for useSearchParams in Next.js App Router
 */
export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
                <div className="w-8 h-8 border-2 border-[#012e7a] border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <LoginForm />
        </Suspense>
    )
}
