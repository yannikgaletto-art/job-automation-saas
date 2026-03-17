"use client"

import { useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/motion/button"
import { Input } from "@/components/ui/input"
import { Link } from "@/i18n/navigation"

export default function SignupPage() {
    const [firstName, setFirstName] = useState("")
    const [lastName, setLastName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [signupSuccess, setSignupSuccess] = useState(false)

    const router = useRouter()
    const supabase = createClient()
    const t = useTranslations('auth.signup')

    async function handleSignup(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError("")

        const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                    data: {
                        full_name: fullName,
                    },
                }
            })

            if (error) throw error

            // If Supabase returned a session immediately (email confirm disabled),
            // redirect directly to onboarding
            if (data.session) {
                console.log("✅ Signup successful — session active, redirecting to onboarding")
                router.push("/onboarding")
                return
            }

            // Email confirmation required — show success message
            console.log("✅ Signup successful — email confirmation required")
            setSignupSuccess(true)

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('error_default')
            console.error("❌ Signup failed:", msg)
            setError(msg)
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
                    <h2 className="text-2xl font-semibold text-[#37352F]">{t('title')}</h2>
                    <p className="text-[#73726E] mt-2">{t('subtitle')}</p>
                </div>

                {signupSuccess ? (
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center mx-auto">
                            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-[#37352F]">{t('success_title')}</h3>
                        <p className="text-sm text-[#73726E] leading-relaxed"
                           dangerouslySetInnerHTML={{ __html: t('success_message', { email }) }}
                        />
                        <p className="text-xs text-[#9B9A97] mt-4">
                            {t('success_no_email')}{" "}
                            <button
                                onClick={() => setSignupSuccess(false)}
                                className="text-[#012e7a] hover:underline font-medium"
                            >
                                {t('success_retry')}
                            </button>.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSignup} className="space-y-4">
                        {/* Name fields — side by side */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-[#37352F]">{t('first_name_label')}</label>
                                <Input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required
                                    placeholder={t('first_name_placeholder')}
                                    className="border-[#E7E7E5]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-[#37352F]">{t('last_name_label')}</label>
                                <Input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    required
                                    placeholder={t('last_name_placeholder')}
                                    className="border-[#E7E7E5]"
                                />
                            </div>
                        </div>

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
                                minLength={6}
                                placeholder="••••••••"
                                className="border-[#E7E7E5]"
                            />
                            <p className="text-xs text-[#73726E] mt-1">{t('password_hint')}</p>
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
                )}

                <p className="mt-6 text-sm text-center text-[#73726E]">
                    {t('has_account')}{" "}
                    <Link href="/login" className="text-[#012e7a] hover:underline font-medium">
                        {t('sign_in')}
                    </Link>
                </p>
            </div >
        </div >
    )
}
