export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/template
 * Saves the user's preferred CV template to user_profiles.
 * Auth-guarded per SICHERHEITSARCHITEKTUR.md §8.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface TemplateSelectionRequest {
    template_id: string
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body: TemplateSelectionRequest = await req.json()

        if (!body.template_id) {
            return NextResponse.json(
                { error: 'Missing template_id' },
                { status: 400 }
            )
        }

        // Update user_profiles — RLS ensures user can only update own row
        const { data, error } = await supabase
            .from('user_profiles')
            .update({
                preferred_cv_template: body.template_id,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)
            .select()

        if (error) {
            console.error('[onboarding/template] Update error:', error.message)
            return NextResponse.json(
                { error: 'Failed to update template selection' },
                { status: 500 }
            )
        }

        if (!data || data.length === 0) {
            console.warn('[onboarding/template] No profile found for user:', user.id)
            return NextResponse.json(
                { error: 'User profile not found' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            message: `Template selected: ${body.template_id}`
        })

    } catch (error) {
        console.error('[onboarding/template] Fatal:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
