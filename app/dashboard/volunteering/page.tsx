'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Inbox, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { OpportunityCard } from '@/components/volunteering/opportunity-card';
import { TestimonialsWall } from '@/components/volunteering/testimonials-wall';
import { CategoryVote } from '@/components/volunteering/category-vote';
import { SmartMatchBanner } from '@/components/volunteering/smart-match-banner';
import type { VolunteeringOpportunity, VoteAggregation } from '@/types/volunteering';

// ─── Quick-Select Tags ────────────────────────────────────────────
const QUICK_TAGS = [
    'Obdachlosenhilfe',
    'Nachhaltigkeit',
    'Betreuung',
    'Bildung',
    'Senioren',
    'Tierschutz',
    'Mentoring',
    'Gesundheit',
    'Kultur',
    'Umwelt',
];

// ─── Category Filter Options ─────────────────────────────────────
const CATEGORIES = [
    { value: '', label: 'Alle Bereiche' },
    { value: 'social', label: 'Soziales' },
    { value: 'environment', label: 'Umwelt' },
    { value: 'education', label: 'Bildung' },
    { value: 'health', label: 'Gesundheit' },
    { value: 'culture', label: 'Kultur' },
];

export default function VolunteeringPage() {
    // ─── State ────────────────────────────────────────────────────
    const [opportunities, setOpportunities] = useState<VolunteeringOpportunity[]>([]);
    const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
    const [votes, setVotes] = useState<VoteAggregation[]>([]);
    const [matchSuggestions, setMatchSuggestions] = useState<VolunteeringOpportunity[]>([]);
    const [matchedCategories, setMatchedCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [cityFilter, setCityFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ─── Auto-detect city from user profile ──────────────────────
    useEffect(() => {
        async function detectCity() {
            try {
                const res = await fetch('/api/settings');
                const data = await res.json();
                if (data?.preferred_locations?.length > 0) {
                    setCityFilter(data.preferred_locations[0]);
                }
            } catch { /* silent — city detection is nice-to-have */ }
        }
        detectCity();
    }, []);

    // ─── Build effective search query from text + tags ────────────
    const getEffectiveQuery = useCallback(() => {
        const parts: string[] = [];
        if (searchQuery.trim()) parts.push(searchQuery.trim());
        // Tags contribute to search if no free text
        if (parts.length === 0 && activeTags.size > 0) {
            return Array.from(activeTags).join(' ');
        }
        return parts.join(' ');
    }, [searchQuery, activeTags]);

    // ─── Fetch Opportunities ──────────────────────────────────────
    const fetchOpportunities = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            const q = getEffectiveQuery();
            if (q) params.set('q', q);
            if (cityFilter.trim()) params.set('city', cityFilter.trim());
            if (categoryFilter) params.set('category', categoryFilter);
            params.set('limit', '50');

            const res = await fetch(`/api/volunteering/opportunities?${params}`);
            const data = await res.json();
            if (data.success) {
                setOpportunities(data.data);
            }
        } catch {
            console.error('❌ [volunteering] Failed to fetch opportunities');
        } finally {
            setLoading(false);
        }
    }, [cityFilter, categoryFilter, getEffectiveQuery]);

    // ─── Fetch helpers ────────────────────────────────────────────
    const fetchBookmarks = useCallback(async () => {
        try {
            const res = await fetch('/api/volunteering/bookmarks');
            const data = await res.json();
            if (data.success) {
                const ids = new Set<string>(data.data.map((b: { opportunity_id: string }) => b.opportunity_id));
                setBookmarkedIds(ids);
            }
        } catch { /* silent */ }
    }, []);

    const fetchVotes = useCallback(async () => {
        try {
            const res = await fetch('/api/volunteering/votes');
            const data = await res.json();
            if (data.success) setVotes(data.data);
        } catch { /* silent */ }
    }, []);

    const fetchMatch = useCallback(async () => {
        try {
            const res = await fetch('/api/volunteering/match');
            const data = await res.json();
            if (data.success && data.data?.length > 0) {
                setMatchSuggestions(data.data);
                setMatchedCategories(data.matched_categories ?? []);
            }
        } catch { /* silent */ }
    }, []);

    // ─── Initial Load ─────────────────────────────────────────────
    useEffect(() => {
        fetchOpportunities();
        fetchBookmarks();
        fetchVotes();
        fetchMatch();
    }, [fetchOpportunities, fetchBookmarks, fetchVotes, fetchMatch]);

    // ─── Debounced search ─────────────────────────────────────────
    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            fetchOpportunities();
        }, 350);
    };

    const handleSearchSubmit = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        fetchOpportunities();
    };

    // ─── Tag toggle ───────────────────────────────────────────────
    const toggleTag = (tag: string) => {
        setActiveTags(prev => {
            const next = new Set(prev);
            if (next.has(tag)) {
                next.delete(tag);
            } else {
                next.add(tag);
            }
            return next;
        });
        // Trigger auto-search after tag toggle
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            fetchOpportunities();
        }, 200);
    };

    // ─── Refetch on category filter change ────────────────────────
    useEffect(() => {
        fetchOpportunities();
    }, [cityFilter, categoryFilter, fetchOpportunities]);

    // ─── Toggle Bookmark ──────────────────────────────────────────
    const handleToggleBookmark = async (opportunityId: string) => {
        if (bookmarkedIds.has(opportunityId)) {
            try {
                const res = await fetch('/api/volunteering/bookmarks');
                const data = await res.json();
                if (data.success) {
                    const bookmark = data.data.find((b: { opportunity_id: string }) => b.opportunity_id === opportunityId);
                    if (bookmark) {
                        await fetch(`/api/volunteering/bookmarks?id=${bookmark.id}`, { method: 'DELETE' });
                        setBookmarkedIds(prev => {
                            const next = new Set(prev);
                            next.delete(opportunityId);
                            return next;
                        });
                        toast.success('Bookmark entfernt');
                    }
                }
            } catch {
                toast.error('Fehler beim Entfernen');
            }
        } else {
            try {
                const res = await fetch('/api/volunteering/bookmarks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ opportunity_id: opportunityId }),
                });
                if (res.ok) {
                    setBookmarkedIds(prev => new Set(prev).add(opportunityId));
                    toast.success('Gespeichert');
                } else if (res.status === 409) {
                    toast.info('Bereits gespeichert');
                }
            } catch {
                toast.error('Fehler beim Speichern');
            }
        }
    };

    // ─── Render ───────────────────────────────────────────────────
    return (
        <div className="space-y-6 pb-12 max-w-5xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
            >
                <h1 className="text-3xl font-semibold text-[#37352F]">Ehrenamt</h1>
                <p className="text-[#73726E] mt-1">
                    Tue Gutes in deiner Umgebung. Finde Engagements, die zu dir passen.
                </p>
            </motion.div>

            {/* Smart Match Banner (dismissable, non-intrusive) */}
            <SmartMatchBanner suggestions={matchSuggestions} matchedCategories={matchedCategories} />

            {/* ─── SEARCH BAR ──────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-3"
            >
                {/* Search + City Row */}
                <div className="flex gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#A9A9A6]" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                            placeholder="Ehrenamt suchen... z.B. Obdachlosenhilfe, Nachhilfe, Tierschutz"
                            className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] transition-colors shadow-sm"
                        />
                        {loading && (
                            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A9A9A6] animate-spin" />
                        )}
                    </div>

                    {/* City Input */}
                    <div className="relative w-44">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A9A9A6]" />
                        <input
                            type="text"
                            value={cityFilter}
                            onChange={(e) => setCityFilter(e.target.value)}
                            placeholder="Stadt..."
                            className="w-full pl-9 pr-3 py-3 text-sm rounded-xl border border-[#E7E7E5] bg-white text-[#37352F] placeholder:text-[#A9A9A6] focus:outline-none focus:ring-2 focus:ring-[#0066FF]/20 focus:border-[#0066FF] transition-colors shadow-sm"
                        />
                    </div>
                </div>

                {/* Quick-Select Tag Chips */}
                <div className="flex flex-wrap gap-2">
                    {QUICK_TAGS.map((tag) => {
                        const isActive = activeTags.has(tag);
                        return (
                            <motion.button
                                key={tag}
                                onClick={() => toggleTag(tag)}
                                whileTap={{ scale: 0.95 }}
                                className={`px-3 py-1.5 text-[13px] rounded-full border transition-all ${isActive
                                    ? 'bg-[#0066FF] text-white border-[#0066FF] shadow-sm'
                                    : 'bg-white text-[#73726E] border-[#E7E7E5] hover:border-[#0066FF]/30 hover:text-[#0066FF]'
                                    }`}
                            >
                                {tag}
                            </motion.button>
                        );
                    })}
                </div>
            </motion.div>

            {/* ─── CATEGORY FILTER ─────────────────────────────────────── */}
            <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.value}
                        onClick={() => setCategoryFilter(cat.value)}
                        className={`px-3.5 py-1.5 text-sm rounded-lg border transition-all ${categoryFilter === cat.value
                            ? 'bg-[#0066FF] text-white border-[#0066FF]'
                            : 'bg-white text-[#73726E] border-[#E7E7E5] hover:border-[#0066FF]/30'
                            }`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* ─── OPPORTUNITY GRID ────────────────────────────────────── */}
            {loading && opportunities.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 text-[#A9A9A6] animate-spin" />
                </div>
            ) : opportunities.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-16 text-center"
                >
                    <Inbox className="w-12 h-12 text-[#E7E7E5] mb-4" />
                    <h3 className="text-lg font-medium text-[#37352F]">
                        {searchQuery || activeTags.size > 0
                            ? 'Keine Ergebnisse gefunden'
                            : 'Noch keine Ehrenamter verfuegbar'}
                    </h3>
                    <p className="text-sm text-[#73726E] mt-1 max-w-md">
                        {searchQuery || activeTags.size > 0
                            ? 'Versuche einen anderen Suchbegriff oder entferne Filter.'
                            : 'Der Scraper laeuft woechentlich. Neue Angebote erscheinen automatisch.'}
                    </p>
                </motion.div>
            ) : (
                <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                >
                    {opportunities.map((opp) => (
                        <OpportunityCard
                            key={opp.id}
                            opportunity={opp}
                            isBookmarked={bookmarkedIds.has(opp.id)}
                            onToggleBookmark={handleToggleBookmark}
                        />
                    ))}
                </motion.div>
            )}

            {/* Divider */}
            <div className="border-t border-[#E7E7E5]" />

            {/* Testimonials Wall */}
            <TestimonialsWall />

            {/* Divider */}
            <div className="border-t border-[#E7E7E5]" />

            {/* Category Voting */}
            <CategoryVote votes={votes} onVoteSubmitted={fetchVotes} />
        </div>
    );
}
