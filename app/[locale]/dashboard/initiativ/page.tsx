import { getTranslations } from 'next-intl/server';
import { Building2, FileText, Radar, Send } from 'lucide-react';

const STEPS = [
    { key: 'strengths', icon: Radar },
    { key: 'signals', icon: Building2 },
    { key: 'brief', icon: FileText },
] as const;

export default async function InitiativPage() {
    const t = await getTranslations('dashboard.initiativ');

    return (
        <div className="mx-auto max-w-6xl space-y-8 pb-12">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#C8D4EA] bg-[#F4F7FC] px-3 py-1 text-xs font-semibold text-[#012e7a]">
                        <Send className="h-3.5 w-3.5" />
                        {t('eyebrow')}
                    </div>
                    <h1 className="text-3xl font-semibold tracking-normal text-[#37352F]">
                        {t('title')}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#73726E]">
                        {t('subtitle')}
                    </p>
                </div>
                <div className="rounded-lg border border-[#E7E7E5] bg-white px-4 py-3 text-sm text-[#73726E] shadow-sm">
                    <span className="font-semibold text-[#37352F]">{t('status_label')}</span>{' '}
                    {t('status_value')}
                </div>
            </header>

            <section className="grid gap-4 md:grid-cols-3">
                {STEPS.map((step, index) => {
                    const Icon = step.icon;
                    return (
                        <article
                            key={step.key}
                            className="rounded-lg border border-[#E7E7E5] bg-white p-5 shadow-sm"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F4F7FC] text-[#012e7a]">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <span className="text-xs font-semibold text-[#A8A29E]">
                                    {t('step_label', { number: index + 1 })}
                                </span>
                            </div>
                            <h2 className="text-base font-semibold text-[#37352F]">
                                {t(`${step.key}_title`)}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[#73726E]">
                                {t(`${step.key}_body`)}
                            </p>
                        </article>
                    );
                })}
            </section>

            <section className="rounded-lg border border-dashed border-[#B9C7E3] bg-[#F8FAFE] p-6">
                <h2 className="text-lg font-semibold text-[#37352F]">
                    {t('next_title')}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#73726E]">
                    {t('next_body')}
                </p>
            </section>
        </div>
    );
}
