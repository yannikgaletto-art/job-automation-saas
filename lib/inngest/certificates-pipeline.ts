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
import { NonRetriableError } from 'inngest';
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

// ─── Provider URL Fallback (Contract §10 extension) ──────────────────────
const PROVIDER_FALLBACK_URLS: Record<string, string> = {
    coursera: 'https://www.coursera.org/search?query=',
    udemy: 'https://www.udemy.com/courses/search/?q=',
    linkedin: 'https://www.linkedin.com/learning/search?keywords=',
    'linkedin learning': 'https://www.linkedin.com/learning/search?keywords=',
    tuv: 'https://www.tuvsud.com/de-de/dienstleistungen/weiterbildung/seminare/',
    'tüv': 'https://www.tuvsud.com/de-de/dienstleistungen/weiterbildung/seminare/',
    'tüv rheinland': 'https://www.tuv.com/de/deutschland/privatkunden/seminare_schulungen_1/weiterbildung_1.html',
    dekra: 'https://www.dekra-akademie.de/de/suche/?q=',
    'dekra akademie': 'https://www.dekra-akademie.de/de/suche/?q=',
    haufe: 'https://www.haufe-akademie.de/weiterbildung/?q=',
    'haufe akademie': 'https://www.haufe-akademie.de/weiterbildung/?q=',
    alfatraining: 'https://www.alfatraining.de/gefoerderte-weiterbildung/',
    ihk: 'https://www.ihk-akademie.de/weiterbildung/',
    dqs: 'https://www.dqs-akademie.de/seminare/',
    bsi: 'https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Qualifizierung/qualifizierung_node.html',
};

function applyUrlFallback(
    rec: CertificateRecommendation,
    keyword: string
): CertificateRecommendation {
    if (rec.urlValid) return rec; // URL ist valid — kein Fallback nötig

    const providerKey = rec.provider.toLowerCase();
    const matchedKey = Object.keys(PROVIDER_FALLBACK_URLS).find(k =>
        providerKey.includes(k)
    );

    if (matchedKey) {
        const fallbackBase = PROVIDER_FALLBACK_URLS[matchedKey];
        const searchUrl = fallbackBase + encodeURIComponent(keyword);
        console.log(`[Certificates] URL fallback: ${rec.provider} → ${searchUrl}`);
        return { ...rec, url: searchUrl, urlValid: true };
    }

    // Kein bekannter Provider — URL bleibt invalid, aber kein Crash
    console.warn(`[Certificates] No fallback URL for provider: ${rec.provider}`);
    return rec;
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
async function searchCertificates(keyword: string, location: string = 'Deutschland'): Promise<string> {
    const query = `${keyword} Zertifizierung ${location} 2025 2026 TÜV DEKRA DQS BSI AlfaTraining AZAV Bildungsgutschein Coursera Udemy LinkedIn Learning online Preis Anmeldung URL`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

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
                        content: 'Du bist ein Experte für berufliche Weiterbildung und Zertifizierungen. Antworte auf Deutsch. Nenne immer konkrete Anbieter, Preise, Dauer und direkte URLs zur Anmeldung. Berücksichtige sowohl lokale Deutsche Anbieter (TÜV, DEKRA, IHK, AlfaTraining) als auch globale Online-Plattformen (Coursera, Udemy, LinkedIn Learning).',
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

Nenne mindestens 4-5 verschiedene Optionen mit unterschiedlichen Anbietern — darunter:
- Lokale/Deutsche Anbieter (TÜV Rheinland, DEKRA, AlfaTraining, Haufe Akademie, IHK)
- Online-Plattformen (Coursera, Udemy, LinkedIn Learning) für flexible, ortsunabhängige Optionen
- AZAV-geförderte Angebote wenn vorhanden`,
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
        retries: 2,
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
                    .select('job_title, description, requirements, metadata, company_name, seniority, location')
                    .eq('id', jobId)
                    .eq('user_id', userId)
                    .single();

                if (jobErr || !job) throw new NonRetriableError(`Job not found: ${jobErr?.message}`);

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

                const jobMetadata = (job.metadata as Record<string, unknown>) || {};

                return {
                    jobTitle: job.job_title || '',
                    jobDescription: job.description || '',
                    company: (job.company_name as string) || '',
                    seniority: (job.seniority as string) || '',
                    location: (job.location as string) || '',
                    steckbrief: job.requirements || {},
                    cvMatchResult: jobMetadata.cv_match || {},
                    cvText,
                };
            });

            // ── Phase 1: Gap-Analyse via Claude Sonnet ───────────────────
            const skillGaps = await step.run('phase-1-gap-analysis', async () => {
                // Extract real gaps from CV Match requirementRows
                const missingReqs = ((inputData.cvMatchResult as any)?.requirementRows || [])
                    .filter((r: any) => r.status === 'missing' || r.status === 'partial')
                    .map((r: any) => r.requirement)
                    .join(', ');

                const prompt = `Analysiere den Lebenslauf und die Stellenanforderungen. Identifiziere die 1-2 wichtigsten Qualifikationslücken, für die eine Zertifizierung sinnvoll wäre.

STELLENTITEL: ${inputData.jobTitle}
UNTERNEHMEN: ${inputData.company || 'nicht angegeben'}
SENIORITY: ${inputData.seniority || 'nicht angegeben'}
STANDORT: ${inputData.location || 'Deutschland'}

STECKBRIEF / ANFORDERUNGEN:
${JSON.stringify(inputData.steckbrief, null, 2)}

BEKANNTE QUALIFIKATIONSLÜCKEN AUS CV MATCH:
${missingReqs || 'Keine CV-Match-Daten vorhanden — aus Anforderungen ableiten'}

CV MATCH ERGEBNIS:
${JSON.stringify(inputData.cvMatchResult, null, 2)}

LEBENSLAUF (Auszug, max 4000 Zeichen):
${inputData.cvText.substring(0, 4000)}

REGELN:
- Identifiziere GENAU 1-2 konkrete Skill-Gaps
- Formuliere jedes als kurzes Keyword (z.B. "Scrum Master", "KI-Management", "ITIL", "AWS Cloud Architect")
- Berücksichtige den deutschen Arbeitsmarkt und die Branche von ${inputData.company || 'dem Unternehmen'}
- Ignoriere Gaps die durch Berufserfahrung abgedeckt werden können

Antworte NUR mit einem JSON-Array von Strings:
["Keyword 1", "Keyword 2"]`;

                let response;
                try {
                    response = await complete({
                        taskType: 'analyze_skill_gaps',
                        prompt,
                        systemPrompt: 'Du bist ein Karriereberater, spezialisiert auf den deutschen Arbeitsmarkt. Antworte ausschließlich mit validem JSON.',
                        temperature: 0.3,
                        maxTokens: 256,
                    });
                } catch (err: any) {
                    if (err?.status === 400 || err?.status === 401 || err?.status === 404) {
                        throw new NonRetriableError(`AI API permanent error (Phase 1): ${err.message}`);
                    }
                    throw err;
                }

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
                // Parallel Perplexity calls — Promise.allSettled ensures one failure doesn't crash the entire phase
                const settled = await Promise.allSettled(
                    skillGaps.map(kw => searchCertificates(kw, inputData.location || 'Deutschland'))
                );
                const results: string[] = settled
                    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && !!r.value)
                    .map(r => r.value);

                if (results.length === 0) {
                    // Fallback: search with job title directly
                    console.warn('[Certificates] Phase 2 fallback — searching with job title');
                    const fallback = await searchCertificates(inputData.jobTitle, inputData.location || 'Deutschland');
                    if (fallback) results.push(fallback);
                }

                return results;
            });

            console.log(`[Certificates] Phase 2 complete — ${rawResearchTexts.length} research texts`);

            // ── Phase 3: Synthese via Claude Haiku ────────────────────────
            const recommendations = await step.run('phase-3-synthesize', async () => {
                // CV Match gaps used in Phase 1 are also needed here — re-extract for Phase 3
                const missingReqsPhase3 = ((inputData.cvMatchResult as any)?.requirementRows || [])
                    .filter((r: any) => r.status === 'missing' || r.status === 'partial')
                    .map((r: any) => r.requirement)
                    .join(', ');

                const prompt = `Basierend auf den folgenden Recherche-Ergebnissen zu Zertifizierungen, erstelle EXAKT 3 strukturierte Empfehlungen.

STELLENTITEL: ${inputData.jobTitle}
UNTERNEHMEN: ${inputData.company || 'nicht angegeben'}
BRANCHE-KONTEXT: ${inputData.seniority ? `${inputData.seniority} Position` : 'Position'} bei ${inputData.company || 'dem Unternehmen'}
STANDORT FÜR AZAV-FÖRDERUNG: ${inputData.location || 'Deutschland'}
SKILL-GAPS: ${skillGaps.join(', ')}
BEKANNTE LÜCKEN AUS CV MATCH: ${missingReqsPhase3 || 'aus Recherche-Ergebnissen ableiten'}

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
    "reasonForMatch": "1 Satz warum das zur Stelle bei ${inputData.company || 'dem Unternehmen'} passt"
  }
]

REGELN:
- EXAKT 3 Empfehlungen — NICHT mehr, NICHT weniger
- providerType-Verteilung: 1x "reputation" (TÜV, SGS, DQS, BSI, DEKRA, IHK), 1x "specialist" (AlfaTraining, Haufe, Linkedin Learning, Coursera), 1x "value" (günstigste/AZAV-Option ODER kostenlose Coursera/Udemy Option)
- reputationScore 3 = TÜV, BSI, DQS, SGS; 2 = DEKRA, Haufe, IHK; 1 = andere
- Falls keine AZAV-Info gefunden: hasAZAV auf false setzen, priceEstimate als "Preis auf Anfrage"
- Falls keine URL gefunden: url auf die Hauptseite des Anbieters setzen
- Deutsche Sprache in allen Textfeldern
- reasonForMatch MUSS auf die spezifischen Anforderungen der Stelle bei ${inputData.company || 'dem Unternehmen'} Bezug nehmen
- Antworte NUR mit dem JSON-Array — KEIN Fließtext`;

                let response;
                try {
                    response = await complete({
                        taskType: 'synthesize_certificates',
                        prompt,
                        systemPrompt: 'Du bist ein strukturierter Daten-Extraktor. Antworte ausschließlich mit dem geforderten JSON-Format. Kein Markdown, kein Fließtext.',
                        temperature: 0,
                        maxTokens: 2048,
                    });
                } catch (err: any) {
                    if (err?.status === 400 || err?.status === 401 || err?.status === 404) {
                        throw new NonRetriableError(`AI API permanent error (Phase 3): ${err.message}`);
                    }
                    throw err;
                }

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
                throw new NonRetriableError('Pipeline produced 0 recommendations after synthesis');
            }

            // ── Link Validation (Contract §10) ──────────────────────────
            const validatedRecs = await step.run('validate-urls', async () => {
                const validated = await validateUrls(recommendations);
                // Apply provider fallback for invalid URLs (§10 extension)
                const primaryKeyword = skillGaps[0] || inputData.jobTitle;
                return validated.map(rec => applyUrlFallback(rec, primaryKeyword));
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
