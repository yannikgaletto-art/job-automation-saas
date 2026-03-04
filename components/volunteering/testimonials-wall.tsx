'use client';

import { motion } from 'framer-motion';

// ─── Seed Data (Phase 1) ──────────────────────────────────────────
const TESTIMONIALS = [
    {
        name: 'Sarah M.',
        text: 'Bei der Berliner Tafel habe ich gelernt, dass Geben und Nehmen keine Einbahnstrasse ist. Die Dankbarkeit der Menschen hat mich tief beruehrt.',
        organization: 'Berliner Tafel',
        role: 'Essensausgabe',
    },
    {
        name: 'Marco K.',
        text: 'Wenn ein Kind zum ersten Mal einen ganzen Satz auf Deutsch sagt und dabei strahlt — das ist ein Moment, den vergisst man nicht mehr.',
        organization: 'Willkommen e.V.',
        role: 'Sprachbegleiter',
    },
    {
        name: 'Lena W.',
        text: 'Ich habe gemerkt: Wenn ich anderen helfe, helfe ich auch mir selbst. Das Ehrenamt war fuer mich ein Anker in einer unsicheren Zeit.',
        organization: 'Gute-Tat Berlin',
        role: 'Pro-Bono Design',
    },
    {
        name: 'Jonas B.',
        text: 'Im Tierheim habe ich gelernt, wieder Verantwortung zu uebernehmen. Die Tiere urteilen nicht — sie brauchen dich einfach.',
        organization: 'Tierheim Berlin',
        role: 'Tierpflege',
    },
];

// ─── Helpers ──────────────────────────────────────────────────────
function getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 82%)`;
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
    return (
        <section>
            <h2 className="text-lg font-semibold text-[#37352F] mb-4">
                Erfahrungsberichte
            </h2>
            <motion.div
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                variants={containerVariants}
                initial="hidden"
                animate="show"
            >
                {TESTIMONIALS.map((t) => (
                    <motion.div
                        key={t.name}
                        variants={cardVariants}
                        className="rounded-xl border border-[#E7E7E5] bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-start gap-3">
                            {/* Avatar */}
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                                style={{ backgroundColor: getAvatarColor(t.name), color: '#37352F' }}
                            >
                                {getInitials(t.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#37352F]">{t.name}</p>
                                <p className="text-xs text-[#A9A9A6]">
                                    {t.role} bei {t.organization}
                                </p>
                            </div>
                        </div>
                        <p className="text-sm text-[#73726E] mt-3 leading-relaxed italic">
                            &ldquo;{t.text}&rdquo;
                        </p>
                    </motion.div>
                ))}
            </motion.div>
        </section>
    );
}
