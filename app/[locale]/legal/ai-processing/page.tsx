import { getTranslations } from 'next-intl/server';

/**
 * KI-Verarbeitungsrichtlinie — comprehensive AI transparency page.
 *
 * Accessible from:
 * - Onboarding Consent Step 2 ("KI-Dienste" link)
 * - Security/Privacy settings
 * - Footer legal links
 *
 * Covers: EU AI Act Art. 50 transparency, DSGVO Art. 13/22, Anthropic DPA.
 */
export default async function AIProcessingPage() {
    const t = await getTranslations('legal.ai_processing');

    const sections = [
        { key: 's1' },
        { key: 's2' },
        { key: 's3' },
        { key: 's4' },
        { key: 's5' },
        { key: 's6' },
        { key: 's7' },
        { key: 's8' },
    ];

    return (
        <div className="max-w-3xl mx-auto px-6 py-12 font-sans text-[#37352F]">
            {/* Header */}
            <div className="mb-10">
                <h1 className="text-2xl font-bold mb-1">{t('title')}</h1>
                <p className="text-sm text-[#73726E]">{t('version')}</p>
            </div>

            {/* Visual Data Flow — the "Roadmap" */}
            <div className="mb-10 p-5 bg-[#F5F5F4] border border-[#E7E7E5] rounded-xl">
                <h2 className="text-sm font-semibold text-[#37352F] mb-4">{t('flow_title')}</h2>
                <div className="flex flex-col gap-0">
                    {['flow_1', 'flow_2', 'flow_3', 'flow_4', 'flow_5'].map((key, idx, arr) => (
                        <div key={key}>
                            <div className="flex items-start gap-3">
                                <div className="flex flex-col items-center">
                                    <div className="w-7 h-7 rounded-full bg-[#012e7a] text-white text-xs font-bold flex items-center justify-center shrink-0">
                                        {idx + 1}
                                    </div>
                                    {idx < arr.length - 1 && (
                                        <div className="w-0.5 h-6 bg-[#012e7a]/20" />
                                    )}
                                </div>
                                <p className="text-sm text-[#37352F] pt-1">{t(key)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Sections */}
            <div className="space-y-8">
                {sections.map(({ key }) => (
                    <section key={key} className="border-b border-[#E7E7E5] pb-6 last:border-0">
                        <h2 className="text-base font-semibold mb-2">
                            {t(`${key}_title`)}
                        </h2>
                        <div
                            className="text-sm text-[#37352F] leading-relaxed [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mt-2 [&_ul]:space-y-1 [&_li]:text-sm"
                            dangerouslySetInnerHTML={{ __html: String(t.raw(`${key}_body`)) }}
                        />
                    </section>
                ))}
            </div>

            {/* Back link */}
            <div className="mt-10 pt-6 border-t border-[#E7E7E5]">
                <a
                    href="/dashboard"
                    className="text-sm text-[#012e7a] hover:underline font-medium"
                >
                    ← {t('back')}
                </a>
            </div>
        </div>
    );
}
