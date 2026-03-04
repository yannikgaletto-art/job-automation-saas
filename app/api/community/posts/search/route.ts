import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/community/posts/search?q=<query>&slug=<optional>
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const q = searchParams.get('q');
        const slug = searchParams.get('slug');

        if (!q || q.trim().length < 2) {
            return NextResponse.json({ error: 'Suchbegriff muss mindestens 2 Zeichen haben' }, { status: 400 });
        }

        const sanitizedQuery = q.trim();

        // Full-text search using PostgreSQL tsvector
        let query = supabase
            .from('community_posts')
            .select('id, community_slug, user_id, post_type, title, content, tags, upvote_count, comment_count, created_at')
            .textSearch('search_vector', sanitizedQuery, {
                type: 'plain',
                config: 'german',
            });

        if (slug && ['skill-share', 'career', 'entrepreneurship'].includes(slug)) {
            query = query.eq('community_slug', slug);
        }

        query = query.limit(20);

        const { data: rawPosts, error: dbError } = await query;

        if (dbError) {
            console.error('[community/search] GET db error:', dbError.message);
            return NextResponse.json({ error: 'Suche fehlgeschlagen' }, { status: 500 });
        }

        // Batch-fetch profiles
        const searchUserIds = [...new Set((rawPosts ?? []).map((p: { user_id: string }) => p.user_id))];
        let searchProfileMap: Map<string, string> = new Map();
        if (searchUserIds.length > 0) {
            const { data: profiles } = await supabase
                .from('community_profiles')
                .select('user_id, display_name')
                .in('user_id', searchUserIds);
            if (profiles) {
                for (const p of profiles) {
                    searchProfileMap.set(p.user_id, p.display_name);
                }
            }
        }

        const posts = (rawPosts ?? []).map((p: Record<string, unknown>) => {
            return {
                id: p.id,
                community_slug: p.community_slug,
                user_id: p.user_id,
                post_type: p.post_type,
                title: p.title,
                content: p.content,
                tags: p.tags,
                upvote_count: p.upvote_count,
                comment_count: p.comment_count,
                created_at: p.created_at,
                display_name: searchProfileMap.get(p.user_id as string) ?? 'Anonym',
            };
        });

        return NextResponse.json({ success: true, data: posts });
    } catch (err) {
        console.error('[community/search] GET unhandled:', err);
        return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
    }
}
