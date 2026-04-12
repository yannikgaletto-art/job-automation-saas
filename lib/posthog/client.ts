/**
 * PostHog Browser Client — Product Analytics
 *
 * Usage: Import `posthog` and call `posthog.capture('event_name', { properties })`.
 * This is a lazy-init singleton — PostHog only initializes once, on first import.
 *
 * DSGVO: EU endpoint, all inputs masked, no IP storage.
 */

import posthog from 'posthog-js';

let initialized = false;

export function initPostHog(): typeof posthog {
    if (typeof window === 'undefined') return posthog;
    if (initialized) return posthog;

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

    if (!key || key === 'phc_xxx') {
        console.warn('[PostHog] No API key configured — analytics disabled');
        return posthog;
    }

    posthog.init(key, {
        api_host: host,
        capture_pageview: false,      // Manual for Next.js App Router (route changes)
        capture_pageleave: true,       // Track session duration
        persistence: 'localStorage',   // DSGVO: no cookies
        disable_session_recording: false,
        session_recording: {
            maskAllInputs: true,       // DSGVO: mask form inputs
            maskTextSelector: '*',     // Mask all text in recordings
        },
        loaded: (ph) => {
            // In dev, enable debug mode for console logging
            if (process.env.NODE_ENV === 'development') {
                ph.debug();
            }
        },
    });

    initialized = true;
    return posthog;
}

export { posthog };
