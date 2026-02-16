import { createClient } from "@/lib/supabase/server"
import { trackApplication } from "@/lib/services/application-history"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    const supabase = await createClient()

    // 1. Get authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // 2. Parse request body
        const body = await request.json()
        const { jobUrl, companyName, companySlug, jobTitle, applicationMethod, generatedDocuments } = body

        // 3. Validate required fields
        if (!jobUrl || !companyName || !jobTitle) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        // 4. Call trackApplication()
        const result = await trackApplication({
            userId: user.id,
            jobUrl,
            companyName,
            companySlug,
            jobTitle,
            applicationMethod: applicationMethod || 'manual',
            generatedDocuments
        })

        if (!result.success) {
            if (result.error === "Duplicate application") {
                return NextResponse.json({
                    error: "Duplicate application",
                    details: result.duplicate
                }, { status: 409 })
            }
            throw new Error(result.error)
        }

        return NextResponse.json({ success: true }, { status: 201 })

    } catch (error: any) {
        console.error("Error in /api/applications/track:", error)
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
    }
}
