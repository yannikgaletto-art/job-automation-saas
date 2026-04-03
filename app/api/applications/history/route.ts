import { createClient } from "@/lib/supabase/server"
import { updateApplicationCRM, type ApplicationStatus } from "@/lib/services/application-history"
import { NextResponse } from "next/server"
import { z } from "zod"

// ────────────────────────────────────────────────
// Zod Schema for PATCH validation
// ────────────────────────────────────────────────

const VALID_STATUSES: ApplicationStatus[] = [
    'applied', 'follow_up_sent', 'interviewing', 'offer_received', 'rejected', 'ghosted'
]

const patchSchema = z.object({
    id: z.string().uuid(),
    submitted: z.boolean().optional(),
    status: z.enum(VALID_STATUSES as [string, ...string[]]).optional(),
    next_action_date: z.string().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    rejection_tags: z.array(z.string().max(30)).max(10).optional(),
    contact_name: z.string().max(100).nullable().optional(),
    learnings: z.string().max(1000).nullable().optional(),
})

// ────────────────────────────────────────────────
// GET: Paginated history with CRM fields
// ────────────────────────────────────────────────

export async function GET(request: Request) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const offset = (page - 1) * limit

    try {
        const { data, count, error } = await supabase
            .from("application_history")
            .select("*", { count: "exact" })
            .eq("user_id", user.id)
            .order("applied_at", { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) throw error

        return NextResponse.json({
            applications: (data || []).map((app: any) => ({
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
                },
                // CRM fields
                status: app.status || 'applied',
                nextActionDate: app.next_action_date || null,
                notes: app.notes || null,
                rejectionTags: app.rejection_tags || [],
                contactName: app.contact_name || null,
                learnings: app.learnings || null,
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

        // Table doesn't exist yet → empty state, not 500
        if (
            error?.code === '42P01' ||
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

// ────────────────────────────────────────────────
// PATCH: Update CRM fields (status, notes, tags, etc.)
// ────────────────────────────────────────────────

export async function PATCH(request: Request) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await request.json()

        // Validate with Zod
        const parsed = patchSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid request body", details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const { id, ...fields } = parsed.data

        const result = await updateApplicationCRM({
            id,
            userId: user.id,
            ...fields,
            status: fields.status as ApplicationStatus | undefined,
        })

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "Update failed" },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error("Error in PATCH /api/applications/history:", error)
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        )
    }
}
