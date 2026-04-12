/**
 * Next.js Instrumentation File — Sentry Server + Edge Init
 *
 * Required for Next.js 15 + @sentry/nextjs.
 * Replaces the deprecated sentry.server.config.ts and sentry.edge.config.ts.
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('../sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config');
    }
}
