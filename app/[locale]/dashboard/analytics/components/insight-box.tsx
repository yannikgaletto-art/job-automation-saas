'use client';

import { motion } from 'framer-motion';

export function InsightBox({ text, icon }: { text: string; icon: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 bg-[#FAFAF9] border border-[#E7E7E5] rounded-lg px-4 py-3"
        >
            <span className="text-base shrink-0">{icon}</span>
            <p className="text-xs text-[#37352F] leading-relaxed">{text}</p>
        </motion.div>
    );
}
