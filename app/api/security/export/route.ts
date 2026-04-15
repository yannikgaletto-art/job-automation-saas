/**
 * Scoped Data Export API
 *
 * GET /api/security/export
 *
 * DSGVO Art. 20: Right to Data Portability.
 * Returns a scoped JSON export of user-provided data.
 *
 * Scope: Only Art. 20-relevant data the user provided.
 * EXCLUDES: firecrawl_markdown, serpapi_raw, encryptedPii, conversation_history,
 *           stripe_customer_id, internal AI processing logs.
 *
 * Target: < 500 KB payload, < 2s execution (Vercel limits).
 *
 * Rate limited: 3 per 10 minutes.
 */

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { rateLimiters, checkUpstashLimit } from "@/lib/api/rate-limit-upstash"

// Vercel timeout protection — 8 parallel DB queries + JSON serialization
export const maxDuration = 30;

export async function GET() {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit
    const blocked = await checkUpstashLimit(rateLimiters.dataExport, user.id)
    if (blocked) return blocked

    try {
        // Parallel fetch all user data (all scoped to user_id via RLS)
        // Scoped: only user-provided data, no internal processing artifacts
        const [
            settingsResult,
            profileResult,
            consentsResult,
            documentsResult,
            jobsResult,
            applicationsResult,
            creditsResult,
            coachingResult,
        ] = await Promise.all([
            supabase
                .from("user_settings")
                .select("onboarding_completed, preferred_language, created_at, updated_at, last_active_at")
                .eq("user_id", user.id)
                .maybeSingle(),
            supabase
                .from("user_profiles")
                .select("preferred_cv_template, target_role, target_location, writing_style_adjectives, avatar_animal, created_at, updated_at")
                .eq("id", user.id)
                .maybeSingle(),
            supabase
                .from("consent_history")
                .select("document_type, document_version, consent_given, consented_at")
                .eq("user_id", user.id)
                .order("consented_at", { ascending: false }),
            supabase
                .from("documents")
                .select("id, document_type, file_name, origin, created_at")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false }),
            supabase
                .from("job_queue")
                .select("id, job_title, company_name, location, status, created_at")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false }),
            supabase
                .from("application_history")
                .select("id, company_name, job_title, application_method, applied_at, contact_person, notes")
                .eq("user_id", user.id)
                .order("applied_at", { ascending: false }),
            supabase
                .from("user_credits")
                .select("plan_type, credits_total, credits_used, topup_credits, billing_period_end")
                .eq("user_id", user.id)
                .maybeSingle(),
            supabase
                .from("coaching_sessions")
                .select("id, session_status, interview_round, coaching_score, turn_count, created_at, completed_at")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false }),
        ])

        const exportData = {
            _meta: {
                exported_at: new Date().toISOString(),
                format_version: "2.0",
                scope: "Art. 20 DSGVO — user-provided data only",
                note: "This export contains your personal data stored by Pathly. AI processing logs, internal cache, and Stripe payment details are excluded for security.",
            },
            user_id: user.id,
            email: user.email,
            settings: settingsResult.data || null,
            profile: profileResult.data || null,
            consent_history: consentsResult.data || [],
            documents_metadata: documentsResult.data || [],
            job_queue: jobsResult.data || [],
            application_history: applicationsResult.data || [],
            billing: creditsResult.data ? {
                plan_type: creditsResult.data.plan_type,
                credits_total: creditsResult.data.credits_total,
                credits_used: creditsResult.data.credits_used,
                billing_period_end: creditsResult.data.billing_period_end,
            } : null,
            coaching_sessions: (coachingResult.data || []).map(s => ({
                id: s.id,
                status: s.session_status,
                round: s.interview_round,
                score: s.coaching_score,
                turns: s.turn_count,
                created_at: s.created_at,
                completed_at: s.completed_at,
                // NOTE: conversation_history excluded (contains AI-generated content, not user-provided)
            })),
        }

        const filename = `pathly-data-export-${new Date().toISOString().split('T')[0]}.json`

        return new NextResponse(JSON.stringify(exportData, null, 2), {
            status: 200,
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        })
    } catch (error) {
        console.error("❌ [security/export] Error:", error)
        return NextResponse.json({ error: "Failed to export data" }, { status: 500 })
    }
}
