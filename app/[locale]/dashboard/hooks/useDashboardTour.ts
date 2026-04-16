'use client';

/**
 * useDashboardTour — Generic per-tab tour hook.
 * 
 * Each dashboard tab can have its own guided tour that fires on first visit.
 * Uses localStorage for persistence (MVP — no DB migration needed).
 * 
 * Example:
 *   const tour = useDashboardTour('goals', GOALS_TOUR_STEPS);
 *   if (tour.isActive) return <GuidedTourOverlay {...tour} />;
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TourStep {
    targetSelector: string;
    /** Preferred tooltip position relative to highlighted area */
    position: 'left' | 'right' | 'top' | 'bottom';
    titleKey: string;
    bodyKey: string;
}

interface UseDashboardTourReturn {
    /** Whether the tour is currently active / visible */
    isActive: boolean;
    /** Current step index (0-based) */
    currentStep: number;
    /** Total steps */
    totalSteps: number;
    /** The configuration for the current step */
    step: TourStep | null;
    /** All steps */
    steps: TourStep[];
    /** Advance to next step or complete if last */
    nextStep: () => void;
    /** Skip / close the tour entirely */
    skipTour: () => void;
}

function getStorageKey(tabId: string): string {
    return `pathly_tour_completed_${tabId}`;
}

function isTourCompleted(tabId: string): boolean {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(getStorageKey(tabId)) === '1';
}

function markTourCompleted(tabId: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(getStorageKey(tabId), '1');
}

/**
 * @param tabId - Unique identifier for the tab (e.g., 'goals', 'job-search')
 * @param steps - Array of TourStep configurations
 * @param options.delayMs - Delay before showing tour (default: 3500ms — after confetti)
 * @param options.enabled - External gate (e.g., wait for other overlays to close)
 * @param options.requireOnboardingFlag - If true, tour only starts if user just completed onboarding (sessionStorage flag)
 */
export function useDashboardTour(
    tabId: string,
    steps: TourStep[],
    options: { delayMs?: number; enabled?: boolean; requireOnboardingFlag?: boolean } = {}
): UseDashboardTourReturn {
    const { delayMs = 3500, enabled = true, requireOnboardingFlag = false } = options;
    const [isActive, setIsActive] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const hasTriggered = useRef(false);

    // Check if this tour should show (only once per tab, ever)
    useEffect(() => {
        if (hasTriggered.current) return;
        if (!enabled) return;
        if (isTourCompleted(tabId)) return;
        if (steps.length === 0) return;

        // When requireOnboardingFlag is true, only show tour if user just completed onboarding.
        // NOTE: We do NOT remove the flag here — each tab needs to read it independently.
        // sessionStorage auto-clears when the browser tab closes, preventing re-triggers.
        if (requireOnboardingFlag) {
            if (typeof window === 'undefined') return;
            const flag = sessionStorage.getItem('pathly_show_post_onboarding_tour');
            if (flag !== '1') return;
        }

        const timer = setTimeout(() => {
            hasTriggered.current = true;
            setIsActive(true);
            setCurrentStep(0);
        }, delayMs);

        return () => clearTimeout(timer);
    }, [tabId, steps.length, delayMs, enabled, requireOnboardingFlag]);

    const completeTour = useCallback(() => {
        markTourCompleted(tabId);
        setIsActive(false);
        setCurrentStep(0);
    }, [tabId]);

    const nextStep = useCallback(() => {
        if (currentStep >= steps.length - 1) {
            // Last step — complete tour
            completeTour();
        } else {
            setCurrentStep((prev) => prev + 1);
        }
    }, [currentStep, steps.length, completeTour]);

    const skipTour = useCallback(() => {
        completeTour();
    }, [completeTour]);

    return {
        isActive,
        currentStep,
        totalSteps: steps.length,
        step: isActive ? steps[currentStep] ?? null : null,
        steps,
        nextStep,
        skipTour,
    };
}
