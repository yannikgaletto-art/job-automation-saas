/**
 * Application History Service — Customer Journey CRM
 * Feature-Silo: Application History CRM (FEATURE_COMPAT_MATRIX.md §10)
 *
 * Tracks job applications, checks duplicates, and manages CRM fields
 * (status, notes, contacts, learnings, rejection tags).
 *
 * Uses centralized admin singleton (lib/supabase/admin.ts).
 */

import crypto from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

export type ApplicationStatus =
    | 'applied'
    | 'follow_up_sent'
    | 'interviewing'
    | 'offer_received'
    | 'rejected'
    | 'ghosted'

/** Terminal states that should auto-clear next_action_date */
const TERMINAL_STATUSES: ApplicationStatus[] = ['rejected', 'ghosted', 'offer_received']

export interface DuplicateCheckResult {
    isDuplicate: boolean
    reason?: "exact_url" | "same_company_similar_role"
    lastAppliedAt?: Date
    cooldownDaysRemaining?: number
    matchDetails?: {
        jobTitle: string
        companyName: string
        applicationMethod: string
    }
}

export interface TrackApplicationParams {
    userId: string
    jobUrl: string
    companyName: string
    jobTitle: string
    applicationMethod: "auto" | "manual" | "extension"
    generatedDocuments?: {
        cv_url?: string
        cover_letter_url?: string
    }
}

export interface UpdateApplicationCRMParams {
    id: string
    userId: string
    status?: ApplicationStatus
    next_action_date?: string | null
    notes?: string | null
    rejection_tags?: string[]
    contact_name?: string | null
    learnings?: string | null
    submitted?: boolean
}

// ────────────────────────────────────────────────
// Duplicate Check
// ────────────────────────────────────────────────

/**
 * Checks if a user has already applied to a job.
 *
 * Logic mirrors the DB trigger `prevent_double_apply`:
 * 1. Exact URL Match (MD5) -> 30 days cooldown
 * 2. Same Company + Fuzzy Title -> 90 days cooldown
 */
export async function checkDuplicateApplication(
    userId: string,
    jobUrl: string,
    companySlug?: string,
    jobTitle?: string
): Promise<DuplicateCheckResult> {
    if (!userId || !jobUrl) {
        throw new Error("userId and jobUrl are required for duplicate check")
    }

    const supabase = getSupabaseAdmin()
    const urlHash = crypto.createHash("md5").update(jobUrl).digest("hex")

    // 1. CHECK: Exact URL Match (last 30 days)
    const { data: exactMatches, error: exactError } = await supabase
        .from("application_history")
        .select("applied_at, job_title, company_name, application_method")
        .eq("user_id", userId)
        .eq("url_hash", urlHash)
        .gt("applied_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1)

    if (exactError) {
        console.error("Error checking exact duplicate:", exactError)
    }

    if (exactMatches && exactMatches.length > 0) {
        const match = exactMatches[0]
        return {
            isDuplicate: true,
            reason: "exact_url",
            lastAppliedAt: new Date(match.applied_at),
            cooldownDaysRemaining: 30,
            matchDetails: {
                jobTitle: match.job_title || "Unknown Role",
                companyName: match.company_name,
                applicationMethod: match.application_method
            }
        }
    }

    // 2. CHECK: Same Company + Similar Title (last 90 days)
    if (companySlug && jobTitle) {
        const { data: companyMatches, error: companyError } = await supabase
            .from("application_history")
            .select("applied_at, job_title, company_name, application_method")
            .eq("user_id", userId)
            .eq("company_slug", companySlug)
            .gt("applied_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

        if (companyError) {
            console.error("Error checking company duplicate:", companyError)
        }

        if (companyMatches && companyMatches.length > 0) {
            const targetWords = new Set(
                jobTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3)
            )

            for (const match of companyMatches) {
                if (!match.job_title) continue

                const matchWords = match.job_title.toLowerCase().split(/\s+/)
                const intersection = matchWords.filter((w: string) => targetWords.has(w))

                if (targetWords.size > 0 && intersection.length / targetWords.size >= 0.5) {
                    return {
                        isDuplicate: true,
                        reason: "same_company_similar_role",
                        lastAppliedAt: new Date(match.applied_at),
                        cooldownDaysRemaining: 90,
                        matchDetails: {
                            jobTitle: match.job_title,
                            companyName: match.company_name,
                            applicationMethod: match.application_method
                        }
                    }
                }
            }
        }
    }

    return { isDuplicate: false }
}

// ────────────────────────────────────────────────
// Track Application
// ────────────────────────────────────────────────

/**
 * Tracks a new job application in the history.
 * company_slug is GENERATED ALWAYS AS in DB — do NOT pass it explicitly.
 */
export async function trackApplication(
    params: TrackApplicationParams
): Promise<{ success: boolean; error?: string; duplicate?: DuplicateCheckResult }> {
    const { userId, jobUrl, companyName, jobTitle, applicationMethod, generatedDocuments } = params

    try {
        console.log(`💾 Tracking application for ${companyName} (${jobTitle})...`)

        const supabase = getSupabaseAdmin()

        // company_slug is GENERATED ALWAYS from company_name — omit it from INSERT
        const { error } = await supabase
            .from("application_history")
            .insert({
                user_id: userId,
                job_url: jobUrl,
                company_name: companyName,
                job_title: jobTitle,
                application_method: applicationMethod,
                cv_url: generatedDocuments?.cv_url,
                cover_letter_url: generatedDocuments?.cover_letter_url
            })
            .select()
            .single()

        if (error) {
            if (error.code === '23505' || error.code === 'P0001') {
                console.warn(`⚠️ Duplicate application prevented: ${companyName}`)
                return {
                    success: false,
                    error: "Duplicate application",
                    duplicate: {
                        isDuplicate: true,
                        reason: "exact_url",
                        lastAppliedAt: new Date(),
                        cooldownDaysRemaining: 30
                    }
                }
            }
            throw error
        }

        console.log("✅ Application tracked successfully.")
        return { success: true }

    } catch (err: any) {
        console.error("❌ Error tracking application:", err)
        return { success: false, error: err.message || "Failed to track application" }
    }
}

// ────────────────────────────────────────────────
// Update Application CRM Fields
// ────────────────────────────────────────────────

/**
 * Updates CRM fields for an application (status, notes, contacts, etc.).
 * Ownership is enforced via .eq('user_id', userId).
 * Terminal status auto-clears next_action_date.
 */
export async function updateApplicationCRM(
    params: UpdateApplicationCRMParams
): Promise<{ success: boolean; error?: string }> {
    const { id, userId, ...fields } = params

    try {
        const supabase = getSupabaseAdmin()

        // Build partial update object — only include fields that were explicitly passed
        const update: Record<string, unknown> = {}

        if (fields.status !== undefined) {
            update.status = fields.status
            // Auto-clear next_action_date on terminal states
            if (TERMINAL_STATUSES.includes(fields.status)) {
                update.next_action_date = null
            }
        }

        if (fields.next_action_date !== undefined) {
            update.next_action_date = fields.next_action_date
        }

        if (fields.notes !== undefined) {
            update.notes = fields.notes || null
        }

        if (fields.rejection_tags !== undefined) {
            update.rejection_tags = fields.rejection_tags
        }

        if (fields.contact_name !== undefined) {
            update.contact_name = fields.contact_name || null
        }

        if (fields.learnings !== undefined) {
            update.learnings = fields.learnings || null
        }

        if (fields.submitted !== undefined) {
            update.submitted_at = fields.submitted ? new Date().toISOString() : null
        }

        // Auto-set submitted_at when entering interviewing/offer states
        if (
            fields.status &&
            ['interviewing', 'offer_received'].includes(fields.status) &&
            fields.submitted === undefined
        ) {
            update.submitted_at = update.submitted_at ?? new Date().toISOString()
        }

        if (Object.keys(update).length === 0) {
            return { success: true } // Nothing to update
        }

        const { error } = await supabase
            .from("application_history")
            .update(update)
            .eq("id", id)
            .eq("user_id", userId) // Ownership enforcement

        if (error) throw error

        return { success: true }

    } catch (err: any) {
        console.error("❌ Error updating application CRM:", err)
        return { success: false, error: err.message || "Failed to update application" }
    }
}
