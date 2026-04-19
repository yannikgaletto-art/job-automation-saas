"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, usePathname } from "@/i18n/navigation"
import { useSearchParams } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/motion/button"
import { Input } from "@/components/ui/input"
import { Link } from "@/i18n/navigation"
import { ChevronDown } from "lucide-react"

const LANGUAGES = [
    { code: "de", label: "Deutsch" },
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
] as const

export default function SignupPage() {
    const [firstName, setFirstName] = useState("")
    const [lastName, setLastName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [signupSuccess, setSignupSuccess] = useState(false)
    const [langOpen, setLangOpen] = useState(false)
    const [confirmChecking, setConfirmChecking] = useState(false)
    const [resending, setResending] = useState(false)
    const [pollCount, setPollCount] = useState(0)

    const router = useRouter()
    const pathname = usePathname()
    const supabase = createClient()
    const t = useTranslations('auth.signup')
    const currentLocale = useLocale()
    const searchParams = useSearchParams()
    const referralCode = searchParams.get('ref') || ''

    // Refs to keep credentials stable across polls (avoid stale closures)
    const emailRef = useRef(email)
    const passwordRef = useRef(password)
    useEffect(() => { emailRef.current = email }, [email])
    useEffect(() => { passwordRef.current = password }, [password])

    // ── Poll for email confirmation (cross-device) ──────────────
    // Uses signInWithPassword to check if email has been confirmed.
    // Exponential backoff: 5s → 8s → 12s → 15s to avoid Supabase rate limits.
    useEffect(() => {
        if (!signupSuccess || !emailRef.current || !passwordRef.current) return

        let cancelled = false
        let pollNumber = 0

        async function poll() {
            if (cancelled) return

            try {
                const { data, error: pollError } = await supabase.auth.signInWithPassword({
                    email: emailRef.current,
                    password: passwordRef.current,
                })
                if (data?.session && !cancelled) {
                    console.log("✅ Email confirmed (polling) — redirecting to onboarding")
                    router.push("/onboarding")
                    return
                }
                if (pollError) {
                    console.log(`⏳ Poll #${pollNumber + 1}: ${pollError.message}`)
                }
            } catch (err) {
                console.log("⏳ Poll network error:", err)
            }

            if (cancelled) return

            // Exponential backoff: start at 5s, increase to 15s max
            pollNumber++
            setPollCount(pollNumber)
            const delay = Math.min(5000 + pollNumber * 1500, 15000)
            setTimeout(poll, delay)
        }

        // First poll after 5s
        const initialTimeout = setTimeout(poll, 5000)

        // Also listen for same-device confirmation (auth state change)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_IN" && session && !cancelled) {
                console.log("✅ Email confirmed (auth state change) — redirecting to onboarding")
                router.push("/onboarding")
            }
        })

        return () => {
            cancelled = true
            clearTimeout(initialTimeout)
            subscription.unsubscribe()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signupSuccess])

    // ── Manual "I confirmed" handler ────────────────────────────
    const handleManualConfirm = useCallback(async () => {
        setConfirmChecking(true)
        setError("")
        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email: emailRef.current,
                password: passwordRef.current,
            })
            if (data?.session) {
                console.log("✅ Email confirmed (manual check) — redirecting to onboarding")
                router.push("/onboarding")
                return
            }
            if (signInError) {
                console.log("⏳ Email not yet confirmed:", signInError.message)
                setError(t('confirm_not_yet'))
                setTimeout(() => setError(""), 4000)
            }
        } catch {
            setError(t('error_default'))
        } finally {
            setConfirmChecking(false)
        }
    }, [supabase, router, t])

    // ── Resend confirmation email ───────────────────────────────
    const handleResend = useCallback(async () => {
        setResending(true)
        setError("")
        try {
            const { error: resendError } = await supabase.auth.resend({
                type: 'signup',
                email: emailRef.current,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            })
            if (resendError) {
                console.error("❌ Resend failed:", resendError.message)
                setError(t('error_default'))
            } else {
                setError("")
                // Brief success feedback
                setPollCount(0) // Reset poll counter
            }
        } catch {
            setError(t('error_default'))
        } finally {
            setResending(false)
        }
    }, [supabase, t])

    function handleLanguageChange(code: string) {
        setLangOpen(false)
        router.replace(pathname, { locale: code })
    }

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
                        // Referral: persisted in raw_user_meta_data,
                        // survives OAuth redirects (no sessionStorage needed)
                        ...(referralCode ? { referral_code: referralCode } : {}),
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
            const rawMsg = err instanceof Error ? err.message : ''
            console.error("❌ Signup failed:", rawMsg)

            // Normalize: never expose raw DB/system errors to the user.
            if (rawMsg.includes('already registered') || rawMsg.includes('already been registered')) {
                setError(t('error_already_registered'))
            } else {
                setError(t('error_default'))
            }
        } finally {
            setLoading(false)
        }
    }

    const currentLang = LANGUAGES.find(l => l.code === currentLocale) ?? LANGUAGES[1]

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
            <div className="max-w-md w-full bg-white p-8 rounded-xl border border-[#E7E7E5] shadow-sm">

                {signupSuccess ? (
                    <div className="text-center space-y-5 py-4">
                        <div className="w-16 h-16 rounded-2xl bg-[#012e7a]/10 border border-[#012e7a]/20 flex items-center justify-center mx-auto">
                            <svg className="w-8 h-8 text-[#012e7a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-[#37352F]">{t('success_title')}</h3>
                        <div className="flex items-center justify-center gap-2">
                            <div className="w-2 h-2 bg-[#012e7a] rounded-full animate-pulse" />
                            <p className="text-sm text-[#73726E]">{t('waiting_confirmation')}</p>
                        </div>

                        {/* Manual confirmation button — prominent */}
                        <button
                            onClick={handleManualConfirm}
                            disabled={confirmChecking}
                            className="w-full mt-2 px-4 py-2.5 bg-[#012e7a] text-white text-sm font-medium rounded-lg hover:bg-[#012e7a]/90 transition-colors disabled:opacity-50"
                        >
                            {confirmChecking ? t('confirm_checking') : t('confirm_done_btn')}
                        </button>

                        {error && (
                            <p className="text-xs text-amber-600 mt-1">{error}</p>
                        )}

                        {/* Resend button — actually resends the email */}
                        <p className="text-xs text-[#9B9A97] mt-4">
                            {t('success_no_email')}{" "}
                            <button
                                onClick={handleResend}
                                disabled={resending}
                                className="text-[#012e7a] hover:underline font-medium disabled:opacity-50"
                            >
                                {resending ? '...' : t('success_retry')}
                            </button>.
                        </p>

                        {/* Poll status indicator */}
                        {pollCount > 0 && (
                            <p className="text-xs text-[#9B9A97]">
                                {pollCount > 6
                                    ? 'Tipp: Öffne den Bestätigungslink auf diesem Gerät, dann klicke oben auf den Button.'
                                    : `Prüfe automatisch... (${pollCount})`
                                }
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#012e7a] to-[#1a4a9a] flex items-center justify-center">
                                <span className="text-white font-bold text-xl">P</span>
                            </div>
                            <h1 className="text-3xl font-bold text-[#37352F]">Pathly</h1>
                        </div>
                        {/* Language selector */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setLangOpen(!langOpen)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#37352F] bg-[#F5F5F4] border border-[#E7E7E5] rounded-lg hover:bg-[#EBEBEA] transition-colors"
                            >
                                {currentLang.label}
                                <ChevronDown className={`w-3.5 h-3.5 text-[#73726E] transition-transform ${langOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {langOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                                    <div className="absolute right-0 mt-1 w-36 bg-white border border-[#E7E7E5] rounded-lg shadow-lg z-20 py-1">
                                        {LANGUAGES.map((lang) => (
                                            <button
                                                key={lang.code}
                                                type="button"
                                                onClick={() => handleLanguageChange(lang.code)}
                                                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                                    lang.code === currentLocale
                                                        ? 'text-[#012e7a] font-medium bg-[#F5F5F4]'
                                                        : 'text-[#37352F] hover:bg-[#F5F5F4]'
                                                }`}
                                            >
                                                {lang.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <h2 className="text-2xl font-semibold text-[#37352F]">{t('title')}</h2>
                </div>
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

                <p className="mt-6 text-sm text-center text-[#73726E]">
                    {t('has_account')}{" "}
                    <Link href="/login" className="text-[#012e7a] hover:underline font-medium">
                        {t('sign_in')}
                    </Link>
                </p>
                    </>
                )}
            </div >
        </div >
    )
}
