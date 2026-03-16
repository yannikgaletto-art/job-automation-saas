import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schema for blocks
const BlockSchema = z.object({
    id: z.string().uuid(),
    templateId: z.string().uuid().nullable(),
    title: z.string().min(1).max(100),
    durationSeconds: z.number().int().min(5).max(60),
    isRequired: z.boolean(),
    content: z.string().max(2000),
    sortOrder: z.number().int().min(0),
});

const SaveSchema = z.object({
    jobId: z.string().uuid(),
    blocks: z.array(BlockSchema),
    mode: z.enum(['teleprompter', 'bullets']),
    keywordsCovered: z.array(z.string()).optional().default([]),
    wpmSpeed: z.number().int().min(60).max(300).optional().default(130),
});

/**
 * PUT /api/video/scripts/save
 * 
 * Saves the user's script and validates structure (soft warnings).
 * Uses upsert on (user_id, job_id) — no [id] dynamic route needed.
 * 
 * Contracts: §8 (Auth Guard), §3 (user-scoped)
 */
export async function PUT(request: NextRequest) {
    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const parsed = SaveSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({
                error: 'Ungültige Daten',
                details: parsed.error.flatten().fieldErrors,
            }, { status: 400 });
        }

        const { jobId, blocks, mode, keywordsCovered, wpmSpeed } = parsed.data;
        const userId = user.id;

        // §3: Verify job ownership
        const { data: job } = await supabaseAdmin
            .from('job_queue')
            .select('id')
            .eq('id', jobId)
            .eq('user_id', userId)
            .single();

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Structure validation (soft warnings, no hard block)
        const warnings: string[] = [];
        const hasVorstellung = blocks.some(b => b.title === 'Vorstellung' || (b.isRequired && b.sortOrder === 0));
        const hasAbschluss = blocks.some(b => b.title === 'Abschluss' || (b.isRequired && b.sortOrder === blocks.length - 1));

        if (!hasVorstellung) {
            warnings.push('Block "Vorstellung" fehlt — Recruiter erwarten eine kurze Selbstvorstellung.');
        }
        if (!hasAbschluss) {
            warnings.push('Block "Abschluss" fehlt — Ein starker Abschluss hinterlässt einen bleibenden Eindruck.');
        }

        const totalDuration = blocks.reduce((sum, b) => sum + b.durationSeconds, 0);
        if (totalDuration > 75) {
            warnings.push(`Gesamtdauer ${totalDuration}s — das Video sollte max. 60 Sekunden lang sein.`);
        }
        if (totalDuration < 30) {
            warnings.push(`Gesamtdauer nur ${totalDuration}s — versuche mindestens 45 Sekunden zu füllen.`);
        }

        const emptyBlocks = blocks.filter(b => !b.content.trim());
        if (emptyBlocks.length > 0) {
            warnings.push(`${emptyBlocks.length} Block(s) ohne Inhalt: ${emptyBlocks.map(b => b.title).join(', ')}`);
        }

        // Upsert
        const { error: upsertError } = await supabaseAdmin
            .from('video_scripts')
            .upsert(
                {
                    user_id: userId,
                    job_id: jobId,
                    mode,
                    blocks,
                    keywords_covered: keywordsCovered,
                    wpm_speed: wpmSpeed,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,job_id', ignoreDuplicates: false }
            );

        if (upsertError) {
            console.error('❌ video/scripts/save upsert error:', upsertError.message);
            return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
        }

        // Read-back for response
        const { data: saved } = await supabaseAdmin
            .from('video_scripts')
            .select('id, mode, blocks, keywords_covered, wpm_speed, updated_at')
            .eq('user_id', userId)
            .eq('job_id', jobId)
            .single();

        return NextResponse.json({
            valid: warnings.length === 0,
            warnings,
            script: saved,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ video/scripts/save error=${errMsg}`);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
