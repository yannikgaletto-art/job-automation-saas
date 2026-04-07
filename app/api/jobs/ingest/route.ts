export const maxDuration = 60; // Vercel timeout protection — Firecrawl + Haiku can take 20-30s

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import { deepScrapeJob } from '@/lib/services/job-search-pipeline';
import { inngest } from '@/lib/inngest/client';
import { complete } from '@/lib/ai/model-router';
import { getUserLocale, getLanguageName } from '@/lib/i18n/get-user-locale';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// AI extraction handled by Model Router (lib/ai/model-router.ts)

const IngestRequestSchema = z.object({
    company: z.string().min(2, 'Company name must be at least 2 characters'),
    jobTitle: z.string().min(2, 'Job title must be at least 2 characters'),
    jobDescription: z.string().min(10, 'Mindestens 10 Zeichen').max(10000, 'Maximal 10.000 Zeichen'),
    companyWebsite: z.string().min(1).optional().or(z.literal('')),
    // URL to the job posting (for Firecrawl deep scrape)
    // Relaxed from z.string().url() — SerpAPI share_links contain fragments/special chars that fail strict URL validation
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

        // ================================================================
        // STEP 0.5: Enforce max 5 active jobs per user
        // ================================================================
        const { count: activeJobCount, error: countError } = await supabaseAdmin
            .from('job_queue')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('status', ['pending', 'ready_for_review', 'ready_to_apply']);

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
        // STEP 1.5: Firecrawl deep scrape for richer Steckbrief data
        // Skip for manual_entry — user already supplied the full description
        // and the URL is the company website, not a job posting.
        // ================================================================
        let enrichedDescription = jobDescription;
        const isManualEntry = source === 'manual_entry';

        if (!isManualEntry && normalizedSourceUrl && !normalizedSourceUrl.includes('linkedin.com')) {
            try {
                console.log(`[${requestId}] route=jobs/ingest step=firecrawl_scrape url=${normalizedSourceUrl}`);
                const scraped = await Promise.race([
                    deepScrapeJob(normalizedSourceUrl),
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))
                ]);
                if (scraped && scraped.length >= 200) {
                    enrichedDescription = scraped.slice(0, 8000); // Cap for Haiku token limit
                    console.log(`[${requestId}] route=jobs/ingest step=firecrawl_scrape chars=${scraped.length} using_scraped=true`);
                } else {
                    console.log(`[${requestId}] route=jobs/ingest step=firecrawl_scrape fallback=short_text`);
                }
            } catch (err) {
                console.warn(`[${requestId}] route=jobs/ingest step=firecrawl_scrape error fallback=original_description`);
            }
        } else if (isManualEntry) {
            console.log(`[${requestId}] route=jobs/ingest step=firecrawl_scrape skipped=manual_entry desc_len=${jobDescription.length}`);
        }

        // ================================================================
        // STEP 1.8: Fetch user locale (single call, reused for prompt + Inngest)
        // ================================================================
        const locale = await getUserLocale(userId);
        const languageName = getLanguageName(locale);
        console.log(`[${requestId}] route=jobs/ingest step=locale locale=${locale}`);

        // ================================================================
        // STEP 1.9: Description-Level Extraction Cache
        // Before calling Mistral, check if we've already extracted fields
        // from this exact job description text (by SHA-256 hash).
        // This guarantees deterministic buzzwords across repeated ingests
        // of the same posting — even after the user deletes and re-adds a job.
        // ================================================================
        const descriptionHash = crypto
            .createHash('sha256')
            .update(enrichedDescription.trim().toLowerCase())
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
            // Scan user's recent jobs for a prior extraction of identical content.
            // Max ~50 jobs per user → no index required, O(50) is fine.
            const { data: priorJobs } = await supabaseAdmin
                .from('job_queue')
                .select('buzzwords, summary, requirements, responsibilities, benefits, seniority, location, metadata')
                .eq('user_id', userId)
                .not('buzzwords', 'is', null)
                .order('created_at', { ascending: false })
                .limit(50);

            if (priorJobs) {
                const matchingJob = priorJobs.find((j: any) => {
                    const meta = (j.metadata || {}) as Record<string, unknown>;
                    return meta.description_hash === descriptionHash && Array.isArray(j.buzzwords) && j.buzzwords.length > 0;
                });

                if (matchingJob) {
                    cachedExtraction = {
                        buzzwords: matchingJob.buzzwords,
                        summary: matchingJob.summary || null,
                        qualifications: Array.isArray(matchingJob.requirements) ? matchingJob.requirements : [],
                        responsibilities: Array.isArray(matchingJob.responsibilities) ? matchingJob.responsibilities : [],
                        benefits: Array.isArray(matchingJob.benefits) ? matchingJob.benefits : [],
                        seniority: matchingJob.seniority || 'unknown',
                        location: matchingJob.location || null,
                    };
                    console.log(`[${requestId}] route=jobs/ingest step=description_cache HIT — reusing ${matchingJob.buzzwords.length} buzzwords (hash: ${descriptionHash.slice(0, 8)}…)`);
                }
            }
        } catch (cacheErr: any) {
            // Non-blocking — cache failure falls through to LLM extraction
            console.warn(`[${requestId}] route=jobs/ingest step=description_cache error (non-blocking): ${cacheErr?.message}`);
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

            if (process.env.ANTHROPIC_API_KEY) {
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
  Quality over quantity. 8–12 high-signal keywords is better than 20 weak ones.`
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
                    prompt: enrichedDescription,
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
        // STEP 3.5: Normalize buzzwords (determinism guarantee)
        // Sort + dedup ensures identical descriptions produce identical keyword lists.
        // Without this, Claude's non-deterministic token order causes hash drift.
        // ================================================================
        if (Array.isArray(extractedData.buzzwords) && extractedData.buzzwords.length > 0) {
            const raw: string[] = extractedData.buzzwords;
            const seen = new Set<string>();
            const normalized: string[] = [];
            for (const kw of raw) {
                const key = kw.trim().toLowerCase();
                if (key.length >= 2 && !seen.has(key)) {
                    seen.add(key);
                    normalized.push(kw.trim()); // preserve original casing
                }
            }
            extractedData.buzzwords = normalized.sort((a, b) =>
                a.toLowerCase().localeCompare(b.toLowerCase())
            );
            console.log(`[${requestId}] route=jobs/ingest step=normalize_buzzwords count=${extractedData.buzzwords.length}`);
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

        // ================================================================
        // STEP 4.5: Trigger strong extraction pipeline (Lazy Extraction)
        // Non-blocking: Haiku data is already saved as fallback
        // OPTIMIZATION: Set sync_extracted_at flag BEFORE triggering Inngest
        // so the background job can reliably skip its redundant LLM call.
        // ================================================================
        try {
            // Only set the flag if we actually ran sync extraction successfully
            // Also store description_hash so STEP 1.9 can find this job in future ingests
            const hasSyncData = extractedData && Object.keys(extractedData).length > 0 && (extractedData.summary || cachedExtraction);
            if (hasSyncData) {
                // JSONB Read-Modify-Write: read current metadata first to avoid wiping other fields
                // (defensive pattern — metadata is null at this point for new jobs, but safe for all futures)
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
