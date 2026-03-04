'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, SlidersHorizontal, Loader2, X, Sparkles,
    ExternalLink, ArrowRight, CheckCircle2, AlertTriangle,
    ChevronDown, ChevronRight, Clock, Trash2, Plus, Star, RefreshCw,
    Compass, List, Layers
} from 'lucide-react';
import type { SerpApiJob } from '@/lib/services/job-search-pipeline';
import { useJobQueueCount } from '@/store/use-job-queue-count';
import JobSwipeView from '@/components/job-search/JobSwipeView';

// ─── Types ────────────────────────────────────────────────────────

interface SavedSearch {
    id: string;
    query: string;
    location: string;
    filters: Record<string, unknown>;
    results: EnrichedJob[];
    result_count: number;
    fetched_at: string;
}

interface EnrichedJob extends SerpApiJob {
    already_in_queue?: boolean;
    matched_filters?: string[];
}

// ─── Constants ────────────────────────────────────────────────────

const EXPERIENCE_LEVELS = ['Entry', 'Mid', 'Senior', 'Lead'] as const;
const ORG_TYPES = ['Startup', 'Konzern', 'NGO', 'Staat'] as const;
const WERTE_FILTERS = [
    { key: 'nachhaltigkeit', label: 'Nachhaltigkeit' },
    { key: 'innovation', label: 'Innovation' },
    { key: 'social_impact', label: 'Social Impact' },
    { key: 'deep_tech', label: 'Deep Tech' },
    { key: 'dei', label: 'Diversity / Equity / Inclusion' },
    { key: 'gemeinwohl', label: 'Gemeinwohl' },
    { key: 'circular_economy', label: 'Circular Economy' },
    { key: 'new_work', label: 'New Work' },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `vor ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(hours / 24);
    return `vor ${days}d`;
}

function getScoreBar(score: number): { color: string; label: string | null } {
    if (score >= 80) return { color: 'bg-green-500', label: 'Strong Match' };
    if (score >= 65) return { color: 'bg-[#0066FF]', label: null };
    return { color: 'bg-stone-400', label: null };
}

// ─── Main Page ────────────────────────────────────────────────────

export default function JobSearchPage() {
    const [starredUrls, setStarredUrls] = useState<Set<string>>(new Set());

    useEffect(() => {
        const saved = localStorage.getItem('pathly_starred_jobs');
        if (saved) {
            try { setStarredUrls(new Set(JSON.parse(saved))); } catch (e) { }
        }
    }, []);

    const toggleStar = useCallback((url: string) => {
        setStarredUrls(prev => {
            const next = new Set(prev);
            if (next.has(url)) next.delete(url);
            else next.add(url);
            localStorage.setItem('pathly_starred_jobs', JSON.stringify(Array.from(next)));
            return next;
        });
    }, []);

    const handleRefreshSearch = useCallback(async (searchToRefresh: SavedSearch, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const res = await fetch('/api/job-search/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: searchToRefresh.query,
                    location: searchToRefresh.location,
                    filters: searchToRefresh.filters,
                    forceRefresh: true,
                    mode: searchMode,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setSavedSearches(prev => prev.map(s => {
                if (s.id !== searchToRefresh.id) return s;
                const oldStarred = s.results.filter(oldJob => starredUrls.has(oldJob.apply_link));
                const newJobs = (data.results || []).filter((newJob: any) => !starredUrls.has(newJob.apply_link));
                const combined = [...oldStarred, ...newJobs];
                return {
                    ...s,
                    results: combined,
                    result_count: combined.length,
                    fetched_at: new Date().toISOString()
                };
            }));
        } catch (err) {
            console.error("Refresh failed:", err);
        }
    }, [starredUrls]);

    // Search state
    const [query, setQuery] = useState('');
    const [location, setLocation] = useState('Berlin');
    const [isSearching, setIsSearching] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchMode, setSearchMode] = useState<'keyword' | 'mission'>('keyword');

    // Filter state
    const [selectedExperience, setSelectedExperience] = useState<string[]>([]);
    const [selectedOrgType, setSelectedOrgType] = useState<string[]>([]);
    const [selectedWerte, setSelectedWerte] = useState<string[]>([]);

    // Saved searches (accordion)
    const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
    const [expandedSearchId, setExpandedSearchId] = useState<string | null>(null);
    const [loadingSearches, setLoadingSearches] = useState(true);
    const [viewMode, setViewMode] = useState<'list' | 'swipe'>('list');

    // Suggested titles
    const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
    const [loadingTitles, setLoadingTitles] = useState(true);

    // ─── Load saved searches on mount ────────────────────────────

    useEffect(() => {
        loadSavedSearches();
        loadSuggestedTitles();
    }, []);

    const loadSavedSearches = async () => {
        try {
            const res = await fetch('/api/job-search/saved');
            const data = await res.json();
            if (data.searches) {
                setSavedSearches(data.searches);
                // Auto-expand the most recent search
                if (data.searches.length > 0) {
                    setExpandedSearchId(data.searches[0].id);
                }
            }
        } catch {
            // Silently handle
        } finally {
            setLoadingSearches(false);
        }
    };

    const loadSuggestedTitles = async () => {
        try {
            const res = await fetch('/api/jobs/search/suggest-titles');
            const data = await res.json();
            if (data.success && data.titles) {
                setSuggestedTitles(data.titles);
            }
        } catch {
            // Silently use empty suggestions
        } finally {
            setLoadingTitles(false);
        }
    };

    // ─── Search Handler ─────────────────────────────────────────────

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;

        setIsSearching(true);
        setError(null);

        try {
            const res = await fetch('/api/job-search/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query.trim(),
                    location: location.trim() || 'Deutschland',
                    filters: {
                        experience: selectedExperience.length > 0 ? selectedExperience : undefined,
                        orgType: selectedOrgType.length > 0 ? selectedOrgType : undefined,
                        werte: selectedWerte.length > 0 ? selectedWerte : undefined,
                    },
                    mode: searchMode,
                }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Suche fehlgeschlagen');

            // Insert new search at top of list
            const newSearch: SavedSearch = {
                id: data.search_id || crypto.randomUUID(),
                query: query.trim(),
                location: location.trim() || 'Deutschland',
                filters: {},
                results: data.results || [],
                result_count: data.result_count || 0,
                fetched_at: new Date().toISOString(),
            };

            setSavedSearches(prev => {
                // Remove existing search with same query+location
                const filtered = prev.filter(
                    s => !(s.query === newSearch.query && s.location === newSearch.location)
                );
                // Add new one at top, limit to 10
                return [newSearch, ...filtered].slice(0, 10);
            });

            setExpandedSearchId(newSearch.id);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSearching(false);
        }
    }, [query, location, selectedExperience, selectedOrgType, selectedWerte, searchMode]);

    // ─── Delete Search ──────────────────────────────────────────────

    const handleDeleteSearch = async (searchId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSavedSearches(prev => prev.filter(s => s.id !== searchId));

        try {
            await fetch(`/api/job-search/saved?id=${searchId}`, { method: 'DELETE' });
        } catch {
            // Already removed from UI optimistically
        }
    };

    // ─── Toggle filter chip ─────────────────────────────────────────

    const toggleFilter = (
        value: string,
        selected: string[],
        setSelected: (val: string[]) => void,
    ) => {
        setSelected(
            selected.includes(value)
                ? selected.filter(v => v !== value)
                : [...selected, value]
        );
    };

    // ─── Check if any saved searches exist ──────────────────────────
    const hasSearches = savedSearches.length > 0;
    const showEmptyState = !loadingSearches && !hasSearches && !isSearching && !error;

    return (
        <div className="space-y-6 max-w-[1200px]">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-[#37352F]">Job Search</h1>
                <p className="text-sm text-[#73726E] mt-1">
                    Finde passende Jobs — powered by Google Jobs.
                </p>
            </div>

            {/* Search Bar */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-[#E7E7E5] rounded-xl p-5 shadow-sm"
            >
                {/* Mode Toggle */}
                <div className="flex gap-1 mb-3">
                    {(['keyword', 'mission'] as const).map(mode => (
                        <motion.button
                            key={mode}
                            onClick={() => setSearchMode(mode)}
                            animate={{
                                scale: searchMode === mode ? 1 : 0.97,
                                opacity: searchMode === mode ? 1 : 0.7,
                            }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${searchMode === mode
                                ? 'bg-[#f0f4ff] text-[#002e7a] border border-[#002e7a]/20'
                                : 'text-[#73726E] border border-[#E7E7E5] hover:border-[#002e7a]/30'
                                }`}
                        >
                            {mode === 'keyword' ? (
                                <span className="flex items-center gap-1.5">
                                    <Search className="w-3 h-3" />
                                    Keyword
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5">
                                    <Compass className="w-3 h-3" />
                                    Mission
                                </span>
                            )}
                        </motion.button>
                    ))}
                </div>

                <div className="flex gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" />
                        <input
                            type="text"
                            placeholder={searchMode === 'mission' ? 'Beschreibe deine nächste Mission...' : 'Jobtitel eingeben...'}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#E7E7E5] bg-[#FAFAF9] text-sm text-[#37352F] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#002e7a] focus:ring-1 focus:ring-[#002e7a]/20 transition-all"
                        />
                    </div>
                    <div className="w-48 relative">
                        <input
                            type="text"
                            placeholder="Ort..."
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            className="w-full px-4 py-2.5 rounded-lg border border-[#E7E7E5] bg-[#FAFAF9] text-sm text-[#37352F] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#002e7a] focus:ring-1 focus:ring-[#002e7a]/20 transition-all"
                        />
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.02, y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSearch}
                        disabled={isSearching || !query.trim()}
                        className="px-6 py-2.5 bg-[#002e7a] text-white text-sm font-medium rounded-lg hover:bg-[#001d4f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {isSearching ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Search className="w-4 h-4" />
                        )}
                        Suchen
                    </motion.button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-2.5 rounded-lg border text-sm transition-colors ${showFilters ? 'border-[#002e7a] text-[#002e7a] bg-[#f0f4ff]' : 'border-[#E7E7E5] text-[#73726E] hover:border-[#002e7a]'}`}
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                    </button>
                </div>

                {/* Suggested Titles */}
                {suggestedTitles.length > 0 && !isSearching && !hasSearches && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-[#A8A29E] flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Vorschlaege:
                        </span>
                        {suggestedTitles.map(title => (
                            <motion.button
                                key={title}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setQuery(title)}
                                className="px-3 py-1 rounded-full bg-[#f0f4ff] text-[#002e7a] text-xs font-medium border border-[#002e7a]/10 hover:border-[#002e7a]/30 transition-colors"
                            >
                                {title}
                            </motion.button>
                        ))}
                    </div>
                )}

                {/* Extended Filters */}
                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-4 pt-4 border-t border-[#E7E7E5] space-y-4">
                                {/* Row 1: Experience + OrgType */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-medium text-[#73726E] mb-1.5 block">Erfahrungslevel</label>
                                        <div className="flex gap-2">
                                            {EXPERIENCE_LEVELS.map(level => (
                                                <button
                                                    key={level}
                                                    onClick={() => toggleFilter(level, selectedExperience, setSelectedExperience)}
                                                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${selectedExperience.includes(level)
                                                        ? 'border-[#002e7a] text-[#002e7a] bg-[#f0f4ff] font-medium'
                                                        : 'border-[#E7E7E5] text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a]'
                                                        }`}
                                                >
                                                    {level}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-[#73726E] mb-1.5 block">Organisationsform</label>
                                        <div className="flex gap-2">
                                            {ORG_TYPES.map(org => (
                                                <button
                                                    key={org}
                                                    onClick={() => toggleFilter(org, selectedOrgType, setSelectedOrgType)}
                                                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${selectedOrgType.includes(org)
                                                        ? 'border-[#002e7a] text-[#002e7a] bg-[#f0f4ff] font-medium'
                                                        : 'border-[#E7E7E5] text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a]'
                                                        }`}
                                                >
                                                    {org}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2: Werte-Filter (NEW) — 2 rows */}
                                <div>
                                    <label className="text-xs font-medium text-[#73726E] mb-1.5 block">Ausrichtung</label>
                                    <div className="flex gap-2 mb-2">
                                        {WERTE_FILTERS.slice(0, 4).map(wf => (
                                            <button
                                                key={wf.key}
                                                onClick={() => toggleFilter(wf.key, selectedWerte, setSelectedWerte)}
                                                className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${selectedWerte.includes(wf.key)
                                                    ? 'border-[#002e7a] text-[#002e7a] bg-[#f0f4ff] font-medium'
                                                    : 'border-[#E7E7E5] text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a]'
                                                    }`}
                                            >
                                                {wf.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        {WERTE_FILTERS.slice(4).map(wf => (
                                            <button
                                                key={wf.key}
                                                onClick={() => toggleFilter(wf.key, selectedWerte, setSelectedWerte)}
                                                className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${selectedWerte.includes(wf.key)
                                                    ? 'border-[#002e7a] text-[#002e7a] bg-[#f0f4ff] font-medium'
                                                    : 'border-[#E7E7E5] text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a]'
                                                    }`}
                                            >
                                                {wf.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-red-800">Fehler bei der Suche</p>
                        <p className="text-xs text-red-600 mt-1">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X className="w-4 h-4 text-red-400" />
                    </button>
                </div>
            )}

            {/* Loading */}
            {isSearching && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    >
                        <Search className="w-8 h-8 text-[#002e7a]" />
                    </motion.div>
                    <p className="text-sm text-[#73726E]">
                        {searchMode === 'mission' ? 'Mission wird analysiert...' : 'Durchsuche Google Jobs...'}
                    </p>
                </div>
            )}

            {/* Saved Searches (Notion-style Table) */}
            {!isSearching && hasSearches && (
                <div className="bg-white border border-[#E7E7E5] rounded-xl overflow-hidden shadow-sm">
                    {/* Table Header */}
                    <div className="grid grid-cols-[1fr_100px_160px_80px] items-center px-5 py-2 border-b border-[#E7E7E5] bg-[#FAFAF9]">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-[#A8A29E] uppercase tracking-wider">
                            <Search className="w-3 h-3" />
                            Keyword / Mission
                        </span>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-[#A8A29E] uppercase tracking-wider">
                            <Sparkles className="w-3 h-3" />
                            Anzahl
                        </span>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-[#A8A29E] uppercase tracking-wider">
                            <ArrowRight className="w-3 h-3" />
                            Ort
                        </span>
                        <span />
                    </div>
                    {/* Table Rows */}
                    {savedSearches.map(search => (
                        <SearchAccordion
                            key={search.id}
                            search={search}
                            isExpanded={expandedSearchId === search.id}
                            onToggle={() => setExpandedSearchId(
                                expandedSearchId === search.id ? null : search.id
                            )}
                            onDelete={(e) => handleDeleteSearch(search.id, e)}
                            onRefresh={(e) => handleRefreshSearch(search, e)}
                            starredUrls={starredUrls}
                            toggleStar={toggleStar}
                            viewMode={viewMode}
                            onViewModeChange={setViewMode}
                        />
                    ))}
                </div>
            )}

            {/* Empty State */}
            {showEmptyState && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#f0f4ff] flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-[#002e7a]" />
                    </div>
                    <h3 className="text-sm font-semibold text-[#37352F] mb-1">
                        Starte deine Jobsuche
                    </h3>
                    <p className="text-xs text-[#73726E] max-w-sm">
                        Gib einen Jobtitel und Ort ein. Pathly durchsucht Google Jobs
                        und zeigt dir passende Stellen mit echten Bewerbungslinks.
                    </p>
                </div>
            )}
        </div>
    );
}

// ─── Search Accordion Component ─────────────────────────────────────

function SearchAccordion({
    search,
    isExpanded,
    onToggle,
    onDelete,
    onRefresh,
    starredUrls,
    toggleStar,
    viewMode,
    onViewModeChange,
}: {
    search: SavedSearch;
    isExpanded: boolean;
    onToggle: () => void;
    onDelete: (e: React.MouseEvent) => void;
    onRefresh: (e: React.MouseEvent) => void;
    starredUrls: Set<string>;
    toggleStar: (url: string) => void;
    viewMode: 'list' | 'swipe';
    onViewModeChange: (mode: 'list' | 'swipe') => void;
}) {
    return (
        <div className="border-b border-[#E7E7E5] last:border-b-0">
            {/* Table Row */}
            <div
                onClick={onToggle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onToggle()}
                className="grid grid-cols-[1fr_100px_160px_80px] items-center px-5 py-3 hover:bg-[#FAFAF9] transition-colors cursor-pointer group"
            >
                {/* Col 1: Keyword / Mission */}
                <div className="flex items-center gap-2.5 min-w-0">
                    <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.15 }}
                        className="shrink-0"
                    >
                        <ChevronRight className="w-3.5 h-3.5 text-[#A8A29E]" />
                    </motion.div>
                    <span className="text-sm font-medium text-[#37352F] truncate">
                        {search.query}
                    </span>
                    <span className="shrink-0 text-xs text-[#A8A29E] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Clock className="w-3 h-3" />
                        {timeAgo(search.fetched_at)}
                    </span>
                </div>

                {/* Col 2: Anzahl */}
                <span className="text-sm text-[#37352F]">
                    {search.result_count} Jobs
                </span>

                {/* Col 3: Ort */}
                <span className="text-sm text-[#73726E] truncate">
                    {search.location || '—'}
                </span>

                {/* Col 4: Actions */}
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={onRefresh}
                        className="p-1.5 rounded-md text-[#002e7a] hover:bg-[#f0f4ff] transition-colors"
                        title="Ergebnisse aktualisieren"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(e); }}
                        className="p-1.5 rounded-md text-[#A8A29E] hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Suche entfernen"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Expanded Results */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-4 border-t border-[#E7E7E5] bg-[#FAFAF9]/50">
                            {search.results.length === 0 ? (
                                <p className="text-xs text-[#A8A29E] py-6 text-center">
                                    Keine Ergebnisse gefunden.
                                </p>
                            ) : (
                                <>
                                    {/* View Mode Toggle */}
                                    <div className="flex items-center justify-end gap-1 pt-3 pb-2" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => onViewModeChange('list')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${viewMode === 'list'
                                                ? 'bg-[#002e7a] text-white font-medium'
                                                : 'text-[#73726E] hover:bg-[#F7F7F5]'
                                                }`}
                                        >
                                            <List className="w-3.5 h-3.5" />
                                            Liste
                                        </button>
                                        <button
                                            onClick={() => onViewModeChange('swipe')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${viewMode === 'swipe'
                                                ? 'bg-[#002e7a] text-white font-medium'
                                                : 'text-[#73726E] hover:bg-[#F7F7F5]'
                                                }`}
                                        >
                                            <Layers className="w-3.5 h-3.5" />
                                            Swipe
                                        </button>
                                    </div>

                                    {/* Content: List or Swipe */}
                                    {viewMode === 'list' ? (
                                        <div className="space-y-1">
                                            {search.results.map((job, i) => (
                                                <JobRow
                                                    key={`${job.company_name}-${job.title}-${i}`}
                                                    job={job}
                                                    starredUrls={starredUrls}
                                                    toggleStar={toggleStar}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-4">
                                            <JobSwipeView jobs={search.results} />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Job Row Component ──────────────────────────────────────────────

function JobRow({ job, starredUrls, toggleStar }: { job: EnrichedJob; starredUrls: Set<string>; toggleStar: (url: string) => void }) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="border border-[#E7E7E5] rounded-lg overflow-hidden">
            {/* Row */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#FAFAF9] transition-colors text-left"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-[#37352F] truncate">
                            {job.company_name}
                        </h4>
                        {job.already_in_queue && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Bereits in Queue
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-[#73726E] mt-0.5 truncate">
                        {job.title} · {job.location}
                    </p>
                    {/* Quick-info pills in collapsed row */}
                    {(job.detected_extensions?.schedule_type || job.detected_extensions?.salary || job.detected_extensions?.work_from_home) && (
                        <div className="flex items-center gap-1.5 mt-1">
                            {job.detected_extensions?.schedule_type && (
                                <span className="px-1.5 py-0.5 rounded bg-[#F7F7F5] text-[10px] text-[#73726E] border border-[#E7E7E5]">
                                    {job.detected_extensions.schedule_type}
                                </span>
                            )}
                            {job.detected_extensions?.salary && (
                                <span className="px-1.5 py-0.5 rounded bg-[#F7F7F5] text-[10px] text-[#73726E] border border-[#E7E7E5]">
                                    {job.detected_extensions.salary}
                                </span>
                            )}
                            {job.detected_extensions?.work_from_home && (
                                <span className="px-1.5 py-0.5 rounded bg-[#f0f4ff] text-[10px] text-[#002e7a] border border-[#002e7a]/10">
                                    Remote
                                </span>
                            )}
                        </div>
                    )}
                    {/* Werte-Filter match tags */}
                    {job.matched_filters && job.matched_filters.length > 0 && (
                        <div className="flex gap-1.5 mt-1">
                            {job.matched_filters.map((filter: string) => (
                                <span
                                    key={filter}
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${filter === 'nachhaltigkeit' ? 'bg-green-50 text-green-700 border-green-200' :
                                        filter === 'innovation' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                            filter === 'social_impact' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                filter === 'deep_tech' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    filter === 'dei' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                                                        filter === 'gemeinwohl' ? 'bg-teal-50 text-teal-700 border-teal-200' :
                                                            filter === 'circular_economy' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                filter === 'new_work' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                                                    'bg-slate-50 text-slate-600 border-slate-200'
                                        }`}
                                >
                                    {WERTE_FILTERS.find(wf => wf.key === filter)?.label || filter}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                    {job.detected_extensions?.posted_at && (
                        <span className="text-[10px] text-[#A8A29E]">
                            {job.detected_extensions.posted_at}
                        </span>
                    )}
                    <motion.div
                        animate={{ rotate: isExpanded ? 0 : -90 }}
                        transition={{ duration: 0.15 }}
                    >
                        <ChevronDown className="w-4 h-4 text-[#A8A29E]" />
                    </motion.div>
                </div>
            </button>

            {/* Expanded Detail */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 border-t border-[#E7E7E5] space-y-3 pt-3">


                            {/* Description — scannable bullet points with important keyword highlighting */}
                            {job.description && (() => {
                                const IMPORTANT_KEYWORDS = [
                                    'Innovation', 'Innovationen', 'Digital', 'Digitalisierung', 'Transformation',
                                    'Startup', 'Scaleup', 'KMU', 'Consulting', 'Beratung',
                                    'Manager', 'Lead', 'Senior', 'Director', 'Head',
                                    'Strategie', 'Strategy', 'Nachhaltigkeit', 'Sustainability',
                                    'R&D', 'Forschung', 'Entwicklung', 'Technologie', 'Technology',
                                    'KI', 'AI', 'Machine Learning', 'Software', 'Plattform',
                                    'Remote', 'Hybrid', 'Karriere', 'Wachstum', 'Impact',
                                    'Fortune', 'Global', 'weltweit', 'international',
                                    'Fördermittel', 'Finanzierung', 'Investment',
                                    'Mission', 'Vision', 'Potenzial', 'Führung',
                                ];

                                const bullets = job.description
                                    .split(/[.!?\n]+/)
                                    .map((s: string) => s.trim())
                                    .filter((s: string) => s.length > 15 && s.length < 200)
                                    .slice(0, 4);

                                if (bullets.length === 0) return null;

                                const highlightKeywords = (text: string) => {
                                    const parts: { text: string; bold: boolean }[] = [];
                                    let remaining = text;

                                    while (remaining.length > 0) {
                                        let earliestIdx = remaining.length;
                                        let matchedKw = '';

                                        for (const kw of IMPORTANT_KEYWORDS) {
                                            const idx = remaining.indexOf(kw);
                                            if (idx >= 0 && idx < earliestIdx) {
                                                earliestIdx = idx;
                                                matchedKw = kw;
                                            }
                                        }

                                        if (!matchedKw) {
                                            parts.push({ text: remaining, bold: false });
                                            break;
                                        }

                                        if (earliestIdx > 0) {
                                            parts.push({ text: remaining.slice(0, earliestIdx), bold: false });
                                        }
                                        parts.push({ text: matchedKw, bold: true });
                                        remaining = remaining.slice(earliestIdx + matchedKw.length);
                                    }
                                    return parts;
                                };

                                return (
                                    <ul className="text-xs text-[#37352F] leading-relaxed space-y-1.5 mt-2 list-none ml-0">
                                        {bullets.map((bullet: string, idx: number) => (
                                            <li key={idx} className="flex items-start gap-1.5">
                                                <span className="text-[#A8A29E] mt-0.5 shrink-0">·</span>
                                                <span className="line-clamp-2">
                                                    {highlightKeywords(bullet).map((part, pIdx) =>
                                                        part.bold
                                                            ? <strong key={pIdx} className="font-semibold text-[#37352F]">{part.text}</strong>
                                                            : <span key={pIdx}>{part.text}</span>
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                );
                            })()}

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-1">
                                {job.apply_link && (
                                    <a
                                        href={job.apply_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E7E7E5] text-xs font-semibold text-[#002e7a] hover:bg-[#002e7a]/5 transition-colors"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        Website
                                    </a>
                                )}
                                {!job.already_in_queue ? (
                                    <div className="flex items-center gap-2">
                                        <AddToQueueButton job={job} />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleStar(job.apply_link); }}
                                            className={`p-1.5 rounded-lg border transition-colors ${starredUrls.has(job.apply_link)
                                                ? 'border-[#002e7a] text-[#002e7a] bg-[#002e7a]/5'
                                                : 'border-[#E7E7E5] text-[#A8A29E] hover:border-[#002e7a] hover:text-[#002e7a]'
                                                }`}
                                            title="Job merken"
                                        >
                                            <Star className={`w-4 h-4 ${starredUrls.has(job.apply_link) ? 'fill-[#002e7a]' : ''}`} />
                                        </button>
                                    </div>
                                ) : (
                                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium border border-green-200">
                                        <CheckCircle2 className="w-3 h-3" />
                                        In der Queue
                                    </span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Add to Queue Button — Pulse Ring + Morph Animation ─────────────

function AddToQueueButton({ job }: { job: EnrichedJob }) {
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState(false);
    const [showPulse, setShowPulse] = useState(false);
    const increment = useJobQueueCount(s => s.increment);

    const handleAdd = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (adding || added) return;

        setAdding(true);
        try {
            const res = await fetch('/api/jobs/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobTitle: job.title,
                    company: job.company_name,
                    location: job.location,
                    jobDescription: job.description || 'Keine Beschreibung verfügbar',
                    source_url: job.apply_link,
                    source: 'job_search',
                }),
            });

            if (res.ok) {
                const data = await res.json();
                if (!data.duplicate) {
                    // Phase 1+2: Trigger pulse animation
                    setShowPulse(true);
                    increment(); // Sidebar badge hochzählen
                    // Phase 3: Settle into final state after animation
                    setTimeout(() => {
                        setAdded(true);
                        setShowPulse(false);
                    }, 1000);
                } else {
                    // Already in queue (duplicate detected by backend)
                    setAdded(true);
                }
            } else {
                console.error('[AddToQueue] Failed:', res.status);
            }
        } catch (err) {
            console.error('[AddToQueue] Network error:', err);
        } finally {
            setAdding(false);
        }
    };

    // Final settled state — green "In der Queue"
    if (added && !showPulse) {
        return (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium border border-green-200">
                <CheckCircle2 className="w-3 h-3" />
                In der Queue
            </span>
        );
    }

    return (
        <div className="relative">
            <motion.button
                whileHover={!showPulse ? { scale: 1.02 } : undefined}
                whileTap={!showPulse ? { scale: 0.98 } : undefined}
                onClick={handleAdd}
                disabled={adding || showPulse}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-50 transition-colors relative overflow-visible"
                animate={{
                    backgroundColor: showPulse ? '#16a34a' : '#002e7a',
                }}
                transition={{ duration: 0.3 }}
            >
                <AnimatePresence mode="wait">
                    {showPulse ? (
                        <motion.span
                            key="check"
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                            className="flex items-center gap-1.5"
                        >
                            <CheckCircle2 className="w-3 h-3" />
                            Hinzugefügt
                        </motion.span>
                    ) : adding ? (
                        <motion.span key="loading" className="flex items-center gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Hinzufügen
                        </motion.span>
                    ) : (
                        <motion.span key="default" className="flex items-center gap-1.5">
                            <Plus className="w-3 h-3" />
                            Hinzufügen
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.button>

            {/* Pulse Rings — expand outward from button center */}
            {showPulse && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <motion.div
                        className="absolute w-full h-full rounded-lg border-2 border-green-400"
                        initial={{ scale: 1, opacity: 0.5 }}
                        animate={{ scale: 2.5, opacity: 0 }}
                        transition={{ duration: 0.7, ease: 'easeOut' }}
                    />
                    <motion.div
                        className="absolute w-full h-full rounded-lg border-2 border-green-400"
                        initial={{ scale: 1, opacity: 0.35 }}
                        animate={{ scale: 2, opacity: 0 }}
                        transition={{ duration: 0.55, ease: 'easeOut', delay: 0.1 }}
                    />
                </div>
            )}
        </div>
    );
}

