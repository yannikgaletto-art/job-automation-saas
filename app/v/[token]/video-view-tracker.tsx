"use client";

import { useEffect } from 'react';

interface VideoViewTrackerProps {
    token: string;
}

/**
 * Client-side component that fires the view tracking call once per browser session.
 * Uses sessionStorage to prevent inflation from reloads within the same tab session.
 * No PII is sent -- only the public access token.
 */
export function VideoViewTracker({ token }: VideoViewTrackerProps) {
    useEffect(() => {
        const storageKey = `pathly_vv_${token}`;

        // Skip if already tracked in this session (reload protection)
        if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) {
            return;
        }

        fetch('/api/video/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        })
            .then(() => {
                // Mark as tracked for this session
                try { sessionStorage.setItem(storageKey, '1'); } catch { /* quota exceeded — ignore */ }
            })
            .catch(() => {
                // Silent — view tracking must never block the video player
            });
    }, [token]);

    return null;
}
