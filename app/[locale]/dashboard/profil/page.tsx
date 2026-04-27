import { ActiveCVCard } from "@/components/profil/active-cv-card"
import { LaunchWaitlistCard } from "@/components/profil/launch-waitlist-card"
import { CvMigrationBanner } from "@/components/profil/cv-migration-banner"
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

    // Phase 11: show the post-migration banner only when the user has not
    // yet acknowledged it AND we are still within 24h of the migration date.
    // The Single-CV migration sets cv_migration_seen_at = NOW() for all
    // non-impacted users + every future signup, so a NULL value here means
    // "this user lost CV docs in the migration".
    //
    // MIGRATION_APPLIED_AT is the planned apply date; the 24h window auto-
    // hides the banner for any return visit a day later. If the migration
    // is rolled out on a different day, update this constant to match.
    const MIGRATION_APPLIED_AT = new Date('2026-04-28T00:00:00Z')
    const ONE_DAY_MS = 24 * 60 * 60 * 1000
    const withinOneDay = Date.now() - MIGRATION_APPLIED_AT.getTime() < ONE_DAY_MS

    const { data: profileRow } = await supabase
        .from('user_profiles')
        .select('cv_migration_seen_at')
        .eq('id', user.id)
        .maybeSingle()
    const showMigrationBanner = withinOneDay && !profileRow?.cv_migration_seen_at

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="mb-6">
                <h1 className="text-3xl font-semibold text-[#37352F]">{t('page.title')}</h1>
                <p className="text-sm text-[#73726E] mt-1">{t('page.subtitle')}</p>
            </div>

            <CvMigrationBanner initiallyVisible={showMigrationBanner} />

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
