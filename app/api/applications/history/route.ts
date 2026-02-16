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
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
    }
}
