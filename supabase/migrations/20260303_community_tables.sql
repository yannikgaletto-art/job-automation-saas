-- ============================================================
-- Community Feature V1.1
-- Tables: community_profiles, community_posts, community_comments, community_upvotes
-- All with RLS enabled + per-operation policies
-- ============================================================

-- 1. community_profiles
CREATE TABLE IF NOT EXISTS community_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    skills TEXT[] DEFAULT '{}',
    learning_goals TEXT[] DEFAULT '{}',
    looking_for TEXT DEFAULT '',
    current_company TEXT DEFAULT '',
    linkedin_url TEXT DEFAULT '',
    onboarded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE community_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_profiles_select"
    ON community_profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "community_profiles_insert"
    ON community_profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_profiles_update"
    ON community_profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 2. community_posts
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_slug TEXT NOT NULL CHECK (community_slug IN ('skill-share', 'career', 'entrepreneurship')),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_type TEXT NOT NULL DEFAULT 'discussion' CHECK (post_type IN ('ask', 'offer', 'discussion', 'template')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    upvote_count INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('german', coalesce(title, '') || ' ' || coalesce(content, ''))
    ) STORED
);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_posts_select"
    ON community_posts FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "community_posts_insert"
    ON community_posts FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_posts_update"
    ON community_posts FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_posts_delete"
    ON community_posts FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_community_posts_slug ON community_posts (community_slug);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_upvotes ON community_posts (upvote_count DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_search ON community_posts USING GIN (search_vector);

-- 3. community_comments
CREATE TABLE IF NOT EXISTS community_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_comments_select"
    ON community_comments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "community_comments_insert"
    ON community_comments FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_comments_delete"
    ON community_comments FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_created ON community_comments (created_at);

-- 4. community_upvotes (junction table)
CREATE TABLE IF NOT EXISTS community_upvotes (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);

ALTER TABLE community_upvotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_upvotes_select"
    ON community_upvotes FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "community_upvotes_insert"
    ON community_upvotes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_upvotes_delete"
    ON community_upvotes FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- ============================================================
-- SEED DATA
-- SEED: Replace seed_user_id with a real user_id in production
-- ============================================================
DO $$
DECLARE
    seed_user_id UUID;
BEGIN
    SELECT id INTO seed_user_id FROM auth.users LIMIT 1;

    IF seed_user_id IS NULL THEN
        RAISE NOTICE 'No users found, skipping seed data';
        RETURN;
    END IF;

    INSERT INTO community_profiles (user_id, display_name, skills, looking_for)
    VALUES (seed_user_id, 'Pathly Team', ARRAY['Product Management', 'UX Design', 'TypeScript'], 'Community-Feedback')
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO community_posts (community_slug, user_id, post_type, title, content, tags) VALUES
    (
        'skill-share', seed_user_id, 'offer',
        'Biete UX Design Reviews fuer dein SaaS-Projekt',
        'Ich habe 5 Jahre Erfahrung im UX fuer B2B SaaS. Biete 30-Minuten Feedback-Sessions fuer Landing Pages, Onboarding Flows oder Dashboards. Schreib mir mit einem Screenshot.',
        ARRAY['UX', 'Design', 'SaaS']
    ),
    (
        'skill-share', seed_user_id, 'ask',
        'Suche React/Next.js Sparringspartner (remote)',
        'Arbeite gerade an einem Side Project und koennte regelmaessiges Code-Review vertragen. Ideal waere jemand mit 2+ Jahren Next.js und Interesse an Clean Architecture.',
        ARRAY['React', 'Next.js', 'Code Review']
    ),
    (
        'career', seed_user_id, 'discussion',
        'Wechsel von Consulting in Product Management -- Erfahrungen?',
        'Ich bin seit 3 Jahren im Consulting und ueberlege den Wechsel ins PM. Welche Skills aus dem Consulting sind uebertragbar und wo muss ich nachlegen?',
        ARRAY['Karrierewechsel', 'PM']
    ),
    (
        'career', seed_user_id, 'discussion',
        'Wie strukturiert ihr eure Bewerbungsphase?',
        'Ich bewerbe mich gerade bei ca. 10 Firmen parallel und verliere langsam den Ueberblick. Nutzt ihr Tracker, Kalender-Bloecke oder Google Sheets?',
        ARRAY['Bewerbung', 'Organisation']
    ),
    (
        'entrepreneurship', seed_user_id, 'discussion',
        'Solo-Founder oder Co-Founder? Vor- und Nachteile',
        'Stehe vor der Entscheidung: Alleine starten oder jemanden suchen. Was sind eure ehrlichen Erfahrungen?',
        ARRAY['Gruendung', 'Co-Founder']
    )
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Community seed data inserted for user %', seed_user_id;
END $$;
