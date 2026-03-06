import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Parallel fetch all user data (all scoped to user_id via RLS)
        const [
            profileResult,
            consentsResult,
            documentsResult,
            jobsResult,
            applicationsResult,
        ] = await Promise.all([
            supabase
                .from("user_profiles")
                .select("preferred_cv_template, onboarding_completed, subscription_tier, created_at, updated_at")
                .eq("id", user.id)
                .maybeSingle(),
            supabase
                .from("consent_history")
                .select("document_type, document_version, consent_given, consented_at")
                .eq("user_id", user.id)
                .order("consented_at", { ascending: false }),
            supabase
                .from("documents")
                .select("id, document_type, created_at")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false }),
            supabase
                .from("job_queue")
                .select("id, job_title, company_name, location, status, created_at")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false }),
            supabase
                .from("application_history")
                .select("id, company_name, job_title, application_method, applied_at")
                .eq("user_id", user.id)
                .order("applied_at", { ascending: false }),
        ])

        const exportData = {
            exported_at: new Date().toISOString(),
            user_id: user.id,
            email: user.email,
            profile: profileResult.data || null,
            consent_history: consentsResult.data || [],
            documents_metadata: documentsResult.data || [],
            job_queue: jobsResult.data || [],
            application_history: applicationsResult.data || [],
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
