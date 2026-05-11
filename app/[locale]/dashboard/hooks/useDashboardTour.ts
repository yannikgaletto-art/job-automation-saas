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

export const TOUR_RESET_EVENT = 'pathly:tours-reset';
export const TOUR_REPLAY_SESSION_KEY = 'pathly_tour_replay_requested';
export const POST_ONBOARDING_TOUR_SESSION_KEY = 'pathly_show_post_onboarding_tour';

export const DASHBOARD_TOUR_IDS = [
    'goals',
    'job-queue',
    'job-search',
    'coaching',
    'cv-qr-video-letter',
    'video-letter-modes',
] as const;

interface TourResetEventDetail {
    tourIds: string[];
}

export interface TourStep {
    targetSelector: string;
    /** Preferred tooltip position relative to highlighted area */
    position: 'left' | 'right' | 'top' | 'bottom';
    titleKey: string;
    bodyKey: string;
    /** Optional image URL (from /public) to show above the body text */
    imageUrl?: string;
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

export function getTourCompletedStorageKey(tabId: string): string {
    return `pathly_tour_completed_${tabId}`;
}

function isTourCompleted(tabId: string): boolean {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(getTourCompletedStorageKey(tabId)) === '1';
}

function markTourCompleted(tabId: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getTourCompletedStorageKey(tabId), '1');
}

export function hasRequiredTourStartGate(requireOnboardingFlag: boolean): boolean {
    if (!requireOnboardingFlag) return true;
    if (typeof window === 'undefined') return false;

    return (
        window.sessionStorage.getItem(POST_ONBOARDING_TOUR_SESSION_KEY) === '1' ||
        window.sessionStorage.getItem(TOUR_REPLAY_SESSION_KEY) === '1'
    );
}

export function resetDashboardTourCompletion(tourIds: readonly string[] = DASHBOARD_TOUR_IDS): void {
    if (typeof window === 'undefined') return;

    tourIds.forEach((tourId) => {
        window.localStorage.removeItem(getTourCompletedStorageKey(tourId));
    });
    window.sessionStorage.setItem(TOUR_REPLAY_SESSION_KEY, '1');
    window.dispatchEvent(new CustomEvent<TourResetEventDetail>(TOUR_RESET_EVENT, {
        detail: { tourIds: [...tourIds] },
    }));
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
    const [resetVersion, setResetVersion] = useState(0);
    const hasTriggered = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleTourReset = (event: Event) => {
            const detail = (event as CustomEvent<TourResetEventDetail>).detail;
            if (detail?.tourIds && !detail.tourIds.includes(tabId)) return;

            hasTriggered.current = false;
            setIsActive(false);
            setCurrentStep(0);
            setResetVersion((version) => version + 1);
        };

        window.addEventListener(TOUR_RESET_EVENT, handleTourReset);
        return () => window.removeEventListener(TOUR_RESET_EVENT, handleTourReset);
    }, [tabId]);

    // Check if this tour should show (only once per tab, ever)
    useEffect(() => {
        if (hasTriggered.current) return;
        if (!enabled) return;
        if (isTourCompleted(tabId)) return;
        if (steps.length === 0) return;

        // When requireOnboardingFlag is true, only show tour if user just completed onboarding.
        // NOTE: We do NOT remove the flag here — each tab needs to read it independently.
        // sessionStorage auto-clears when the browser tab closes, preventing re-triggers.
        // Settings reset also sets a replay-session flag so completed tours can be tested again.
        if (!hasRequiredTourStartGate(requireOnboardingFlag)) return;

        const timer = setTimeout(() => {
            hasTriggered.current = true;
            setIsActive(true);
            setCurrentStep(0);
        }, delayMs);

        return () => clearTimeout(timer);
    }, [tabId, steps.length, delayMs, enabled, requireOnboardingFlag, resetVersion]);

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
