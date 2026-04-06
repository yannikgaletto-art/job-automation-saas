"use client";

import { useReducer, useEffect, useCallback, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { Check } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/utils';
import { ModeToggle } from './script-studio/mode-toggle';
import { BlockEditor, type ScriptBlock } from './script-studio/block-editor';
import { KeywordSidebar } from './script-studio/keyword-sidebar';
import { ScriptPreview } from './script-studio/script-preview';
import { PreGenerationModal, type PreGenParams } from './script-studio/pre-generation-modal';
import { useCreditExhausted } from '@/app/[locale]/dashboard/hooks/credit-exhausted-context';

// --- Types ---

interface CategorizedKeywords {
    mustHave: string[];
    niceToHave: string[];
    companySpecific: string[];
}

interface ScriptState {
    phase: 'loading' | 'empty' | 'editing' | 'generating' | 'preview' | 'error';
    mode: 'teleprompter' | 'bullets';
    blocks: ScriptBlock[];
    categorizedKeywords: CategorizedKeywords;
    mirrorPhrases: string[];
    wpmSpeed: number;
    showPreview: boolean;
    showOverwriteConfirm: boolean;
    isSaving: boolean;
    warnings: string[];
    error: string | null;
    lastSaved: string | null;
    preGenParams: PreGenParams | null;
}

type ScriptAction =
    | { type: 'SET_PHASE'; phase: ScriptState['phase'] }
    | { type: 'SET_MODE'; mode: 'teleprompter' | 'bullets' }
    | { type: 'SET_BLOCKS'; blocks: ScriptBlock[] }
    | { type: 'SET_KEYWORDS'; keywords: CategorizedKeywords }
    | { type: 'SET_MIRROR_PHRASES'; phrases: string[] }
    | { type: 'SET_WPM'; wpm: number }
    | { type: 'TOGGLE_PREVIEW' }
    | { type: 'SET_SAVING'; saving: boolean }
    | { type: 'SET_WARNINGS'; warnings: string[] }
    | { type: 'SET_ERROR'; error: string }
    | { type: 'SAVED'; timestamp: string }
    | { type: 'SHOW_OVERWRITE_CONFIRM' }
    | { type: 'HIDE_OVERWRITE_CONFIRM' }
    | { type: 'SET_PRE_GEN_PARAMS'; params: PreGenParams }
    | { type: 'LOAD_SCRIPT'; script: { mode: string; blocks: ScriptBlock[]; wpmSpeed: number; categorizedKeywords: CategorizedKeywords } };

const initialState: ScriptState = {
    phase: 'loading',
    mode: 'bullets',
    blocks: [],
    categorizedKeywords: { mustHave: [], niceToHave: [], companySpecific: [] },
    mirrorPhrases: [],
    wpmSpeed: 160,
    showPreview: false,
    showOverwriteConfirm: false,
    isSaving: false,
    warnings: [],
    error: null,
    lastSaved: null,
    preGenParams: null,
};

function reducer(state: ScriptState, action: ScriptAction): ScriptState {
    switch (action.type) {
        case 'SET_PHASE':
            return { ...state, phase: action.phase, error: null };
        case 'SET_MODE':
            return { ...state, mode: action.mode };
        case 'SET_BLOCKS':
            return { ...state, blocks: action.blocks };
        case 'SET_KEYWORDS':
            return { ...state, categorizedKeywords: action.keywords };
        case 'SET_MIRROR_PHRASES':
            return { ...state, mirrorPhrases: action.phrases };
        case 'SET_PRE_GEN_PARAMS':
            return { ...state, preGenParams: action.params };
        case 'SET_WPM':
            return { ...state, wpmSpeed: action.wpm };
        case 'TOGGLE_PREVIEW':
            return { ...state, showPreview: !state.showPreview };
        case 'SET_SAVING':
            return { ...state, isSaving: action.saving };
        case 'SHOW_OVERWRITE_CONFIRM':
            return { ...state, showOverwriteConfirm: true, phase: 'editing' };
        case 'HIDE_OVERWRITE_CONFIRM':
            return { ...state, showOverwriteConfirm: false };
        case 'SET_WARNINGS':
            return { ...state, warnings: action.warnings };
        case 'SET_ERROR':
            return { ...state, phase: 'error', error: action.error };
        case 'SAVED':
            return { ...state, isSaving: false, lastSaved: action.timestamp };
        case 'LOAD_SCRIPT':
            return {
                ...state,
                phase: 'editing',
                mode: action.script.mode as 'teleprompter' | 'bullets',
                blocks: action.script.blocks,
                wpmSpeed: action.script.wpmSpeed || 130,
                categorizedKeywords: action.script.categorizedKeywords || state.categorizedKeywords,
            };
        default:
            return state;
    }
}

// --- GeneratingProgress (unified step-tracker design) ---

function GeneratingProgress() {
    const t = useTranslations('video_letter');
    const [activeStep, setActiveStep] = useState(0);

    const GENERATING_STEPS = useMemo(() => [
        t('gen_step_1'),
        t('gen_step_2'),
        t('gen_step_3'),
        t('gen_step_4'),
        t('gen_step_5'),
        t('gen_step_6'),
    ], [t]);

    useEffect(() => {
        setActiveStep(0);
        let idx = 0;
        const interval = setInterval(() => {
            idx = Math.min(idx + 1, GENERATING_STEPS.length - 1);
            setActiveStep(idx);
            if (idx >= GENERATING_STEPS.length - 1) clearInterval(interval);
        }, 2500);
        return () => clearInterval(interval);
    }, [GENERATING_STEPS.length]);

    return (
        <div className="w-full px-6 py-8 bg-[#FAFAF9] rounded-xl border border-slate-200">
            {/* Spinner + title */}
            <div className="flex items-center gap-2.5 mb-1">
                <LoadingSpinner className="w-5 h-5 text-[#002e7a] shrink-0" />
                <span className="text-sm font-semibold text-[#37352F]">
                    {t('gen_title')}
                </span>
            </div>
            <p className="text-xs text-[#73726E] mb-5 pl-[29px]">{t('gen_subtitle')}</p>

            {/* Step list */}
            <div className="space-y-2">
                {GENERATING_STEPS.map((label, i) => {
                    const isDone = i < activeStep;
                    const isActive = i === activeStep;
                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.07, duration: 0.25 }}
                            className={cn(
                                'flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-300',
                                isDone
                                    ? 'bg-[#EEF2FF] border-[#C7D6F7]'
                                    : isActive
                                        ? 'bg-white border-[#002e7a] shadow-sm'
                                        : 'bg-white border-[#E7E7E5]'
                            )}
                        >
                            {/* Badge */}
                            <div className={cn(
                                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-300',
                                isDone
                                    ? 'bg-[#002e7a] text-white'
                                    : isActive
                                        ? 'border-2 border-[#002e7a] bg-white text-[#002e7a]'
                                        : 'border border-[#D0CFC8] bg-white text-[#A8A29E]'
                            )}>
                                {isDone ? <Check size={12} /> : <span>{i + 1}</span>}
                            </div>

                            {/* Label */}
                            <span className={cn(
                                'text-xs flex-1 transition-all duration-300',
                                isDone
                                    ? 'line-through text-[#002e7a] opacity-60'
                                    : isActive
                                        ? 'font-semibold text-[#37352F]'
                                        : 'font-normal text-[#A8A29E]'
                            )}>
                                {label}
                            </span>

                            {/* Grey dot for active */}
                            {isActive && (
                                <div className="w-3.5 h-3.5 rounded-full bg-[#9CA3AF] shrink-0" />
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

// --- Component ---

interface VideoScriptStudioProps {
    jobId: string;
    onReady: (scriptData: { blocks: ScriptBlock[]; mode: string; wpmSpeed: number }) => void;
    onScriptFound?: () => void; // Called on mount when an existing script is found in DB
}

export function VideoScriptStudio({ jobId, onReady, onScriptFound }: VideoScriptStudioProps) {
    const t = useTranslations('video_letter');
    const locale = useLocale();
    const [state, dispatch] = useReducer(reducer, initialState);
    const [showPreGenModal, setShowPreGenModal] = useState(false);
    const { showPaywall } = useCreditExhausted();

    // Initial load
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/video/scripts?jobId=${jobId}`);
                const data = await res.json();

                if (!res.ok) throw new Error(data.error || t('error_load_failed'));

                if (data.script) {
                    dispatch({
                        type: 'LOAD_SCRIPT',
                        script: {
                            mode: data.script.mode,
                            blocks: data.script.blocks || [],
                            wpmSpeed: data.script.wpm_speed || 130,
                            categorizedKeywords: data.script.categorized_keywords || { mustHave: [], niceToHave: [], companySpecific: [] },
                        },
                    });
                    if (data.script.categorized_keywords) {
                        dispatch({ type: 'SET_KEYWORDS', keywords: data.script.categorized_keywords });
                    }

                    // Notify parent that a script was found so the tile updates immediately
                    onScriptFound?.();

                    // Sync job status so the Video Letter tile appears in the progress row.
                    // This handles scripts saved before video_letter_done status was introduced.
                    try {
                        const { createClient } = await import('@/lib/supabase/client');
                        const supabase = createClient();
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                            const VIDEO_DONE_STATUSES = ['video_letter_done'];
                            const { data: jobRow } = await supabase
                                .from('job_queue')
                                .select('status')
                                .eq('id', jobId)
                                .single();
                            if (jobRow && !VIDEO_DONE_STATUSES.includes(jobRow.status)) {
                                await supabase
                                    .from('job_queue')
                                    .update({ status: 'video_letter_done' })
                                    .eq('id', jobId);
                                console.log('✅ [VideoLetter] Synced job status → video_letter_done');
                            }
                        }
                    } catch {
                        // Non-critical — tile will show on next save
                    }
                } else {
                    dispatch({ type: 'SET_PHASE', phase: 'empty' });
                }
            } catch (err) {
                dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Laden fehlgeschlagen' });
            }
        };
        load();
    }, [jobId]);

    // Generate script — with optional pre-gen params
    const handleGenerate = useCallback(async (force = false, params?: PreGenParams) => {
        // Store params in state for potential force-overwrite reuse
        if (params) {
            dispatch({ type: 'SET_PRE_GEN_PARAMS', params });
        }
        const activeParams = params || state.preGenParams;

        dispatch({ type: 'SET_PHASE', phase: 'generating' });
        try {
            const res = await fetch('/api/video/scripts/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    force,
                    locale,
                    ...(activeParams && {
                        applicant_archetype: activeParams.applicant_archetype,
                        tone_mode: activeParams.tone_mode,
                    }),
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                if (res.status === 402 && data.error === 'CREDITS_EXHAUSTED') {
                    showPaywall('credits', { remaining: data.remaining ?? 0 });
                    dispatch({ type: 'SET_PHASE', phase: 'empty' });
                    return;
                }
                throw new Error(data.error || t('error_generic'));
            }

            // Handle existing script — show inline confirm instead of window.confirm
            if (data.existingScript && data.preview && !force) {
                dispatch({ type: 'SET_KEYWORDS', keywords: data.categorizedKeywords || { mustHave: [], niceToHave: [], companySpecific: [] } });
                dispatch({ type: 'SHOW_OVERWRITE_CONFIRM' });
                return;
            }

            dispatch({ type: 'SET_BLOCKS', blocks: data.script?.blocks || data.suggestedBlocks || [] });
            const kw = data.categorizedKeywords || { mustHave: [], niceToHave: [], companySpecific: [] };
            dispatch({ type: 'SET_KEYWORDS', keywords: kw });
            dispatch({ type: 'SET_MIRROR_PHRASES', phrases: kw.mirrorPhrases || [] });
            dispatch({ type: 'SET_PHASE', phase: 'editing' });
        } catch (err) {
            dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : t('error_generic') });
        }
    }, [jobId, state.preGenParams]);

    // Auto-save (debounced)
    const handleSave = useCallback(async () => {
        dispatch({ type: 'SET_SAVING', saving: true });
        try {
            // Calculate covered keywords
            const allContent = state.blocks.map(b => b.content).join(' ').toLowerCase();
            const allKw = [
                ...state.categorizedKeywords.mustHave,
                ...state.categorizedKeywords.niceToHave,
                ...state.categorizedKeywords.companySpecific,
            ];
            const covered = allKw.filter(k => allContent.includes(k.toLowerCase()));

            const res = await fetch('/api/video/scripts/save', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    blocks: state.blocks,
                    mode: state.mode,
                    keywordsCovered: covered,
                    wpmSpeed: state.wpmSpeed,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');

            dispatch({ type: 'SET_WARNINGS', warnings: data.warnings || [] });
            dispatch({ type: 'SAVED', timestamp: new Date().toISOString() });
        } catch (err) {
            console.error('[ScriptStudio] Save failed:', err);
            dispatch({ type: 'SET_SAVING', saving: false });
        }
    }, [jobId, state.blocks, state.mode, state.wpmSpeed, state.categorizedKeywords]);

    // --- RENDER ---

    // Loading state
    if (state.phase === 'loading') {
        return (
            <div className="p-12 flex justify-center">
                <LoadingSpinner className="w-8 h-8 text-[#012e7a]" />
            </div>
        );
    }

    // Empty state — auto-open modal (consent screen already served as intro)
    if (state.phase === 'empty') {
        return (
            <PreGenerationModal
                open={true}
                onClose={() => {
                    // Navigate back — let parent handle via window history or state reset
                    window.history.back();
                }}
                onConfirm={(params) => {
                    handleGenerate(false, params);
                }}
                jobId={jobId}
            />
        );
    }

    // Generating state — step-by-step progress indicator
    if (state.phase === 'generating') {
        return <GeneratingProgress />;
    }

    // Error state
    if (state.phase === 'error') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 bg-red-50 border border-red-200 rounded-xl max-w-sm mx-auto text-center space-y-4"
            >
                <p className="text-sm text-red-700">{state.error || t('error_generic')}</p>
                <button
                    onClick={() => handleGenerate()}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm"
                >
                    {t('error_retry')}
                </button>
            </motion.div>
        );
    }

    // Editing state — main UI
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden"
        >
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <ModeToggle mode={state.mode} onChange={(m) => dispatch({ type: 'SET_MODE', mode: m })} />
                    <button
                        onClick={() => dispatch({ type: 'TOGGLE_PREVIEW' })}
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition"
                    >
                        {state.showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        {state.showPreview ? t('editor_editor') : t('editor_preview')}
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    {state.lastSaved && (
                        <span className="text-xs text-gray-400">
                            {t('editor_saved_at', { time: new Date(state.lastSaved).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={state.isSaving}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {state.isSaving ? <LoadingSpinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {t('editor_save')}
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex">
                {/* Main content area */}
                <div className="flex-1 p-5">
                    {/* Overwrite Confirm Banner (Fix 8) */}
                    {state.showOverwriteConfirm && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between gap-4 mb-3">
                            <p className="text-sm text-amber-800">
                                {t('editor_overwrite_banner')}
                            </p>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={() => { dispatch({ type: 'HIDE_OVERWRITE_CONFIRM' }); handleGenerate(true, state.preGenParams || undefined); }}
                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-md transition"
                                >
                                    {t('editor_overwrite_btn')}
                                </button>
                                <button
                                    onClick={() => dispatch({ type: 'HIDE_OVERWRITE_CONFIRM' })}
                                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-md transition"
                                >
                                    {t('editor_keep_btn')}
                                </button>
                            </div>
                        </div>
                    )}

                    {state.showPreview ? (
                        <ScriptPreview
                            blocks={state.blocks}
                            mode={state.mode}
                            wpmSpeed={state.wpmSpeed}
                            onWpmChange={(wpm) => dispatch({ type: 'SET_WPM', wpm })}
                        />
                    ) : (
                        <BlockEditor
                            blocks={state.blocks}
                            onChange={(blocks) => dispatch({ type: 'SET_BLOCKS', blocks })}
                            mode={state.mode}
                        />
                    )}

                    {/* Warnings */}
                    {state.warnings.length > 0 && (
                        <div className="mt-4 space-y-1">
                            {state.warnings.map((w, i) => (
                                <p key={i} className="text-xs text-amber-600">⚠ {w}</p>
                            ))}
                        </div>
                    )}
                </div>

                {/* Keyword Sidebar */}
                <div className="w-64 border-l border-gray-100 p-4 bg-gray-50/50">
                    <KeywordSidebar
                        keywords={state.categorizedKeywords}
                        blocks={state.blocks}
                        mirrorPhrases={state.mirrorPhrases}
                    />
                </div>
            </div>

            {/* Footer — Action Button */}
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
                <button
                    onClick={async () => {
                        await handleSave();
                        onReady({ blocks: state.blocks, mode: state.mode, wpmSpeed: state.wpmSpeed });
                    }}
                    className="px-6 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white font-medium rounded-lg transition flex items-center gap-2"
                >
                    {t('editor_start_recording')} <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </motion.div>
    );
}
