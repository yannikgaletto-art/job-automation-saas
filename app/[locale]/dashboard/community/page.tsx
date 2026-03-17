'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import {
    ArrowRight, Repeat, HelpCircle, Rocket, Plus, Search,
    Loader2,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';

// ─── Types ────────────────────────────────────────────────────────
interface SearchResult {
    id: string;
    community_slug: string;
    title: string;
    post_type: string;
    display_name: string;
    created_at: string;
}

// ─── Community Slugs (keys only — labels from t()) ───────────────
const COMMUNITY_SLUGS = [
    { slug: 'skill-share', icon: Repeat, titleKey: 'Skill-Share', descKey: 'skill_share_desc', gradient: 'from-blue-100/60 to-indigo-200/60', iconColor: 'text-blue-500', hoverBorder: 'hover:border-blue-200', image: '/images/community/skill-share.png' },
    { slug: 'career', icon: HelpCircle, titleKey: 'Career Questions', descKey: 'career_desc', gradient: 'from-amber-100/60 to-orange-200/60', iconColor: 'text-amber-500', hoverBorder: 'hover:border-amber-200', image: '/images/community/career.png' },
    { slug: 'entrepreneurship', icon: Rocket, titleKey: 'Entrepreneurship', descKey: 'entrepreneurship_desc', gradient: 'from-emerald-100/60 to-teal-200/60', iconColor: 'text-emerald-500', hoverBorder: 'hover:border-emerald-200', image: '/images/community/entrepreneurship.png' },
] as const;

// ─── Animations ───────────────────────────────────────────────────
const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// ─── Helpers ──────────────────────────────────────────────────────
function getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 60%, 85%)`;
}
function getInitials(name: string): string {
    if (!name || !name.trim()) return '?';
    return name.split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ─── Search Component ─────────────────────────────────────────────
function CommunitySearch() {
    const t = useTranslations('community');
    const locale = useLocale();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowResults(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function formatRelativeTime(dateStr: string): string {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return t('time_just_now');
        if (mins < 60) return t('time_minutes', { n: mins });
        const hours = Math.floor(mins / 60);
        if (hours < 24) return t('time_hours', { n: hours });
        const days = Math.floor(hours / 24);
        if (days < 7) return t('time_days', { n: days });
        return new Date(dateStr).toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    }

    const doSearch = async (q: string) => {
        if (q.length < 2) { setResults([]); setShowResults(false); return; }
        setSearching(true);
        try {
            const res = await fetch(`/api/community/posts/search?q=${encodeURIComponent(q)}`);
            if (res.ok) {
                const d = await res.json();
                if (d.success) { setResults(d.data ?? []); setShowResults(true); }
            }
        } catch { /* silent */ } finally { setSearching(false); }
    };

    const handleChange = (val: string) => {
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(val), 300);
    };

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A9A9A6]" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { if (debounceRef.current) clearTimeout(debounceRef.current); doSearch(query); } }}
                    onFocus={() => results.length > 0 && setShowResults(true)}
                    placeholder={t('search_placeholder')}
                    className="w-full pl-9 pr-9 py-2.5 text-sm rounded-lg border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#012e7a]/20 focus:border-[#012e7a] transition-colors"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A9A9A6] animate-spin" />}
            </div>

            <AnimatePresence>
                {showResults && results.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute z-20 mt-1.5 w-full bg-white rounded-lg border border-[#E7E7E5] shadow-lg overflow-hidden"
                    >
                        {results.slice(0, 6).map((r) => (
                            <Link
                                key={r.id}
                                href={`/dashboard/community/${r.community_slug}`}
                                onClick={() => setShowResults(false)}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-[#F7F7F5] transition-colors border-b border-[#F0F0EE] last:border-b-0"
                            >
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                                    style={{ backgroundColor: getAvatarColor(r.display_name), color: '#37352F' }}
                                >
                                    {getInitials(r.display_name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[#37352F] truncate">{r.title}</p>
                                    <p className="text-xs text-[#A9A9A6]">
                                        {r.community_slug} · {formatRelativeTime(r.created_at)}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Main Hub Page ────────────────────────────────────────────────
export default function CommunityHubPage() {
    const t = useTranslations('community');

    return (
        <div className="space-y-6 pb-12 max-w-5xl mx-auto">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <h1 className="text-3xl font-semibold text-[#37352F]">{t('title')}</h1>
                <p className="text-[#73726E] mt-1">{t('subtitle')}</p>
            </motion.div>

            {/* Search Bar */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                <CommunitySearch />
            </motion.div>

            {/* 2x2 Category Grid */}
            <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6" variants={containerVariants} initial="hidden" animate="show">
                {COMMUNITY_SLUGS.map((cat) => (
                    <motion.div key={cat.slug} variants={cardVariants}>
                        <Link href={`/dashboard/community/${cat.slug}`} className="block group h-full">
                            <div className={`h-full min-h-[240px] flex flex-col rounded-xl border border-[#E7E7E5] bg-white shadow-sm transition-all duration-300 ${cat.hoverBorder} hover:shadow-md cursor-pointer overflow-hidden`}>
                                <div className="relative h-[140px] flex-shrink-0 overflow-hidden rounded-t-xl" style={{ margin: '-1px -1px 0 -1px' }}>
                                    <Image src={cat.image} alt={cat.titleKey} fill className="object-cover" style={{ objectPosition: 'center 35%' }} sizes="(max-width: 768px) 100vw, 50vw" />
                                </div>
                                <div className="flex flex-col flex-1 p-5">
                                    <h2 className="text-lg font-semibold text-[#37352F] group-hover:text-[#012e7a] transition-colors">{cat.titleKey}</h2>
                                    <p className="text-sm text-[#73726E] mt-1 leading-relaxed flex-1">{t(cat.descKey as Parameters<typeof t>[0])}</p>
                                    <div className="flex items-center text-sm text-[#73726E] group-hover:text-[#012e7a] transition-colors mt-3">
                                        <span>{t('explore')}</span>
                                        <ArrowRight className="w-4 h-4 ml-1.5 transform group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    </motion.div>
                ))}

                {/* 4th Card: Coming Soon */}
                <motion.div variants={cardVariants}>
                    <div className="h-full min-h-[240px] flex flex-col rounded-xl border border-[#E7E7E5] bg-white shadow-sm overflow-hidden opacity-60 cursor-default">
                        <div className="relative h-[100px] bg-gradient-to-br from-gray-50 to-gray-100 flex-shrink-0">
                            <Plus className="absolute right-4 bottom-2 w-16 h-16 text-gray-400 opacity-20" />
                        </div>
                        <div className="flex flex-col flex-1 p-5">
                            <h2 className="text-lg font-semibold text-[#37352F]">{t('create_title')}</h2>
                            <p className="text-sm text-[#73726E] mt-1 leading-relaxed flex-1">{t('create_desc')}</p>
                            <div className="mt-3">
                                <span className="inline-flex items-center text-xs font-medium text-[#73726E] bg-[#F7F7F5] border border-[#E7E7E5] rounded-md px-3 py-1.5">
                                    {t('coming_soon')}
                                </span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* Info Banner */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="bg-[#F7F7F5] rounded-xl border border-[#E7E7E5] px-6 py-4">
                <p className="text-sm text-[#73726E]">
                    <span className="font-medium text-[#37352F]">{t('banner_label')}</span>
                    {' — '}
                    {t('banner_text')}
                </p>
            </motion.div>
        </div>
    );
}
