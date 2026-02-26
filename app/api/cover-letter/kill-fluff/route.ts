export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BLACKLIST_PATTERNS, scanForFluff } from '@/lib/services/anti-fluff-blacklist';

/**
 * POST /api/cover-letter/kill-fluff
 * On-demand fluff removal using GPT-4o (or local fallback).
 *
 * Input: { coverLetterText: string, jobId: string }
 * Output: { cleanedText: string, removedPhrases: string[], changeCount: number }
 *
 * Auth: Required (401 without session)
 * Security: jobId must belong to user (403 if foreign — Yannik Correction #4)
 * Cost: ~$0.003-0.005 per call
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

        // Step 2: GPT-4o cleanup (if API key available)
        if (process.env.OPENAI_API_KEY && localScan.found) {
            try {
                const blacklistSection = BLACKLIST_PATTERNS.map(p => `- "${p.pattern}" (${p.reason})`).join('\n');

                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        temperature: 0.3,
                        max_tokens: 2500,
                        messages: [
                            {
                                role: 'system',
                                content: `Du bist ein Fluff-Killer für Anschreiben. Ersetze alle generischen KI-Phrasen durch konkrete, authentische Formulierungen.

BLACKLIST (MUSS entfernt/ersetzt werden):
${blacklistSection}

ZUSÄTZLICH ENTFERNEN:
- Kalenderspruch-artige Weisheiten
- Sätze über 30 Wörter ohne Komma
- Alles was bei einem Personaler den Verdacht "KI-generiert" auslöst

REGELN:
- Behalte Struktur, Länge und Fakten bei
- Ersetze Fluff durch konkrete, belegbare Aussagen
- Gib NUR den bereinigten Text zurück, kein JSON, kein Markdown`
                            },
                            {
                                role: 'user',
                                content: coverLetterText,
                            },
                        ],
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    const cleanedText = data.choices?.[0]?.message?.content?.trim() || coverLetterText;

                    return NextResponse.json({
                        success: true,
                        cleanedText,
                        removedPhrases,
                        changeCount: removedPhrases.length,
                    });
                }
            } catch (gptError) {
                console.error('❌ [KillFluff] GPT-4o failed, falling back to local scan:', gptError);
            }
        }

        // Fallback: Return original text with identified phrases (no GPT-4o improvement)
        return NextResponse.json({
            success: true,
            cleanedText: coverLetterText,
            removedPhrases,
            changeCount: 0, // No actual changes made without GPT-4o
            warning: !process.env.OPENAI_API_KEY
                ? 'GPT-4o nicht verfügbar (OPENAI_API_KEY fehlt). Nur Scan, keine Verbesserung.'
                : localScan.found
                    ? 'GPT-4o Verbesserung fehlgeschlagen. Nur lokaler Scan.'
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
