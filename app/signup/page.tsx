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

    const router = useRouter()
    const supabase = createClient()

    async function handleSignup(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError("")

        const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")

        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/onboarding`,
                    data: {
                        full_name: fullName,
                    },
                }
            })

            if (error) throw error

            console.log("✅ Signup successful")
            router.push("/onboarding")
            router.refresh()

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
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0066FF] to-[#3385FF] flex items-center justify-center">
                            <span className="text-white font-bold text-xl">P</span>
                        </div>
                        <h1 className="text-3xl font-bold text-[#37352F]">Pathly</h1>
                    </div>
                    <h2 className="text-2xl font-semibold text-[#37352F]">Konto erstellen</h2>
                    <p className="text-[#73726E] mt-2">Starte mit deiner automatisierten Bewerbung</p>
                </div>

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

                <p className="mt-6 text-sm text-center text-[#73726E]">
                    Bereits registriert?{" "}
                    <Link href="/login" className="text-[#0066FF] hover:underline font-medium">
                        Einloggen
                    </Link>
                </p>
            </div>
        </div>
    )
}
