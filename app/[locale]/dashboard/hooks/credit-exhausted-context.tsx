'use client';

/**
 * Credit Exhausted Context
 * Feature-Silo: billing
 *
 * Global context for triggering the paywall modal from anywhere in the dashboard.
 * Pattern matches MoodCheckinProvider in dashboard/layout.tsx.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

export type PaywallReason = 'credits' | 'coaching' | 'search';

interface CreditExhaustedState {
    open: boolean;
    reason: PaywallReason;
    remaining: number;
}

interface CreditExhaustedContextValue {
    /** Show the paywall modal */
    showPaywall: (reason: PaywallReason, opts?: { remaining?: number }) => void;
    /** Hide the paywall modal */
    hidePaywall: () => void;
    /** Current modal state */
    state: CreditExhaustedState;
}

const CreditExhaustedContext = createContext<CreditExhaustedContextValue | null>(null);

export function CreditExhaustedProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<CreditExhaustedState>({
        open: false,
        reason: 'credits',
        remaining: 0,
    });

    const showPaywall = useCallback((reason: PaywallReason, opts?: { remaining?: number }) => {
        setState({ open: true, reason, remaining: opts?.remaining ?? 0 });
    }, []);

    const hidePaywall = useCallback(() => {
        setState(prev => ({ ...prev, open: false }));
    }, []);

    return (
        <CreditExhaustedContext.Provider value={{ showPaywall, hidePaywall, state }}>
            {children}
        </CreditExhaustedContext.Provider>
    );
}

/**
 * Hook to access the paywall trigger from any dashboard component.
 * Usage: const { showPaywall } = useCreditExhausted();
 */
export function useCreditExhausted() {
    const ctx = useContext(CreditExhaustedContext);
    if (!ctx) {
        throw new Error('useCreditExhausted must be used within CreditExhaustedProvider');
    }
    return ctx;
}
