import { ActiveCVCard } from "@/components/profil/active-cv-card"
import { LaunchWaitlistCard } from "@/components/profil/launch-waitlist-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Rocket } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

export default async function ProfilPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const t = await getTranslations('profil')

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="mb-6">
                <h1 className="text-3xl font-semibold text-[#37352F]">{t('page.title')}</h1>
                <p className="text-sm text-[#73726E] mt-1">{t('page.subtitle')}</p>
            </div>

            <Card className="bg-white border-[#E7E7E5] shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl text-[#37352F] flex items-center gap-2">
                        <FileText className="h-5 w-5 text-[#012e7a]" />
                        {t('documents.title')}
                    </CardTitle>
                    <CardDescription className="text-[#73726E]">
                        {t('documents.description')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ActiveCVCard />
                </CardContent>
            </Card>

            <Card className="bg-white border-[#E7E7E5] shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl text-[#37352F] flex items-center gap-2">
                        <Rocket className="h-5 w-5 text-[#012e7a]" />
                        {t('launch_waitlist.title')}
                    </CardTitle>
                    <CardDescription className="text-[#73726E]">
                        {t('launch_waitlist.description')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <LaunchWaitlistCard />
                </CardContent>
            </Card>
        </div>
    )
}
