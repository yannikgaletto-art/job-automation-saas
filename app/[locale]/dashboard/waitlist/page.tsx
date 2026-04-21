import { Clock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

/**
 * Waitlist Page — shown when the Free Trial cohort is full.
 * 
 * Clean, minimal page in Pathly design (no emojis, professional typography).
 * Users see this after onboarding completes with waitlisted: true.
 */
export default async function WaitlistPage() {
    const t = await getTranslations('waitlist');

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4">
            <div className="max-w-md w-full text-center">
                {/* Icon */}
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#012e7a]/10">
                    <Clock className="w-8 h-8 text-[#012e7a]" />
                </div>

                {/* Heading */}
                <h1 className="text-2xl font-bold text-[#37352F] mb-3">
                    {t('title')}
                </h1>

                {/* Description */}
                <p className="text-sm text-[#73726E] leading-relaxed mb-8 max-w-[36ch] mx-auto">
                    {t('description')}
                </p>

                {/* Status badge */}
                <div className="inline-flex items-center gap-2 bg-[#012e7a]/5 text-[#012e7a] px-5 py-2.5 rounded-full text-sm font-medium mb-8">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#012e7a]/40" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#012e7a]" />
                    </span>
                    {t('status')}
                </div>

                {/* CTA */}
                <div>
                    <Link
                        href="/"
                        className="inline-block w-full py-3 rounded-xl bg-[#012e7a] hover:bg-[#023a97] text-white text-sm font-semibold transition-colors"
                    >
                        {t('cta')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
