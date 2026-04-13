/**
 * Role Research API Route
 * Feature-Silo: coaching
 *
 * POST: Generate "About the Role" and/or "Meine Geschichte" analysis on demand.
 *
 * Safety nets (QA-integrated):
 * - Per-Category Idempotency: returns cached data if the requested category is already analyzed
 * - Category Scoping: `category` param controls which Claude call(s) run
 * - JSONB Safe Merge: ONLY overwrites the requested category, never blind-overwrites sibling keys
 * - Partial Success: saves whatever succeeded via Promise.allSettled
 * - maxDuration: 60s for Vercel
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { getUserLocale } from '@/lib/i18n/get-user-locale';
import { getLanguageInstruction } from '@/lib/prompts/coaching-prompt-i18n';
import type { AboutRole } from '@/types/coaching';

// Vercel timeout protection
export const maxDuration = 60;

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Isolated Anthropic client — NOT from model-router (Forbidden File)
let roleClient: Anthropic | null = null;
function getClient(): Anthropic {
    if (!roleClient) {
        roleClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    }
    return roleClient;
}

const MODEL = 'claude-haiku-4-5-20251001';

// ─── POST: Analyze Role and/or User Story ─────────────────────────────
export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { sessionId, category = 'all', force = false } = body as {
            sessionId: string;
            category?: 'aboutRole' | 'myStory' | 'all';
            force?: boolean;
        };

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        // ── Load existing session (user-scoped — Contract 3) ──
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('coaching_sessions')
            .select('id, job_id, coaching_dossier')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Session nicht gefunden' }, { status: 404 });
        }

        const existingDossier = session.coaching_dossier as Record<string, unknown> | null;

        // ── Per-category Idempotency: return cached if the requested section exists (skip if force=true) ──
        const wantsAboutRole = category === 'aboutRole' || category === 'all';
        const wantsMyStory = category === 'myStory' || category === 'all';

        const hasAboutRole = !!existingDossier?.aboutRole;
        const hasMyStory = !!existingDossier?.myStory;

        if (
            !force &&
            (
                (wantsAboutRole && !wantsMyStory && hasAboutRole) ||
                (wantsMyStory && !wantsAboutRole && hasMyStory) ||
                (wantsAboutRole && wantsMyStory && hasAboutRole && hasMyStory)
            )
        ) {
            console.log(`✅ [RoleResearch] Idempotency hit (category: ${category}) — returning cached data for session ${sessionId}`);
            return NextResponse.json({
                aboutRole: existingDossier?.aboutRole ?? null,
                myStory: existingDossier?.myStory ?? null,
                cached: true,
            });
        }

        // When force=true, treat the requested category as not cached so it gets regenerated
        const skipAboutRole = force ? false : hasAboutRole;
        const skipMyStory = force ? false : hasMyStory;

        // ── Load job data (user-scoped) ──
        const { data: job, error: jobError } = await supabaseAdmin
            .from('job_queue')
            .select('job_title, company_name, description, requirements')
            .eq('id', session.job_id)
            .eq('user_id', user.id)
            .single();

        if (jobError || !job) {
            return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
        }

        // ── Load CV text (mandatory) ──
        const cvResult = await getCVText(user.id, undefined, { forAI: true });
        if (!cvResult) {
            return NextResponse.json({
                error: 'Kein Lebenslauf gefunden. Bitte lade deinen CV in den Settings hoch.',
                code: 'CV_NOT_FOUND',
            }, { status: 404 });
        }

        // ── Load Cover Letter (optional — graceful fallback) ──
        let coverLetterText = '';
        try {
            const { data: clDoc } = await supabaseAdmin
                .from('documents')
                .select('metadata')
                .eq('user_id', user.id)
                .eq('document_type', 'cover_letter')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (clDoc) {
                const meta = clDoc.metadata as Record<string, unknown>;
                coverLetterText = (meta?.extracted_text as string) || '';
            }
        } catch {
            // Non-blocking — cover letter is optional
        }

        const client = getClient();
        const userLocale = await getUserLocale(user.id);
        const langInstruction = getLanguageInstruction(userLocale);
        const jobDesc = job.description?.substring(0, 3000) || 'Nicht verfügbar';
        const reqText = job.requirements
            ? JSON.stringify(job.requirements, null, 2).substring(0, 2000)
            : '';

        // ── Run only the requested Claude calls ──
        const calls: Promise<Anthropic.Message>[] = [];
        if (wantsAboutRole && !skipAboutRole) {
            calls.push(
                // Call: About the Role — scoped, concise, bold keywords
                client.messages.create({
                    model: MODEL,
                    max_tokens: 1200,
                    temperature: 0.3,
                    system: `${langInstruction}\nDu bist ein Karriereberater, der Jobsuchende auf Bewerbungsgespräche vorbereitet. Analysiere Stellenbeschreibungen prägnant und klar. Antworte ausschließlich als valides JSON (kein Markdown, keine Code-Blöcke).`,
                    messages: [{
                        role: 'user',
                        content: `Analysiere diese Stellenbeschreibung und beschreibe die Rolle "${job.job_title}" bei "${job.company_name}" in drei Kategorien.

STELLENBESCHREIBUNG:
${jobDesc}

ANFORDERUNGEN:
${reqText}

REGELN:
- Fasse dich kurz: maximal 1 prägnanter Satz pro Punkt.
- Starte jeden Punkt mit einer **fettgedruckten Schlüsselphrase** (Markdown **...**), gefolgt von einem Doppelpunkt und dem Satz.
- Keine generischen Phrasen, alles spezifisch für diese Stelle.

Antworte als JSON mit exakt dieser Struktur:
{
  "dailyBusiness": ["**Keyword:** Konkreter Satz.", "..."],
  "cases": ["**Keyword:** Konkreter Satz.", "..."],
  "methodology": ["**Keyword:** Konkreter Satz.", "..."]
}
Generiere 3-4 Punkte pro Kategorie.`,
                    }],
                })
            );
        }
        if (wantsMyStory && !skipMyStory) {
            calls.push(
                // Call: Meine Geschichte — concise T1-style storytelling
                client.messages.create({
                    model: MODEL,
                    max_tokens: 1200,
                    temperature: 0.4,
                    system: `${langInstruction}\nDu bist ein Storytelling-Coach. Formuliere die berufliche Geschichte als kraftvolle Stichpunkte. Jeder Stichpunkt beginnt mit einer **fettgedruckten Überschrift** (Markdown), gefolgt von maximal 1-2 Sätzen. Kein Fülltext, kein Blabla. Antworte ausschließlich als valides JSON (kein Markdown, keine Code-Blöcke).`,
                    messages: [{
                        role: 'user',
                        content: `Analysiere diesen Lebenslauf${coverLetterText ? ' und das Anschreiben' : ''} und formuliere die berufliche Geschichte als Stichpunkte.

LEBENSLAUF:
${cvResult.text.substring(0, 4000)}

${coverLetterText ? `ANSCHREIBEN:\n${coverLetterText.substring(0, 2000)}` : ''}

STELLE: ${job.job_title} bei ${job.company_name}

REGELN:
- Maximal 1-2 Sätze pro Stichpunkt. Kein Fülltext.
- Format: "**Überschrift:** Kurzer, prägnanter Satz."

Antworte als JSON:
{
  "myStory": ["**Brückenbauer:** Bei mir kommen...", "**Hands-on Mentalität:** ...", "..."]
}
Generiere 4-5 Stichpunkte, die die Stärken des Kandidaten für GENAU diese Stelle bei ${job.company_name} hervorheben.`,
                    }],
                })
            );
        }

        const results = await Promise.allSettled(calls);

        // ── Parse results — map results back to category ──
        let updatedAboutRole: AboutRole | null = null;
        let updatedMyStory: string[] | null = null;

        let resultIndex = 0;

        if (wantsAboutRole && !skipAboutRole) {
            const result = results[resultIndex++];
            if (result.status === 'fulfilled') {
                try {
                    const raw = result.value.content
                        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
                        .map(b => b.text).join('\n').trim()
                        .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    const match = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
                    const parsed = JSON.parse(match);
                    updatedAboutRole = {
                        dailyBusiness: Array.isArray(parsed.dailyBusiness) ? parsed.dailyBusiness : [],
                        cases: Array.isArray(parsed.cases) ? parsed.cases : [],
                        methodology: Array.isArray(parsed.methodology) ? parsed.methodology : [],
                    };
                    console.log(`✅ [RoleResearch] About the Role parsed: ${updatedAboutRole.dailyBusiness.length} tasks`);
                } catch (e) {
                    console.error('❌ [RoleResearch] About the Role parse failed:', e);
                }
            } else {
                console.error('❌ [RoleResearch] About the Role call failed:', result.reason);
            }
        }

        if (wantsMyStory && !skipMyStory) {
            const result = results[resultIndex++];
            if (result.status === 'fulfilled') {
                try {
                    const raw = result.value.content
                        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
                        .map(b => b.text).join('\n').trim()
                        .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    const match = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
                    const parsedStory = JSON.parse(match);
                    const storyItems: string[] = Array.isArray(parsedStory.myStory) ? parsedStory.myStory : [];
                    updatedMyStory = storyItems;
                    console.log(`✅ [RoleResearch] Meine Geschichte parsed: ${storyItems.length} bullet points`);
                } catch (e) {
                    console.error('❌ [RoleResearch] Meine Geschichte parse failed:', e);
                }
            } else {
                console.error('❌ [RoleResearch] Meine Geschichte call failed:', result.reason);
            }
        }

        // ── Safe JSONB Read-Modify-Write (QA: NEVER blind-overwrite sibling keys) ──
        // Only merge keys we actually requested & generated. Preserve existing sibling data.
        const mergedDossier: Record<string, unknown> = { ...(existingDossier || {}) };
        if (updatedAboutRole !== null) mergedDossier.aboutRole = updatedAboutRole;
        if (updatedMyStory !== null) mergedDossier.myStory = updatedMyStory;

        const { error: updateError } = await supabaseAdmin
            .from('coaching_sessions')
            .update({ coaching_dossier: mergedDossier })
            .eq('id', sessionId)
            .eq('user_id', user.id);

        if (updateError) {
            console.error('❌ [RoleResearch] DB update failed:', updateError.message);
            // Non-blocking — still return data to the frontend
        }

        console.log(`✅ [RoleResearch] Complete (category: ${category}) for session ${sessionId}`);

        // Return the final effective state (new or cached)
        return NextResponse.json({
            aboutRole: updatedAboutRole ?? (existingDossier?.aboutRole ?? null),
            myStory: updatedMyStory ?? (existingDossier?.myStory ?? null),
            cached: false,
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ [RoleResearch] POST error:', message);

        if (message.includes('CV_NOT_FOUND')) {
            return NextResponse.json({
                error: 'Kein Lebenslauf gefunden. Bitte lade deinen CV in den Settings hoch.',
                code: 'CV_NOT_FOUND',
            }, { status: 404 });
        }

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
