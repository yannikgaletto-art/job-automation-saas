/**
 * PostHog Server-Side Client — API Route Event Tracking
 *
 * Usage in API routes:
 *   import { captureServerEvent, shutdownPostHog } from '@/lib/posthog/server';
 *   captureServerEvent(userId, 'cover_letter_generated', { jobId });
 *
 * IMPORTANT: Call shutdownPostHog() or use captureServerEvent() which auto-flushes.
 * In serverless (Vercel), events must flush before the response is sent.
 */

import { PostHog } from 'posthog-node';

let _client: PostHog | null = null;

function getServerClient(): PostHog | null {
    if (_client) return _client;

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || key === 'phc_xxx') return null;

    _client = new PostHog(key, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
        flushAt: 1,       // Flush immediately in serverless (no batching)
        flushInterval: 0, // No timer-based flush — serverless functions can terminate
    });

    return _client;
}

/**
 * Fire-and-forget server-side event capture with auto-flush.
 * Safe to call even if PostHog is not configured — silently no-ops.
 */
export function captureServerEvent(
    userId: string,
    event: string,
    properties?: Record<string, unknown>,
): void {
    const client = getServerClient();
    if (!client) return;

    client.capture({
        distinctId: userId,
        event,
        properties: {
            ...properties,
            $lib: 'posthog-node',
            environment: process.env.NODE_ENV || 'production',
        },
    });
}

/**
 * Identify a user with server-side properties.
 * Call after onboarding completion to sync user traits.
 */
export function identifyServerUser(
    userId: string,
    properties: Record<string, unknown>,
): void {
    const client = getServerClient();
    if (!client) return;

    client.identify({
        distinctId: userId,
        properties,
    });
}

/** Graceful shutdown — call in cleanup contexts (rare in serverless). */
export async function shutdownPostHog(): Promise<void> {
    if (_client) {
        await _client.shutdown();
        _client = null;
    }
}
