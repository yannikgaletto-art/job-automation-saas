/**
 * Coaching Message API Route
 * Feature-Silo: coaching
 * 
 * POST: Send a user message and get AI coaching response
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendCoachingMessage } from '@/lib/services/coaching-service';
import type { SendMessageResponse } from '@/types/coaching';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';

// Vercel Serverless: Coaching calls Claude with multi-turn context
export const maxDuration = 60;

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Auth check (Contract 8)
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limit (Upstash Redis — 15 req/min, generous for chat)
        const rateLimited = await checkUpstashLimit(rateLimiters.coachingMessage, user.id);
        if (rateLimited) return rateLimited;

        const { id: sessionId } = await params;
        const { message } = await request.json();

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return NextResponse.json({ error: 'Nachricht darf nicht leer sein' }, { status: 400 });
        }

        // Send message through coaching service
        const result = await sendCoachingMessage(sessionId, user.id, message.trim());

        return NextResponse.json({
            aiMessage: result.aiMessage,
            hint: result.hint,
            turnNumber: result.turnNumber,
            isComplete: result.isComplete,
            tokensUsed: result.tokensUsed,
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [Coaching] Message error:`, message);

        if (message.includes('SESSION_NOT_FOUND')) {
            return NextResponse.json({ error: 'Session nicht gefunden' }, { status: 404 });
        }
        if (message.includes('SESSION_ENDED')) {
            return NextResponse.json({ error: 'Session ist bereits beendet' }, { status: 400 });
        }

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
