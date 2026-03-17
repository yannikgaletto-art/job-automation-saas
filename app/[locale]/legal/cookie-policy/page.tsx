import { getTranslations } from 'next-intl/server';

export default async function CookiePolicyPage() {
    const t = await getTranslations('legal.cookie_policy');
    return (
        <div className="max-w-4xl mx-auto p-8 font-sans text-[#37352F]">
            <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
            <p className="text-sm text-gray-600 mb-8">{t('version')}</p>

            <div className="space-y-6">
                <section>
                    <h2 className="text-xl font-semibold mb-2">{t('s1_title')}</h2>
                    <p dangerouslySetInnerHTML={{ __html: String(t.raw('s1_body')) }} />
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-2">{t('s2_title')}</h2>
                    <p dangerouslySetInnerHTML={{ __html: String(t.raw('s2_body')) }} />
                </section>
            </div>
        </div>
    )
}
