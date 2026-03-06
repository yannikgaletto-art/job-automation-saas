import { ActiveCVCard } from "./active-cv-card"
import { ProfileCard } from "./profile-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, User, Sparkles } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function SettingsPage() {
    // Server-side auth check
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
        redirect("/login")
    }

    return (
        <div className="p-8 max-w-5xl mx-auto">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-[#0066FF]/10 to-[#0066FF]/5 rounded-xl">
                        <Sparkles className="h-6 w-6 text-[#0066FF]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-[#37352F]">Dein Karriere-Profil</h1>
                        <p className="text-sm text-[#73726E]">
                            Je mehr Pathly über dich weiß, desto besser werden deine Bewerbungen.
                        </p>
                    </div>
                </div>
            </div>

            {/* Profile Context Section */}
            <Card className="bg-white border-[#E7E7E5] shadow-sm mb-6">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl text-[#37352F] flex items-center gap-2">
                        <User className="h-5 w-5 text-[#0066FF]" />
                        Persönlicher Kontext
                    </CardTitle>
                    <CardDescription className="text-[#73726E]">
                        Diese Informationen helfen der KI, deine Bewerbungen zu personalisieren.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ProfileCard />
                </CardContent>
            </Card>

            {/* Document Management Section */}
            <Card className="bg-white border-[#E7E7E5] shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl text-[#37352F] flex items-center gap-2">
                        <FileText className="h-5 w-5 text-[#0066FF]" />
                        Meine Dokumente
                    </CardTitle>
                    <CardDescription className="text-[#73726E]">
                        Dein Lebenslauf und Anschreiben — werden für CV-Match, Optimierung und Bewerbungserstellung verwendet.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ActiveCVCard />
                </CardContent>
            </Card>
        </div>
    )
}
