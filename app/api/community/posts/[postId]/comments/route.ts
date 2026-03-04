import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const commentSchema = z.object({
    content: z.string().min(1, 'Kommentar darf nicht leer sein').max(2000, 'Kommentar darf maximal 2000 Zeichen haben'),
});

// GET /api/community/posts/[postId]/comments
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ postId: string }> }
) {
    try {
        const { postId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!postId) {
            return NextResponse.json({ error: 'postId ist erforderlich' }, { status: 400 });
        }

        const { data: comments, error: dbError } = await supabase
            .from('community_comments')
            .select('id, post_id, user_id, content, created_at')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (dbError) {
            console.error('[community/comments] GET db error:', dbError.message);
            return NextResponse.json({ error: 'Kommentare konnten nicht geladen werden' }, { status: 500 });
        }

        // Batch-fetch display_names for comment authors
        const commentUserIds = [...new Set((comments ?? []).map((c: { user_id: string }) => c.user_id))];
        let commentProfileMap: Map<string, string> = new Map();
        if (commentUserIds.length > 0) {
            const { data: profiles } = await supabase
                .from('community_profiles')
                .select('user_id, display_name')
                .in('user_id', commentUserIds);
            if (profiles) {
                for (const p of profiles) {
                    commentProfileMap.set(p.user_id, p.display_name);
                }
            }
        }

        const flatComments = (comments ?? []).map((c: Record<string, unknown>) => {
            return {
                id: c.id,
                post_id: c.post_id,
                user_id: c.user_id,
                content: c.content,
                created_at: c.created_at,
                display_name: commentProfileMap.get(c.user_id as string) ?? 'Anonym',
            };
        });

        return NextResponse.json({ success: true, data: flatComments });
    } catch (err) {
        console.error('[community/comments] GET unhandled:', err);
        return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
    }
}

// POST /api/community/posts/[postId]/comments — With Zod + double-assurance + comment_count
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ postId: string }> }
) {
    try {
        const { postId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!postId) {
            return NextResponse.json({ error: 'postId ist erforderlich' }, { status: 400 });
        }

        const body = await req.json();
        const parsed = commentSchema.safeParse(body);

        if (!parsed.success) {
            const firstError = parsed.error.errors[0]?.message ?? 'Ungueltige Eingabedaten';
            return NextResponse.json({ error: firstError }, { status: 400 });
        }

        // Verify post exists
        const { data: post } = await supabase
            .from('community_posts')
            .select('id')
            .eq('id', postId)
            .maybeSingle();

        if (!post) {
            return NextResponse.json({ error: 'Post nicht gefunden' }, { status: 404 });
        }

        // Verify user has a community profile
        const { data: profile } = await supabase
            .from('community_profiles')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json(
                { error: 'Community-Profil erforderlich zum Kommentieren.' },
                { status: 403 }
            );
        }

        const { data: comment, error: insertError } = await supabase
            .from('community_comments')
            .insert({
                post_id: postId,
                user_id: user.id,
                content: parsed.data.content.trim(),
            })
            .select()
            .single();

        if (insertError || !comment) {
            console.error('[community/comments] POST insert error:', insertError?.message);
            return NextResponse.json({ error: 'Kommentar konnte nicht erstellt werden' }, { status: 500 });
        }

        // Double-assurance: read-back with profile JOIN for display_name
        const { data: verified, error: readBackError } = await supabase
            .from('community_comments')
            .select(`
                id,
                post_id,
                user_id,
                content,
                created_at,
                community_profiles ( display_name )
            `)
            .eq('id', comment.id)
            .single();

        if (readBackError || !verified) {
            console.error('[community/comments] POST read-back failed:', readBackError?.message);
            return NextResponse.json({ error: 'Kommentar-Verifizierung fehlgeschlagen' }, { status: 500 });
        }

        const verifiedProfile = (verified as Record<string, unknown>).community_profiles as { display_name: string } | null;
        const flatComment = {
            id: verified.id,
            post_id: verified.post_id,
            user_id: verified.user_id,
            content: verified.content,
            created_at: verified.created_at,
            display_name: verifiedProfile?.display_name ?? 'Anonym',
        };

        // Increment comment_count on the post
        const { count } = await supabase
            .from('community_comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId);

        if (count !== null) {
            await supabase
                .from('community_posts')
                .update({ comment_count: count })
                .eq('id', postId);
        }

        return NextResponse.json({ success: true, data: flatComment });
    } catch (err) {
        console.error('[community/comments] POST unhandled:', err);
        return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
    }
}
