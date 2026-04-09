import { getTranslations } from 'next-intl/server';

export default async function PrivacyPolicyPage() {
    const t = await getTranslations('legal.privacy');
    return (
        <div className="max-w-4xl mx-auto p-8 font-sans text-[#37352F]">
            <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
            <p className="text-sm text-gray-600 mb-8">{t('version')}</p>

            {/* TL;DR Section */}
            <div className="bg-[#F5F5F4] rounded-lg p-6 mb-10 border border-[#E7E7E5]">
                <h2 className="text-lg font-semibold mb-3">{t('tldr_title')}</h2>
                <ul className="space-y-2 text-sm text-[#73726E]">
                    <li>• {t('tldr_1')}</li>
                    <li>• {t('tldr_2')}</li>
                    <li>• {t('tldr_3')}</li>
                    <li>• {t('tldr_4')}</li>
                    <li>• {t('tldr_5')}</li>
                </ul>
            </div>

            <div className="space-y-10">
                {/* 1. Controller */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s1_title')}</h2>
                    <p className="mb-2">{t('s1_intro')}</p>
                    <div className="bg-[#F5F5F4] rounded-lg p-4 text-sm">
                        <p className="font-medium">Pathly</p>
                        <p className="text-[#73726E]">Yannik Galetto</p>
                        <p className="text-[#73726E]">E-Mail: contact@path-ly.eu</p>
                    </div>
                </section>

                {/* 2. Data Categories */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s2_title')}</h2>
                    <p className="mb-3">{t('s2_intro')}</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-[#E7E7E5] rounded-lg">
                            <thead>
                                <tr className="bg-[#F5F5F4]">
                                    <th className="text-left p-3 font-medium">{t('s2_col_category')}</th>
                                    <th className="text-left p-3 font-medium">{t('s2_col_examples')}</th>
                                    <th className="text-left p-3 font-medium">{t('s2_col_purpose')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E7E7E5]">
                                <tr>
                                    <td className="p-3">{t('s2_r1_cat')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r1_ex')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r1_purpose')}</td>
                                </tr>
                                <tr>
                                    <td className="p-3">{t('s2_r2_cat')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r2_ex')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r2_purpose')}</td>
                                </tr>
                                <tr>
                                    <td className="p-3">{t('s2_r3_cat')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r3_ex')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r3_purpose')}</td>
                                </tr>
                                <tr>
                                    <td className="p-3">{t('s2_r4_cat')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r4_ex')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r4_purpose')}</td>
                                </tr>
                                <tr>
                                    <td className="p-3">{t('s2_r5_cat')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r5_ex')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s2_r5_purpose')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* 3. Legal Basis */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s3_title')}</h2>
                    <ul className="space-y-2 text-sm">
                        <li><strong>{t('s3_b_label')}</strong> {t('s3_b_text')}</li>
                        <li><strong>{t('s3_a_label')}</strong> {t('s3_a_text')}</li>
                        <li><strong>{t('s3_f_label')}</strong> {t('s3_f_text')}</li>
                    </ul>
                </section>

                {/* 4. Sub-Processors */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s4_title')}</h2>
                    <p className="mb-3">{t('s4_intro')}</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-[#E7E7E5] rounded-lg">
                            <thead>
                                <tr className="bg-[#F5F5F4]">
                                    <th className="text-left p-3 font-medium">{t('s4_col_provider')}</th>
                                    <th className="text-left p-3 font-medium">{t('s4_col_purpose')}</th>
                                    <th className="text-left p-3 font-medium">{t('s4_col_data')}</th>
                                    <th className="text-left p-3 font-medium">{t('s4_col_location')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E7E7E5]">
                                <tr>
                                    <td className="p-3 font-medium">Supabase (AWS)</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_supabase_purpose')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_supabase_data')}</td>
                                    <td className="p-3 text-[#73726E]">EU (Frankfurt)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Anthropic (Claude)</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_anthropic_purpose')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_anthropic_data')}</td>
                                    <td className="p-3 text-[#73726E]">USA (EU-SCC, ZDR)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">OpenAI</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_openai_purpose')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_openai_data')}</td>
                                    <td className="p-3 text-[#73726E]">USA (EU-SCC, ZDR)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Perplexity</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_perplexity_purpose')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_perplexity_data')}</td>
                                    <td className="p-3 text-[#73726E]">USA (EU-SCC)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">SerpAPI</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_serpapi_purpose')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_serpapi_data')}</td>
                                    <td className="p-3 text-[#73726E]">USA (EU-SCC)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Vercel</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_vercel_purpose')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_vercel_data')}</td>
                                    <td className="p-3 text-[#73726E]">EU (Frankfurt)</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Azure Document Intelligence</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_azure_purpose')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_azure_data')}</td>
                                    <td className="p-3 text-[#73726E]">EU (West Europe)</td>
                                </tr>

                                <tr>
                                    <td className="p-3 font-medium">Jina AI (Reader)</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_jina_purpose')}</td>
                                    <td className="p-3 text-[#73726E]">{t('s4_jina_data')}</td>
                                    <td className="p-3 text-[#73726E]">EU/USA</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="text-sm text-[#73726E] mt-3">
                        {t('s4_scc_note')}
                    </p>
                </section>

                {/* 5. AI Transparency */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s5_title')}</h2>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <p className="text-sm font-medium text-blue-800 mb-2">{t('s5_notice_title')}</p>
                        <p className="text-sm text-blue-700">{t('s5_notice_body')}</p>
                    </div>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <strong>{t('s5_no_training_label')}</strong> {t('s5_no_training_text')}
                        </li>
                        <li>
                            <strong>{t('s5_human_label')}</strong> {t('s5_human_text')}
                        </li>
                        <li>
                            <strong>{t('s5_docs_label')}</strong> {t('s5_docs_text')}
                        </li>
                        <li>
                            <strong>{t('s5_coaching_label')}</strong> {t('s5_coaching_text')}
                        </li>
                    </ul>
                </section>

                {/* 6. Retention */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s6_title')}</h2>
                    <ul className="space-y-2 text-sm">
                        <li><strong>{t('s6_account_label')}</strong> {t('s6_account_text')}</li>
                        <li><strong>{t('s6_docs_label')}</strong> {t('s6_docs_text')}</li>
                        <li><strong>{t('s6_jobs_label')}</strong> {t('s6_jobs_text')}</li>
                        <li><strong>{t('s6_ai_label')}</strong> {t('s6_ai_text')}</li>
                        <li><strong>{t('s6_coaching_label')}</strong> {t('s6_coaching_text')}</li>
                        <li><strong>{t('s6_consent_label')}</strong> {t('s6_consent_text')}</li>
                    </ul>
                </section>

                {/* 7. Security */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s7_title')}</h2>
                    <ul className="space-y-2 text-sm">
                        <li><strong>{t('s7_encryption_label')}</strong> {t('s7_encryption_text')}</li>
                        <li><strong>{t('s7_rls_label')}</strong> {t('s7_rls_text')}</li>
                        <li><strong>{t('s7_location_label')}</strong> {t('s7_location_text')}</li>
                        <li><strong>{t('s7_pii_label')}</strong> {t('s7_pii_text')}</li>
                    </ul>
                </section>

                {/* 8. Your Rights */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s8_title')}</h2>
                    <p className="mb-3 text-sm">{t('s8_intro')}</p>
                    <ul className="space-y-2 text-sm">
                        <li><strong>{t('s8_r15_label')}</strong> {t('s8_r15_text')}</li>
                        <li><strong>{t('s8_r16_label')}</strong> {t('s8_r16_text')}</li>
                        <li><strong>{t('s8_r17_label')}</strong> {t('s8_r17_text')}</li>
                        <li><strong>{t('s8_r18_label')}</strong> {t('s8_r18_text')}</li>
                        <li><strong>{t('s8_r20_label')}</strong> {t('s8_r20_text')}</li>
                        <li><strong>{t('s8_r21_label')}</strong> {t('s8_r21_text')}</li>
                        <li><strong>{t('s8_r7_label')}</strong> {t('s8_r7_text')}</li>
                    </ul>
                    <p className="text-sm text-[#73726E] mt-3">{t('s8_contact')}</p>
                </section>

                {/* 9. Supervisory Authority */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s9_title')}</h2>
                    <p className="text-sm">{t('s9_body')}</p>
                </section>

                {/* 10. Cookies */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s10_title')}</h2>
                    <p className="text-sm">{t('s10_body')}</p>
                </section>

                {/* 11. Changes */}
                <section>
                    <h2 className="text-xl font-semibold mb-3">{t('s11_title')}</h2>
                    <p className="text-sm">{t('s11_body')}</p>
                </section>
            </div>

            <div className="border-t border-[#E7E7E5] mt-10 pt-6 text-sm text-[#73726E]">
                <p>{t('last_updated')}</p>
            </div>
        </div>
    )
}
