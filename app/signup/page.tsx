"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/motion/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

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
                router.refresh()
                return
            }

            // Email confirmation required — show success message
            console.log("✅ Signup successful — email confirmation required")
            setSignupSuccess(true)

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Signup failed"
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
                    <h2 className="text-2xl font-semibold text-[#37352F]">Konto erstellen</h2>
                    <p className="text-[#73726E] mt-2">Starte mit deiner automatisierten Bewerbung</p>
                </div>

                {signupSuccess ? (
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center mx-auto">
                            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-[#37352F]">Bestätigungsmail gesendet!</h3>
                        <p className="text-sm text-[#73726E] leading-relaxed">
                            Wir haben eine E-Mail an <strong className="text-[#37352F]">{email}</strong> gesendet.
                            Klicke auf den Link in der E-Mail, um dein Konto zu aktivieren und mit dem Onboarding zu starten.
                        </p>
                        <p className="text-xs text-[#9B9A97] mt-4">
                            Keine E-Mail erhalten? Prüfe deinen Spam-Ordner oder{" "}
                            <button
                                onClick={() => setSignupSuccess(false)}
                                className="text-[#012e7a] hover:underline font-medium"
                            >
                                versuche es erneut
                            </button>.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSignup} className="space-y-4">
                        {/* Name fields — side by side */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-[#37352F]">Vorname</label>
                                <Input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required
                                    placeholder="Max"
                                    className="border-[#E7E7E5]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-[#37352F]">Nachname</label>
                                <Input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    required
                                    placeholder="Mustermann"
                                    className="border-[#E7E7E5]"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2 text-[#37352F]">E-Mail</label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="max@beispiel.de"
                                className="border-[#E7E7E5]"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2 text-[#37352F]">Passwort</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                placeholder="••••••••"
                                className="border-[#E7E7E5]"
                            />
                            <p className="text-xs text-[#73726E] mt-1">Mindestens 6 Zeichen</p>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-red-600 text-sm">{error}</p>
                            </div>
                        )}

                        <Button type="submit" disabled={loading} className="w-full" variant="primary">
                            {loading ? "Konto wird erstellt..." : "Registrieren"}
                        </Button>
                    </form>
                )}

                <p className="mt-6 text-sm text-center text-[#73726E]">
                    Bereits registriert?{" "}
                    <Link href="/login" className="text-[#012e7a] hover:underline font-medium">
                        Einloggen
                    </Link>
                </p>
            </div >
        </div >
    )
}
