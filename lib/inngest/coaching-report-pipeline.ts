/**
 * Coaching Report Pipeline (Inngest) — Retry Shell
 * Feature-Silo: coaching
 *
 * Thin wrapper around generateAndSaveReport() for Inngest retry infrastructure.
 * The actual report logic lives ONLY in lib/services/coaching-report-generator.ts.
 *
 * Triggered by event: 'coaching/generate-report'
 */

import { inngest } from './client';
import { generateAndSaveReport } from '@/lib/services/coaching-report-generator';
import { NonRetriableError } from 'inngest';

export const generateCoachingReport = inngest.createFunction(
    {
        id: 'generate-coaching-report',
        name: 'Generate Coaching Report',
        retries: 2,
    },
    { event: 'coaching/generate-report' },
    async ({ event, step }) => {
        const { sessionId, userId } = event.data;

        await step.run('generate-report', async () => {
            try {
                // generateAndSaveReport has its own idempotency guard —
                // if report already exists, it returns immediately.
                await generateAndSaveReport(sessionId, userId);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);

                // Session not found → don't retry
                if (message.includes('Session not found')) {
                    throw new NonRetriableError(message);
                }

                // All other errors → let Inngest retry
                throw err;
            }
        });

        return { success: true, sessionId };
    }
);
