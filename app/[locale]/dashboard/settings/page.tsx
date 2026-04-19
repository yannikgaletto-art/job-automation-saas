import { ActiveCVCard } from "./active-cv-card"
import { LanguageToggleCard } from "./language-toggle-card"
import { CheckinSettingsCard } from "./checkin-settings-card"
import { TourResetCard } from "./tour-reset-card"
import { CreditUsageCard } from "./credit-usage-card"
import { ReferralCard } from "./referral-card"
import { SettingsTabs } from "./settings-tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Globe, GraduationCap, Zap, Gift } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

export default async function SettingsPage() {
    // Server-side auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const t = await getTranslations('settings')

    return (
        <div className="max-w-5xl mx-auto">
            {/* Page Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-semibold text-[#37352F]">{t('page.title')}</h1>
                <p className="text-sm text-[#73726E] mt-1">{t('page.subtitle')}</p>
            </div>

            {/* Tab System — client wrapper, Konto content as children */}
            <SettingsTabs>
                {/* === KONTO TAB CONTENT (server-rendered) === */}

                {/* Credits & Usage Section */}
                <Card className="bg-white border-[#E7E7E5] shadow-sm mb-6">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl text-[#37352F] flex items-center gap-2">
                            <Zap className="h-5 w-5 text-[#012e7a]" />
                            {t('credits.title')}
                        </CardTitle>
                        <CardDescription className="text-[#73726E]">
                            {t('credits.description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CreditUsageCard />
                    </CardContent>
                </Card>

                {/* Referral CTA — directly below Credits */}
                <Card className="bg-white border-[#E7E7E5] shadow-sm mb-6">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl text-[#37352F] flex items-center gap-2">
                            <Gift className="h-5 w-5 text-[#012e7a]" />
                            {t('referral.card_title')}
                        </CardTitle>
                        <CardDescription className="text-[#73726E]">
                            {t('referral.card_description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ReferralCard />
                    </CardContent>
                </Card>
                <Card className="bg-white border-[#E7E7E5] shadow-sm mb-6">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl text-[#37352F] flex items-center gap-2">
                            <Globe className="h-5 w-5 text-[#012e7a]" />
                            {t('language.title')}
                        </CardTitle>
                        <CardDescription className="text-[#73726E]">
                            {t('language.description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <LanguageToggleCard />
                    </CardContent>
                </Card>

                {/* Mood Check-in Reactivation — only visible when auto-hidden */}
                <div className="mb-6">
                    <CheckinSettingsCard />
                </div>

                {/* Tour Reset — replay any tab tour */}
                <Card className="bg-white border-[#E7E7E5] shadow-sm mb-6">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl text-[#37352F] flex items-center gap-2">
                            <GraduationCap className="h-5 w-5 text-[#012e7a]" />
                            {t('tours.section_title')}
                        </CardTitle>
                        <CardDescription className="text-[#73726E]">
                            {t('tours.section_description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <TourResetCard />
                    </CardContent>
                </Card>

                {/* Document Management Section */}
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
            </SettingsTabs>
        </div>
    )
}
