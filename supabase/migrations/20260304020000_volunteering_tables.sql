-- ============================================================================
-- VOLUNTEERING TABLES — Ehrenamt Feature (Phase 1)
-- ============================================================================
-- Drei Tabellen: Opportunities (gescrapt), Bookmarks (user-spezifisch), Votes (Kategorie-Vorschläge)
-- RLS auf ALLEN Tabellen. Opportunities: public read. Bookmarks + Votes: user-scoped.
-- ============================================================================

-- 1. Gescrapte Ehrenamt-Opportunities
CREATE TABLE IF NOT EXISTS volunteering_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  organization TEXT NOT NULL,
  category TEXT NOT NULL,           -- 'social', 'environment', 'education', 'health', 'culture'
  city TEXT,
  url TEXT NOT NULL,
  source TEXT NOT NULL,             -- 'vostel', 'gute-tat', 'stadtmission', 'obdachlosenhilfe', 'dsee'
  commitment_type TEXT,             -- 'einmalig', 'regelmaessig', 'flexibel'
  skills_tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. User-Bookmarks + Status-Tracking
CREATE TABLE IF NOT EXISTS volunteering_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES volunteering_opportunities(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'saved',      -- 'saved', 'contacted', 'active', 'completed'
  hours_logged NUMERIC(5,1) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Category Voting (User schlagen neue Bereiche vor)
CREATE TABLE IF NOT EXISTS volunteering_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_suggestion TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category_suggestion)
);

-- ============================================================================
-- RLS (PFLICHT — SICHERHEITSARCHITEKTUR §3)
-- ============================================================================

ALTER TABLE volunteering_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteering_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteering_votes ENABLE ROW LEVEL SECURITY;

-- Opportunities: everyone can read, only service role can insert/update
CREATE POLICY "Public read volunteering_opportunities"
  ON volunteering_opportunities FOR SELECT USING (true);

-- Bookmarks: user sees only own data
CREATE POLICY "Users manage own volunteering_bookmarks"
  ON volunteering_bookmarks FOR ALL USING (auth.uid() = user_id);

-- Votes: user sees only own data
CREATE POLICY "Users manage own volunteering_votes"
  ON volunteering_votes FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vol_opp_city ON volunteering_opportunities(city);
CREATE INDEX IF NOT EXISTS idx_vol_opp_category ON volunteering_opportunities(category);
CREATE INDEX IF NOT EXISTS idx_vol_opp_source ON volunteering_opportunities(source);
CREATE INDEX IF NOT EXISTS idx_vol_opp_active ON volunteering_opportunities(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_vol_bookmarks_user ON volunteering_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_vol_bookmarks_opp ON volunteering_bookmarks(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_vol_votes_user ON volunteering_votes(user_id);

-- Unique constraint for dedup during scraping (upsert by URL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vol_opp_url ON volunteering_opportunities(url);

-- ============================================================================
-- SEED DATA — Initial Opportunities (reale Angebote als Startdaten)
-- ============================================================================

INSERT INTO volunteering_opportunities (title, description, organization, category, city, url, source, commitment_type, skills_tags) VALUES
-- Soziales (verified URLs)
('Ehrenamtliches Engagement bei der Berliner Tafel', 'Unterstuetze die Berliner Tafel bei der Lebensmittelrettung und -verteilung. Gemeinsam gegen Lebensmittelverschwendung und fuer Menschen in Not.', 'Berliner Tafel e.V.', 'social', 'Berlin', 'https://www.berliner-tafel.de/mitmachen/', 'gute-tat', 'regelmaessig', ARRAY['kochen', 'teamarbeit', 'organisation']),
('Einsatz in der Johanniter-Notuebernachtung Ohlauer 365', 'Ehrenamtlicher Einsatz in der Notuebernachtung fuer obdachlose Menschen. Betreuung und Versorgung in der Nacht.', 'Johanniter-Unfall-Hilfe e.V.', 'social', 'Berlin', 'https://vostel.de/de/volunteering/projects/1086_Johanniter-Unfall-Hilfe-e-V-Regionalverband-Berlin_Einsatz-in-der-Johanniter-Notuebernachtung-Ohlauer-365_Berlin', 'vostel', 'einmalig', ARRAY['obdachlosenhilfe', 'betreuung', 'nachtschicht']),
('Ehrenamt bei der Berliner Stadtmission', 'Unterstuetze Kinder, Jugendliche, Senioren, Wohnungslose und Gefluechtete. Vielfaeltige Einsatzmoeglichkeiten.', 'Berliner Stadtmission', 'social', 'Berlin', 'https://www.berliner-stadtmission.de/ehrenamt/vermittlung', 'stadtmission', 'regelmaessig', ARRAY['betreuung', 'sozialarbeit', 'empathie']),
('Bruecken bauen: Gemeinsamkeiten entdecken', 'Familien aus verschiedenen Kulturen zusammenbringen. Gemeinsame Aktivitaeten und Austausch foerdern.', 'oskar Freiwilligenagentur Lichtenberg', 'social', 'Berlin', 'https://vostel.de/de/volunteering/projects/12954_oskar-freiwilligenagentur-lichtenberg_Bruecken-bauen-Gemeinsamkeiten-entdecken-Familien-kommen-zusammen-ID-120411_Berlin', 'vostel', 'regelmaessig', ARRAY['integration', 'familie', 'kommunikation']),
-- Umwelt (verified URLs)
('Rette Kleidung beim Berliner Halbmarathon', 'Hilf beim Einsammeln und Sortieren zurueckgelassener Kleidung beim Berliner Halbmarathon. Nachhaltigkeit trifft Sport.', 'Berliner Stadtmission', 'environment', 'Berlin', 'https://www.berliner-stadtmission.de/ehrenamt/ehrenamt-im-team', 'stadtmission', 'einmalig', ARRAY['nachhaltigkeit', 'umwelt', 'recycling']),
('Ehrenamt fuer Nachhaltigkeit bei Gute-Tat', 'Engagiere dich in einem der vielfaeltigen Umwelt- und Nachhaltigkeitsprojekte der Stiftung Gute-Tat.', 'Stiftung Gute-Tat', 'environment', 'Berlin', 'https://www.gute-tat.de/ehrenamt/', 'gute-tat', 'flexibel', ARRAY['nachhaltigkeit', 'umwelt', 'natur']),
-- Bildung (verified URLs)
('Einzelbegleitung von Kindern und Jugendlichen mit Behinderung', 'Regelmaessige individuelle Begleitung und Unterstuetzung von Kindern und Jugendlichen mit Beeintraechtigung.', 'Einhorn gGmbH', 'education', 'Berlin', 'https://vostel.de/de/volunteering/projects/11222_Einhorn-im-Kiez-Unterstuetzungsangebote-fuer-Familien-mit-pflegebeduerftigen-Kindern-der-Einhorn-gGmbH_Regelmaessige-individuelle-Einzelbegleitung-von-Kindern-und-Jugendlichen-mit-Behinderung_Berlin', 'vostel', 'regelmaessig', ARRAY['bildung', 'betreuung', 'inklusion', 'kinder']),
('NesT - Neustart im Team: Gefluechteten helfen', 'Unterstuetze Gefluechtete beim Ankommen in Deutschland. Mentoring, Sprachpraxis und Alltagsbegleitung.', 'NesT - Neustart im Team', 'education', 'Berlin', 'https://vostel.de/de/volunteering/projects/9722_NesT-Neustart-im-Team_NesT-Neustart-im-Team', 'vostel', 'regelmaessig', ARRAY['bildung', 'sprache', 'integration', 'mentoring']),
-- Gesundheit (verified URLs)
('Ehrenamtliche Reisebegleitung fuer hilfsbeduerftige Menschen', 'Ermoeglicht hilfs- und pflegebeduerftige Menschen einen schoenen Urlaub als ehrenamtliche Reisebegleitung.', 'Verschiedene Traeger', 'health', 'Berlin', 'https://vostel.de/de/volunteering/projects', 'vostel', 'einmalig', ARRAY['gesundheit', 'empathie', 'betreuung']),
('Freie Einsatzstellen bei der Stadtmission', 'Vielfaeltige Moeglichkeiten sich im Gesundheitsbereich zu engagieren: Besuchsdienste, Begleitung, Betreuung.', 'Berliner Stadtmission', 'health', 'Berlin', 'https://www.berliner-stadtmission.de/ehrenamt/vermittlung', 'stadtmission', 'regelmaessig', ARRAY['gesundheit', 'pflege', 'senioren']),
-- Kultur (verified URLs)
('Ehrenamt im Team: Gemeinsam Gutes tun', 'Engagiert euch als Gruppe oder Firma bei sozialen und kulturellen Projekten in Berlin.', 'Berliner Stadtmission', 'culture', 'Berlin', 'https://www.berliner-stadtmission.de/ehrenamt/ehrenamt-im-team', 'stadtmission', 'flexibel', ARRAY['kultur', 'teamarbeit', 'event']),
('Finde dein Ehrenamt bei vostel.de', 'Entdecke hunderte von Ehrenamtsprojekten in Berlin und ganz Deutschland. Kultur, Bildung, Soziales und mehr.', 'vostel.de', 'culture', 'Berlin', 'https://vostel.de/de/volunteering/projects', 'vostel', 'flexibel', ARRAY['kultur', 'kommunikation', 'vielfalt'])
ON CONFLICT (url) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  organization = EXCLUDED.organization,
  category = EXCLUDED.category,
  skills_tags = EXCLUDED.skills_tags,
  scraped_at = now();
