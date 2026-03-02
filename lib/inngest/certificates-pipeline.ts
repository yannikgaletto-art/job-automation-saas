/**
 * Inngest Function: certificates/generate
 * 3-Phase Pipeline für Weiterbildungs- und Zertifikatsempfehlungen
 *
 * Phase 1: Gap-Analyse via Claude Sonnet (model-router: analyze_skill_gaps)
 * Phase 2: Live-Recherche via Perplexity Sonar Pro
 * Phase 3: Synthese & Scoring via Claude Haiku (model-router: synthesize_certificates)
 *
 * Contract References:
 * - §3: user_id scoped queries
 * - §10: HEAD-check on all URLs
 */

import { inngest } from './client';
import { createClient } from '@supabase/supabase-js';
import { complete } from '@/lib/ai/model-router';
import type { CertificateRecommendation } from '@/types/certificates';

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// ─── URL Validation (Contract §10) ──────────────────────────────────────
async function validateUrl(url: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow',
        });
        clearTimeout(timeoutId);
        return res.ok;
    } catch {
        return false;
    }
}

async function validateUrls(recommendations: CertificateRecommendation[]): Promise<CertificateRecommendation[]> {
    const results = await Promise.allSettled(
        recommendations.map(async (rec) => {
            const urlValid = await validateUrl(rec.url);
            return { ...rec, urlValid };
        })
    );

    return results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return { ...recommendations[i], urlValid: false };
    });
}

// ─── Perplexity API Call ─────────────────────────────────────────────────
async function searchCertificates(keyword: string): Promise<string> {
    const query = `${keyword} Zertifizierung Deutschland 2025 2026 TÜV DEKRA DQS BSI AlfaTraining AZAV Bildungsgutschein Preis Anmeldung URL`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'sonar-pro',
                messages: [
                    {
                        role: 'system',
                        content: 'Du bist ein Experte für berufliche Weiterbildung und Zertifizierungen in Deutschland. Antworte auf Deutsch. Nenne immer konkrete Anbieter, Preise, Dauer und direkte URLs zur Anmeldung.',
                    },
                    {
                        role: 'user',
                        content: `Finde die besten Zertifizierungen für "${keyword}" in Deutschland.
                        
Ich brauche für JEDEN gefundenen Anbieter:
- Vollständiger Name der Zertifizierung
- Anbieter (z.B. TÜV Rheinland, DEKRA, AlfaTraining, Haufe Akademie)
- Ob AZAV-Förderung (Bildungsgutschein) möglich ist
- Geschätzter Preis (z.B. "ab 890 €" oder "kostenlos mit Bildungsgutschein")
- Dauer (z.B. "2 Tage Präsenz" oder "4 Wochen online")
- Direkte URL zur Kurs-/Anmeldeseite
- Reputation des Anbieters

Nenne mindestens 4-5 verschiedene Optionen mit unterschiedlichen Anbietern.`,
                    },
                ],
                temperature: 0,
                return_citations: true,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`Perplexity API error: ${response.status}`);
            return '';
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || '';
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Perplexity search error:', error);
        return '';
    }
}

// ─── Main Pipeline ───────────────────────────────────────────────────────
export const generateCertificates = inngest.createFunction(
    {
        id: 'generate-certificates',
        name: 'Generate Certificate Recommendations',
        rateLimit: {
            key: 'event.data.userId',
            limit: 5,
            period: '1h',
        },
    },
    { event: 'certificates/generate' },
    async ({ event, step }) => {
        const { jobId, userId } = event.data as { jobId: string; userId: string };
        const supabase = getSupabase();

        console.log(`[Certificates] Starting pipeline for job=${jobId} user=${userId}`);

        // ── Update status to processing ──────────────────────────────────
        await supabase
            .from('job_certificates')
            .update({ status: 'processing', updated_at: new Date().toISOString() })
            .eq('job_id', jobId)
            .eq('user_id', userId);

        try {
            // ── Fetch input data ─────────────────────────────────────────
            const inputData = await step.run('fetch-input-data', async () => {
                // Get job data (Contract §3: user_id scoped)
                const { data: job, error: jobErr } = await supabase
                    .from('job_queue')
                    .select('job_title, job_description, steckbrief, cv_match_result')
                    .eq('id', jobId)
                    .eq('user_id', userId)
                    .single();

                if (jobErr || !job) throw new Error(`Job not found: ${jobErr?.message}`);

                // Get CV text
                const { data: cvDoc } = await supabase
                    .from('documents')
                    .select('metadata')
                    .eq('user_id', userId)
                    .eq('document_type', 'cv')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                const cvText = cvDoc?.metadata?.extracted_text || cvDoc?.metadata?.raw_text || '';

                return {
                    jobTitle: job.job_title || '',
                    jobDescription: job.job_description || '',
                    steckbrief: job.steckbrief || {},
                    cvMatchResult: job.cv_match_result || {},
                    cvText,
                };
            });

            // ── Phase 1: Gap-Analyse via Claude Sonnet ───────────────────
            const skillGaps = await step.run('phase-1-gap-analysis', async () => {
                const prompt = `Analysiere den Lebenslauf und die Stellenanforderungen. Identifiziere die 1-2 wichtigsten Qualifikationslücken, für die eine Zertifizierung sinnvoll wäre.

STELLENTITEL: ${inputData.jobTitle}

STECKBRIEF / ANFORDERUNGEN:
${JSON.stringify(inputData.steckbrief, null, 2)}

CV MATCH ERGEBNIS:
${JSON.stringify(inputData.cvMatchResult, null, 2)}

LEBENSLAUF (Auszug, max 2000 Zeichen):
${inputData.cvText.substring(0, 2000)}

REGELN:
- Identifiziere GENAU 1-2 konkrete Skill-Gaps
- Formuliere jedes als kurzes Keyword (z.B. "Scrum Master", "KI-Management", "ITIL", "AWS Cloud Architect")
- Berücksichtige den deutschen Arbeitsmarkt
- Ignoriere Gaps die durch Berufserfahrung abgedeckt werden können

Antworte NUR mit einem JSON-Array von Strings:
["Keyword 1", "Keyword 2"]`;

                const response = await complete({
                    taskType: 'analyze_skill_gaps',
                    prompt,
                    systemPrompt: 'Du bist ein Karriereberater, spezialisiert auf den deutschen Arbeitsmarkt. Antworte ausschließlich mit validem JSON.',
                    temperature: 0.3,
                    maxTokens: 256,
                });

                try {
                    const parsed = JSON.parse(response.text.trim());
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed.slice(0, 2) as string[];
                    }
                } catch {
                    // Try to extract array from text
                    const match = response.text.match(/\[([^\]]+)\]/);
                    if (match) {
                        try {
                            return JSON.parse(`[${match[1]}]`).slice(0, 2) as string[];
                        } catch { /* fall through */ }
                    }
                }

                // Fallback: use job title as keyword
                console.warn('[Certificates] Phase 1 fallback — using job title as keyword');
                return [inputData.jobTitle];
            });

            console.log(`[Certificates] Phase 1 complete — gaps: ${skillGaps.join(', ')}`);

            // ── Phase 2: Live-Recherche via Perplexity ───────────────────
            const rawResearchTexts = await step.run('phase-2-perplexity-research', async () => {
                const results: string[] = [];
                for (const keyword of skillGaps) {
                    const text = await searchCertificates(keyword);
                    if (text) results.push(text);
                }

                if (results.length === 0) {
                    // Fallback: search with job title directly
                    console.warn('[Certificates] Phase 2 fallback — searching with job title');
                    const fallback = await searchCertificates(inputData.jobTitle);
                    if (fallback) results.push(fallback);
                }

                return results;
            });

            console.log(`[Certificates] Phase 2 complete — ${rawResearchTexts.length} research texts`);

            // ── Phase 3: Synthese via Claude Haiku ────────────────────────
            const recommendations = await step.run('phase-3-synthesize', async () => {
                const prompt = `Basierend auf den folgenden Recherche-Ergebnissen zu Zertifizierungen, erstelle EXAKT 3 strukturierte Empfehlungen.

STELLENTITEL: ${inputData.jobTitle}
SKILL-GAPS: ${skillGaps.join(', ')}

RECHERCHE-ERGEBNISSE:
${rawResearchTexts.join('\n\n---\n\n')}

AUSGABE-FORMAT (JSON-Array mit EXAKT 3 Objekten):
[
  {
    "id": "slug-ohne-sonderzeichen",
    "title": "Vollständiger Zertifikatsname",
    "provider": "Anbieter-Name",
    "providerType": "reputation" | "specialist" | "value",
    "hasAZAV": true/false,
    "priceEstimate": "z.B. ab 890 € oder kostenlos mit Bildungsgutschein",
    "durationEstimate": "z.B. 2 Tage oder 4 Wochen online",
    "reputationScore": 1|2|3,
    "url": "https://direkt-link-zur-kursseite",
    "urlValid": false,
    "reasonForMatch": "1 Satz warum das zur Stelle passt"
  }
]

REGELN:
- EXAKT 3 Empfehlungen — NICHT mehr, NICHT weniger
- providerType-Verteilung: 1x "reputation" (TÜV, SGS, DQS, BSI, DEKRA), 1x "specialist" (AlfaTraining, Haufe, etc.), 1x "value" (günstigste/AZAV-Option)
- reputationScore 3 = TÜV, BSI, DQS, SGS; 2 = DEKRA, Haufe, IHK; 1 = andere
- Falls keine AZAV-Info gefunden: hasAZAV auf false setzen, priceEstimate als "Preis auf Anfrage"
- Falls keine URL gefunden: url auf die Hauptseite des Anbieters setzen
- Deutsche Sprache in allen Textfeldern
- Antworte NUR mit dem JSON-Array — KEIN Fließtext`;

                const response = await complete({
                    taskType: 'synthesize_certificates',
                    prompt,
                    systemPrompt: 'Du bist ein strukturierter Daten-Extraktor. Antworte ausschließlich mit dem geforderten JSON-Format. Kein Markdown, kein Fließtext.',
                    temperature: 0,
                    maxTokens: 2048,
                });

                try {
                    let text = response.text.trim();
                    // Strip markdown code fences if present
                    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
                    if (jsonMatch) text = jsonMatch[1].trim();

                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                        return parsed.slice(0, 3) as CertificateRecommendation[];
                    }
                } catch (e) {
                    console.error('[Certificates] Phase 3 JSON parse error:', e);
                }

                return [] as CertificateRecommendation[];
            });

            console.log(`[Certificates] Phase 3 complete — ${recommendations.length} recommendations`);

            if (recommendations.length === 0) {
                throw new Error('Pipeline produced 0 recommendations');
            }

            // ── Link Validation (Contract §10) ──────────────────────────
            const validatedRecs = await step.run('validate-urls', async () => {
                return validateUrls(recommendations);
            });

            const validCount = validatedRecs.filter(r => r.urlValid).length;
            console.log(`[Certificates] URL validation: ${validCount}/${validatedRecs.length} valid`);

            // ── Generate summary text ────────────────────────────────────
            const summaryText = `Aufgrund deiner Qualifikation und der Anforderungen der Stelle "${inputData.jobTitle}" empfehlen wir dir folgende Weiterbildungen, um dein Profil gezielt zu stärken.`;

            // ── Write results to DB ──────────────────────────────────────
            await step.run('save-results', async () => {
                const { error } = await supabase
                    .from('job_certificates')
                    .update({
                        status: 'done',
                        recommendations: validatedRecs,
                        summary_text: summaryText,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('job_id', jobId)
                    .eq('user_id', userId);

                if (error) throw new Error(`DB update failed: ${error.message}`);
            });

            console.log(`[Certificates] ✅ Pipeline complete for job=${jobId}`);
            return { success: true, recommendations: validatedRecs.length };

        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[Certificates] ❌ Pipeline failed for job=${jobId}:`, errMsg);

            // Set status to failed with error in summary_text
            await supabase
                .from('job_certificates')
                .update({
                    status: 'failed',
                    summary_text: `Fehler bei der Generierung: ${errMsg}`,
                    updated_at: new Date().toISOString(),
                })
                .eq('job_id', jobId)
                .eq('user_id', userId);

            throw error;
        }
    }
);
