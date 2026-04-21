export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveHiringPersona } from '@/lib/services/hiring-manager-resolver';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';

/**
 * POST /api/cover-letter/resolve-personas
 * Resolves likely hiring managers from job description via Perplexity Sonar.
 *
 * Input: { jobDescription: string, companyName: string, contactPerson?: string }
 * Output: { personas: HiringPersona[] }
 *
 * Auth: Required (401 without session)
 * Correction #3: Missing/empty jobDescription → 400
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const rateLimited = await checkUpstashLimit(rateLimiters.resolvePersonas, user.id);
        if (rateLimited) return rateLimited;

        const body = await request.json() as {
            jobDescription?: string;
            companyName?: string;
            contactPerson?: string;
        };

        // Correction #3: Validate required fields
        if (!body.jobDescription || body.jobDescription.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Missing or empty jobDescription' },
                { status: 400 }
            );
        }

        if (!body.companyName || body.companyName.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Missing or empty companyName' },
                { status: 400 }
            );
        }

        const personas = await resolveHiringPersona(
            body.jobDescription,
            body.companyName,
            body.contactPerson,
        );

        return NextResponse.json({
            success: true,
            personas,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [resolve-personas] Error:', errMsg);
        return NextResponse.json(
            { success: false, error: errMsg },
            { status: 500 }
        );
    }
}
