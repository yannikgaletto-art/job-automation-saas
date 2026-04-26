export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { z } from 'zod'
import crypto from 'crypto'
import { inngest } from '@/lib/inngest/client'
import { getUserLocale, getLanguageName, type SupportedLocale } from '@/lib/i18n/get-user-locale'
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash'
import { complete } from '@/lib/ai/model-router'
import { sanitizeForAI } from '@/lib/services/pii-sanitizer'
import { filterAtsKeywords } from '@/lib/services/ats-keyword-filter'

// ================================================================
// CORS Headers — required for Browser Extension (chrome-extension:// origin)
// Extensions cannot set CORS origin — we allow all origins here.
// Auth is enforced via Bearer JWT, not CORS origin.
// ================================================================
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
} as const

/**
 * CORS Preflight handler — required for cross-origin extension requests
 */
export async function OPTIONS() {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
}

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
                { status: 401, headers: CORS_HEADERS }
            )
        }

        // ================================================================
        // STEP 0.5: Rate Limit (server-side, complements client 3s cooldown)
        // Uses authenticated user.id for consistent rate limiting
        // ================================================================
        const rateLimitBlocked = await checkUpstashLimit(rateLimiters.jobIngest, user.id)
        if (rateLimitBlocked) {
            return new Response(rateLimitBlocked.body, {
                status: rateLimitBlocked.status,
                headers: { ...Object.fromEntries(rateLimitBlocked.headers.entries()), ...CORS_HEADERS },
            })
        }

        console.log(`[${requestId}] route=jobs/import step=start userId=${user.id}`)

        // ================================================================
        // STEP 0.5: 5-Job-Limit (QA-Fix RISIKO 4 — identisch zu /ingest)
        // ================================================================
        const { count: activeJobCount, error: countError } = await supabaseAdmin
            .from('job_queue')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .not('status', 'in', '("archived","rejected")')

        if (!countError && (activeJobCount ?? 0) >= 5) {
            console.log(`[${requestId}] route=jobs/import step=limit_check blocked count=${activeJobCount}`)
            return NextResponse.json(
                { success: false, error: 'job_limit_reached', code: 'LIMIT_5', requestId },
                { status: 429, headers: CORS_HEADERS }
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
                    { status: 400, headers: CORS_HEADERS }
                )
            }
            throw validationError
        }

        const { url, title, company, location, platform, description } = validated
        console.log(`[${requestId}] route=jobs/import step=validate title="${title}" company="${company}" platform=${platform}`)

        // ================================================================
        // STEP 1.5: LinkedIn Description Quality Guard
        // LinkedIn's SPA sometimes renders only a truncated preview (~80-120 chars).
        // If description is too short AND the URL is a LinkedIn job, reject early.
        // This prevents Zombie-Jobs (imported with empty Steckbrief) entirely.
        // The extension will show an amber warning banner to guide the user.
        // Threshold: 200 chars (same value as MIN_DESCRIPTION_LENGTH in extension constants.ts)
        // ================================================================
        const isLinkedIn = url.includes('linkedin.com')
        const descLen = description?.length ?? 0
        if (isLinkedIn && descLen < 200) {
            console.log(`[${requestId}] route=jobs/import step=linkedin_quality_guard rejected desc_len=${descLen}`)
            return NextResponse.json(
                {
                    success: false,
                    error: 'Stellenbeschreibung konnte nicht vollständig gelesen werden. Bitte klappe sie auf LinkedIn manuell auf.',
                    code: 'LINKEDIN_DESCRIPTION_TOO_SHORT',
                    requestId,
                },
                { status: 400, headers: CORS_HEADERS }
            )
        }

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
                { status: 200, headers: CORS_HEADERS }
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
                    { status: 200, headers: CORS_HEADERS }
                )
            }

            console.error(`[${requestId}] route=jobs/import step=db_insert error=${insertError.message} code=${insertError.code}`)
            return NextResponse.json(
                { success: false, error: 'Database error', code: insertError.code, requestId },
                { status: 500, headers: CORS_HEADERS }
            )
        }

        // ================================================================
        // STEP 5: Synchronous Claude Extraction (NEW — mirrors ingest route)
        // The extension sends the description it parsed from the DOM/JSON-LD.
        // We run Claude HERE synchronously so the Steckbrief is populated
        // BEFORE the user opens the dashboard. This was the root cause of
        // "Keine strukturierten Daten vorhanden" — previously only Inngest
        // (async) was responsible, and users opened the dashboard too fast.
        // Best-effort: if Claude fails, import still succeeds + Inngest retries.
        // ================================================================
        const locale = await getUserLocale(user.id)
        const languageName = getLanguageName(locale as SupportedLocale)

        if (description && description.length >= 100) {
            try {
                console.log(`[${requestId}] route=jobs/import step=sync_extract desc_len=${description.length}`)

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

Schema: {"summary":"2-3 sentences in ${languageName}","responsibilities":["max 8"],"qualifications":["max 8"],"benefits":["TOP 6, max 3 words each"],"location":"string or null","seniority":"junior|mid|senior|lead|unknown","buzzwords":["MAXIMUM 15 ATS keywords extracted EXCLUSIVELY from the job description text below. HARD RULE: Each keyword MUST appear verbatim, as a direct translation, or as a clear semantic match in the JD text. If a keyword does NOT appear in the JD, you MUST NOT include it. Never invent keywords from your training data; never carry over keywords from prior tasks. CATEGORIES: tools, frameworks, platforms, certifications, domain terms. EXCLUDE: generic verbs, language names, soft skills, adjectives. LANGUAGE: translate language-dependent terms into ${languageName} when an established translation exists (e.g. 'Project Management' → 'Projektmanagement' for de). Proper nouns and brand-specific tools keep their original form (Salesforce, SAP, Python, Scrum). Compliance-specific terms may translate as language variants of the same regulation: GDPR ↔ DSGVO ↔ RGPD."]}`,
                    prompt: sanitizeForAI(description).sanitized,
                    temperature: 0,
                    maxTokens: 2000,
                })

                // Parse Claude response
                let extracted: Record<string, unknown> = {}
                try {
                    let cleaned = response.text.trim()
                    const mdMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
                    if (mdMatch?.[1]) cleaned = mdMatch[1].trim()
                    extracted = JSON.parse(cleaned)
                } catch {
                    // Try to extract JSON from surrounding text
                    const first = response.text.indexOf('{')
                    const last = response.text.lastIndexOf('}')
                    if (first !== -1 && last > first) {
                        try { extracted = JSON.parse(response.text.substring(first, last + 1)) } catch { /* fall through */ }
                    }
                }

                // Write extracted fields + sync flag
                if (extracted.summary || extracted.buzzwords) {
                    // Normalize buzzwords + ATS-Filter (parity with /api/jobs/ingest STEP 3.5)
                    let buzzwords: string[] | null = null
                    if (Array.isArray(extracted.buzzwords) && extracted.buzzwords.length > 0) {
                        const seen = new Set<string>()
                        const normalized: string[] = []
                        for (const kw of extracted.buzzwords as string[]) {
                            const key = kw.trim().toLowerCase()
                            if (key.length >= 2 && !seen.has(key)) {
                                seen.add(key)
                                normalized.push(kw.trim())
                            }
                        }
                        normalized.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

                        // ATS-Filter: strip garbage + rewrite German compounds.
                        const atsFilter = filterAtsKeywords(normalized)
                        buzzwords = atsFilter.kept.length > 0 ? atsFilter.kept : null
                        if (atsFilter.removed.length > 0) {
                            console.log(`[${requestId}] route=jobs/import step=ats_filter kept=${atsFilter.kept.length} removed=${atsFilter.removed.length}: ${atsFilter.removed.slice(0, 5).join(', ')}`)
                        }
                        if (atsFilter.rewritten && atsFilter.rewritten.length > 0) {
                            console.log(`[${requestId}] route=jobs/import step=ats_filter rewrote=${atsFilter.rewritten.slice(0, 3).map(r => `${r.from}→${r.to}`).join(', ')}`)
                        }
                    }

                    await supabaseAdmin
                        .from('job_queue')
                        .update({
                            summary: (extracted.summary as string) || null,
                            responsibilities: Array.isArray(extracted.responsibilities) && extracted.responsibilities.length > 0
                                ? extracted.responsibilities : null,
                            requirements: Array.isArray(extracted.qualifications) && (extracted.qualifications as unknown[]).length > 0
                                ? extracted.qualifications : null,
                            benefits: Array.isArray(extracted.benefits) ? extracted.benefits : [],
                            location: (extracted.location as string) || location || null,
                            seniority: (extracted.seniority as string) || 'unknown',
                            buzzwords: buzzwords,
                            metadata: {
                                sync_extracted_at: new Date().toISOString(),
                                source: 'extension',
                            },
                        })
                        .eq('id', job.id)
                        .eq('user_id', user.id)

                    console.log(`[${requestId}] route=jobs/import step=sync_extract ✅ summary=${!!extracted.summary} buzzwords=${buzzwords?.length ?? 0}`)
                } else {
                    console.warn(`[${requestId}] route=jobs/import step=sync_extract ⚠️ Claude returned empty extraction`)
                }
            } catch (extractErr) {
                // Non-blocking: sync extraction failed, Inngest will retry
                console.warn(`[${requestId}] route=jobs/import step=sync_extract ❌ error — Inngest will handle`, extractErr)
            }
        } else {
            console.log(`[${requestId}] route=jobs/import step=sync_extract skipped desc_len=${description?.length ?? 0}`)
        }

        // ================================================================
        // STEP 6: Trigger Inngest as enrichment backup
        // Even after sync extraction, Inngest runs for enrichment (e.g.
        // Jina fallback for non-LinkedIn URLs, deeper analysis).
        // The sync_extracted_at metadata flag tells Inngest to skip
        // redundant LLM calls if sync already populated the fields.
        // ================================================================
        try {
            await inngest.send({
                name: 'job/extract',
                data: { jobId: job.id, userId: user.id, locale },
            })
            console.log(`[${requestId}] route=jobs/import step=trigger_extract job_id=${job.id}`)
        } catch (triggerErr) {
            console.warn(`[${requestId}] route=jobs/import step=trigger_extract error — manual re-extract possible`)
        }

        // ================================================================
        // STEP 7: Return success
        // ================================================================
        console.log(`[${requestId}] route=jobs/import step=complete duration_ms=${Date.now() - startTime} job_id=${job.id}`)

        return NextResponse.json(
            {
                success: true,
                id: job.id,
                duplicate: false,
                requestId,
            },
            { status: 201, headers: CORS_HEADERS }
        )
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error(`[${requestId}] route=jobs/import step=unhandled_error error=${errMsg}`)
        return NextResponse.json(
            { success: false, error: errMsg, requestId },
            { status: 500, headers: CORS_HEADERS }
        )
    }
}
