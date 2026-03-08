import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { deepScrapeJob } from '@/lib/services/job-search-pipeline';
import { inngest } from '@/lib/inngest/client';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

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
            .eq('user_id', userId);

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
        // STEP 2: Extract requirements with LLM (with timeout)
        // ================================================================
        let extractedData: any = {};
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // Increased timeout for deeper extraction

        try {
            console.log(`[${requestId}] route=jobs/ingest step=ai_parse_requirements`);

            if (process.env.ANTHROPIC_API_KEY) {
                const extractionSchema = {
                    company: "string — Unternehmensname",
                    jobTitle: "string — exakter Stellentitel",
                    location: "string | null — Ort/Remote/Hybrid falls erkennbar",
                    company_website: "string | null — URL der Unternehmenswebsite (z.B. https://firma.de), NICHT die Karriereseite oder Stellenanzeige",
                    summary: "string — 2-3 Sätze Zusammenfassung der Rolle",
                    responsibilities: "string[] — Aufgaben als Stichpunkte (max 8)",
                    qualifications: "string[] — Anforderungen/Qualifikationen (max 8)",
                    benefits: "string[] — Benefits (max 5, kann leer sein)",
                    seniority: "'junior' | 'mid' | 'senior' | 'lead' | 'unknown'",
                    buzzwords: "string[] — ATS/Robot-Keywords: Tools, Methoden, Frameworks (max 12)"
                };

                const message = await anthropic.messages.create({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 1500,
                    temperature: 0,
                    system: `Extrahiere aus der folgenden Stellenbeschreibung die Informationen als JSON. Alle Felder auf Deutsch. Wenn ein Feld nicht erkennbar ist, nutze null oder leeres Array. Gib NUR valides JSON zurück, kein Markdown. Schema: ${JSON.stringify(extractionSchema)}`,
                    messages: [{ role: 'user', content: enrichedDescription }]
                }, { signal: controller.signal });

                if (message.content[0].type === 'text') {
                    const text = message.content[0].text.trim();
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
                }
            } else {
                console.warn(`[${requestId}] route=jobs/ingest step=ai_parse no_api_key skipped`);
            }
        } catch (aiError: any) {
            if (aiError.name === 'AbortError') {
                console.warn(`[${requestId}] route=jobs/ingest step=ai_parse timeout=12000ms`);
            } else {
                console.warn(`[${requestId}] route=jobs/ingest step=ai_parse error=${aiError.message}`);
            }
            // Proceed with empty extraction rather than failing the ingest
        } finally {
            clearTimeout(timeoutId);
        }

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
        // ================================================================
        try {
            await inngest.send({
                name: 'job/extract',
                data: { jobId: job.id, userId },
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
