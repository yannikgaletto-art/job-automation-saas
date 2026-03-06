import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use user.id from auth — no user_id from query params (security)
    const { data: consents, error } = await supabase
        .from("consent_history")
        .select("document_type, document_version, consent_given, consented_at")
        .eq("user_id", user.id)
        .eq("consent_given", true)
        .order("consented_at", { ascending: false })

    if (error) {
        console.error("❌ [security/consent-history] DB error:", error.message)
        // If RLS blocks access, return empty array (graceful degradation)
        return NextResponse.json({ success: true, consents: [] })
    }

    return NextResponse.json({ success: true, consents: consents || [] })
}
