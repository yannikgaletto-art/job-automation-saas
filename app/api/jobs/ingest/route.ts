export const maxDuration = 60; // Vercel timeout protection — Jina scrape + Mistral extraction can take 20-30s

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import { deepScrapeJob } from '@/lib/services/job-search-pipeline';
import { inngest } from '@/lib/inngest/client';
import { complete } from '@/lib/ai/model-router';
import { getUserLocale, getLanguageName } from '@/lib/i18n/get-user-locale';
import { sanitizeForAI } from '@/lib/services/pii-sanitizer';
import { filterAtsKeywords } from '@/lib/services/ats-keyword-filter';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// AI extraction handled by Model Router (lib/ai/model-router.ts)
// extract_job_fields → MISTRAL_SMALL (EU-native, ~5× cheaper than Haiku)

// Module-level utility — pure function, no closures needed
function normalizeSortDedup(items: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
        const key = item.trim().toLowerCase();
        if (key.length >= 2 && !seen.has(key)) {
            seen.add(key);
            out.push(item.trim());
        }
    }
    return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

const IngestRequestSchema = z.object({
    company: z.string().min(2, 'Company name must be at least 2 characters'),
    jobTitle: z.string().min(2, 'Job title must be at least 2 characters'),
    jobDescription: z.string().min(10, 'Mindestens 10 Zeichen').max(10000, 'Maximal 10.000 Zeichen'),
    companyWebsite: z.string().min(1).optional().or(z.literal('')),
    // URL to the job posting (for Jina deep scrape)
    source_url: z.string().min(1).optional().or(z.literal('')),
    source: z.string().optional(),
    location: z.string().optional(),
});

export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
        // ================================================================
        // STEP 0: Authenticate user via session
        // ================================================================
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        console.log(`[${requestId}] route=jobs/ingest step=start userId=${user?.id ?? 'anon'}`);

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated', requestId },
                { status: 401 }
            );
        }

        const userId = user.id;

        // Rate limit (Upstash Redis — 5 req/min, complements max-5-active guard)
        const rateLimited = await checkUpstashLimit(rateLimiters.jobIngest, userId);
        if (rateLimited) return rateLimited;

        // ================================================================
        // STEP 0.5: Enforce max 5 active jobs per user
        // ================================================================
        const { count: activeJobCount, error: countError } = await supabaseAdmin
            .from('job_queue')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .not('status', 'in', '("archived","rejected","submitted")');

        if (!countError && (activeJobCount ?? 0) >= 5) {
            console.log(`[${requestId}] route=jobs/ingest step=limit_check blocked count=${activeJobCount}`);
            return NextResponse.json(
                { success: false, error: 'Max. 5 aktive Jobs erreicht. Bitte schliesse bestehende Jobs ab oder loesche sie.', requestId },
                { status: 429 }
            );
        }

        // ================================================================
        // STEP 1: Validate input
        // ================================================================
        const body = await request.json();

        let validated;
        try {
            validated = IngestRequestSchema.parse(body);
        } catch (validationError) {
            if (validationError instanceof z.ZodError) {
                return NextResponse.json(
                    { success: false, error: 'Invalid request', details: validationError.errors, requestId },
                    { status: 400 }
                );
            }
            throw validationError;
        }

        const { company, jobTitle, jobDescription, companyWebsite, source_url, source, location: frontendLocation } = validated;
        // Normalize: empty string → undefined
        const normalizedWebsite = companyWebsite && companyWebsite.trim() !== '' ? companyWebsite.trim() : null;
        const normalizedSourceUrl = source_url && source_url.trim() !== '' ? source_url.trim() : null;

        console.log(`[${requestId}] route=jobs/ingest step=validate title="${jobTitle}" company="${company}"`);

        // ================================================================
        // STEP 1.5: Jina deep scrape for richer Steckbrief data
        // deepScrapeJob() uses Jina Reader internally (Firecrawl removed 2026-03-30).
        // Skip for manual_entry — user already supplied the full description
        // and the URL is the company website, not a job posting.
        // ================================================================
        let enrichedDescription = jobDescription;
        const isManualEntry = source === 'manual_entry';

        if (!isManualEntry && normalizedSourceUrl && !normalizedSourceUrl.includes('linkedin.com')) {
            try {
                console.log(`[${requestId}] route=jobs/ingest step=jina_scrape url=${normalizedSourceUrl}`);
                const scraped = await Promise.race([
                    deepScrapeJob(normalizedSourceUrl),
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))
                ]);
                if (scraped && scraped.length >= 200) {
                    enrichedDescription = scraped.slice(0, 8000); // Cap for token limit
                    console.log(`[${requestId}] route=jobs/ingest step=jina_scrape chars=${scraped.length} using_scraped=true`);
                } else {
                    console.log(`[${requestId}] route=jobs/ingest step=jina_scrape fallback=short_text`);
                }
            } catch (err) {
                console.warn(`[${requestId}] route=jobs/ingest step=jina_scrape error fallback=original_description`);
            }
        } else if (isManualEntry) {
            console.log(`[${requestId}] route=jobs/ingest step=jina_scrape skipped=manual_entry desc_len=${jobDescription.length}`);
        }

        // ================================================================
        // STEP 1.8: Fetch user locale (single call, reused for prompt + Inngest)
        // ================================================================
        const locale = await getUserLocale(userId);
        const languageName = getLanguageName(locale);
        console.log(`[${requestId}] route=jobs/ingest step=locale locale=${locale}`);

        // ================================================================
        // STEP 1.9: Description-Level Extraction Cache (Persistent)
        // Before calling Mistral, check job_extraction_cache for a prior
        // extraction of this exact description (by SHA-256 hash).
        // This table survives job deletes — unlike the old job_queue scan.
        // Guarantees: delete + re-add = identical buzzwords + requirements.
        // ================================================================
        const descriptionHash = crypto
            .createHash('sha256')
            .update(enrichedDescription.trim().toLowerCase().replace(/\s+/g, ' '))
            .digest('hex')
            .slice(0, 32);

        let cachedExtraction: {
            buzzwords: string[];
            summary: string | null;
            qualifications: string[];
            responsibilities: string[];
            benefits: string[];
            seniority: string;
            location: string | null;
        } | null = null;

        try {
            // Single-row lookup via unique index (user_id, description_hash, locale).
            // Locale is part of the key — the same job in different locales caches separately
            // because ATS keywords are language-aware (CV-Match consistency).
            const { data: cached, error: cacheErr } = await supabaseAdmin
                .from('job_extraction_cache')
                .select('buzzwords, requirements, responsibilities, benefits, summary, seniority, location')
                .eq('user_id', userId)
                .eq('description_hash', descriptionHash)
                .eq('locale', locale)
                .maybeSingle();

            if (!cacheErr && cached && Array.isArray(cached.buzzwords) && cached.buzzwords.length > 0) {
                // ATS-Filter applied to legacy cache entries — old caches may contain
                // pre-hardening garbage (Bürozeit, Teamfähigkeit, etc.).
                const cacheFilter = filterAtsKeywords(cached.buzzwords as string[]);
                cachedExtraction = {
                    buzzwords: cacheFilter.kept,
                    summary: cached.summary || null,
                    qualifications: Array.isArray(cached.requirements) ? cached.requirements : [],
                    responsibilities: Array.isArray(cached.responsibilities) ? cached.responsibilities : [],
                    benefits: Array.isArray(cached.benefits) ? cached.benefits : [],
                    seniority: cached.seniority || 'unknown',
                    location: cached.location || null,
                };
                console.log(`[${requestId}] route=jobs/ingest step=extraction_cache HIT — reusing ${cacheFilter.kept.length}/${cached.buzzwords.length} buzzwords after filter (hash: ${descriptionHash.slice(0, 8)}…)`);
                if (cacheFilter.removed.length > 0) {
                    console.log(`[${requestId}] route=jobs/ingest step=cache_filter removed=${cacheFilter.removed.length}: ${cacheFilter.removed.slice(0, 5).join(', ')}`);
                }
            }
        } catch (cacheErr: any) {
            // Non-blocking — cache failure falls through to LLM extraction
            console.warn(`[${requestId}] route=jobs/ingest step=extraction_cache error (non-blocking): ${cacheErr?.message}`);
        }

        // ================================================================
        // STEP 2: Extract requirements with LLM (with timeout)
        // Skipped if description_cache HIT — reuse prior extraction instead.
        // ================================================================
        let extractedData: any = cachedExtraction ?? {};

        if (cachedExtraction) {
            console.log(`[${requestId}] route=jobs/ingest step=ai_parse_requirements SKIPPED — using cached extraction`);
        } else {
        try {
            console.log(`[${requestId}] route=jobs/ingest step=ai_parse_requirements`);

            // STEP 2 runs with Mistral (extract_job_fields → MISTRAL_SMALL via model-router).
            // Guard checks MISTRAL_API_KEY. If missing, we still attempt extraction.
            // complete() will throw, aiError catch below falls through to empty extraction.
            // Inngest extract-job-pipeline (STEP 4.5 trigger) will fill the gap in the background.
            if (process.env.MISTRAL_API_KEY || process.env.ANTHROPIC_API_KEY) {
                const extractionSchema = {
                    company: "string — company name",
                    jobTitle: "string — exact job title",
                    location: "string | null — location/Remote/Hybrid if identifiable",
                    company_website: "string | null — URL of the company website (e.g. https://company.com), NOT the careers page or job posting",
                    summary: `string — 2-3 sentence summary of the role in ${languageName}`,
                    responsibilities: `string[] — responsibilities as bullet points (max 8), in ${languageName}`,
                    qualifications: `string[] — qualifications (max 8), in ${languageName}`,
                    benefits: `string[] — TOP 6 most important benefits, max 3 words each (e.g. "30 Tage Urlaub", "Remote Work", "Betriebliche Altersvorsorge"). No full sentences. No copy-paste.`,
                    seniority: "'junior' | 'mid' | 'senior' | 'lead' | 'unknown'",
                    buzzwords: `string[] — ATS keywords: MAXIMUM 15. ONLY include: software tools, frameworks, platforms, technical standards, certifications, and specific domain/methodology terms that an ATS robot would scan for.
  ✅ INCLUDE: Python, Salesforce, SAP, Jira, ISO 26262, SCRUM, OKR, MEDDPICC, Machine Learning, M&A, Kartellrecht, IFRS, Power BI, ROI, ARR
  ❌ EXCLUDE: generic verbs ("Implementierung", "Schulungen", "Analyse"), language names ("Deutsch", "Englisch", "Fließend"), company/product names that are the job focus ("Odoo"-role = not a keyword), adjectives ("Agile"), soft skills ("Kommunikation"), job titles ("Business Consultant")
  Quality over quantity. 8–12 high-signal keywords is better than 20 weak ones.

  LANGUAGE RULE (CRITICAL for CV-Match consistency):
  TARGET LANGUAGE: ${languageName}
  Translate language-dependent terms ALWAYS into the target language:
    "Project Management" (en) ↔ "Projektmanagement" (de) ↔ "Gestión de Proyectos" (es)
    "Stakeholder Management" (en) ↔ "Stakeholder-Management" (de)
    "Accounting" (en) ↔ "Buchhaltung" (de) ↔ "Contabilidad" (es)
  EIGENNAMEN stay in original (never translate):
    Tools/Brands (Salesforce, SAP, Python, DATEV), frameworks (Scrum, OKR, ITIL),
    certifications (PMP, AWS Solutions Architect, Bilanzbuchhalter IHK),
    standards (ISO 9001, ISO 27001, ISO 26262, PCI DSS).
  EXCEPTION — language variants of the same regulation translate normally:
    GDPR (en) ↔ DSGVO (de) ↔ RGPD (es).
  This rule applies even if the job posting is in a different language than ${languageName}.`
                };

                const response = await complete({
                    taskType: 'extract_job_fields',
                    systemPrompt: `Extract the following information from the job description as JSON. All text fields (summary, responsibilities, qualifications, benefits) MUST be written in ${languageName}. If a field is not identifiable, use null or empty array. Return ONLY valid JSON, no markdown.

IMPORTANT for lists (responsibilities, qualifications):
- Write condensed, complete sentences — approximately 20% shorter than the original.
- Preserve the core message of each point. No abbreviating to mere keywords.
- NO copy-paste of the original, but an informed condensation.

IMPORTANT for benefits:
- Extract ONLY the 6 most standout benefits, max 3 words each.
- Example GOOD: ["30 Tage Urlaub", "Remote Work"] — Example BAD: ["Flexibles Arbeiten: Wir arbeiten in einem ausgewogenen hybriden Mix..."]

Schema: ${JSON.stringify(extractionSchema)}`,
                    prompt: sanitizeForAI(enrichedDescription).sanitized,
                    temperature: 0,
                    maxTokens: 2000,
                });

                const text = response.text.trim();
                try {
                    extractedData = JSON.parse(text);
                } catch (parseError) {
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            extractedData = JSON.parse(jsonMatch[0]);
                        } catch (e) {
                            console.warn(`[${requestId}] route=jobs/ingest step=ai_parse JSON fallback parse failed`);
                        }
                    } else {
                        console.warn(`[${requestId}] route=jobs/ingest step=ai_parse JSON parse failed, text=${text.substring(0, 50)}...`);
                    }
                }
                console.log(`[${requestId}] route=jobs/ingest step=ai_parse model=${response.model} cost_cents=${response.costCents}`);
            } else {
                console.warn(`[${requestId}] route=jobs/ingest step=ai_parse no_api_key skipped`);
            }
        } catch (aiError: any) {
            console.warn(`[${requestId}] route=jobs/ingest step=ai_parse error=${aiError.message}`);
            // Proceed with empty extraction rather than failing the ingest
        }
        } // end if (!cachedExtraction)

        // ================================================================
        // STEP 3: Check if user_profiles row exists (required FK)
        // ================================================================
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('id')
            .eq('id', userId)
            .single();

        if (!profile) {
            await supabaseAdmin.from('user_profiles').insert({
                id: userId,
                pii_encrypted: {},
                onboarding_completed: false,
            });
            console.log(`[${requestId}] route=jobs/ingest step=ensure_profile created`);
        }

        // ================================================================
        // STEP 3.5: Normalize buzzwords + requirements (determinism guarantee)
        // Sort + dedup ensures identical descriptions produce identical keyword lists.
        // Then ATS-Filter strips garbage (Bürozeit, Teamfähigkeit, ...) and rewrites
        // German compounds (Projektleitungserfahrung → Projektleitung).
        // ================================================================
        if (Array.isArray(extractedData.buzzwords) && extractedData.buzzwords.length > 0) {
            const normalized = normalizeSortDedup(extractedData.buzzwords);
            const atsFilter = filterAtsKeywords(normalized);
            extractedData.buzzwords = atsFilter.kept;
            console.log(`[${requestId}] route=jobs/ingest step=normalize_buzzwords count=${atsFilter.kept.length} (filtered ${atsFilter.removed.length}/${normalized.length})`);
            if (atsFilter.removed.length > 0) {
                console.log(`[${requestId}] route=jobs/ingest step=ats_filter removed=${atsFilter.removed.slice(0, 5).join(', ')}${atsFilter.removed.length > 5 ? '...' : ''}`);
            }
            if (atsFilter.rewritten && atsFilter.rewritten.length > 0) {
                console.log(`[${requestId}] route=jobs/ingest step=ats_filter rewrote=${atsFilter.rewritten.slice(0, 3).map(r => `${r.from}→${r.to}`).join(', ')}`);
            }
        }
        if (Array.isArray(extractedData.qualifications) && extractedData.qualifications.length > 0) {
            extractedData.qualifications = normalizeSortDedup(extractedData.qualifications);
            console.log(`[${requestId}] route=jobs/ingest step=normalize_requirements count=${extractedData.qualifications.length}`);
        }

        // ================================================================
        // STEP 4: Insert job into queue
        // ================================================================
        console.log(`[${requestId}] route=jobs/ingest step=db_insert_job`);

        const jobUrl = normalizedSourceUrl || `manual:${crypto.randomUUID()}`;

        const { data: job, error: insertError } = await supabaseAdmin
            .from('job_queue')
            .insert({
                user_id: userId,
                job_url: jobUrl,
                source_url: normalizedSourceUrl || null,
                job_title: jobTitle,
                company_name: company,
                company_website: normalizedWebsite || extractedData.company_website || null,
                description: enrichedDescription,
                location: extractedData.location || frontendLocation || null,
                requirements: extractedData.qualifications?.length > 0 ? extractedData.qualifications : null,
                responsibilities: extractedData.responsibilities?.length > 0 ? extractedData.responsibilities : null,
                summary: extractedData.summary || null,
                seniority: extractedData.seniority || 'unknown',
                benefits: extractedData.benefits || [],
                buzzwords: extractedData.buzzwords || null,
                platform: 'unknown',
                snapshot_at: new Date().toISOString(),
                status: 'pending',
                user_profile_id: userId,
            })
            .select('id, job_title, company_name, location, platform, status, created_at')
            .single();

        if (insertError) {
            // Graceful duplicate handling: Postgres unique constraint violation (23505)
            // from idx_jobqueue_user_url(user_id, source_url)
            if (insertError.code === '23505') {
                console.log(`[${requestId}] route=jobs/ingest step=db_insert_job duplicate=true source_url=${normalizedSourceUrl}`);
                return NextResponse.json(
                    { success: true, duplicate: true, requestId },
                    { status: 200 }
                );
            }
            console.error(`[${requestId}] route=jobs/ingest step=db_insert_job supabase_error=${insertError.message} code=${insertError.code} details=${JSON.stringify(insertError.details)} hint=${insertError.hint}`);
            return NextResponse.json(
                { success: false, error: 'Database error', details: insertError.message, code: insertError.code, hint: insertError.hint, requestId },
                { status: 500 }
            );
        }

        console.log(`[${requestId}] route=jobs/ingest step=complete duration_ms=${Date.now() - startTime} job_id=${job.id}`);

        // §ANALYTICS: Track job added (PostHog)
        try {
            const { captureServerEvent } = await import('@/lib/posthog/server');
            captureServerEvent(userId, 'job_added_to_queue', {
                jobId: job.id,
                source: source || 'unknown',
                hasSourceUrl: !!normalizedSourceUrl,
                cacheHit: !!cachedExtraction,
            });
        } catch { /* non-blocking */ }

        // ================================================================
        // STEP 4.5: Trigger strong extraction pipeline (Lazy Extraction)
        // Non-blocking: Mistral data is already saved as fallback.
        // OPTIMIZATION: Set sync_extracted_at flag BEFORE triggering Inngest
        // so the background job can reliably skip its redundant LLM call.
        // ================================================================
        try {
            // Only set the flag if we actually ran sync extraction successfully
            const hasSyncData = extractedData && Object.keys(extractedData).length > 0 && (extractedData.summary || cachedExtraction);
            if (hasSyncData) {
                // JSONB Read-Modify-Write: read current metadata first to avoid wiping other fields
                const { data: currentJobMeta } = await supabaseAdmin
                    .from('job_queue')
                    .select('metadata')
                    .eq('id', job.id)
                    .eq('user_id', userId)
                    .single();
                const existingMeta = (currentJobMeta?.metadata as Record<string, unknown>) || {};

                await supabaseAdmin
                    .from('job_queue')
                    .update({
                        metadata: {
                            ...existingMeta,
                            sync_extracted_at: new Date().toISOString(),
                            description_hash: descriptionHash,
                            description_cache_hit: !!cachedExtraction,
                        },
                    })
                    .eq('id', job.id)
                    .eq('user_id', userId);
                console.log(`[${requestId}] route=jobs/ingest step=set_sync_flag job_id=${job.id} description_hash=${descriptionHash.slice(0, 8)}… cache_hit=${!!cachedExtraction}`);
            }

            // ================================================================
            // STEP 4.6: Persist extraction to job_extraction_cache
            // Ensures buzzwords + requirements survive job deletes.
            // Only writes on MISS (when Mistral ran). Cache HITs skip this.
            // Uses upsert: if hash already exists (shouldn't happen on MISS),
            // update the existing row defensively.
            // ================================================================
            if (!cachedExtraction && Array.isArray(extractedData.buzzwords) && extractedData.buzzwords.length > 0) {
                try {
                    await supabaseAdmin
                        .from('job_extraction_cache')
                        .upsert({
                            user_id: userId,
                            description_hash: descriptionHash,
                            locale,
                            buzzwords: extractedData.buzzwords || [],
                            requirements: extractedData.qualifications || [],
                            responsibilities: extractedData.responsibilities || [],
                            benefits: extractedData.benefits || [],
                            summary: extractedData.summary || null,
                            seniority: extractedData.seniority || 'unknown',
                            location: extractedData.location || null,
                            updated_at: new Date().toISOString(),
                        }, {
                            onConflict: 'user_id,description_hash,locale',
                        });
                    console.log(`[${requestId}] route=jobs/ingest step=extraction_cache_write hash=${descriptionHash.slice(0, 8)}… locale=${locale} buzzwords=${extractedData.buzzwords.length}`);
                } catch (cacheWriteErr: any) {
                    // Non-blocking — extraction already saved to job_queue row
                    console.warn(`[${requestId}] route=jobs/ingest step=extraction_cache_write error (non-blocking): ${cacheWriteErr?.message}`);
                }
            }

            await inngest.send({
                name: 'job/extract',
                data: { jobId: job.id, userId, locale },
            });
            console.log(`[${requestId}] route=jobs/ingest step=trigger_extract job_id=${job.id}`);
        } catch (triggerErr) {
            console.warn(`[${requestId}] route=jobs/ingest step=trigger_extract error — manual re-extract possible`);
        }

        // ================================================================
        // STEP 5: Return success
        // ================================================================
        return NextResponse.json(
            {
                success: true,
                job: {
                    id: job.id,
                    title: job.job_title,
                    company_name: job.company_name,
                },
                requestId
            },
            { status: 201 }
        );
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] route=jobs/ingest step=unhandled_error error=${errMsg}`);
        return NextResponse.json(
            { success: false, error: errMsg, requestId },
            { status: 500 }
        );
    }
}
