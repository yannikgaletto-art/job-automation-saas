import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enrichCompany, linkEnrichmentToJob } from "@/lib/services/company-enrichment"

export async function POST(req: NextRequest) {
    try {
        const { jobId, companyName } = await req.json()

        if (!jobId || !companyName) {
            return NextResponse.json(
                { error: "jobId and companyName are required" },
                { status: 400 }
            )
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // 1. Trigger enrichment (fetch from Perplexity / Cache)
        const enrichment = await enrichCompany(companyName, companyName, true) // Force refresh so it attempts to fetch

        // 2. Link it to the job if an ID is returned
        if (enrichment.id) {
            await linkEnrichmentToJob(jobId, enrichment.id)
        }

        return NextResponse.json({ success: true, data: enrichment })
    } catch (error: any) {
        console.error("❌ [API] /api/jobs/enrich err:", error)
        return NextResponse.json(
            { error: error.message || "Failed to enrich company" },
            { status: 500 }
        )
    }
}
