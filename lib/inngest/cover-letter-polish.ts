/**
 * Inngest Function: cover-letter/polish
 * Asynchronous polish pipeline — runs AFTER the synchronous cover letter generation.
 *
 * Steps:
 *   1. Anti-Fluff Re-Gen (if fluff found during sync scan)
 *   2. GPT-4o Language Judge + Claim Extraction (if OPENAI_API_KEY available)
 *   3. Perplexity Fact Check on extracted claims (if PERPLEXITY_API_KEY available)
 *   4. X-Ray Audit Trail via Haiku
 *   5. JSONB Merge-Update on documents.metadata
 *
 * Reference: Implementation Plan Phase 2.2
 * Contract: §ARCHITECTURE 3.1 (Inngest Resilience)
 */

import { inngest } from './client';
import { NonRetriableError } from 'inngest';
import { createClient } from '@supabase/supabase-js';
import { scanForFluff } from '@/lib/services/anti-fluff-blacklist';
import { runMultiAgentPipeline } from '@/lib/services/multi-agent-pipeline';
import Anthropic from '@anthropic-ai/sdk';
import type { CoverLetterSetupContext, AuditTrailCard } from '@/types/cover-letter-setup';

// ─── Supabase Admin (per-call, not module-level — §QA Audit M4) ──────────
function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// ─── Event Type ──────────────────────────────────────────────────────────
interface PolishEventData {
    draftId: string;
    userId: string;
    coverLetter: string;
    fluffFound: boolean;
    jobData?: { job_title?: string; company_name?: string; requirements?: string[]; [key: string]: unknown };
    companyResearch?: { company_values?: string[]; tech_stack?: string[]; [key: string]: unknown };
    setupContext?: CoverLetterSetupContext;
}

// ─── Audit Trail Generator (extracted from cover-letter-generator.ts) ────
async function generateAuditTrail(
    coverLetter: string,
    setupContext: CoverLetterSetupContext
): Promise<AuditTrailCard[]> {
    if (!process.env.ANTHROPIC_API_KEY) return [];

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const auditPrompt = `Analysiere dieses Anschreiben und erstelle 3-5 X-Ray Karten, die zeigen WARUM bestimmte Formulierungen so gewählt wurden.

ANSCHREIBEN:
---
${coverLetter}
---

SETUP-KONTEXT:
- Ton: ${setupContext.tone?.preset || 'formal'}
- Firma: ${setupContext.companyName || 'Unbekannt'}
- Gewählte Module: ${JSON.stringify(setupContext.optInModules || {})}

Erstelle 3-5 Karten. Jede Karte MUSS exakt dieses JSON-Schema haben:
{
  "category": einer von: "user_voice" | "company_insight" | "job_fit" | "module_trace",
  "icon": eines von: "🟢" (user_voice) | "🔵" (company_insight) | "🟣" (job_fit) | "🟠" (module_trace),
  "title": "Kurzer prägnanter Titel (max 5 Wörter)",
  "detail": "Erklärung warum diese Formulierung gewählt wurde (1-2 Sätze)",
  "reference": "Optional: Quellbezug z.B. 'Zitat: Peter Drucker' oder 'CV-Station: Fraunhofer'"
}

Kategorie-Zuordnung:
- user_voice: Formulierungen die auf den Schreibstil des Bewerbers eingehen
- company_insight: Firmenwerte, Vision, Projekte die integriert wurden
- job_fit: Direkte Bezüge zu den Job-Anforderungen
- module_trace: Aktivierte Features wie Zitat, 90-Tage-Plan, Vulnerability-Injector

Antworte NUR als valides JSON-Array (kein Markdown, keine Erklärung):
[{ "category": "...", "icon": "...", "title": "...", "detail": "...", "reference": "..." }]`;

    const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        temperature: 0.2,
        system: 'You are an X-Ray annotation engine. Respond only with a valid JSON array, no markdown, no explanation.',
        messages: [{ role: 'user', content: auditPrompt }]
    });

    const content = message.content[0].type === 'text' ? message.content[0].text : '[]';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
        console.warn('[Audit] No JSON array found in Claude response:', content.slice(0, 200));
        return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as AuditTrailCard[];
    // Validate: filter out cards missing required fields
    const valid = parsed.filter(c => c.category && c.title && c.detail);
    console.log(`[Audit] Parsed ${parsed.length} cards, ${valid.length} valid`);
    return valid;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────
export const polishCoverLetter = inngest.createFunction(
    {
        id: 'cover-letter-polish',
        name: 'Cover Letter Polish Pipeline',
        retries: 1,
    },
    { event: 'cover-letter/polish' },
    async ({ event, step }) => {
        const {
            draftId,
            userId,
            coverLetter: originalText,
            fluffFound,
            jobData,
            companyResearch,
            setupContext,
        } = event.data as PolishEventData;

        const supabase = getSupabase();
        let currentText = originalText;
        let polishImproved = false;
        const polishWarnings: string[] = [];

        console.log(`[Polish] Starting for draft=${draftId} user=${userId.substring(0, 8)}…`);

        // ── Verify draft exists (NonRetriableError if not) ────────────
        const { data: draft, error: draftErr } = await supabase
            .from('documents')
            .select('id')
            .eq('id', draftId)
            .eq('user_id', userId)
            .single();

        if (draftErr || !draft) {
            throw new NonRetriableError(`Draft ${draftId} not found for user — aborting polish`);
        }


        // ── Step 1: Anti-Fluff Re-Gen ────────────────────────────────
        if (fluffFound && process.env.ANTHROPIC_API_KEY) {
            currentText = await step.run('anti-fluff-regen', async () => {
                const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
                const fluffScan = scanForFluff(currentText);

                if (!fluffScan.found) {
                    console.log('[Polish:Fluff] No fluff found on re-scan — skipping');
                    return currentText;
                }

                const fluffFeedback = fluffScan.matches.map(
                    m => `BLACKLIST-TREFFER: "${m.pattern}" — Ersetze durch konkrete, belegbare Aussage.`
                );

                const fixPrompt = `Du bist ein Senior-Karriereberater. Das folgende Anschreiben enthält generische KI-Phrasen.

AKTUELLES ANSCHREIBEN:
---
${currentText}
---

ERKANNTE PROBLEME:
${fluffFeedback.join('\n')}

AUFGABE: Ersetze ALLE markierten Passagen durch konkrete, belegbare Aussagen. Behalte Struktur und Länge bei.
GIB NUR DEN ÜBERARBEITETEN TEXT ZURÜCK! Keine Einleitungen, kein Markdown, keine Kommentare.`;

                try {
                    const message = await anthropic.messages.create({
                        model: 'claude-sonnet-4-5-20250929',
                        max_tokens: 2000,
                        temperature: 0.5,
                        messages: [{ role: 'user', content: fixPrompt }]
                    });

                    const fixedText = message.content[0].type === 'text'
                        ? message.content[0].text.trim()
                        : currentText;

                    const reScan = scanForFluff(fixedText);
                    if (!reScan.found) {
                        console.log('[Polish:Fluff] ✅ Clean after re-gen');
                        polishImproved = true;
                        return fixedText;
                    } else {
                        console.warn(`[Polish:Fluff] ⚠️ ${reScan.matches.length} patterns remain after re-gen`);
                        polishWarnings.push(`Anti-Fluff: ${reScan.matches.length} Muster nach Re-Gen übrig`);
                        polishImproved = true;
                        return fixedText;
                    }
                } catch (err: unknown) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    console.error('[Polish:Fluff] Re-gen failed:', errMsg);
                    polishWarnings.push(`Anti-Fluff Re-Gen fehlgeschlagen: ${errMsg}`);
                    return currentText;
                }
            });
        }

        // ── Step 2+3: Multi-Agent Pipeline (GPT-4o + Perplexity) ─────
        if (currentText.length > 0) {
            currentText = await step.run('multi-agent-pipeline', async () => {
                try {
                    const pipelineResult = await runMultiAgentPipeline(
                        currentText,
                        jobData,
                        companyResearch
                    );

                    if (pipelineResult.pipelineImproved) {
                        polishImproved = true;
                    }
                    if (pipelineResult.pipelineWarnings.length > 0) {
                        polishWarnings.push(...pipelineResult.pipelineWarnings);
                    }

                    return pipelineResult.finalText;
                } catch (pipelineErr: unknown) {
                    const errMsg = pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr);
                    console.error('[Polish:Pipeline] Failed:', errMsg);
                    polishWarnings.push(`Multi-Agent-Pipeline fehlgeschlagen: ${errMsg}`);
                    return currentText;
                }
            });
        }

        // ── Step 4: X-Ray Audit Trail ────────────────────────────────
        let auditTrail: AuditTrailCard[] = [];
        if (process.env.ANTHROPIC_API_KEY) {
            // Build a minimal context if none was provided — ensures audit trail is always attempted
            const effectiveContext: CoverLetterSetupContext = setupContext ?? {
                companyName: jobData?.company_name ?? 'Unbekannt',
                tone: { preset: 'formal' },
                optInModules: {},
            } as CoverLetterSetupContext;

            auditTrail = await step.run('audit-trail', async () => {
                try {
                    const trail = await generateAuditTrail(currentText, effectiveContext);
                    console.log(`[Polish:Audit] ✅ Generated ${trail.length} cards`);
                    return trail;
                } catch (auditErr: unknown) {
                    const errMsg = auditErr instanceof Error ? auditErr.message : String(auditErr);
                    console.warn('[Polish:Audit] Failed:', errMsg);
                    polishWarnings.push(`Audit Trail fehlgeschlagen: ${errMsg}`);
                    return [] as AuditTrailCard[];
                }
            });
        }

        // ── Step 5: JSONB Merge-Update on documents.metadata ─────────
        await step.run('save-polished-draft', async () => {
            // Read current metadata first (JSONB merge, not overwrite)
            const { data: currentDoc } = await supabase
                .from('documents')
                .select('metadata')
                .eq('id', draftId)
                .eq('user_id', userId)
                .single();

            if (!currentDoc) {
                throw new NonRetriableError(`Draft ${draftId} disappeared during polish`);
            }

            const existingMeta = (currentDoc.metadata || {}) as Record<string, unknown>;

            const updatedMeta = {
                ...existingMeta,
                // Only overwrite generated_content if polish actually improved it
                ...(polishImproved ? { generated_content: currentText } : {}),
                polish_status: 'done',
                polish_improved: polishImproved,
                polish_warnings: polishWarnings.length > 0 ? polishWarnings : undefined,
                pipeline_improved: polishImproved,
                pipeline_warnings: polishWarnings.length > 0 ? polishWarnings : undefined,
                ...(auditTrail.length > 0 ? { audit_trail: auditTrail, xray_annotations: auditTrail } : {}),
                polished_at: new Date().toISOString(),
            };

            const { error: updateErr } = await supabase
                .from('documents')
                .update({ metadata: updatedMeta })
                .eq('id', draftId)
                .eq('user_id', userId);

            if (updateErr) {
                throw new Error(`Failed to save polished draft: ${updateErr.message}`);
            }

            console.log(`[Polish] ✅ Draft ${draftId} updated — improved=${polishImproved}, warnings=${polishWarnings.length}`);
        });

        return {
            success: true,
            draftId,
            polishImproved,
            polishWarnings,
            auditTrailCards: auditTrail?.length ?? 0,
        };
    }
);
