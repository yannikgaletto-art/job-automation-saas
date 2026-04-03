/**
 * Consent Recording API
 * 
 * §8: Auth Guard — userId derived from authenticated session, never from body.
 * DSGVO Art. 7: Consent must be traceable, timestamped, and attributable.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ConsentPayload {
    consents: Array<{
        document_type: 'privacy_policy' | 'terms_of_service' | 'ai_processing' | 'cookies'
        document_version: string
        consent_given: boolean
    }>
}

export async function POST(req: NextRequest) {
    try {
        // §8: Auth Guard — derive userId from session, never trust body
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body: ConsentPayload = await req.json()

        if (!body.consents || !Array.isArray(body.consents)) {
            return NextResponse.json(
                { error: 'Invalid request body' },
                { status: 400 }
            )
        }

        // Extract IP and User Agent for DSGVO audit trail
        const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
        const user_agent = req.headers.get('user-agent') || 'unknown'

        // §3: User-scoped — always use authenticated user.id
        const consentRecords = body.consents.map(consent => ({
            user_id: user.id,
            document_type: consent.document_type,
            document_version: consent.document_version,
            consent_given: consent.consent_given,
            ip_address,
            user_agent,
            consented_at: new Date().toISOString()
        }))

        const { data, error } = await supabaseAdmin
            .from('consent_history')
            .insert(consentRecords)
            .select()

        if (error) {
            console.error('[Consent] Insert error:', error)
            return NextResponse.json(
                { error: 'Failed to record consent', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            recorded: data.length,
            message: `Successfully recorded ${data.length} consent(s)`
        })

    } catch (error) {
        console.error('[Consent] Error recording consent:', error)
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

// GET: Retrieve consent history for the authenticated user
export async function GET() {
    try {
        // §8: Auth Guard
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // §3: User-scoped — only return own consent records
        const { data, error } = await supabaseAdmin
            .from('consent_history')
            .select('*')
            .eq('user_id', user.id)
            .order('consented_at', { ascending: false })

        if (error) {
            console.error('[Consent] Fetch error:', error)
            return NextResponse.json(
                { error: 'Failed to fetch consent history', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            consents: data
        })

    } catch (error) {
        console.error('[Consent] Error fetching consent history:', error)
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
