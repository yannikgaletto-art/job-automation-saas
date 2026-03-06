import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
    const supabase = await createClient()

    // 1. Get authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Parse query params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const offset = (page - 1) * limit

    try {
        // 3. SELECT from application_history
        const { data, count, error } = await supabase
            .from("application_history")
            .select("*", { count: "exact" })
            .eq("user_id", user.id)
            .order("applied_at", { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) throw error

        // 4. Return paginated results
        return NextResponse.json({
            applications: data.map((app: any) => ({
                id: app.id,
                companyName: app.company_name,
                jobTitle: app.job_title,
                appliedAt: app.applied_at,
                submittedAt: app.submitted_at || null,
                applicationMethod: app.application_method,
                jobUrl: app.job_url,
                generatedDocuments: {
                    cv_url: app.cv_url,
                    cover_letter_url: app.cover_letter_url
                }
            })),
            pagination: {
                page,
                limit,
                total: count || 0,
                hasMore: (offset + limit) < (count || 0)
            }
        })

    } catch (error: any) {
        console.error("Error in /api/applications/history:", error)

        // Tabelle existiert noch nicht oder ist leer → kein 500, sondern leerer State
        if (
            error?.code === '42P01' ||          // PostgreSQL: table does not exist
            error?.message?.includes('relation') ||
            error?.message?.includes('does not exist')
        ) {
            return NextResponse.json({
                applications: [],
                pagination: { page: 1, limit: 10, total: 0, hasMore: false }
            })
        }

        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        )
    }
}

/**
 * PATCH: Toggle "Bewerbung abgeschickt" checkbox.
 * Sets submitted_at = NOW() when checked, NULL when unchecked.
 * RLS enforced via authenticated Supabase client.
 */
export async function PATCH(request: Request) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { id, submitted } = body

        if (!id || typeof submitted !== 'boolean') {
            return NextResponse.json({ error: "Missing id or submitted field" }, { status: 400 })
        }

        const { error } = await supabase
            .from("application_history")
            .update({ submitted_at: submitted ? new Date().toISOString() : null })
            .eq("id", id)
            .eq("user_id", user.id) // Double-check ownership

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("Error in PATCH /api/applications/history:", error)
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        )
    }
}
