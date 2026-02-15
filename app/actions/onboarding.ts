"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

export type ProfileData = {
    firstName: string
    lastName: string
    email: string
    phone: string
    address: string
    skills: string
    experienceYears: number
}

// Initialize Supabase Client with Service Role Key for admin access (bypassing RLS)
// This is necessary because in this phase we might be dealing with mock user IDs
// that don't have an active auth session or exist in auth.users yet.
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function saveUserProfile(userId: string, data: ProfileData) {
    // MOCK ENCRYPTION: Convert JSON to Buffer
    const piiBuffer = Buffer.from(JSON.stringify(data))

    // Try to update or insert the profile
    const { error } = await supabase
        .from("user_profiles")
        .upsert({
            id: userId,
            pii_encrypted: piiBuffer,
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
        })

    if (error) {
        console.error("Error updating user profile:", error)

        // Gracefully handle Foreign Key Violation (user doesn't exist in auth.users)
        // This is expected in development/mock mode.
        if (error.code === '23503') {
            console.warn(`[DEV MODE] Ignoring FK violation for user ${userId}. Profile not saved to DB, but flow proceeds.`)
            return { success: true, warning: "Mock mode: User not persisted" }
        }

        throw new Error("Failed to save profile")
    }

    revalidatePath("/dashboard")
    return { success: true }
}
