'use client';

/**
 * PostHog Provider — Wraps the app to initialize analytics.
 *
 * - Initializes PostHog on mount
 * - Captures pageviews on route changes (mandatory for App Router)
 * - Identifies user after Supabase auth state resolves
 */

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initPostHog, posthog } from '@/lib/posthog/client';
import { createClient } from '@/lib/supabase/client';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const prevPath = useRef<string | null>(null);
    const identified = useRef(false);

    // Initialize PostHog once on mount
    useEffect(() => {
        initPostHog();
    }, []);

    // Identify user after Supabase auth resolves (merge anonymous → real user)
    useEffect(() => {
        if (identified.current) return;

        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user?.id) {
                posthog.identify(user.id, {
                    email: user.email,
                    created_at: user.created_at,
                });
                identified.current = true;
            }
        }).catch(() => {
            // Silently fail — analytics identity is non-critical
        });
    }, []);

    // Track pageview on route change (App Router doesn't fire automatically)
    useEffect(() => {
        const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');

        // Prevent duplicate captures on initial mount
        if (prevPath.current === url) return;
        prevPath.current = url;

        posthog.capture('$pageview', {
            $current_url: url,
        });
    }, [pathname, searchParams]);

    return <>{children}</>;
}
