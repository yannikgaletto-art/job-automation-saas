export const dynamic = 'force-dynamic';

/**
 * /api/tasks
 * GET  — Fetch today's tasks + carry-over tasks
 * POST — Create new task
 * PATCH — Update task (schedule, progress, status)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── GET: Fetch today's tasks + carry-overs ──────────────────────

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const today = new Date().toISOString().split('T')[0];
        const todayStart = `${today}T00:00:00.000Z`;
        const todayEnd = `${today}T23:59:59.999Z`;

        // Fetch: inbox tasks + today's scheduled + carry-overs for today
        const { data: tasks, error } = await supabaseAdmin
            .from('tasks')
            .select('*')
            .eq('user_id', user.id)
            .or(
                `status.eq.inbox,` +
                `and(scheduled_start.gte.${todayStart},scheduled_start.lte.${todayEnd}),` +
                `and(status.eq.carry_over,carry_over_to.eq.${today})`
            )
            .order('created_at', { ascending: true });

        if (error) {
            console.error('❌ [Tasks] Fetch error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, tasks: tasks || [] });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}

// ─── POST: Create new task ───────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { title, estimated_minutes, job_queue_id, source } = body;

        if (!title?.trim()) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        // Validate source field
        const validSource = source === 'pulse' ? 'pulse' : 'manual';

        const { data: task, error } = await supabaseAdmin
            .from('tasks')
            .insert({
                user_id: user.id,
                title: title.trim(),
                estimated_minutes: estimated_minutes || 60,
                job_queue_id: job_queue_id || null,
                status: 'inbox',
                source: validSource,
            })
            .select('*')
            .single();

        if (error) {
            console.error('❌ [Tasks] Insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, task }, { status: 201 });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}

// ─── PATCH: Update task ──────────────────────────────────────────

export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
        }

        // Allowed fields
        const allowed = [
            'title', 'estimated_minutes', 'status', 'scheduled_start', 'scheduled_end',
            'pomodoros_completed', 'notes', 'completed_at', 'progress_percent',
            'progress_note', 'carry_over_to', 'carry_over_count', 'source',
        ];
        const safeUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (key in updates) safeUpdates[key] = updates[key];
        }

        const { data: task, error } = await supabaseAdmin
            .from('tasks')
            .update(safeUpdates)
            .eq('id', id)
            .eq('user_id', user.id)
            .select('*')
            .single();

        if (error) {
            console.error('❌ [Tasks] Update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, task });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}

// ─── DELETE: Remove task ────────────────────────────────────────

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('tasks')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
