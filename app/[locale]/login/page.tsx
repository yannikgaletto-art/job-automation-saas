"use client"

import { useState, Suspense } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/motion/button"
import { Input } from "@/components/ui/input"
import { Link } from "@/i18n/navigation"

/**
 * LoginForm — requires Suspense boundary due to useSearchParams
 */
function LoginForm() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const t = useTranslations('auth.login')

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
            // Use window.location.href (not router.push) to ensure full page
            // reload so Supabase session cookie is picked up by the callback page
            const returnTo = searchParams.get('returnTo')
            if (returnTo) {
                window.location.href = decodeURIComponent(returnTo)
            } else {
                router.push("/dashboard")
                router.refresh()
            }

        } catch (err: any) {
            console.error("❌ Login failed:", err.message)
            setError(err.message || t('error_invalid'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
            <div className="max-w-md w-full bg-white p-8 rounded-xl border border-[#E7E7E5] shadow-sm">
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#012e7a] to-[#1a4a9a] flex items-center justify-center">
                            <span className="text-white font-bold text-xl">P</span>
                        </div>
                        <h1 className="text-3xl font-bold text-[#37352F]">Pathly</h1>
                    </div>
                    <h2 className="text-2xl font-semibold text-[#37352F]">{t('welcome')}</h2>
                    <p className="text-[#73726E] mt-2">{t('subtitle')}</p>
                </div>

                {/* Cross-device confirmation banner */}
                {searchParams.get('confirmed') === 'true' && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-medium text-green-800 mb-1">E-Mail bestätigt!</p>
                        <p className="text-xs text-green-700">
                            Dein Konto ist verifiziert. Falls du dich auf einem anderen Gerät angemeldet hast, kehre dorthin zurück, die Anmeldung wird automatisch erkannt. Oder logge dich hier ein.
                        </p>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2 text-[#37352F]">{t('email_label')}</label>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder={t('email_placeholder')}
                            className="border-[#E7E7E5]"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2 text-[#37352F]">{t('password_label')}</label>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            className="border-[#E7E7E5]"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-600 text-sm">{error}</p>
                        </div>
                    )}

                    <Button type="submit" disabled={loading} className="w-full" variant="primary">
                        {loading ? t('submitting') : t('submit')}
                    </Button>
                </form>

                <p className="mt-6 text-sm text-center text-[#73726E]">
                    {t('no_account')}{" "}
                    <Link href="/signup" className="text-[#012e7a] hover:underline font-medium">
                        {t('sign_up')}
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
