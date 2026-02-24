'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, SlidersHorizontal, Loader2, X, Sparkles, ExternalLink, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { SerpApiJob } from '@/lib/services/job-search-pipeline';

// ─── Types ────────────────────────────────────────────────────────

interface ProcessedJob {
    id: string;
    job_title: string;
    company_name: string;
    match_score_overall: number | null;
    recommendation: string | null;
    status: string;
    score_breakdown: Record<string, number> | null;
    judge_reasoning: string | null;
    red_flags: string[];
    green_flags: string[];
    knockout_reason: string | null;
    work_model: string;
    ats_keywords: string[];
}

type ViewMode = 'search' | 'results' | 'detail';

// ─── Main Page ────────────────────────────────────────────────────

export default function JobSearchPage() {
    // Search state
    const [query, setQuery] = useState('');
    const [location, setLocation] = useState('Berlin');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SerpApiJob[]>([]);
    const [showFilters, setShowFilters] = useState(false);

    // Pipeline state
    const [processingJobs, setProcessingJobs] = useState<Set<number>>(new Set());
    const [processedJobs, setProcessedJobs] = useState<Map<number, ProcessedJob>>(new Map());
    const [addedToQueue, setAddedToQueue] = useState<Set<string>>(new Set());

    // Detail panel
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    // Suggested titles
    const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
    const [loadingTitles, setLoadingTitles] = useState(true);

    // Error
    const [error, setError] = useState<string | null>(null);

    // Fetch suggested titles on mount
    useEffect(() => {
        async function fetchTitles() {
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
        }
        fetchTitles();
    }, []);

    // ─── Search Handler ─────────────────────────────────────────────

    const handleSearch = useCallback(async () => {
        if (!query.trim() || !location.trim()) return;

        setIsSearching(true);
        setError(null);
        setSearchResults([]);
        setProcessedJobs(new Map());
        setSelectedIndex(null);

        try {
            const res = await fetch('/api/jobs/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query.trim(), location: location.trim() }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Search failed');

            setSearchResults(data.jobs || []);

            // Auto-process top 5 results through the deep pipeline
            const topJobs = (data.jobs || []).slice(0, 5);
            topJobs.forEach((_: SerpApiJob, i: number) => {
                processJob(i, data.jobs[i]);
            });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSearching(false);
        }
    }, [query, location]);

    // ─── Process Single Job ─────────────────────────────────────────

    const processJob = async (index: number, serpApiJob: SerpApiJob) => {
        if (processingJobs.has(index) || processedJobs.has(index)) return;

        setProcessingJobs(prev => new Set(prev).add(index));

        try {
            const res = await fetch('/api/jobs/search/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serpApiJob,
                    searchQuery: `${query} ${location}`,
                }),
            });

            const data = await res.json();

            if (data.success && data.job) {
                setProcessedJobs(prev => {
                    const next = new Map(prev);
                    next.set(index, data.job);
                    return next;
                });
            }
        } catch (err) {
            console.error(`Failed to process job ${index}:`, err);
        } finally {
            setProcessingJobs(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }
    };

    // ─── Score Badge ────────────────────────────────────────────────

    const ScoreBadge = ({ score }: { score: number | null }) => {
        if (score === null) return <span className="text-xs text-stone-400">—</span>;
        const color = score >= 75 ? 'text-green-700 bg-green-50 border-green-200'
            : score >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200'
                : 'text-red-700 bg-red-50 border-red-200';
        const emoji = score >= 75 ? '🟢' : score >= 50 ? '🟡' : '🔴';
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
                {emoji} {score}%
            </span>
        );
    };

    // ─── Recommendation Badge ──────────────────────────────────────

    const RecBadge = ({ rec }: { rec: string | null }) => {
        if (!rec) return null;
        const map: Record<string, { label: string; cls: string }> = {
            apply: { label: 'Bewerben!', cls: 'text-green-700 bg-green-50' },
            consider: { label: 'Prüfen', cls: 'text-amber-700 bg-amber-50' },
            skip: { label: 'Überspringen', cls: 'text-red-700 bg-red-50' },
        };
        const info = map[rec] || { label: rec, cls: 'text-stone-600 bg-stone-50' };
        return (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${info.cls}`}>
                {info.label}
            </span>
        );
    };

    const selectedJob = selectedIndex !== null ? searchResults[selectedIndex] : null;
    const selectedProcessed = selectedIndex !== null ? processedJobs.get(selectedIndex) : null;

    return (
        <div className="space-y-6 max-w-[1200px]">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-[#37352F]">🔍 Job Search</h1>
                <p className="text-sm text-[#73726E] mt-1">
                    Finde passende Jobs — KI-bewertet nach deinem Werteprofil.
                </p>
            </div>

            {/* Search Bar */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-[#E7E7E5] rounded-xl p-5 shadow-sm"
            >
                <div className="flex gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" />
                        <input
                            type="text"
                            placeholder="Jobtitel eingeben..."
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
                {suggestedTitles.length > 0 && !isSearching && searchResults.length === 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-[#A8A29E] flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Vorschläge:
                        </span>
                        {suggestedTitles.map(title => (
                            <motion.button
                                key={title}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => { setQuery(title); }}
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
                            <div className="mt-4 pt-4 border-t border-[#E7E7E5] grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-[#73726E] mb-1.5 block">Erfahrungslevel</label>
                                    <div className="flex gap-2">
                                        {['Entry', 'Mid', 'Senior', 'Lead'].map(level => (
                                            <button
                                                key={level}
                                                className="px-3 py-1.5 rounded-md text-xs border border-[#E7E7E5] text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a] transition-colors"
                                            >
                                                {level}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[#73726E] mb-1.5 block">Organisationsform</label>
                                    <div className="flex gap-2">
                                        {['Startup', 'Konzern', 'NGO', 'Staat'].map(org => (
                                            <button
                                                key={org}
                                                className="px-3 py-1.5 rounded-md text-xs border border-[#E7E7E5] text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a] transition-colors"
                                            >
                                                {org}
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
                    <p className="text-sm text-[#73726E]">Durchsuche Google Jobs...</p>
                </div>
            )}

            {/* Results */}
            {!isSearching && searchResults.length > 0 && (
                <div className="flex gap-6">
                    {/* Left: Results List */}
                    <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-[#37352F]">
                                ERGEBNISSE ({searchResults.length} Jobs)
                            </h2>
                        </div>

                        {searchResults.map((job, i) => {
                            const processed = processedJobs.get(i);
                            const isProcessing = processingJobs.has(i);
                            const isSelected = selectedIndex === i;
                            const isAdded = processed?.id && addedToQueue.has(processed.id);

                            return (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    whileHover={{ scale: 1.01, y: -1 }}
                                    onClick={() => {
                                        setSelectedIndex(i);
                                        if (!processed && !isProcessing) processJob(i, job);
                                    }}
                                    className={`p-4 rounded-lg border cursor-pointer transition-all ${isSelected
                                        ? 'border-[#002e7a] bg-[#f0f4ff] shadow-sm'
                                        : 'border-[#E7E7E5] bg-white hover:border-[#002e7a]/30 hover:shadow-sm'
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-semibold text-[#37352F] truncate">
                                                    {job.company_name}
                                                </h3>
                                                {isAdded && (
                                                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                                )}
                                            </div>
                                            <p className="text-xs text-[#73726E] mt-0.5 truncate">
                                                {job.title} · {job.location}
                                            </p>
                                            {job.detected_extensions?.posted_at && (
                                                <p className="text-[10px] text-[#A8A29E] mt-1">
                                                    {job.detected_extensions.posted_at}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0 ml-3">
                                            {isProcessing ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-[#002e7a]" />
                                            ) : processed ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <ScoreBadge score={processed.match_score_overall} />
                                                    <RecBadge rec={processed.recommendation} />
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-[#A8A29E]">Klick für Score</span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Right: Detail Panel */}
                    <AnimatePresence mode="wait">
                        {selectedJob && (
                            <motion.div
                                key={selectedIndex}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ duration: 0.2 }}
                                className="w-[400px] shrink-0"
                            >
                                <div className="bg-white border border-[#E7E7E5] rounded-xl p-5 shadow-sm sticky top-8 space-y-4">
                                    {/* Header */}
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-base font-bold text-[#37352F]">
                                                {selectedJob.company_name}
                                            </h3>
                                            <button
                                                onClick={() => setSelectedIndex(null)}
                                                className="text-[#A8A29E] hover:text-[#37352F]"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <p className="text-sm text-[#73726E] mt-0.5">
                                            {selectedJob.title} · {selectedJob.location}
                                        </p>
                                        {selectedJob.detected_extensions?.schedule_type && (
                                            <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-[#F7F7F5] text-[10px] text-[#73726E] border border-[#E7E7E5]">
                                                {selectedJob.detected_extensions.schedule_type}
                                            </span>
                                        )}
                                    </div>

                                    {/* Loading state */}
                                    {processingJobs.has(selectedIndex!) && (
                                        <div className="bg-[#f0f4ff] rounded-lg p-4 flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 animate-spin text-[#002e7a]" />
                                            <div>
                                                <p className="text-xs font-medium text-[#002e7a]">Analysiere...</p>
                                                <p className="text-[10px] text-[#002e7a]/60">Firecrawl → GPT-4o-mini → Claude Judge</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Processed data */}
                                    {selectedProcessed && (
                                        <>
                                            {/* Match Score */}
                                            <div className="text-center py-2">
                                                <p className="text-xs text-[#73726E] mb-1">MATCH-SCORE</p>
                                                <span className="text-3xl font-bold text-[#002e7a]">
                                                    {selectedProcessed.match_score_overall ?? '—'}
                                                    {selectedProcessed.match_score_overall !== null && (
                                                        <span className="text-lg">%</span>
                                                    )}
                                                </span>
                                            </div>

                                            {/* Score Breakdown */}
                                            {selectedProcessed.score_breakdown && (
                                                <div className="space-y-2">
                                                    <p className="text-[10px] font-semibold text-[#73726E] uppercase tracking-wider">Score Breakdown</p>
                                                    {Object.entries(selectedProcessed.score_breakdown).map(([key, val]) => (
                                                        <div key={key} className="flex items-center gap-2">
                                                            <span className="text-[10px] text-[#73726E] w-28 truncate capitalize">
                                                                {key.replace('_', ' ')}
                                                            </span>
                                                            <div className="flex-1 h-1.5 bg-[#F4F4F0] rounded-full overflow-hidden">
                                                                <motion.div
                                                                    initial={{ width: 0 }}
                                                                    animate={{ width: `${val}%` }}
                                                                    transition={{ duration: 0.6, delay: 0.2 }}
                                                                    className="h-full rounded-full"
                                                                    style={{
                                                                        backgroundColor: val >= 70 ? '#16a34a' : val >= 40 ? '#d97706' : '#dc2626',
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] font-mono text-[#73726E] w-8 text-right">{val}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Judge Reasoning */}
                                            {selectedProcessed.judge_reasoning && (
                                                <div className="bg-[#F7F7F5] rounded-lg p-3">
                                                    <p className="text-[10px] font-semibold text-[#73726E] uppercase tracking-wider mb-1">JUDGE-EMPFEHLUNG (Claude)</p>
                                                    <p className="text-xs text-[#37352F] leading-relaxed">
                                                        {selectedProcessed.judge_reasoning}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Flags */}
                                            {(selectedProcessed.green_flags?.length > 0 || selectedProcessed.red_flags?.length > 0) && (
                                                <div className="space-y-2">
                                                    {selectedProcessed.green_flags?.map((flag, i) => (
                                                        <div key={`g-${i}`} className="flex items-start gap-2">
                                                            <span className="text-green-500 text-xs mt-0.5">✅</span>
                                                            <span className="text-xs text-[#37352F]">{flag}</span>
                                                        </div>
                                                    ))}
                                                    {selectedProcessed.red_flags?.map((flag, i) => (
                                                        <div key={`r-${i}`} className="flex items-start gap-2">
                                                            <span className="text-red-500 text-xs mt-0.5">⚠️</span>
                                                            <span className="text-xs text-[#37352F]">{flag}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* ATS Keywords */}
                                            {selectedProcessed.ats_keywords?.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] font-semibold text-[#73726E] uppercase tracking-wider mb-2">ATS KEYWORDS</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {selectedProcessed.ats_keywords.slice(0, 8).map(kw => (
                                                            <span key={kw} className="px-2 py-0.5 rounded-md bg-[#f0f4ff] text-[#002e7a] text-[10px] font-medium border border-[#002e7a]/10">
                                                                {kw}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Description (always visible) */}
                                    {selectedJob.description && (
                                        <div>
                                            <p className="text-[10px] font-semibold text-[#73726E] uppercase tracking-wider mb-1">BESCHREIBUNG</p>
                                            <p className="text-xs text-[#37352F] leading-relaxed line-clamp-4">
                                                {selectedJob.description}
                                            </p>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex flex-col gap-2 pt-2 border-t border-[#E7E7E5]">
                                        {selectedJob.apply_link && (
                                            <a
                                                href={selectedJob.apply_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[#E7E7E5] text-xs text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a] transition-colors"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                Stellenanzeige öffnen
                                            </a>
                                        )}
                                        {selectedProcessed && !addedToQueue.has(selectedProcessed.id) ? (
                                            <motion.button
                                                whileHover={{ scale: 1.02, y: -1 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => {
                                                    setAddedToQueue(prev => new Set(prev).add(selectedProcessed.id));
                                                }}
                                                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#002e7a] text-white text-sm font-medium hover:bg-[#001d4f] transition-colors"
                                            >
                                                <ArrowRight className="w-4 h-4" />
                                                In Queue aufnehmen
                                            </motion.button>
                                        ) : selectedProcessed ? (
                                            <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium border border-green-200">
                                                <CheckCircle2 className="w-4 h-4" />
                                                In der Queue
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Empty State */}
            {!isSearching && searchResults.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#f0f4ff] flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-[#002e7a]" />
                    </div>
                    <h3 className="text-sm font-semibold text-[#37352F] mb-1">
                        Starte deine Jobsuche
                    </h3>
                    <p className="text-xs text-[#73726E] max-w-sm">
                        Gib einen Jobtitel und Ort ein. Pathly durchsucht Google Jobs,
                        analysiert jede Stelle und bewertet den Culture Fit für dich.
                    </p>
                </div>
            )}
        </div>
    );
}
