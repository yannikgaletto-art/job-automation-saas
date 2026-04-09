export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scanForFluff } from '@/lib/services/anti-fluff-blacklist';

/**
 * POST /api/cover-letter/kill-fluff
 * Scan-Only fluff detection endpoint (no AI-Call — zero cost).
 *
 * Refactored 2026-04-09: AI-powered rewrite removed.
 * Rationale: Fluff feedback is now injected into the sync-loop in cover-letter-generator.ts.
 * This endpoint is retained for on-demand client-side scanning only.
 *
 * Input: { coverLetterText: string, jobId: string }
 * Output: { cleanedText: string (unchanged), removedPhrases: string[], changeCount: 0 }
 *
 * Auth: Required (401 without session)
 * Security: jobId must belong to user (403 if foreign)
 * Cost: $0.00 (no AI call)
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const { coverLetterText, jobId } = await request.json() as {
            coverLetterText?: string;
            jobId?: string;
        };

        if (!coverLetterText || !jobId) {
            return NextResponse.json(
                { success: false, error: 'Missing coverLetterText or jobId' },
                { status: 400 }
            );
        }

        // Security: Verify jobId belongs to this user
        const { data: job, error: jobError } = await supabase
            .from('job_queue')
            .select('id')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (jobError || !job) {
            return NextResponse.json(
                { success: false, error: 'Job not found or access denied' },
                { status: 403 }
            );
        }

        // Scan-Only: Identify fluff via centralized BLACKLIST_PATTERNS
        const localScan = scanForFluff(coverLetterText);
        const removedPhrases: string[] = localScan.matches.map(m => m.pattern);

        return NextResponse.json({
            success: true,
            cleanedText: coverLetterText, // Unchanged — no AI rewrite
            removedPhrases,
            changeCount: 0, // No actual changes made (scan-only)
            fluffFound: localScan.found,
            matches: localScan.matches.map(m => ({
                pattern: m.pattern,
                reason: m.reason,
                category: m.category,
                feedback: m.feedback,
            })),
            info: localScan.found
                ? `${localScan.matches.length} Fluff-Pattern(s) erkannt. Nutze "Korrektur"-Funktion des Editors für gezielte Verbesserungen.`
                : 'Kein Fluff gefunden — Text ist sauber.',
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            { success: false, error: errMsg },
            { status: 500 }
        );
    }
}
