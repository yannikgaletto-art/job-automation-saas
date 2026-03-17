"use client";

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw } from 'lucide-react';
import type { ScriptBlock } from './block-editor';

interface ScriptPreviewProps {
    blocks: ScriptBlock[];
    mode: 'teleprompter' | 'bullets';
    wpmSpeed: number;
    onWpmChange: (wpm: number) => void;
    isOverlay?: boolean;
}

export function ScriptPreview({ blocks, mode, wpmSpeed, onWpmChange, isOverlay = false }: ScriptPreviewProps) {
    if (mode === 'bullets') {
        return <BulletsView blocks={blocks} isOverlay={isOverlay} />;
    }
    return <TeleprompterView blocks={blocks} wpmSpeed={wpmSpeed} onWpmChange={onWpmChange} isOverlay={isOverlay} />;
}

// --- Bullets View ---

function BulletsView({ blocks, isOverlay }: { blocks: ScriptBlock[]; isOverlay: boolean }) {
    const visibleBlocks = blocks.filter(b => b.content.trim());
    return (
        <div className={`space-y-2 ${isOverlay ? 'p-3' : 'p-4'}`}>
            <AnimatePresence mode="popLayout">
                {visibleBlocks.map((block, i) => (
                    <motion.div
                        key={block.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: i * 0.05 }}
                        className={`rounded-lg p-3 ${isOverlay
                            ? 'bg-black/40 backdrop-blur-sm text-white border border-white/10'
                            : 'bg-blue-50 border border-blue-100'}`}
                    >
                        <p className={`text-xs font-semibold mb-0.5 ${isOverlay ? 'text-blue-300' : 'text-[#012e7a]'}`}>{block.title}</p>
                        <p className={`text-sm ${isOverlay ? 'text-white/90' : 'text-gray-700'}`}>{block.content}</p>
                    </motion.div>
                ))}
            </AnimatePresence>
            {visibleBlocks.length === 0 && (
                <p className={`text-sm text-center py-4 ${isOverlay ? 'text-white/50' : 'text-gray-400'}`}>
                    Noch keine Stichpunkte vorhanden
                </p>
            )}
        </div>
    );
}

// --- Teleprompter View ---
//
// ARCHITECTURE: Scroll loop uses window-scoped globals.
// Why: React useEffect intervals die on unmount. Module-scope variables
// die when Next.js Fast Refresh replaces the module. Only window globals
// survive both. The scroll loop finds the target via data-attribute,
// so it self-heals when the DOM element changes.
//

declare global {
    interface Window {
        __teleprompterIntervalId?: ReturnType<typeof setInterval>;
        __teleprompterWpm?: number;
        __teleprompterWordCount?: number;
        __teleprompterScrollPos?: number;  // fractional accumulator — avoids sub-pixel rounding
    }
}

const DATA_ATTR = 'data-teleprompter-scroll';

function stopTeleprompter() {
    if (typeof window !== 'undefined' && window.__teleprompterIntervalId != null) {
        clearInterval(window.__teleprompterIntervalId);
        window.__teleprompterIntervalId = undefined;
    }
}

function startTeleprompter() {
    stopTeleprompter();
    // Seed accumulator from current scroll position
    const el = document.querySelector(`[${DATA_ATTR}]`) as HTMLElement | null;
    window.__teleprompterScrollPos = el ? el.scrollTop : 0;

    window.__teleprompterIntervalId = setInterval(() => {
        const el = document.querySelector(`[${DATA_ATTR}]`) as HTMLElement | null;
        if (!el) return;

        const scrollable = el.scrollHeight - el.clientHeight;
        if (scrollable <= 0) return;

        const wpm = window.__teleprompterWpm || 130;
        const wc = window.__teleprompterWordCount || 50;
        const totalSec = (wc / wpm) * 60;
        const pxPerTick = (scrollable / Math.max(totalSec, 1)) * 0.016;

        // Accumulate fractionally, then write to DOM — avoids browser rounding killing sub-pixel increments
        window.__teleprompterScrollPos = Math.min((window.__teleprompterScrollPos ?? 0) + pxPerTick, scrollable);
        el.scrollTop = window.__teleprompterScrollPos;
    }, 16);
}

function TeleprompterView({
    blocks, wpmSpeed, onWpmChange, isOverlay,
}: {
    blocks: ScriptBlock[];
    wpmSpeed: number;
    onWpmChange: (wpm: number) => void;
    isOverlay: boolean;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const fullText = blocks
        .filter(b => b.content.trim())
        .map(b => `[${b.title}]\n${b.content}`)
        .join('\n\n');

    const wordCount = Math.max(fullText.split(/\s+/).filter(Boolean).length, 1);

    // Sync to window globals every render
    if (typeof window !== 'undefined') {
        window.__teleprompterWpm = wpmSpeed;
        window.__teleprompterWordCount = wordCount;
    }

    // Stop on unmount
    useEffect(() => {
        return () => stopTeleprompter();
    }, []);

    // Sync play state: if window interval is running but component says not playing, reconcile
    useEffect(() => {
        if (!isPlaying) {
            stopTeleprompter();
        }
    }, [isPlaying]);

    const handlePlayPause = useCallback(() => {
        setIsPlaying(prev => {
            if (!prev) {
                startTeleprompter();
            } else {
                stopTeleprompter();
            }
            return !prev;
        });
    }, []);

    const handleReset = useCallback(() => {
        stopTeleprompter();
        setIsPlaying(false);
        window.__teleprompterScrollPos = 0;
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, []);

    return (
        <div className="space-y-3">
            {/* Controls */}
            <div className={`flex items-center gap-3 ${isOverlay ? 'px-3 pt-2' : ''}`}>
                <button
                    onClick={handlePlayPause}
                    className={`p-2 rounded-full transition ${isOverlay
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                    onClick={handleReset}
                    className={`p-2 rounded-full transition ${isOverlay
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    aria-label="Zurücksetzen"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 text-xs">
                    <span className={isOverlay ? 'text-white/60' : 'text-gray-500'}>Speed</span>
                    <input
                        type="range" min={100} max={300} step={20} value={wpmSpeed}
                        onChange={(e) => onWpmChange(parseInt(e.target.value))}
                        className="w-20 accent-[#012e7a]"
                    />
                    <span className={`w-12 ${isOverlay ? 'text-white/80' : 'text-gray-700'}`}>{wpmSpeed} WPM</span>
                </div>
            </div>

            {/* Scroll container — data attr used by window-scope loop */}
            <div
                ref={scrollRef}
                data-teleprompter-scroll="true"
                style={{ height: isOverlay ? '192px' : '256px', overflowY: 'scroll', scrollBehavior: 'auto' }}
                className={isOverlay
                    ? 'px-4 py-3 text-white/90 text-lg leading-relaxed'
                    : 'p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 text-base leading-relaxed'}
            >
                {fullText ? (
                    <pre className="whitespace-pre-wrap font-sans m-0">{fullText}</pre>
                ) : (
                    <p className={`text-sm text-center py-8 ${isOverlay ? 'text-white/40' : 'text-gray-400'}`}>
                        Schreibe Text in deine Blöcke, um die Teleprompter-Vorschau zu sehen
                    </p>
                )}
            </div>
        </div>
    );
}
