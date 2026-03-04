import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/community/posts/[postId]/upvote — Toggle upvote
export async function POST(
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

        // Verify post exists
        const { data: post } = await supabase
            .from('community_posts')
            .select('id')
            .eq('id', postId)
            .maybeSingle();

        if (!post) {
            return NextResponse.json({ error: 'Post nicht gefunden' }, { status: 404 });
        }

        // Check existing upvote
        const { data: existing } = await supabase
            .from('community_upvotes')
            .select('user_id')
            .eq('user_id', user.id)
            .eq('post_id', postId)
            .maybeSingle();

        let upvoted: boolean;

        if (existing) {
            // Remove upvote
            const { error: deleteError } = await supabase
                .from('community_upvotes')
                .delete()
                .eq('user_id', user.id)
                .eq('post_id', postId);

            if (deleteError) {
                console.error('[community/upvote] delete error:', deleteError.message);
                return NextResponse.json({ error: 'Upvote konnte nicht entfernt werden' }, { status: 500 });
            }

            upvoted = false;
        } else {
            // Add upvote
            const { error: insertError } = await supabase
                .from('community_upvotes')
                .insert({ user_id: user.id, post_id: postId });

            if (insertError) {
                console.error('[community/upvote] insert error:', insertError.message);
                return NextResponse.json({ error: 'Upvote konnte nicht hinzugefuegt werden' }, { status: 500 });
            }

            upvoted = true;
        }

        // Read-back: count actual upvotes for accuracy
        const { count, error: countError } = await supabase
            .from('community_upvotes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId);

        const upvote_count = count ?? 0;

        // Sync cached count on the post
        if (!countError) {
            await supabase
                .from('community_posts')
                .update({ upvote_count })
                .eq('id', postId);
        }

        return NextResponse.json({ success: true, upvoted, upvote_count });
    } catch (err) {
        console.error('[community/upvote] unhandled:', err);
        return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
    }
}
