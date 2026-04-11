export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { z } from 'zod'
import crypto from 'crypto'
import { inngest } from '@/lib/inngest/client'
import { getUserLocale } from '@/lib/i18n/get-user-locale'

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

// ================================================================
// Zod Schema — Extension sends pre-parsed data
// ================================================================
const ImportRequestSchema = z.object({
    url: z.string().url('Valid URL required'),
    title: z.string().min(2).max(200),
    company: z.string().min(1).max(200),
    location: z.string().max(200).optional().nullable(),
    platform: z.enum([
        'linkedin', 'indeed', 'stepstone',
        'greenhouse', 'lever', 'workday', 'taleo',
        'company_website', 'unknown'
    ]),
    description: z.string().max(5000, 'Max 5000 Zeichen').optional().nullable(),
})

export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID()
    const startTime = Date.now()

    try {
        // ================================================================
        // STEP 0: Auth Guard (§8 API SECURITY CONTRACT)
        // Extension sends Bearer token, not cookie
        // ================================================================
        const authHeader = request.headers.get('authorization')
        let user: { id: string } | null = null

        if (authHeader?.startsWith('Bearer ')) {
            // Extension auth: Bearer JWT
            const token = authHeader.slice(7)
            const { data, error } = await supabaseAdmin.auth.getUser(token)
            if (!error && data?.user) {
                user = { id: data.user.id }
            }
        } else {
            // Fallback: Cookie-based auth (if ever called from SaaS)
            const supabase = await createClient()
            const { data: { user: cookieUser }, error } = await supabase.auth.getUser()
            if (!error && cookieUser) {
                user = { id: cookieUser.id }
            }
        }

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED', requestId },
                { status: 401 }
            )
        }

        console.log(`[${requestId}] route=jobs/import step=start userId=${user.id}`)

        // ================================================================
        // STEP 0.5: 5-Job-Limit (QA-Fix RISIKO 4 — identisch zu /ingest)
        // ================================================================
        const { count: activeJobCount, error: countError } = await supabaseAdmin
            .from('job_queue')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .in('status', ['pending', 'ready_for_review', 'ready_to_apply', 'submitted'])

        if (!countError && (activeJobCount ?? 0) >= 5) {
            console.log(`[${requestId}] route=jobs/import step=limit_check blocked count=${activeJobCount}`)
            return NextResponse.json(
                { success: false, error: 'job_limit_reached', code: 'LIMIT_5', requestId },
                { status: 429 }
            )
        }

        // ================================================================
        // STEP 1: Validate input
        // ================================================================
        const body = await request.json()
        let validated
        try {
            validated = ImportRequestSchema.parse(body)
        } catch (validationError) {
            if (validationError instanceof z.ZodError) {
                return NextResponse.json(
                    { success: false, error: 'Invalid request', details: validationError.errors, requestId },
                    { status: 400 }
                )
            }
            throw validationError
        }

        const { url, title, company, location, platform, description } = validated
        console.log(`[${requestId}] route=jobs/import step=validate title="${title}" company="${company}" platform=${platform}`)

        // ================================================================
        // STEP 2: Duplicate Check (QA-Fix BUG 1 — source_url, NOT apply_link)
        // UNIQUE Index: idx_jobqueue_user_url(user_id, source_url)
        // ================================================================
        const { data: existing } = await supabaseAdmin
            .from('job_queue')
            .select('id')
            .eq('user_id', user.id)
            .eq('source_url', url)
            .maybeSingle()

        if (existing) {
            console.log(`[${requestId}] route=jobs/import step=duplicate id=${existing.id}`)
            return NextResponse.json(
                { success: true, id: existing.id, duplicate: true, requestId },
                { status: 200 }
            )
        }

        // ================================================================
        // STEP 3: Ensure user_profiles row exists (FK requirement)
        // ================================================================
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('id')
            .eq('id', user.id)
            .single()

        if (!profile) {
            await supabaseAdmin.from('user_profiles').insert({
                id: user.id,
                pii_encrypted: {},
                onboarding_completed: false,
            })
            console.log(`[${requestId}] route=jobs/import step=ensure_profile created`)
        }

        // ================================================================
        // STEP 4: Insert job (QA-Fix — job_url + source_url dual mapping)
        // ================================================================
        const { data: job, error: insertError } = await supabaseAdmin
            .from('job_queue')
            .insert({
                user_id: user.id,
                job_url: url,                    // TEXT NOT NULL
                source_url: url,                 // For UNIQUE-Index dedup
                job_title: title,
                company_name: company,
                location: location || null,
                description: description || null,
                platform: platform,
                source: 'extension',
                status: 'pending',
                user_profile_id: user.id,
                snapshot_at: new Date().toISOString(),
                metadata: {},
            })
            .select('id, job_title, company_name')
            .single()

        if (insertError) {
            // Graceful duplicate: Postgres UNIQUE violation (23505) as fallback
            if (insertError.code === '23505') {
                console.log(`[${requestId}] route=jobs/import step=db_insert duplicate_constraint`)
                return NextResponse.json(
                    { success: true, duplicate: true, requestId },
                    { status: 200 }
                )
            }

            console.error(`[${requestId}] route=jobs/import step=db_insert error=${insertError.message} code=${insertError.code}`)
            return NextResponse.json(
                { success: false, error: 'Database error', code: insertError.code, requestId },
                { status: 500 }
            )
        }

        // ================================================================
        // STEP 5: Trigger Inngest extract pipeline (QA-Fix — locale PFLICHT)
        // ================================================================
        try {
            const locale = await getUserLocale(user.id)
            await inngest.send({
                name: 'job/extract',
                data: { jobId: job.id, userId: user.id, locale },
            })
            console.log(`[${requestId}] route=jobs/import step=trigger_extract job_id=${job.id} locale=${locale}`)
        } catch (triggerErr) {
            console.warn(`[${requestId}] route=jobs/import step=trigger_extract error — manual re-extract possible`)
        }

        // ================================================================
        // STEP 6: Return success
        // ================================================================
        console.log(`[${requestId}] route=jobs/import step=complete duration_ms=${Date.now() - startTime} job_id=${job.id}`)

        return NextResponse.json(
            {
                success: true,
                id: job.id,
                duplicate: false,
                requestId,
            },
            { status: 201 }
        )
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error(`[${requestId}] route=jobs/import step=unhandled_error error=${errMsg}`)
        return NextResponse.json(
            { success: false, error: errMsg, requestId },
            { status: 500 }
        )
    }
}
