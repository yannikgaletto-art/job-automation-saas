-- ============================================================
-- QUOTE POOL — Curated quotes for Cover Letter injection
-- Migration: 20260329_quote_pool.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quote_pool (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme        TEXT NOT NULL,                     -- e.g. 'Innovation & Leadership'
  person       TEXT NOT NULL,                     -- e.g. 'Steve Jobs'
  quote_en     TEXT NOT NULL,                     -- Original / EN
  quote_de     TEXT NOT NULL,                     -- German translation
  context      TEXT,                              -- Source / context note
  role_keywords TEXT[] NOT NULL DEFAULT '{}',     -- e.g. '{"Product Owner","Lead Developer"}'
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast keyword matching
CREATE INDEX IF NOT EXISTS idx_quote_pool_role_keywords
  ON public.quote_pool USING GIN (role_keywords);

CREATE INDEX IF NOT EXISTS idx_quote_pool_theme
  ON public.quote_pool (theme);

-- RLS: quotes are global / read-only for all authenticated users
ALTER TABLE public.quote_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read quotes"
  ON public.quote_pool FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- Only service role / admin can insert/update
CREATE POLICY "Service role manages quotes"
  ON public.quote_pool FOR ALL
  TO service_role
  USING (TRUE);

-- ============================================================
-- SEED: 20 curated quotes from CSV
-- ============================================================
INSERT INTO public.quote_pool (theme, person, quote_en, quote_de, context, role_keywords) VALUES
(
  'Innovation & Leadership',
  'Steve Jobs',
  'Innovation distinguishes between a leader and a follower.',
  'Innovation unterscheidet einen Anführer von einem Mitläufer.',
  'The Innovation Secrets of Steve Jobs (Buch)',
  ARRAY['Führungsposition','Product Owner','Innovation Manager','CTO','Team Lead']
),
(
  'Software als Handwerk',
  'Bill Gates',
  'Software is a great combination between artistry and engineering.',
  'Software ist eine großartige Kombination aus Kunst und Ingenieurwesen.',
  'Rede / Zitatensammlung (Bill Gates Speaks)',
  ARRAY['Software Developer','Software Architect','Clean Code','Backend Engineer','Frontend Engineer']
),
(
  'Transformation & Wandel',
  'Satya Nadella',
  'Our industry does not respect tradition — it only respects innovation.',
  'Unsere Branche respektiert keine Tradition – sie respektiert nur Innovation.',
  'Antritts-E-Mail an Microsoft-Mitarbeiter (2014)',
  ARRAY['Change Management','Cloud Migration','Digital Transformation','CTO','IT Strategist']
),
(
  'Disruption & Digitalisierung',
  'Marc Andreessen',
  'Software is eating the world.',
  'Software frisst die Welt auf.',
  'Wall Street Journal Essay (2011)',
  ARRAY['SaaS','Vertrieb','Digital Strategy','Product Manager','Business Development']
),
(
  'Lieferfähigkeit (Execution)',
  'Linus Torvalds',
  'Talk is cheap. Show me the code.',
  'Reden ist billig. Zeig mir den Code.',
  'Linux Kernel Mailingliste (August 2000)',
  ARRAY['Software Developer','DevOps Engineer','Backend Engineer','Pragmatiker','Fullstack Engineer']
),
(
  'Agilität & Legacy',
  'Grace Hopper',
  'The most dangerous phrase in the language is, ''We''ve always done it this way.''',
  'Der gefährlichste Satz der Sprache ist: ''Das haben wir schon immer so gemacht.''',
  'US Navy Admiral & IT-Pionierin',
  ARRAY['Scrum Master','Agile Coach','IT-Projektmanager','Product Owner','Change Agent']
),
(
  'Zukunft der KI',
  'Sundar Pichai',
  'AI is probably the most important thing humanity has ever worked on.',
  'KI ist wahrscheinlich das Wichtigste, woran die Menschheit je gearbeitet hat.',
  'WEF Davos Interview (2020)',
  ARRAY['Data Scientist','Machine Learning Engineer','KI-Produktmanager','AI Engineer','Research Engineer']
),
(
  'Nutzer & Empathie',
  'Steve Jobs',
  'Technology is nothing. What''s important is that you have a faith in people.',
  'Technologie ist nichts. Das Wichtigste ist, dass man an die Menschen glaubt.',
  'Rolling Stone Interview (1994)',
  ARRAY['UX Designer','UI Designer','IT Support','Customer Success','Product Designer']
),
(
  'Produktentwicklung',
  'Reid Hoffman',
  'If you are not embarrassed by the first version of your product, you''ve launched too late.',
  'Wenn dir die erste Version deines Produkts nicht peinlich ist, hast du sie zu spät auf den Markt gebracht.',
  'LinkedIn Gründer, vielfach zitiert (Startup-Philosophie)',
  ARRAY['Product Owner','Startup','MVP','Product Manager','Entrepreneur']
),
(
  'Nutzerzentrierung (SaaS)',
  'Paul Graham',
  'Make something people want.',
  'Baut etwas, das die Leute wollen.',
  'Y Combinator Motto',
  ARRAY['Product Manager','SaaS','Vertrieb','Growth Manager','Customer Research']
),
(
  'Zukunft gestalten',
  'Alan Kay',
  'The best way to predict the future is to invent it.',
  'Der beste Weg, die Zukunft vorauszusagen, ist, sie zu erfinden.',
  'Xerox PARC Meeting (1971)',
  ARRAY['R&D','Innovation Lab','CTO','Research Engineer','Chief Innovation Officer']
),
(
  'Technik & Verantwortung',
  'Tim Cook',
  'Technology can do great things, but it does not want to do great things. It doesn''t want anything.',
  'Technologie kann Großartiges leisten, aber sie will nichts Großartiges leisten. Sie will gar nichts.',
  'MIT Commencement Speech (2017)',
  ARRAY['Tech Ethics','Data Privacy Officer','IT-Berater','Compliance','CISO']
),
(
  'Speed & Perfektionismus',
  'Sheryl Sandberg',
  'Done is better than perfect.',
  'Erledigt ist besser als perfekt.',
  'Buch: Lean In (2013) / Facebook Motto',
  ARRAY['Release Manager','IT Operations','Agile','Product Owner','Startup']
),
(
  'Empathie als IT-Skill',
  'Satya Nadella',
  'Empathy makes you a better innovator.',
  'Empathie macht dich zu einem besseren Innovator.',
  'Buch: Hit Refresh (2017)',
  ARRAY['Business Analyst','Customer Success Manager','IT/Business Interface','Product Manager','UX Researcher']
),
(
  'Kontinuierliche Anpassung',
  'Jeff Bezos',
  'In today''s era of volatility, there is no other way but to re-invent.',
  'In der heutigen Zeit der Volatilität gibt es keinen anderen Weg, als sich neu zu erfinden.',
  'Amazon Shareholder Letter',
  ARRAY['IT Transformation','E-Commerce','Digital Strategy','CTO','Change Management']
),
(
  'Umgang mit Wandel',
  'Elon Musk',
  'Some people don''t like change, but you need to embrace change if the alternative is disaster.',
  'Manche Menschen mögen keine Veränderungen, aber man muss Veränderungen annehmen, wenn die Alternative eine Katastrophe ist.',
  'Interview (2010)',
  ARRAY['IT Security','Krisenmanagement','IT-Restrukturierung','CTO','Risk Manager']
),
(
  'Kundenerwartungen übertreffen',
  'Larry Page',
  'Always deliver more than expected.',
  'Liefere immer mehr, als erwartet wird.',
  'Google Firmenphilosophie',
  ARRAY['IT-Consulting','Pre-Sales Engineer','Customer Support','Account Manager','Service Excellence']
),
(
  'Leadership & Empowerment',
  'Bill Gates',
  'As we look ahead into the next century, leaders will be those who empower others.',
  'Wenn wir auf das nächste Jahrhundert blicken, werden die Führungskräfte diejenigen sein, die andere befähigen.',
  'Forbes / Diverse Reden',
  ARRAY['Engineering Manager','Lead Developer','IT-Direktor','CTO','People Manager']
),
(
  'Daten & Information',
  'Carly Fiorina',
  'The goal is to turn data into information, and information into insight.',
  'Das Ziel ist es, Daten in Informationen und Informationen in Erkenntnisse zu verwandeln.',
  'Rede als HP CEO',
  ARRAY['Data Engineer','BI-Analyst','Database Administrator','Data Scientist','Analytics']
),
(
  'Einfachheit in der IT',
  'Steve Jobs',
  'Simple can be harder than complex: You have to work hard to get your thinking clean to make it simple.',
  'Einfach kann schwerer sein als komplex: Man muss hart arbeiten, um sein Denken so weit zu klären, dass es einfach wird.',
  'BusinessWeek Interview (1998)',
  ARRAY['Frontend Developer','Software Architect','Clean Code','UX Designer','Systems Designer']
);
