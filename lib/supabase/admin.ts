/**
 * Supabase Admin Client — Centralized Singleton
 * Feature-Silo: shared infrastructure
 *
 * Single admin client for all server-side operations.
 * Uses service role key — bypasses RLS.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminInstance: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
    if (!adminInstance) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !key) {
            throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        }

        adminInstance = createClient(url, key, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    return adminInstance;
}
