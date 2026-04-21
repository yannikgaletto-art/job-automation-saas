import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enrichCompany, linkEnrichmentToJob } from "@/lib/services/company-enrichment"
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash'

// Jina scrape (5-15s) + Claude extraction (3-5s) + DB write = needs 20-25s
export const maxDuration = 45;

export async function POST(req: NextRequest) {
    try {
        const { jobId, companyName, website, industry, description } = await req.json()

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

        const rateLimited = await checkUpstashLimit(rateLimiters.jobEnrich, user.id)
        if (rateLimited) return rateLimited

        // 1. Trigger enrichment with optional Steckbrief context (Stufe 0)
        const enrichContext = {
            website: website || undefined,
            industry: industry || undefined,
            description: description || undefined,
        };
        const enrichment = await enrichCompany(companyName, companyName, true, enrichContext)

        // 2. Link it to the job if an ID is returned
        if (enrichment.id) {
            await linkEnrichmentToJob(jobId, enrichment.id)
        }

        return NextResponse.json({ success: true, data: enrichment })
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error("❌ [API] /api/jobs/enrich err:", errMsg)
        return NextResponse.json(
            { error: errMsg || "Failed to enrich company" },
            { status: 500 }
        )
    }
}
