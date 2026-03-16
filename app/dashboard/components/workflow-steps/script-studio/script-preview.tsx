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
    /** If true, renders as a compact overlay for during-recording use */
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
                        className={`rounded-lg p-3 ${
                            isOverlay
                                ? 'bg-black/40 backdrop-blur-sm text-white border border-white/10'
                                : 'bg-blue-50 border border-blue-100'
                        }`}
                    >
                        <p className={`text-xs font-semibold mb-0.5 ${isOverlay ? 'text-blue-300' : 'text-[#012e7a]'}`}>
                            {block.title}
                        </p>
                        <p className={`text-sm ${isOverlay ? 'text-white/90' : 'text-gray-700'}`}>
                            {block.content}
                        </p>
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

function TeleprompterView({
    blocks,
    wpmSpeed,
    onWpmChange,
    isOverlay,
}: {
    blocks: ScriptBlock[];
    wpmSpeed: number;
    onWpmChange: (wpm: number) => void;
    isOverlay: boolean;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isScrolling, setIsScrolling] = useState(false);
    const animFrameRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

    // Full text from all blocks
    const fullText = blocks
        .filter(b => b.content.trim())
        .map(b => `[${b.title}]\n${b.content}`)
        .join('\n\n');

    // Calculate scroll speed: pixels per second based on WPM
    const wordCount = fullText.split(/\s+/).length;
    const totalReadTime = (wordCount / wpmSpeed) * 60; // seconds
    const scrollHeight = scrollRef.current?.scrollHeight || 1;
    const containerHeight = scrollRef.current?.clientHeight || 1;
    const pixelsPerSecond = (scrollHeight - containerHeight) / Math.max(totalReadTime, 1);

    const animate = useCallback((timestamp: number) => {
        if (!scrollRef.current || !isScrolling) return;

        if (lastTimeRef.current) {
            const delta = (timestamp - lastTimeRef.current) / 1000;
            scrollRef.current.scrollTop += pixelsPerSecond * delta;

            // Stop at bottom
            if (scrollRef.current.scrollTop >= scrollRef.current.scrollHeight - scrollRef.current.clientHeight) {
                setIsScrolling(false);
                return;
            }
        }

        lastTimeRef.current = timestamp;
        animFrameRef.current = requestAnimationFrame(animate);
    }, [isScrolling, pixelsPerSecond]);

    useEffect(() => {
        if (isScrolling) {
            lastTimeRef.current = 0;
            animFrameRef.current = requestAnimationFrame(animate);
        }
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [isScrolling, animate]);

    const handleReset = () => {
        setIsScrolling(false);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    };

    return (
        <div className={`space-y-3 ${isOverlay ? '' : ''}`}>
            {/* Controls */}
            <div className={`flex items-center gap-3 ${isOverlay ? 'px-3 pt-2' : ''}`}>
                <button
                    onClick={() => setIsScrolling(!isScrolling)}
                    className={`p-2 rounded-full transition ${
                        isOverlay
                            ? 'bg-white/20 text-white hover:bg-white/30'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                    {isScrolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                    onClick={handleReset}
                    className={`p-2 rounded-full transition ${
                        isOverlay
                            ? 'bg-white/20 text-white hover:bg-white/30'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 text-xs">
                    <span className={isOverlay ? 'text-white/60' : 'text-gray-500'}>Speed</span>
                    <input
                        type="range"
                        min={80}
                        max={200}
                        step={10}
                        value={wpmSpeed}
                        onChange={(e) => onWpmChange(parseInt(e.target.value))}
                        className="w-20 accent-[#012e7a]"
                    />
                    <span className={`w-12 ${isOverlay ? 'text-white/80' : 'text-gray-700'}`}>
                        {wpmSpeed} WPM
                    </span>
                </div>
            </div>

            {/* Scrolling text area */}
            <div
                ref={scrollRef}
                className={`overflow-y-auto scroll-smooth ${
                    isOverlay
                        ? 'max-h-48 px-4 py-3 text-white/90 text-lg leading-relaxed'
                        : 'max-h-64 p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 text-base leading-relaxed'
                }`}
            >
                {fullText ? (
                    <pre className="whitespace-pre-wrap font-sans">{fullText}</pre>
                ) : (
                    <p className={`text-sm text-center py-8 ${isOverlay ? 'text-white/40' : 'text-gray-400'}`}>
                        Schreibe Text in deine Blöcke, um die Teleprompter-Vorschau zu sehen
                    </p>
                )}
            </div>
        </div>
    );
}
