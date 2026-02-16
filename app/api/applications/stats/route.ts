import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
    const supabase = await createClient()

    // 1. Get authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // 2. Fetch all-time count
        const { count: total, error: totalError } = await supabase
            .from("application_history")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)

        if (totalError) throw totalError

        // 3. Fetch last 7 days count
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const { count: last7Days, error: last7Error } = await supabase
            .from("application_history")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("applied_at", sevenDaysAgo.toISOString())

        if (last7Error) throw last7Error

        // 4. Fetch last 30 days count
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        const { count: last30Days, error: last30Error } = await supabase
            .from("application_history")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("applied_at", thirtyDaysAgo.toISOString())

        if (last30Error) throw last30Error

        return NextResponse.json({
            total: total || 0,
            last7Days: last7Days || 0,
            last30Days: last30Days || 0
        })

    } catch (error: any) {
        console.error("Error in /api/applications/stats:", error)
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
    }
}
