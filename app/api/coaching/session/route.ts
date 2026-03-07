/**
 * Coaching Session API Route
 * Feature-Silo: coaching
 * 
 * POST: Create a new coaching session (with idempotency check)
 * GET:  Load session status + conversation history
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { analyzeGap } from '@/lib/services/coaching-gap-analyzer';
import { getInitialCoachingMessage } from '@/lib/services/coaching-service';
import { COACHING_PROMPT_VERSION } from '@/lib/prompts/coaching-system-prompt';
import type { CreateSessionResponse } from '@/types/coaching';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Self-healing: Ensure table exists ───────────────────────────────
let tableVerified = false;

async function ensureCoachingTable(): Promise<void> {
    if (tableVerified) return;

    const { error } = await supabaseAdmin.from('coaching_sessions').select('id').limit(1);
    if (!error) {
        tableVerified = true;
        return;
    }

    // Table doesn't exist — create it via raw SQL using supabase-js workaround
    // We create the table via an insert attempt pattern (the table DDL must be applied manually)
    console.warn('⚠️ [Coaching] coaching_sessions table not found. Attempting auto-creation...');

    // Use the Supabase Management API's SQL endpoint
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').replace('.supabase.co', '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const migrationSQL = `
        CREATE TABLE IF NOT EXISTS coaching_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
            session_status TEXT DEFAULT 'active' CHECK (session_status IN ('active', 'completed', 'abandoned')),
            conversation_history JSONB DEFAULT '[]'::jsonb,
            coaching_dossier JSONB,
            feedback_report TEXT,
            coaching_score INTEGER CHECK (coaching_score BETWEEN 1 AND 10),
            turn_count INTEGER DEFAULT 0,
            duration_seconds INTEGER,
            tokens_used INTEGER DEFAULT 0,
            cost_cents INTEGER DEFAULT 0,
            prompt_version TEXT DEFAULT 'v1',
            created_at TIMESTAMPTZ DEFAULT now(),
            completed_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_coaching_sessions_user ON coaching_sessions(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_coaching_sessions_job ON coaching_sessions(job_id);
        ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'coaching_sessions' AND policyname = 'Users own coaching sessions'
            ) THEN
                CREATE POLICY "Users own coaching sessions" ON coaching_sessions FOR ALL USING (auth.uid() = user_id);
            END IF;
        END $$;
    `;

    try {
        // Try the /pg endpoint (available on Supabase hosted)
        const pgRes = await fetch(`https://${projectRef}.supabase.co/pg/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ query: migrationSQL }),
        });

        if (pgRes.ok) {
            console.log('✅ [Coaching] Table auto-created successfully');
            tableVerified = true;
            return;
        }

        // Fallback: try the REST SQL endpoint
        const sqlRes = await fetch(`https://${projectRef}.supabase.co/rest/v1/rpc/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ query: migrationSQL }),
        });

        if (sqlRes.ok) {
            console.log('✅ [Coaching] Table auto-created via REST');
            tableVerified = true;
        } else {
            console.error('❌ [Coaching] Auto-creation failed. Please apply migration manually:');
            console.error(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`);
            console.error('   File: supabase/migrations/20260304_coaching_sessions.sql');
        }
    } catch (err) {
        console.error('❌ [Coaching] Migration error:', err);
    }
}

// ─── POST: Create Session ─────────────────────────────────────────────
export async function POST(request: Request) {
    try {
        // Self-healing: ensure table exists (graceful migration)
        await ensureCoachingTable();
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId, maxQuestions: requestedMax, interviewRound } = await request.json();
        if (!jobId) {
            return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
        }
        const maxQuestions = Math.min(Math.max(requestedMax || 5, 1), 5);
        const round = interviewRound || 'kennenlernen';

        // Idempotency check: return existing active session for this job
        const { data: existingSession } = await supabaseAdmin
            .from('coaching_sessions')
            .select('id, coaching_dossier, conversation_history')
            .eq('user_id', user.id)
            .eq('job_id', jobId)
            .eq('session_status', 'active')
            .maybeSingle();

        if (existingSession) {
            console.log(`✅ [Coaching] Returning existing active session: ${existingSession.id}`);
            return NextResponse.json({
                sessionId: existingSession.id,
                dossier: existingSession.coaching_dossier,
                firstQuestion: existingSession.conversation_history?.[0]?.content || '',
                existing: true,
            } satisfies CreateSessionResponse & { existing: boolean });
        }

        // Load job data (Contract 3: user-scoped)
        const { data: job, error: jobError } = await supabaseAdmin
            .from('job_queue')
            .select('id, job_title, company_name, description, requirements')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (jobError || !job) {
            return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
        }

        // Run gap analysis (5-15s)
        const { dossier, tokensUsed, costCents } = await analyzeGap(user.id, {
            jobTitle: job.job_title || 'Unbekannt',
            companyName: job.company_name || 'Unbekannt',
            description: job.description || '',
            requirements: job.requirements as Record<string, unknown> | null,
        }, round);

        // Create session
        const { data: session, error: insertError } = await supabaseAdmin
            .from('coaching_sessions')
            .insert({
                user_id: user.id,
                job_id: jobId,
                session_status: 'active',
                coaching_dossier: dossier,
                tokens_used: tokensUsed,
                cost_cents: costCents,
                max_questions: maxQuestions,
                interview_round: round,
                prompt_version: COACHING_PROMPT_VERSION,
            })
            .select('id')
            .single();

        if (insertError || !session) {
            console.error('❌ [Coaching] Failed to create session:', insertError?.message);
            return NextResponse.json({ error: 'Session konnte nicht erstellt werden' }, { status: 500 });
        }

        // Get initial coaching message (greeting + first question)
        const { aiMessage } = await getInitialCoachingMessage(session.id, user.id);

        console.log(`✅ [Coaching] Session created: ${session.id} for job ${jobId}`);

        return NextResponse.json({
            sessionId: session.id,
            dossier,
            firstQuestion: aiMessage,
            maxQuestions,
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ [Coaching] POST /api/coaching/session error:', message);

        if (message.includes('CV_NOT_FOUND')) {
            return NextResponse.json({
                error: 'Kein Lebenslauf gefunden. Bitte lade deinen CV in den Settings hoch.',
                code: 'CV_NOT_FOUND',
            }, { status: 404 });
        }

        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ─── GET: Load Session ────────────────────────────────────────────────
export async function GET(request: Request) {
    try {
        // Self-healing
        await ensureCoachingTable();
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('sessionId');

        if (!sessionId) {
            // List all sessions for this user
            const { data: sessions } = await supabaseAdmin
                .from('coaching_sessions')
                .select('id, job_id, session_status, coaching_score, turn_count, created_at, completed_at, feedback_report')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            return NextResponse.json({ sessions: sessions || [] });
        }

        // Load specific session
        const { data: session, error } = await supabaseAdmin
            .from('coaching_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (error || !session) {
            return NextResponse.json({ error: 'Session nicht gefunden' }, { status: 404 });
        }

        return NextResponse.json({ session });

    } catch (error) {
        console.error('❌ [Coaching] GET error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
