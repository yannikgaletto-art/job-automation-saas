"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/motion/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    const router = useRouter()
    const supabase = createClient()

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
            router.push("/dashboard")
            router.refresh()

        } catch (err: any) {
            console.error("❌ Login failed:", err.message)
            setError(err.message || "Invalid credentials")
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
                    <h2 className="text-2xl font-semibold text-[#37352F]">Welcome back</h2>
                    <p className="text-[#73726E] mt-2">Sign in to your account to continue</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2 text-[#37352F]">Email</label>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="your@email.com"
                            className="border-[#E7E7E5]"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2 text-[#37352F]">Password</label>
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
                        {loading ? "Signing in..." : "Sign In"}
                    </Button>
                </form>

                <p className="mt-6 text-sm text-center text-[#73726E]">
                    Don't have an account?{" "}
                    <Link href="/signup" className="text-[#0066FF] hover:underline font-medium">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    )
}
