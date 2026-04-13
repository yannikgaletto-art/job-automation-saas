import * as Sentry from '@sentry/nextjs'

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,       // 10% der Requests tracen — reicht für MVP
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.0, // Keine Session Replays (DSGVO-freundlich)
    ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'AbortError',
        'signal is aborted without reason',
        'The operation was aborted',
    ],
    beforeSend(event) {
        // PII aus Error-Events entfernen (DSGVO)
        if (event.user) {
            delete event.user.email
            delete event.user.ip_address
            delete event.user.username // Supabase may set username = email (DSGVO)
        }
        return event
    },
})
