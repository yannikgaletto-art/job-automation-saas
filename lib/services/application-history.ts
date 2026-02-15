
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

// Initialize Supabase Client (Service Role for secure access if needed, or Anon)
// Using Service Role to ensure we can check history reliably
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

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

    // Generate MD5 Hash of URL
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
        // Fail safe: allow application if DB check fails? Or block?
        // We'll log and continue to next check, but this is suspicious.
    }

    if (exactMatches && exactMatches.length > 0) {
        const match = exactMatches[0]
        return {
            isDuplicate: true,
            reason: "exact_url",
            lastAppliedAt: new Date(match.applied_at),
            cooldownDaysRemaining: 30, // Simplified
            matchDetails: {
                jobTitle: match.job_title || "Unknown Role",
                companyName: match.company_name,
                applicationMethod: match.application_method
            }
        }
    }

    // 2. CHECK: Same Company + Similar Title (last 90 days)
    if (companySlug && jobTitle) {
        // We use a raw query or a stored procedure because pg_trgm fuzzy match (%) 
        // is not standard in Supabase JS client filters.
        // However, we can basic check on company_slug and then filter in code 
        // OR use the RPC if we exposed one.
        // Since we want to leverage the DB trigger logic WITHOUT triggering an exception,
        // we should ideally query `application_history` by company_slug first.

        const { data: companyMatches, error: companyError } = await supabase
            .from("application_history")
            .select("applied_at, job_title, company_name, application_method")
            .eq("user_id", userId)
            .eq("company_slug", companySlug) // Normalized slug
            .gt("applied_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

        if (companyError) {
            console.error("Error checking company duplicate:", companyError)
        }

        if (companyMatches && companyMatches.length > 0) {
            // Manual fuzzy match in JS since we fetched candidates by company
            // Or relies on just company match? No, "Similar Role" is key.
            // Simple logic: If any job at this company contains similar words?
            // "Senior Engineer" vs "Senior Software Engineer"

            const targetWords = new Set(jobTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3))

            for (const match of companyMatches) {
                if (!match.job_title) continue

                const matchWords = match.job_title.toLowerCase().split(/\s+/)
                const intersection = matchWords.filter((w: string) => targetWords.has(w))

                // If > 50% match of meaningful words
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
