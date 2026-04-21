'use client';

/**
 * GuidedTourOverlay — SVG-based spotlight tutorial overlay.
 *
 * Renders a dark backdrop with a transparent cutout over the target element.
 * A tooltip card appears next to the cutout with explanatory text.
 * Uses ResizeObserver + getBoundingClientRect for dynamic positioning.
 *
 * Design: Extreme Clean (#FAFAF9 bg, #37352F text, #002e7a accent).
 * i18n: All text via useTranslations('tour').
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { TourStep } from '@/app/[locale]/dashboard/hooks/useDashboardTour';

interface GuidedTourOverlayProps {
    step: TourStep;
    currentStep: number;
    totalSteps: number;
    onNext: () => void;
    onSkip: () => void;
}

interface TargetRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const PADDING = 8; // px around highlighted element
const TOOLTIP_GAP = 20; // px between cutout and tooltip
const BORDER_RADIUS = 12; // rounded cutout corners

export function GuidedTourOverlay({
    step,
    currentStep,
    totalSteps,
    onNext,
    onSkip,
}: GuidedTourOverlayProps) {
    const t = useTranslations('tour');
    const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const rafRef = useRef<number>(0);

    // ── Find & track the target element ────────────────────────
    // IMPORTANT: getBoundingClientRect() returns VIEWPORT-relative coords.
    // The SVG must be rendered with position:fixed and NO transforms applied
    // for these coordinates to match pixel-perfect. We read vw/vh here too
    // so the SVG path always matches the current viewport dimensions.
    const updateRect = useCallback(() => {
        const el = document.querySelector(step.targetSelector);
        if (!el) return;

        const rect = el.getBoundingClientRect();
        // Deliberately clamp to viewport so cutout is never off-screen
        const x = Math.max(0, rect.left - PADDING);
        const y = Math.max(0, rect.top - PADDING);
        setTargetRect({
            x,
            y,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
        });
    }, [step.targetSelector]);

    useEffect(() => {
        // Reset rect so overlay hides during transition between steps
        setTargetRect(null);

        let attempts = 0;
        const maxAttempts = 90; // ~1500ms at 60fps — enough for AnimatePresence transitions

        // Retry loop: element may not be in DOM yet (e.g. after tab switch)
        const tryFind = () => {
            const el = document.querySelector(step.targetSelector);
            if (!el && attempts < maxAttempts) {
                attempts++;
                rafRef.current = requestAnimationFrame(tryFind);
                return;
            }
            if (!el) return;

            // Found it — update rect and observe
            updateRect();
            observerRef.current = new ResizeObserver(() => {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(updateRect);
            });
            observerRef.current.observe(el);
        };

        // Delay to let React render the new step's DOM before searching
        const timer = setTimeout(tryFind, 300);


        // Track scroll
        const handleScroll = () => {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(updateRect);
        };
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleScroll);

        return () => {
            clearTimeout(timer);
            observerRef.current?.disconnect();
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
        };
    }, [step.targetSelector, updateRect]);

    // ── Keyboard: Escape to skip, Enter/Space to advance ────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onSkip();
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNext();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onNext, onSkip]);

    // Read viewport size at render time — used for SVG path and tooltip clamping
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;

    // ── SVG cutout path (full screen minus rounded rect) ────────
    // The SVG is rendered on its own fixed element with NO Framer Motion
    // transforms — guaranteeing pixel-perfect alignment with getBCR coords.
    if (!targetRect) return null;
    const { x, y, width, height } = targetRect;
    const cutoutPath = [
        `M 0 0 L ${vw} 0 L ${vw} ${vh} L 0 ${vh} Z`,
        `M ${x + BORDER_RADIUS} ${y}`,
        `L ${x + width - BORDER_RADIUS} ${y}`,
        `Q ${x + width} ${y} ${x + width} ${y + BORDER_RADIUS}`,
        `L ${x + width} ${y + height - BORDER_RADIUS}`,
        `Q ${x + width} ${y + height} ${x + width - BORDER_RADIUS} ${y + height}`,
        `L ${x + BORDER_RADIUS} ${y + height}`,
        `Q ${x} ${y + height} ${x} ${y + height - BORDER_RADIUS}`,
        `L ${x} ${y + BORDER_RADIUS}`,
        `Q ${x} ${y} ${x + BORDER_RADIUS} ${y} Z`,
    ].join(' ');

    // ── Tooltip positioning ─────────────────────────────────────
    const tooltipStyle = getTooltipPosition(step.position, targetRect, vw, vh);

    const isLastStep = currentStep === totalSteps - 1;

    if (typeof window === 'undefined' || !document.body) return null;

    return createPortal(
        <>
            {/* ── 1. SVG Backdrop — position:fixed, ZERO transforms, pixel-perfect ── */}
            {/* Rendered completely outside AnimatePresence so Framer Motion never  */}
            {/* applies scale/translate transforms that would shift SVG coordinates. */}
            <svg
                style={{
                    position: 'fixed',
                    inset: 0,
                    width: '100vw',
                    height: '100vh',
                    zIndex: 59,
                    pointerEvents: 'none',
                }}
            >
                <path
                    d={cutoutPath}
                    fill="rgba(0, 0, 0, 0.60)"
                    fillRule="evenodd"
                />
            </svg>

            {/* ── 2. Click-blocker — prevents clicks on dimmed areas ── */}
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 60,
                    pointerEvents: 'auto',
                }}
                onClick={(e) => e.stopPropagation()}
            />

            {/* ── 3. Cutout pass-through — allows clicks inside the spotlight ── */}
            <div
                style={{
                    position: 'fixed',
                    left: x,
                    top: y,
                    width: width,
                    height: height,
                    zIndex: 61,
                    pointerEvents: 'auto',
                }}
            />

            {/* ── 4. Tooltip Card — Framer Motion animation only here ── */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={`tour-step-${currentStep}`}
                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className="bg-white rounded-2xl shadow-2xl border border-[#E7E7E5] p-6 max-w-sm"
                    style={{
                        position: 'fixed',
                        ...tooltipStyle,
                        zIndex: 62,
                        pointerEvents: 'auto',
                    }}
                >
                    {/* Step indicator */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-[#f0f4ff] flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-[#002e7a]" />
                            </div>
                            <span className="text-[10px] font-semibold text-[#A8A29E] uppercase tracking-wider">
                                {t('step_indicator', { current: currentStep + 1, total: totalSteps })}
                            </span>
                        </div>
                        <button
                            onClick={onSkip}
                            className="p-1 text-[#A8A29E] hover:text-[#37352F] transition-colors rounded-md hover:bg-[#F5F5F4]"
                            title="Tour überspringen"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Step progress dots */}
                    <div className="flex gap-1.5 mb-4">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <div
                                key={i}
                                className={`h-1 rounded-full transition-all duration-300 ${
                                    i <= currentStep
                                        ? 'bg-[#002e7a] flex-[2]'
                                        : 'bg-[#E7E7E5] flex-1'
                                }`}
                            />
                        ))}
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-[#37352F] mb-2">
                        {t(step.titleKey)}
                    </h3>

                    {/* Optional image */}
                    {step.imageUrl && (
                        <div className="mb-3 rounded-lg overflow-hidden border border-[#E7E7E5]">
                            <img
                                src={step.imageUrl}
                                alt=""
                                className="w-full h-auto"
                                loading="eager"
                            />
                        </div>
                    )}

                    {/* Body — supports <b>bold</b> via next-intl rich text */}
                    <p className="text-sm text-[#73726E] leading-relaxed mb-5">
                        {t.rich(step.bodyKey, {
                            b: (chunks) => (
                                <strong className="font-semibold text-[#002e7a]">{chunks}</strong>
                            ),
                        })}
                    </p>

                    {/* Action button */}
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onNext}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors bg-[#002e7a] text-white hover:bg-[#001d4f]`}
                    >
                        {isLastStep ? t('button_start') : t('button_next')}
                        <ArrowRight className="w-4 h-4" />
                    </motion.button>
                </motion.div>
            </AnimatePresence>
        </>,
        document.body
    );
}

// ── Smart tooltip positioning ─────────────────────────────────

function getTooltipPosition(
    preferred: 'left' | 'right' | 'top' | 'bottom',
    rect: TargetRect,
    vw: number,
    vh: number
): React.CSSProperties {
    const TOOLTIP_WIDTH = 340;
    const TOOLTIP_HEIGHT_EST = 280;

    // Try preferred position first, fall back if off-screen
    switch (preferred) {
        case 'right': {
            const left = rect.x + rect.width + TOOLTIP_GAP;
            if (left + TOOLTIP_WIDTH < vw) {
                return {
                    left: `${left}px`,
                    top: `${Math.max(20, rect.y)}px`,
                    width: `${TOOLTIP_WIDTH}px`,
                };
            }
            // Fallback to left
            return {
                left: `${Math.max(20, rect.x - TOOLTIP_WIDTH - TOOLTIP_GAP)}px`,
                top: `${Math.max(20, rect.y)}px`,
                width: `${TOOLTIP_WIDTH}px`,
            };
        }
        case 'left': {
            const left = rect.x - TOOLTIP_WIDTH - TOOLTIP_GAP;
            if (left > 20) {
                return {
                    left: `${left}px`,
                    top: `${Math.max(20, rect.y)}px`,
                    width: `${TOOLTIP_WIDTH}px`,
                };
            }
            // Fallback to right
            return {
                left: `${rect.x + rect.width + TOOLTIP_GAP}px`,
                top: `${Math.max(20, rect.y)}px`,
                width: `${TOOLTIP_WIDTH}px`,
            };
        }
        case 'bottom': {
            const top = rect.y + rect.height + TOOLTIP_GAP;
            // Clamp: if too close to bottom, flip to above the element
            const clampedTop = top + TOOLTIP_HEIGHT_EST > vh
                ? Math.max(20, rect.y - TOOLTIP_HEIGHT_EST - TOOLTIP_GAP)
                : top;
            return {
                left: `${Math.min(vw - TOOLTIP_WIDTH - 20, Math.max(20, rect.x))}px`,
                top: `${clampedTop}px`,
                width: `${TOOLTIP_WIDTH}px`,
            };
        }
        case 'top': {
            return {
                left: `${Math.min(vw - TOOLTIP_WIDTH - 20, Math.max(20, rect.x))}px`,
                top: `${Math.max(20, rect.y - TOOLTIP_HEIGHT_EST - TOOLTIP_GAP)}px`,
                width: `${TOOLTIP_WIDTH}px`,
            };
        }
    }
}
