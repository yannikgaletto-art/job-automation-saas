export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BLACKLIST_PATTERNS, scanForFluff } from '@/lib/services/anti-fluff-blacklist';
import { complete } from '@/lib/ai/model-router';
import { withCreditGate, handleBillingError } from '@/lib/middleware/credit-gate';
import { CREDIT_COSTS } from '@/lib/services/credit-types';

/**
 * POST /api/cover-letter/kill-fluff
 * On-demand fluff removal using Claude 4.5 Sonnet (or local fallback).
 *
 * Input: { coverLetterText: string, jobId: string }
 * Output: { cleanedText: string, removedPhrases: string[], changeCount: number }
 *
 * Auth: Required (401 without session)
 * Security: jobId must belong to user (403 if foreign — Yannik Correction #4)
 * Cost: ~$0.003-0.005 per call
 *
 * MIGRATION NOTE (2026-03-28): Replaced GPT-4o with Claude Sonnet via model-router
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

        // Security: Verify jobId belongs to this user (Yannik Correction #4)
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

        // Step 1: Local scan to identify fluff
        const localScan = scanForFluff(coverLetterText);
        const removedPhrases: string[] = localScan.matches.map(m => m.pattern);

        // Step 2: Claude Sonnet cleanup (if API key available + fluff found)
        if (process.env.ANTHROPIC_API_KEY && localScan.found) {
            try {
                const blacklistSection = BLACKLIST_PATTERNS.map(p => `- "${p.pattern}" (${p.reason})`).join('\n');

                // §BILLING: Credit Gate — debit 0.5 credits, auto-refund on AI failure
                const cleanedText = await withCreditGate(
                    user.id,
                    CREDIT_COSTS.cover_letter,
                    'cover_letter',
                    async () => {
                        const response = await complete({
                            taskType: 'kill_fluff',
                            systemPrompt: `Du bist ein Fluff-Killer für Anschreiben. Ersetze alle generischen KI-Phrasen durch konkrete, authentische Formulierungen.

BLACKLIST (MUSS entfernt/ersetzt werden):
${blacklistSection}

ZUSÄTZLICH ENTFERNEN:
- Kalenderspruch-artige Weisheiten
- Sätze über 30 Wörter ohne Komma
- Alles was bei einem Personaler den Verdacht "KI-generiert" auslöst

REGELN:
- Behalte Struktur, Länge und Fakten bei
- Ersetze Fluff durch konkrete, belegbare Aussagen
- Gib NUR den bereinigten Text zurück, kein JSON, kein Markdown`,
                            prompt: coverLetterText,
                            temperature: 0.3,
                            maxTokens: 2500,
                        });
                        return response.text.trim();
                    },
                    jobId
                );

                return NextResponse.json({
                    success: true,
                    cleanedText,
                    removedPhrases,
                    changeCount: removedPhrases.length,
                });
            } catch (error) {
                const billingResponse = handleBillingError(error);
                if (billingResponse) return billingResponse;
                console.error('❌ [KillFluff] Claude Sonnet failed, falling back to local scan:', error);
            }
        }

        // Fallback: Return original text with identified phrases (no AI improvement)
        return NextResponse.json({
            success: true,
            cleanedText: coverLetterText,
            removedPhrases,
            changeCount: 0, // No actual changes made without Claude
            warning: !process.env.ANTHROPIC_API_KEY
                ? 'Claude Sonnet nicht verfügbar (ANTHROPIC_API_KEY fehlt). Nur Scan, keine Verbesserung.'
                : localScan.found
                    ? 'Claude Sonnet Verbesserung fehlgeschlagen. Nur lokaler Scan.'
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

