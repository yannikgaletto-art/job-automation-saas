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

    // Skip PostHog in local development — avoids "Failed to fetch" noise
    // from the EU endpoint being blocked. No analytics needed locally.
    if (process.env.NODE_ENV !== 'production') {
        return posthog;
    }

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
        // Note: no ph.debug() — that escalates RemoteConfig network errors to
        // unhandled Next.js errors which pollute the error overlay.
    });

    initialized = true;
    return posthog;
}

export { posthog };
