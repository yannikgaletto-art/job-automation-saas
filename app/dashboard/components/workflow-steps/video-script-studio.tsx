"use client";

import { useReducer, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Save, ChevronRight, Eye, EyeOff, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ModeToggle } from './script-studio/mode-toggle';
import { BlockEditor, type ScriptBlock } from './script-studio/block-editor';
import { KeywordSidebar } from './script-studio/keyword-sidebar';
import { ScriptPreview } from './script-studio/script-preview';

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
    wpmSpeed: number;
    showPreview: boolean;
    showOverwriteConfirm: boolean;
    isSaving: boolean;
    warnings: string[];
    error: string | null;
    lastSaved: string | null;
}

type ScriptAction =
    | { type: 'SET_PHASE'; phase: ScriptState['phase'] }
    | { type: 'SET_MODE'; mode: 'teleprompter' | 'bullets' }
    | { type: 'SET_BLOCKS'; blocks: ScriptBlock[] }
    | { type: 'SET_KEYWORDS'; keywords: CategorizedKeywords }
    | { type: 'SET_WPM'; wpm: number }
    | { type: 'TOGGLE_PREVIEW' }
    | { type: 'SET_SAVING'; saving: boolean }
    | { type: 'SET_WARNINGS'; warnings: string[] }
    | { type: 'SET_ERROR'; error: string }
    | { type: 'SAVED'; timestamp: string }
    | { type: 'SHOW_OVERWRITE_CONFIRM' }
    | { type: 'HIDE_OVERWRITE_CONFIRM' }
    | { type: 'LOAD_SCRIPT'; script: { mode: string; blocks: ScriptBlock[]; wpmSpeed: number; categorizedKeywords: CategorizedKeywords } };

const initialState: ScriptState = {
    phase: 'loading',
    mode: 'bullets',
    blocks: [],
    categorizedKeywords: { mustHave: [], niceToHave: [], companySpecific: [] },
    wpmSpeed: 130,
    showPreview: false,
    showOverwriteConfirm: false,
    isSaving: false,
    warnings: [],
    error: null,
    lastSaved: null,
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

// --- GeneratingProgress ---

const GENERATING_STEPS = [
    'Stellenbeschreibung wird geladen',
    'Keywords werden extrahiert',
    'Themenblöcke werden identifiziert',
    'Skript-Struktur wird aufgebaut',
    'Formulierungen werden optimiert',
    'Blockvorschläge werden finalisiert',
];

function GeneratingProgress() {
    const [activeStep, setActiveStep] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveStep(prev => (prev < GENERATING_STEPS.length - 1 ? prev + 1 : prev));
        }, 2500);
        return () => clearInterval(interval);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 bg-white border border-gray-200 rounded-xl max-w-md mx-auto space-y-5"
        >
            {/* Header */}
            <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#012e7a] animate-spin" />
                <div>
                    <p className="text-sm font-semibold text-gray-900">Skript wird erstellt…</p>
                    <p className="text-xs text-gray-400">Das dauert etwa 10–15 Sekunden</p>
                </div>
            </div>

            {/* Steps */}
            <div className="space-y-2.5">
                {GENERATING_STEPS.map((step, i) => {
                    const isDone = i < activeStep;
                    const isActive = i === activeStep;

                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="flex items-center gap-3"
                        >
                            {/* Icon */}
                            {isDone ? (
                                <CheckCircle2 className="w-5 h-5 text-[#012e7a] shrink-0" />
                            ) : isActive ? (
                                <div className="relative w-5 h-5 shrink-0">
                                    <div className="absolute inset-0 rounded-full border-2 border-[#012e7a] border-t-transparent animate-spin" />
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#012e7a]">
                                        {i + 1}
                                    </span>
                                </div>
                            ) : (
                                <Circle className="w-5 h-5 text-gray-300 shrink-0" />
                            )}

                            {/* Label */}
                            <span
                                className={
                                    isDone
                                        ? 'text-sm text-[#012e7a] font-medium line-through decoration-[#012e7a]/30'
                                        : isActive
                                            ? 'text-sm text-gray-900 font-medium'
                                            : 'text-sm text-gray-400'
                                }
                            >
                                {step}
                            </span>

                            {/* Active spinner badge */}
                            {isActive && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="ml-auto"
                                >
                                    <LoadingSpinner className="w-4 h-4 text-[#012e7a]" />
                                </motion.div>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
}

// --- Component ---

interface VideoScriptStudioProps {
    jobId: string;
    onReady: (scriptData: { blocks: ScriptBlock[]; mode: string; wpmSpeed: number }) => void;
}

export function VideoScriptStudio({ jobId, onReady }: VideoScriptStudioProps) {
    const [state, dispatch] = useReducer(reducer, initialState);

    // Initial load
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/video/scripts?jobId=${jobId}`);
                const data = await res.json();

                if (!res.ok) throw new Error(data.error || 'Laden fehlgeschlagen');

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
                } else {
                    dispatch({ type: 'SET_PHASE', phase: 'empty' });
                }
            } catch (err) {
                dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Laden fehlgeschlagen' });
            }
        };
        load();
    }, [jobId]);

    // Generate script
    const handleGenerate = useCallback(async (force = false) => {
        dispatch({ type: 'SET_PHASE', phase: 'generating' });
        try {
            const res = await fetch('/api/video/scripts/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, force }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Generierung fehlgeschlagen');
            }

            // Fix 8: Handle existing script — show inline confirm instead of window.confirm
            if (data.existingScript && data.preview && !force) {
                // Update keywords from cached data, show confirm banner
                dispatch({ type: 'SET_KEYWORDS', keywords: data.categorizedKeywords || { mustHave: [], niceToHave: [], companySpecific: [] } });
                dispatch({ type: 'SHOW_OVERWRITE_CONFIRM' });
                return;
            }

            dispatch({ type: 'SET_BLOCKS', blocks: data.script?.blocks || data.suggestedBlocks || [] });
            dispatch({ type: 'SET_KEYWORDS', keywords: data.categorizedKeywords || { mustHave: [], niceToHave: [], companySpecific: [] } });
            dispatch({ type: 'SET_PHASE', phase: 'editing' });
        } catch (err) {
            dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : 'Generierung fehlgeschlagen' });
        }
    }, [jobId]);

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

    // Empty state — no script exists yet
    if (state.phase === 'empty') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-8 bg-white border border-gray-200 rounded-xl max-w-lg mx-auto text-center space-y-5"
            >
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Video-Skript erstellen</h3>
                    <p className="text-sm text-gray-500">
                        Wir <strong>analysieren</strong> die <strong>Stellenbeschreibung</strong> und erfassen die <strong>Daten</strong>, die du in deinem <strong>Vorstellungsvideo</strong> abdecken solltest.
                    </p>
                </div>
                <button
                    onClick={() => handleGenerate()}
                    className="px-6 py-3 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white font-medium rounded-lg transition w-full flex items-center justify-center gap-2"
                >
                    <Sparkles className="w-5 h-5" /> Skript generieren
                </button>
            </motion.div>
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
                <p className="text-sm text-red-700">{state.error || 'Ein Fehler ist aufgetreten.'}</p>
                <button
                    onClick={() => handleGenerate()}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm"
                >
                    Erneut versuchen
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
                        {state.showPreview ? 'Editor' : 'Vorschau'}
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    {state.lastSaved && (
                        <span className="text-xs text-gray-400">
                            Gespeichert {new Date(state.lastSaved).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={state.isSaving}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {state.isSaving ? <LoadingSpinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        Speichern
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
                                Du hast bereits ein bearbeitetes Skript. Überschreiben mit neuen KI-Vorschlägen?
                            </p>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={() => { dispatch({ type: 'HIDE_OVERWRITE_CONFIRM' }); handleGenerate(true); }}
                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-md transition"
                                >
                                    Überschreiben
                                </button>
                                <button
                                    onClick={() => dispatch({ type: 'HIDE_OVERWRITE_CONFIRM' })}
                                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-md transition"
                                >
                                    Behalten
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
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Keywords</h4>
                    <KeywordSidebar
                        keywords={state.categorizedKeywords}
                        blocks={state.blocks}
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
                    Aufnahme starten <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </motion.div>
    );
}
