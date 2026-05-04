'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { HookCard } from '../cards/HookCard';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import type { SetupDataResponse, SelectedHook, SelectedQuote } from '@/types/cover-letter-setup';
import { ProgressLoadingPanel } from '../ProgressLoadingPanel';

import { AlertCircle, ChevronRight, ChevronDown, SkipForward, RefreshCw, Quote, Globe } from 'lucide-react';

// ─── State Machine ─────────────────────────────────────────────────
type Phase = 'idle' | 'analyzing' | 'results' | 'quotePrompt' | 'quoteSearching' | 'quoteResults';

const QUOTE_CATEGORIES: { key: string; labelKey: string; keywords: string[] }[] = [
    { key: 'Beratung_Business_Management_Strategie', labelKey: 'quote_cat_consulting', keywords: ['berater', 'consultant', 'strategy', 'strategie', 'management', 'business', 'projektmanager', 'project manager'] },
    { key: 'Engineering_Produktion_Industrie_Operations', labelKey: 'quote_cat_engineering', keywords: ['engineer', 'ingenieur', 'produktion', 'operations', 'supply chain', 'logistik'] },
    { key: 'Finanzen_Banking_Investment_Controlling', labelKey: 'quote_cat_finance', keywords: ['finance', 'finanz', 'banking', 'controlling', 'accountant', 'audit'] },
    { key: 'HR_People_Culture_Leadership', labelKey: 'quote_cat_hr', keywords: ['hr', 'human resources', 'people', 'recruiter', 'personal', 'leadership', 'training'] },
    { key: 'Healthcare_Medizin_Pflege_PublicHealth', labelKey: 'quote_cat_healthcare', keywords: ['health', 'medizin', 'pflege', 'pharma', 'biotech', 'medical'] },
    { key: 'IT_Tech_Software_SaaS', labelKey: 'quote_cat_it', keywords: ['software', 'developer', 'entwickler', 'tech', 'saas', 'devops', 'frontend', 'backend', 'cloud', 'data engineer'] },
    { key: 'Kreativbranche_Design_Medien_Kommunikation', labelKey: 'quote_cat_creative', keywords: ['design', 'kreativ', 'creative', 'medien', 'content', 'ux', 'ui', 'brand', 'video'] },
    { key: 'Nachhaltigkeit_SocialImpact_CSR_ESG', labelKey: 'quote_cat_sustainability', keywords: ['nachhaltigkeit', 'sustainability', 'esg', 'csr', 'umwelt', 'energie'] },
    { key: 'Politik_PublicSector_NGO_InternationaleZusammenarbeit', labelKey: 'quote_cat_politics', keywords: ['politik', 'political', 'ngo', 'verwaltung', 'government'] },
    { key: 'Sales_Vertrieb_Customersuccess_Marketing', labelKey: 'quote_cat_sales', keywords: ['sales', 'vertrieb', 'marketing', 'customer success', 'account manager', 'business development', 'e-commerce'] },
    { key: 'Wissenschaft_Forschung_Data_Bildung', labelKey: 'quote_cat_science', keywords: ['wissenschaft', 'research', 'forschung', 'data', 'bildung', 'education', 'analytics', 'data scientist', 'ai '] },
];

const SKIP_HOOK_ID = 'skip-company-analysis';
const MAX_QUOTE_GENERATIONS = 2;

interface Props {
    jobId: string;
    companyName: string;
    setupData: SetupDataResponse;
    onNext: () => void;
    onReloadData?: () => Promise<void>;
}

export function StepHookSelection({ jobId, companyName, setupData, onNext, onReloadData }: Props) {
    const t = useTranslations('cover_letter');
    // Locale-based quote language: 'de' → German quotes, 'en'/'es' → English quotes
    const locale = useLocale();
    const quoteLanguage: 'de' | 'en' = locale === 'de' ? 'de' : 'en';
    const { selectedHook, selectedQuote, fetchedQuotes, introFocus, optInModules, setHook, setQuote, setFetchedQuotes, setIntroFocus, setOptInModule } = useCoverLetterSetupStore();
    const [manualText, setManualText] = useState('');
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [openAccordion, setOpenAccordion] = useState<string | null>(null);
    const [websiteInput, setWebsiteInput] = useState(setupData.companyWebsite || '');
    const [validationWarning, setValidationWarning] = useState<string | null>(null);
    const [quoteRefreshCount, setQuoteRefreshCount] = useState(() => {
        if (typeof window === 'undefined') return 0;
        const saved = window.localStorage.getItem(`cover-letter-quote-generations:${jobId}`);
        const parsed = saved ? Number(saved) : 0;
        return Number.isFinite(parsed) ? Math.min(parsed, MAX_QUOTE_GENERATIONS) : 0;
    });

    // Auto-detect category from job title (mirrors quote-service.ts CATEGORY_KEYWORDS)
    const autoDetectedCategory = useMemo(() => {
        const title = (setupData.jobTitle || '').toLowerCase();
        if (!title) return null;
        let bestCat: string | null = null;
        let bestScore = 0;
        for (const cat of QUOTE_CATEGORIES) {
            let score = 0;
            for (const kw of cat.keywords) {
                if (title.includes(kw)) score++;
            }
            if (score > bestScore) { bestScore = score; bestCat = cat.key; }
        }
        return bestCat;
    }, [setupData.jobTitle]);

    const [selectedQuoteCategory, setSelectedQuoteCategory] = useState<string | null>(autoDetectedCategory);

    useEffect(() => {
        setSelectedQuoteCategory(prev => prev ?? autoDetectedCategory);
    }, [autoDetectedCategory]);

    // ─── State Machine: resume at correct phase ────────────────────
    const getInitialPhase = (): Phase => {
        // If user already selected a hook (returning from Step 2), show results
        if (selectedHook) return 'results';
        // If data already loaded, skip to results
        if (setupData.hasPerplexityData) return 'results';
        return 'idle';
    };

    const [phase, setPhase] = useState<Phase>(getInitialPhase);
    const [analysisStep, setAnalysisStep] = useState(0);
    const analysisSteps = useMemo(() => [
        t('step_reading_website'),
        t('step_analyzing_vision'),
        t('step_checking_values'),
        t('step_preparing_results'),
    ], [t]);

    useEffect(() => {
        setWebsiteInput(prev => prev || setupData.companyWebsite || '');
    }, [setupData.companyWebsite]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = window.localStorage.getItem(`cover-letter-quote-generations:${jobId}`);
        const parsed = saved ? Number(saved) : 0;
        setQuoteRefreshCount(Number.isFinite(parsed) ? Math.min(parsed, MAX_QUOTE_GENERATIONS) : 0);
    }, [jobId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(`cover-letter-quote-generations:${jobId}`, String(quoteRefreshCount));
    }, [jobId, quoteRefreshCount]);

    useEffect(() => {
        if (phase === 'idle' && !selectedHook && setupData.hasPerplexityData) {
            setPhase('results');
        }
    }, [phase, selectedHook, setupData.hasPerplexityData]);

    // i18n-translated typeLabel for HookCard badges
    const hookTypeLabel = useMemo(() => ({
        news: `\uD83D\uDCF0 ${t('hook_type_news')}`,
        value: `\uD83D\uDCA1 ${t('hook_type_value')}`,
        quote: `\uD83D\uDCAC ${t('hook_type_quote')}`,
        linkedin: `\uD83D\uDCBC ${t('hook_type_linkedin')}`,
        manual: `\u270F\uFE0F ${t('hook_type_manual')}`,
        vision: `\uD83C\uDFAF ${t('hook_type_vision')}`,
        project: `\uD83D\uDE80 ${t('hook_type_project')}`,
        funding: `\uD83D\uDCB0 ${t('hook_type_funding')}`,
    }) as Record<import('@/types/cover-letter-setup').HookType, string>, [t]);

    const analysisGroups = useMemo(() => {
        const filteredHooks = setupData.hooks.filter(h => h.type !== 'quote');
        const groups: { label: string; icon: string; types: string[] }[] = [
            { label: t('cat_vision'), icon: '', types: ['vision'] },
            { label: t('cat_values'), icon: '✦', types: ['value'] },
            { label: t('cat_projects'), icon: '↗', types: ['project'] },
            { label: t('cat_funding'), icon: '↟', types: ['funding'] },
        ];

        return groups
            .map(group => ({
                ...group,
                hooks: filteredHooks.filter(h => group.types.includes(h.type)),
            }))
            .filter(group => group.hooks.length > 0);
    }, [setupData.hooks, t]);

    const isSkipHook = selectedHook?.id === SKIP_HOOK_ID;
    const hasCompanyHookSelection = !!selectedHook && !isSkipHook;
    const selectedManualIsValid = selectedHook?.type !== 'manual' || isSkipHook || selectedHook.content.trim().length > 10;
    const canProceed = !selectedHook || selectedManualIsValid;

    const createSkipHook = (): SelectedHook => ({
        id: SKIP_HOOK_ID,
        type: 'manual',
        label: t('skip_company_hook_label'),
        content: '',
        sourceName: '',
        sourceUrl: '',
        sourceAge: '',
        relevanceScore: 0,
    });

    // ─── Hook selection (no auto-advance) ──────────────────────────
    const handleSelect = (hook: SelectedHook) => {
        if (selectedHook?.id !== hook.id) {
            setQuote(null);
            setFetchedQuotes([]);
            setPhase('results');
        }
        if (hook.type === 'manual') {
            setHook({ ...hook, content: manualText });
        } else {
            setHook(hook);
        }
    };

    const handleManualChange = (text: string) => {
        setManualText(text);
        const manualHook = setupData.hooks.find((h) => h.type === 'manual');
        if (manualHook && selectedHook?.type === 'manual') {
            setHook({ ...manualHook, content: text });
        }
    };

    // ─── Phase A: Company Analysis ─────────────────────────────────
    const handleAnalyze = async (websiteOverride?: string) => {
        const website = websiteOverride || websiteInput || setupData.companyWebsite;
        if (!website || website.trim().length < 4) {
            setValidationWarning(t('alert_no_website'));
            return;
        }
        setValidationWarning(null);

        setPhase('analyzing');
        setAnalysisStep(1);
        try {
            // First: save the website to the job so it's persisted for future use
            await fetch(`/api/jobs/${jobId}/context`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_website: website.trim() }),
            });

            const res = await fetch('/api/jobs/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, companyName, website: website.trim() })
            });
            if (!res.ok) throw new Error('Enrichment failed');

            // Real API done — now reload data
            setAnalysisStep(4);
            if (onReloadData) {
                await onReloadData();
            }
            setPhase('results');
        } catch (err) {
            console.error('❌ [StepHook] Analysis failed:', err);
            setPhase('idle');
            setValidationWarning(t('alert_analysis_failed'));
        }
    };

    // Update analysis step based on elapsed time (real progress, not fake)
    useEffect(() => {
        if (phase !== 'analyzing') return;
        const t1 = setTimeout(() => setAnalysisStep(2), 3000);
        const t2 = setTimeout(() => setAnalysisStep(3), 7000);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [phase]);

    // ─── Phase B: Quote Search ─────────────────────────────────────
    const handleQuoteSearch = async (categoryOverride?: string) => {
        if (quoteRefreshCount >= MAX_QUOTE_GENERATIONS) {
            return;
        }
        setPhase('quoteSearching');
        setQuoteError(null);
        setQuoteRefreshCount(prev => prev + 1);
        try {
            // Extract company values from value/vision hooks (primary)
            // Fall back to all non-manual hooks if primary is insufficient
            let companyValues = hasCompanyHookSelection && selectedHook?.content
                ? [selectedHook.content]
                : setupData.hooks
                    .filter(h => h.type === 'value' || h.type === 'vision')
                    .map(h => h.content)
                    .slice(0, 3);

            if (companyValues.length === 0) {
                companyValues = setupData.hooks
                    .filter(h => h.type !== 'manual' && h.type !== 'quote')
                    .map(h => h.content)
                    .slice(0, 3);
            }

            // Extract vision separately for richer thinker identification
            const companyVision = setupData.hooks
                .find(h => h.type === 'vision')
                ?.content ?? '';

            const res = await fetch('/api/cover-letter/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    companyName,
                    companyValues,
                    companyVision,
                    jobTitle: setupData.jobTitle ?? undefined,
                    // Quote language follows UI locale, NOT job language.
                    // de → German quotes, en/es → English quotes (per product spec 2026-03-30)
                    language: quoteLanguage,
                    // User-selected category override (null = auto-detect)
                    categoryOverride: categoryOverride || selectedQuoteCategory || undefined,
                })
            });
            if (!res.ok) throw new Error('Quote search failed');

            const data = await res.json();
            setFetchedQuotes(data.quotes || []);
            setPhase('quoteResults');
        } catch (err) {
            console.error('❌ [StepHook] Quote search failed:', err);
            setQuoteError(t('quote_error'));
            setPhase('quotePrompt');
        }
    };

    const handleQuoteCategorySelect = (categoryKey: string) => {
        if (!hasCompanyHookSelection || quoteRefreshCount >= MAX_QUOTE_GENERATIONS || phase === 'quoteSearching') {
            return;
        }
        setSelectedQuoteCategory(categoryKey);
        void handleQuoteSearch(categoryKey);
    };

    const handleProceedToStep2 = () => {
        // WHY: Only call onNext() — parent (CoverLetterWizard) handles setStep(2).
        // Previously this called setStep(2) + onNext() (which also called setStep(2)),
        // causing a double Zustand update that raced with AnimatePresence transitions.
        if (selectedHook?.type === 'manual' && !isSkipHook && selectedHook.content.trim().length <= 10) {
            return;
        }
        if (!selectedHook) {
            setHook(createSkipHook());
        }
        onNext();
    };

    const renderQuoteCategoryPicker = () => (
        <div>
            <label className="text-[10px] font-medium text-[#73726E] mb-1.5 block">
                {t('quote_category_label')}
            </label>
            <div className="flex flex-wrap gap-1.5">
                {QUOTE_CATEGORIES.map(cat => (
                    <button
                        key={cat.key}
                        type="button"
                        onClick={() => handleQuoteCategorySelect(cat.key)}
                        disabled={!hasCompanyHookSelection || quoteRefreshCount >= MAX_QUOTE_GENERATIONS || phase === 'quoteSearching'}
                        className={[
                            'px-[0.66rem] py-[0.28rem] rounded-full text-[10.5px] font-medium transition-all border',
                            selectedQuoteCategory === cat.key
                                ? 'bg-[#002e7a] text-white border-[#002e7a]'
                                : cat.key === autoDetectedCategory && !selectedQuoteCategory
                                    ? 'bg-[#f0f4ff] text-[#002e7a] border-[#002e7a]/30'
                                    : 'bg-white text-[#73726E] border-[#E7E7E5] hover:border-[#002e7a]/30 hover:text-[#37352F]',
                            !hasCompanyHookSelection || quoteRefreshCount >= MAX_QUOTE_GENERATIONS || phase === 'quoteSearching'
                                ? 'cursor-not-allowed opacity-60'
                                : '',
                        ].join(' ')}
                    >
                        {t(cat.labelKey)}
                    </button>
                ))}
            </div>
        </div>
    );

    // ─── Phase A: IDLE ─────────────────────────────────────────────
    if (phase === 'idle') {
        return (
            <div className="px-1 py-6 flex flex-col items-center justify-center text-center">
                <h3 className="text-xl font-semibold text-[#37352F] mb-2">
                    {t('analysis_title', { company: companyName })}
                </h3>
                <p className="text-[#73726E] text-sm max-w-md mb-4 leading-relaxed">
                    {t('analysis_desc', { company: companyName })}
                </p>

                {/* Website Input */}
                <div className="w-full max-w-md mb-4">
                    <label className="text-xs font-medium text-[#37352F] mb-1.5 block text-left">
                        <Globe className="w-3.5 h-3.5 inline mr-1" />
                        {t('website_label')}
                    </label>
                    <input
                        type="url"
                        value={websiteInput}
                        onChange={(e) => setWebsiteInput(e.target.value)}
                        placeholder={t('website_placeholder')}
                        className="w-full text-sm text-[#37352F] border border-[#E7E7E5] rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#002e7a]/20 focus:border-[#002e7a] placeholder-[#A8A29E] transition-all"
                    />
                    <p className="text-[10px] text-[#A8A29E] mt-1 text-left">
                        {t('website_hint')}
                    </p>
                </div>

                <div className="w-full max-w-md flex justify-center">
                    <button
                        type="button"
                        onClick={() => handleAnalyze()}
                        disabled={!websiteInput || websiteInput.trim().length < 4}
                        className={[
                            'w-full py-3.5 rounded-xl text-sm font-semibold tracking-tight transition-colors',
                            !websiteInput || websiteInput.trim().length < 4
                                ? 'bg-[#E7E7E5] text-[#A8A29E] cursor-not-allowed'
                                : 'bg-[#002e7a] text-white hover:bg-[#001d4f] cursor-pointer',
                        ].join(' ')}
                    >
                        {t('analyze_btn', { company: companyName })}
                    </button>
                </div>

                {validationWarning && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 mt-3 max-w-md">
                        <span>⚠️</span><span>{validationWarning}</span>
                    </div>
                )}
            </div>
        );
    }

    // ─── Phase A: ANALYZING ────────────────────────────────────────
    if (phase === 'analyzing') {
        return (
            <div className="px-1 py-4">
                <ProgressLoadingPanel
                    title={t('analysis_loading_title')}
                    duration={t('analysis_loading_duration')}
                    steps={analysisSteps}
                    activeStep={Math.max(analysisStep - 1, 0)}
                    className="max-w-3xl mx-auto"
                />
            </div>
        );
    }

    // ─── Phase A: RESULTS + Phase B ────────────────────────────────
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-start gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        {t('results_title', { company: companyName })}
                    </h3>
                    <p className="text-xs text-[#73726E] mt-1 max-w-2xl leading-relaxed">
                        {t('results_desc')}
                    </p>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(380px,1.1fr)]">
                <section className="border border-[#E7E7E5] rounded-lg bg-white">
                    <div className="flex items-start justify-between gap-3 border-b border-[#E7E7E5] px-3 py-2.5">
                        <div>
                            <h4 className="text-xs font-semibold text-[#37352F]">
                                {t('analysis_panel_title')}
                            </h4>
                            <p className="text-[11px] text-[#73726E] mt-0.5 leading-relaxed">
                                {t('analysis_panel_desc')}
                            </p>
                        </div>
                        <span className="text-[10px] text-[#73726E] bg-[#f7f7f5] border border-[#E7E7E5] rounded-full px-2 py-0.5">
                            {t('optional_badge')}
                        </span>
                    </div>

                    <div className="p-3 space-y-3">
                        {analysisGroups.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[#D6D6D3] bg-[#fafaf9] p-4">
                            <div className="flex gap-2">
                                <AlertCircle className="w-4 h-4 text-[#73726E] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-semibold text-[#37352F]">
                                        {t('analysis_empty_title')}
                                    </p>
                                    <p className="text-[11px] text-[#73726E] leading-relaxed mt-1">
                                        {t('analysis_empty_desc')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => handleAnalyze()}
                                        className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#002e7a] hover:text-[#001e5a]"
                                    >
                                        <RefreshCw className="w-3 h-3" /> {t('btn_refresh')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        analysisGroups.map(group => {
                            const hasSelection = group.hooks.some(h => selectedHook?.id === h.id);
                            const isOpen = openAccordion === group.label || hasSelection;
                            const bestScore = Math.max(...group.hooks.map(h => Math.round((h.relevanceScore || 0) * 100)));

                            return (
                                <div key={group.label} className="border border-[#E7E7E5] rounded-lg overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setOpenAccordion(isOpen && !hasSelection ? null : group.label)}
                                        className={[
                                            'w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors',
                                            isOpen ? 'bg-[#f7f7f5]' : 'bg-white hover:bg-[#fafaf9]',
                                        ].join(' ')}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xs text-[#37352F]">{group.icon}</span>
                                            <span className="text-xs font-semibold text-[#37352F] truncate">{group.label}</span>
                                            <span className="text-[10px] text-[#A8A29E] font-medium">
                                                ({group.hooks.length})
                                            </span>
                                            {hasSelection && (
                                                <span className="text-[10px] bg-[#002e7a] text-white px-1.5 py-0.5 rounded-full font-medium">
                                                    {t('badge_selected')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {bestScore > 0 && (
                                                <span className="text-[10px] text-[#73726E] font-medium">
                                                    {t('match_up_to', { score: bestScore })}
                                                </span>
                                            )}
                                            <ChevronDown className={[
                                                'w-3.5 h-3.5 text-[#A8A29E] transition-transform',
                                                isOpen ? 'rotate-180' : '',
                                            ].join(' ')} />
                                        </div>
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {isOpen && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[#E7E7E5]">
                                                    {group.hooks.map((hook) => (
                                                        <HookCard
                                                            key={hook.id}
                                                            hook={hook}
                                                            isSelected={selectedHook?.id === hook.id}
                                                            onSelect={() => handleSelect(hook)}
                                                            typeLabel={hookTypeLabel}
                                                            manualPlaceholder={t('manual_hook_placeholder')}
                                                        />
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })
                        )}

                        {selectedHook?.type === 'manual' && !isSkipHook && (
                            <textarea
                                value={manualText}
                                onChange={(e) => handleManualChange(e.target.value)}
                                placeholder={t('manual_placeholder')}
                                rows={3}
                                className="w-full text-xs text-[#37352F] border border-[#002e7a] rounded-lg p-3 resize-none outline-none focus:ring-1 focus:ring-[#002e7a] placeholder-[#A8A29E]"
                            />
                        )}
                    </div>
                </section>

                <aside className="space-y-3 lg:sticky lg:top-4 self-start">
                    <div className="border border-[#E7E7E5] rounded-lg bg-white">
                        <div className="flex items-start justify-between gap-3 border-b border-[#E7E7E5] px-3 py-2.5">
                            <div className="flex items-center gap-2">
                                <Quote className="w-4 h-4 text-[#002e7a] shrink-0" />
                                <div>
                                    <h4 className="text-xs font-semibold text-[#37352F]">{t('quote_panel_title')}</h4>
                                    <p className="text-[11px] text-[#73726E] mt-0.5">{t('quote_panel_desc')}</p>
                                </div>
                            </div>
                            <span className="text-[10px] text-[#73726E] bg-[#f7f7f5] border border-[#E7E7E5] rounded-full px-2 py-0.5">
                                {t('optional_badge')}
                            </span>
                        </div>

                        <div className="p-3 space-y-3">
                            {!hasCompanyHookSelection ? (
                                <div className="rounded-lg bg-[#fafaf9] border border-[#E7E7E5] p-3">
                                    <p className="text-xs font-semibold text-[#37352F]">
                                        {isSkipHook ? t('quote_no_analysis_title') : t('quote_waiting_title')}
                                    </p>
                                    <p className="text-[11px] text-[#73726E] leading-relaxed mt-1">
                                        {isSkipHook ? t('quote_no_analysis_desc') : t('quote_waiting_desc')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setQuote(null)}
                                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E7E7E5] text-[11px] font-medium text-[#73726E] hover:bg-white"
                                    >
                                        <SkipForward className="w-3 h-3" /> {t('btn_skip_quote')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {phase === 'quoteSearching' ? (
                                        <div className="py-8 flex flex-col items-center text-center">
                                            <div className="w-8 h-8 border-2 border-[#002e7a]/20 border-t-[#002e7a] rounded-full animate-spin mb-4" />
                                            <p className="text-sm text-[#37352F] font-medium">{t('quote_searching')}</p>
                                            <p className="text-xs text-[#73726E] mt-1">{t('quote_searching_desc')}</p>
                                        </div>
                                    ) : fetchedQuotes.length > 0 ? (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                                            <div className="flex justify-between items-center gap-3">
                                                <h4 className="text-xs font-semibold text-[#37352F]">
                                                    {t('quote_results_title', { count: fetchedQuotes.length })}
                                                </h4>
                                                <button
                                                    type="button"
                                                    onClick={() => setQuote(null)}
                                                    className="text-[10px] text-[#73726E] hover:text-[#002e7a]"
                                                >
                                                    {t('btn_skip_quote')}
                                                </button>
                                            </div>

                                            {renderQuoteCategoryPicker()}

                                            <p className="text-[10px] text-[#A8A29E]">
                                                {t('quote_generation_counter', { count: quoteRefreshCount, max: MAX_QUOTE_GENERATIONS })}
                                            </p>

                                            <div className="grid grid-cols-1 gap-2">
                                                {!setupData.isReturningUser && (
                                                    <div className="bg-[#FFFBE6] border border-[#F5E6A3] rounded-lg p-3 mb-1">
                                                        <p className="text-xs font-semibold text-[#8B7000] mb-1.5">{t('quote_example_title')}</p>
                                                        <p className="text-xs text-[#5C4A00] leading-relaxed mb-1">
                                                            {t('quote_example_intro')}
                                                        </p>
                                                        <p className="text-xs text-[#5C4A00] italic leading-relaxed mb-1">
                                                            {t('quote_example_quote')}
                                                        </p>
                                                        <p className="text-xs text-[#5C4A00] leading-relaxed">
                                                            {t('quote_example_outro')}
                                                        </p>
                                                    </div>
                                                )}
                                                {fetchedQuotes.map((q, i) => (
                                                    <motion.button
                                                        key={i}
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: i * 0.08 }}
                                                        onClick={() => setQuote(selectedQuote?.quote === q.quote ? null : q)}
                                                        className={[
                                                            'text-left w-full p-3 rounded-lg border transition-all',
                                                            selectedQuote?.quote === q.quote
                                                                ? 'border-2 border-[#002e7a] bg-[#f0f4ff] shadow-sm'
                                                                : 'border-[#E7E7E5] bg-white hover:shadow-sm hover:border-[#d6d6d6]',
                                                        ].join(' ')}
                                                    >
                                                        <p className="text-xs text-[#37352F] italic leading-relaxed">
                                                            &ldquo;{q.quote}&rdquo;
                                                        </p>
                                                        <div className="flex items-center justify-between gap-2 mt-2">
                                                            <span className="text-[10px] font-medium text-[#002e7a]">
                                                                {q.author}
                                                            </span>
                                                            {q.source && (
                                                                <span className="text-[10px] text-[#A8A29E] truncate">
                                                                    {q.source}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </motion.button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                                            {phase === 'quoteResults' && (
                                                <div className="rounded-lg border border-dashed border-[#D6D6D3] bg-[#fafaf9] p-3">
                                                    <p className="text-xs font-semibold text-[#37352F]">{t('quote_empty_title')}</p>
                                                    <p className="text-[11px] text-[#73726E] leading-relaxed mt-1">{t('quote_empty_desc')}</p>
                                                </div>
                                            )}

                                            {renderQuoteCategoryPicker()}

                                            <button
                                                type="button"
                                                onClick={() => setQuote(null)}
                                                className="flex items-center gap-2 px-4 py-2 text-[#73726E] text-xs font-medium rounded-lg border border-[#E7E7E5] hover:bg-gray-50 transition-colors"
                                            >
                                                <SkipForward className="w-3.5 h-3.5" />
                                                {t('btn_skip_quote')}
                                            </button>
                                            {quoteError && (
                                                <p className="text-xs text-red-500">{quoteError}</p>
                                            )}
                                            <p className="text-[10px] text-[#A8A29E]">
                                                {t('quote_generation_counter', { count: quoteRefreshCount, max: MAX_QUOTE_GENERATIONS })}
                                            </p>
                                        </motion.div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </aside>
            </div>

            {selectedQuote && fetchedQuotes.length > 0 && (
                <div className="space-y-3">
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border border-[#E7E7E5] rounded-lg p-4 bg-white space-y-2"
                    >
                        <h4 className="text-sm font-semibold text-[#37352F]">
                            {t('intro_focus_title')}
                        </h4>
                        <p className="text-xs text-[#73726E] leading-relaxed">
                            {t('intro_focus_desc')} <strong className="text-[#37352F]">{t('intro_focus_desc_bold')}</strong>
                        </p>
                        <div className="flex flex-col gap-1.5 mt-1">
                            <label
                                className={[
                                    'flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-all text-xs',
                                    introFocus === 'quote'
                                        ? 'border-[#002e7a] bg-[#f0f4ff]'
                                        : 'border-[#E7E7E5] bg-white hover:border-[#d6d6d6]',
                                ].join(' ')}
                            >
                                <input
                                    type="radio"
                                    name="introFocus"
                                    checked={introFocus === 'quote'}
                                    onChange={() => setIntroFocus('quote')}
                                    className="mt-0.5 accent-[#002e7a]"
                                />
                                <div>
                                    <span className="font-semibold text-[#37352F]">{t('focus_quote_label')}</span>
                                    <span className="text-[#73726E]">
                                        {hasCompanyHookSelection
                                            ? ` ${t('focus_quote_desc')}`
                                            : ` ${t('focus_quote_desc_no_hook')}`}
                                    </span>
                                    <span className="block text-[10px] text-[#A8A29E] mt-0.5">{t('focus_quote_recommended')}</span>
                                </div>
                            </label>
                            <label
                                className={[
                                    'flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-all text-xs',
                                    introFocus === 'hook'
                                        ? 'border-[#002e7a] bg-[#f0f4ff]'
                                        : 'border-[#E7E7E5] bg-white hover:border-[#d6d6d6]',
                                ].join(' ')}
                            >
                                <input
                                    type="radio"
                                    name="introFocus"
                                    checked={introFocus === 'hook'}
                                    onChange={() => {
                                        setIntroFocus('hook');
                                        if (optInModules.pingPong) {
                                            setOptInModule('pingPong', false);
                                        }
                                    }}
                                    className="mt-0.5 accent-[#002e7a]"
                                />
                                <div>
                                    <span className="font-semibold text-[#37352F]">
                                        {hasCompanyHookSelection ? t('focus_hook_label') : t('focus_hook_label_no_hook')}
                                    </span>
                                    <span className="text-[#73726E]">
                                        {hasCompanyHookSelection
                                            ? ` ${t('focus_hook_desc')}`
                                            : ` ${t('focus_hook_desc_no_hook')}`}
                                    </span>
                                </div>
                            </label>
                        </div>
                    </motion.div>

                    {(() => {
                        const pingPongDisabled = hasCompanyHookSelection && introFocus === 'hook';
                        return (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`border border-[#E7E7E5] rounded-lg p-4 bg-white ${pingPongDisabled ? 'opacity-50' : ''}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <Quote className="w-3.5 h-3.5 text-[#002e7a] shrink-0" />
                                            <span className="text-sm font-semibold text-[#37352F]">{t('pingpong_title')}</span>
                                        </div>
                                        <p className="text-xs text-[#73726E] leading-relaxed">
                                            {pingPongDisabled
                                                ? t('pingpong_disabled_desc')
                                                : <>{t('pingpong_desc').split(t('pingpong_desc_bold'))[0]}<strong className="text-[#37352F]">{t('pingpong_desc_bold')}</strong>{t('pingpong_desc').split(t('pingpong_desc_bold'))[1]}</>}
                                        </p>
                                    </div>
                                    <button
                                        id="toggle-pingpong"
                                        role="switch"
                                        aria-checked={optInModules.pingPong}
                                        disabled={!!pingPongDisabled}
                                        onClick={() => { if (!pingPongDisabled) setOptInModule('pingPong', !optInModules.pingPong); }}
                                        style={{
                                            minWidth: '2.75rem', width: '2.75rem', height: '1.5rem',
                                            borderRadius: '9999px', position: 'relative', flexShrink: 0,
                                            transition: 'background-color 0.2s',
                                            backgroundColor: optInModules.pingPong && !pingPongDisabled ? '#002e7a' : '#D1D5DB',
                                            border: 'none', cursor: pingPongDisabled ? 'not-allowed' : 'pointer', padding: 0,
                                        }}
                                    >
                                        <span style={{
                                            position: 'absolute', top: '3px',
                                            left: optInModules.pingPong && !pingPongDisabled ? 'calc(100% - 19px)' : '3px',
                                            width: '18px', height: '18px', backgroundColor: 'white',
                                            borderRadius: '9999px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                            transition: 'left 0.2s',
                                        }} />
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })()}
                </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-[#E7E7E5] pt-3">
                <p className="text-[11px] text-[#73726E] leading-relaxed">
                    {hasCompanyHookSelection
                        ? selectedQuote ? t('selection_state_both') : t('selection_state_analysis_only')
                        : selectedQuote ? t('selection_state_quote_only') : t('selection_state_none')}
                </p>
                <button
                    type="button"
                    onClick={handleProceedToStep2}
                    disabled={!canProceed}
                    className={[
                        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0',
                        canProceed
                            ? 'bg-[#002e7a] text-white hover:bg-[#001e5a]'
                            : 'bg-[#E7E7E5] text-[#A8A29E] cursor-not-allowed',
                    ].join(' ')}
                >
                    {hasCompanyHookSelection ? t('btn_next') : t('btn_next_without_analysis')} <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
