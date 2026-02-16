
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    try {
        const supabase = await createClient()

        // 1. Get authenticated user (optional for onboarding but good practice)
        const { data: { user } } = await supabase.auth.getUser()

        // 2. Parse request body
        const body = await request.json()
        const { user_id, consents } = body

        // Use authenticated user ID if available, otherwise use the passed ID (for new users)
        const targetUserId = user?.id || user_id

        if (!targetUserId) {
            return NextResponse.json({ error: "User ID required" }, { status: 400 })
        }

        // 3. Extract IP address and user agent
        const userAgent = request.headers.get("user-agent") || "unknown"
        // IP extraction in Next.js/Vercel usually via headers
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"

        // 4. Prepare records
        const records = consents.map((c: any) => ({
            user_id: targetUserId,
            document_type: c.document_type,
            document_version: c.document_version,
            consent_given: c.consent_given,
            ip_address: ip,
            user_agent: userAgent
        }))

        // 5. Insert into DB
        const { error } = await supabase
            .from("consent_history")
            .insert(records)

        if (error) {
            console.error("❌ Consent tracking failed:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error("❌ Internal error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
