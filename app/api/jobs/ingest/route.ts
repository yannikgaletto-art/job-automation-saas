import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';

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
    jobDescription: z.string().min(500, 'Job description must be at least 500 characters'),
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

        const { company, jobTitle, jobDescription } = validated;

        console.log(`[${requestId}] route=jobs/ingest step=validate title="${jobTitle}" company="${company}"`);

        // ================================================================
        // STEP 2: Extract requirements with LLM (with timeout)
        // ================================================================
        let requirements: string[] = [];
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

        try {
            console.log(`[${requestId}] route=jobs/ingest step=ai_parse_requirements`);

            if (process.env.ANTHROPIC_API_KEY) {
                const message = await anthropic.messages.create({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 1000,
                    temperature: 0,
                    system: "Extract a concise JSON array of strings representing the key job requirements/skills from the provided job description. Return ONLY the JSON array (e.g. [\"React\", \"TypeScript\", \"5+ years experience\"]). No markdown blocks, no other text.",
                    messages: [{ role: 'user', content: jobDescription }]
                }, { signal: controller.signal });

                if (message.content[0].type === 'text') {
                    const text = message.content[0].text.trim();
                    try {
                        let parsed = JSON.parse(text);
                        if (Array.isArray(parsed)) {
                            requirements = parsed.map(String);
                        }
                    } catch (parseError) {
                        console.warn(`[${requestId}] route=jobs/ingest step=ai_parse JSON parse failed, text=${text.substring(0, 50)}...`);
                    }
                }
            } else {
                console.warn(`[${requestId}] route=jobs/ingest step=ai_parse no_api_key skipped`);
            }
        } catch (aiError: any) {
            if (aiError.name === 'AbortError') {
                console.warn(`[${requestId}] route=jobs/ingest step=ai_parse timeout=8000ms`);
            } else {
                console.warn(`[${requestId}] route=jobs/ingest step=ai_parse error=${aiError.message}`);
            }
            // Proceed with empty requirements rather than failing the ingest
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

        const syntheticJobUrl = `manual:${crypto.randomUUID()}`;

        const { data: job, error: insertError } = await supabaseAdmin
            .from('job_queue')
            .insert({
                user_id: userId,
                job_url: syntheticJobUrl,
                job_title: jobTitle,
                company_name: company,
                description: jobDescription,
                requirements: requirements.length > 0 ? requirements : null,
                platform: 'unknown',
                snapshot_at: new Date().toISOString(),
                status: 'pending',
                user_profile_id: userId,
            })
            .select('id, job_title, company_name, location, platform, status, created_at')
            .single();

        if (insertError) {
            console.error(`[${requestId}] route=jobs/ingest step=db_insert_job supabase_error=${insertError.message} code=${insertError.code}`);
            return NextResponse.json(
                { success: false, error: 'Database error', requestId },
                { status: 500 }
            );
        }

        console.log(`[${requestId}] route=jobs/ingest step=complete duration_ms=${Date.now() - startTime} job_id=${job.id}`);

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
