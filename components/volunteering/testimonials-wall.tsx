'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

// ─── Testimonial indices (keys from locale) ───────────────────────
const TESTIMONIAL_KEYS = ['t1', 't2', 't3', 't4'] as const;

// ─── Helpers ──────────────────────────────────────────────────────
function getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 55%, 82%)`;
}
function getInitials(name: string): string {
    return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Animations ───────────────────────────────────────────────────
const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.12 } },
};
const cardVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// ─── Component ────────────────────────────────────────────────────
export function TestimonialsWall() {
    const t = useTranslations('volunteering');

    const testimonials = TESTIMONIAL_KEYS.map(k => ({
        name: t(`${k}_name` as Parameters<typeof t>[0]),
        role: t(`${k}_role` as Parameters<typeof t>[0]),
        org: t(`${k}_org` as Parameters<typeof t>[0]),
        text: t(`${k}_text` as Parameters<typeof t>[0]),
    }));

    return (
        <section>
            <h2 className="text-lg font-semibold text-[#37352F] mb-4">
                {t('testimonials_title')}
            </h2>
            <motion.div
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                variants={containerVariants}
                initial="hidden"
                animate="show"
            >
                {testimonials.map((testimonial) => (
                    <motion.div
                        key={testimonial.name}
                        variants={cardVariants}
                        className="rounded-xl border border-[#E7E7E5] bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-start gap-3">
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                                style={{ backgroundColor: getAvatarColor(testimonial.name), color: '#37352F' }}
                            >
                                {getInitials(testimonial.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#37352F]">{testimonial.name}</p>
                                <p className="text-xs text-[#A9A9A6]">
                                    {testimonial.role} {t('testimonials_at')} {testimonial.org}
                                </p>
                            </div>
                        </div>
                        <p className="text-sm text-[#73726E] mt-3 leading-relaxed italic">
                            &ldquo;{testimonial.text}&rdquo;
                        </p>
                    </motion.div>
                ))}
            </motion.div>
        </section>
    );
}
