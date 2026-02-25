import { ActiveCVCard } from "./active-cv-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Settings as SettingsIcon } from "lucide-react"
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
                    <SettingsIcon className="h-8 w-8 text-[#0066FF]" />
                    <h1 className="text-3xl font-bold text-[#37352F]">Settings</h1>
                </div>
                <p className="text-[#73726E]">
                    Manage your documents and personal information
                </p>
            </div>

            {/* Document Management Section */}
            <Card className="bg-white border-[#E7E7E5] shadow-sm mb-8">
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

            {/* Additional Settings Placeholder */}
            <Card className="bg-white border-[#E7E7E5] shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl text-[#37352F]">Additional Settings</CardTitle>
                    <CardDescription className="text-[#73726E]">
                        More configuration options coming soon...
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="bg-[#F7F7F5] border border-[#E7E7E5] rounded-lg p-8 text-center">
                        <p className="text-[#73726E]">
                            Stay tuned for profile preferences, notification settings, and more!
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
