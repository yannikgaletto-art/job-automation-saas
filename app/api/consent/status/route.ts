
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ authenticated: false, hasConsents: false })
    }

    // Check for required consents (v1.0)
    const requiredTypes = ["privacy_policy", "terms_of_service", "ai_processing", "cookies"]

    const { data: consents, error } = await supabase
        .from("consent_history")
        .select("document_type")
        .eq("user_id", user.id)
        .eq("document_version", "v1.0")
        .eq("consent_given", true)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const givenTypes = new Set(consents?.map(c => c.document_type) || [])
    const hasAll = requiredTypes.every(t => givenTypes.has(t))

    return NextResponse.json({
        authenticated: true,
        hasConsents: hasAll,
        missing: requiredTypes.filter(t => !givenTypes.has(t))
    })
}
