/**
 * POST /api/consent/track
 * 
 * §8: Auth Guard — userId derived from authenticated session, never from body.
 * DSGVO Art. 7: Consent must be traceable, timestamped, and attributable.
 */

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    try {
        const supabase = await createClient()

        // §8: Auth Guard — derive userId from session, never trust body
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await request.json()
        const { consents } = body

        if (!consents || !Array.isArray(consents)) {
            return NextResponse.json({ error: "consents array required" }, { status: 400 })
        }

        // Extract IP and User Agent for DSGVO audit trail
        const userAgent = request.headers.get("user-agent") || "unknown"
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"

        // §3: User-scoped — always use authenticated user.id
        const records = consents.map((c: { document_type: string; document_version: string; consent_given: boolean }) => ({
            user_id: user.id,
            document_type: c.document_type,
            document_version: c.document_version,
            consent_given: c.consent_given,
            ip_address: ip,
            user_agent: userAgent
        }))

        const { error } = await supabase
            .from("consent_history")
            .insert(records)

        if (error) {
            console.error("❌ [Consent/Track] Insert failed:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error("❌ [Consent/Track] Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
