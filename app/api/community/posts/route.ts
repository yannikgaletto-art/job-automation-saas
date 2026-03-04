import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const VALID_SLUGS = ['skill-share', 'career', 'entrepreneurship'] as const;
const VALID_POST_TYPES = ['ask', 'offer', 'discussion', 'template'] as const;
const VALID_SORT = ['recent', 'popular', 'unanswered'] as const;

const createPostSchema = z.object({
    community_slug: z.enum(VALID_SLUGS),
    post_type: z.enum(VALID_POST_TYPES).default('discussion'),
    title: z.string().min(3, 'Titel muss mindestens 3 Zeichen haben').max(200, 'Titel darf maximal 200 Zeichen haben'),
    content: z.string().min(10, 'Inhalt muss mindestens 10 Zeichen haben').max(5000, 'Inhalt darf maximal 5000 Zeichen haben'),
    tags: z.array(z.string().max(30)).max(10).optional(),
});

// GET /api/community/posts
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const slug = searchParams.get('slug');
        const postType = searchParams.get('post_type');
        const tag = searchParams.get('tag');
        const sort = searchParams.get('sort') || 'recent';
        const limitParam = parseInt(searchParams.get('limit') || '50', 10);
        const limit = Math.min(Math.max(1, limitParam), 100);

        if (!slug || !VALID_SLUGS.includes(slug as typeof VALID_SLUGS[number])) {
            return NextResponse.json({ error: 'Ungueltiger oder fehlender slug-Parameter' }, { status: 400 });
        }

        // Build query (no embedded JOIN — profiles fetched separately)
        let query = supabase
            .from('community_posts')
            .select(`
        id,
        community_slug,
        user_id,
        post_type,
        title,
        content,
        tags,
        upvote_count,
        comment_count,
        created_at
      `)
            .eq('community_slug', slug);

        // Optional filters
        if (postType && VALID_POST_TYPES.includes(postType as typeof VALID_POST_TYPES[number])) {
            query = query.eq('post_type', postType);
        }

        if (tag && typeof tag === 'string' && tag.trim()) {
            query = query.contains('tags', [tag.trim()]);
        }

        // Sort
        if (sort === 'popular') {
            query = query.order('upvote_count', { ascending: false }).order('created_at', { ascending: false });
        } else if (sort === 'unanswered') {
            query = query.eq('comment_count', 0).order('created_at', { ascending: false });
        } else {
            query = query.order('created_at', { ascending: false });
        }

        query = query.limit(limit);

        const { data: rawPosts, error: dbError } = await query;

        if (dbError) {
            console.error('[community/posts] GET db error:', dbError.message);
            return NextResponse.json({ error: 'Posts konnten nicht geladen werden' }, { status: 500 });
        }

        const postsList = rawPosts ?? [];
        const postIds = postsList.map((p: { id: string }) => p.id);
        const userIds = [...new Set(postsList.map((p: { user_id: string }) => p.user_id))];

        // Batch-fetch profiles for all post authors
        let profileMap: Map<string, { display_name: string; skills: string[] }> = new Map();
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('community_profiles')
                .select('user_id, display_name, skills')
                .in('user_id', userIds);

            if (profiles) {
                for (const p of profiles) {
                    profileMap.set(p.user_id, { display_name: p.display_name, skills: p.skills ?? [] });
                }
            }
        }

        // Check which posts the current user has upvoted
        let userUpvotes: Set<string> = new Set();
        if (postIds.length > 0) {
            const { data: upvoteRows } = await supabase
                .from('community_upvotes')
                .select('post_id')
                .eq('user_id', user.id)
                .in('post_id', postIds);

            if (upvoteRows) {
                userUpvotes = new Set(upvoteRows.map((r: { post_id: string }) => r.post_id));
            }
        }

        // Flatten response
        const posts = postsList.map((p: Record<string, unknown>) => {
            const profile = profileMap.get(p.user_id as string);
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
                display_name: profile?.display_name ?? 'Anonym',
                author_skills: profile?.skills ?? [],
                user_has_upvoted: userUpvotes.has(p.id as string),
            };
        });

        return NextResponse.json({ success: true, data: posts, total: posts.length });
    } catch (err) {
        console.error('[community/posts] GET unhandled:', err);
        return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
    }
}

// POST /api/community/posts — Create with Zod + double-assurance
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const parsed = createPostSchema.safeParse(body);

        if (!parsed.success) {
            const firstError = parsed.error.errors[0]?.message ?? 'Ungueltige Eingabedaten';
            return NextResponse.json({ error: firstError }, { status: 400 });
        }

        const { community_slug, post_type, title, content, tags } = parsed.data;

        // Profile check
        const { data: profile } = await supabase
            .from('community_profiles')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (!profile) {
            return NextResponse.json(
                { error: 'Community-Profil erforderlich. Erstelle zuerst ein Profil.' },
                { status: 403 }
            );
        }

        const { data: post, error: insertError } = await supabase
            .from('community_posts')
            .insert({
                community_slug,
                user_id: user.id,
                post_type,
                title: title.trim(),
                content: content.trim(),
                tags: tags ?? [],
            })
            .select()
            .single();

        if (insertError || !post) {
            console.error('[community/posts] POST insert error:', insertError?.message);
            return NextResponse.json({ error: 'Post konnte nicht erstellt werden' }, { status: 500 });
        }

        // Double-assurance: read-back
        const { data: verified, error: readBackError } = await supabase
            .from('community_posts')
            .select('*')
            .eq('id', post.id)
            .single();

        if (readBackError || !verified) {
            console.error('[community/posts] POST read-back failed:', readBackError?.message);
            return NextResponse.json({ error: 'Post-Verifizierung fehlgeschlagen' }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: verified });
    } catch (err) {
        console.error('[community/posts] POST unhandled:', err);
        return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
    }
}
