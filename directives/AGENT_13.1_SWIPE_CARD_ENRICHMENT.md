# AGENT_13.1 — Swipe Card Enrichment

**Version:** 1.0 | **Priority:** MEDIUM | **Status:** PLANNED
**Prerequisite:** This session completed Schritt 1 (Shell Card)

---

## Kontext & Ausgangslage

Die Swipe-Karte zeigt aktuell nur garantierte SerpAPI-Daten (Shell Card):
- Jobtitel, Company Name + Logo, Vollzeit/Berlin, "vor X Std", Description Snippet
- Die Enrichment-Pipeline (Jina → GPT Harvester → Claude Judge) wird beim
  Suchen nicht aufgerufen — nur nach Job-Queue-Add via Inngest.

---

## Was du NICHT tun sollst

- **Keinen `match_score_overall`** auf der Swipe-Karte — epistemisch unehrlich
- **Keine Stichpunkte**, wenn Scrape gescheitert/unvollständig war
- **Kein blockierender Spinner** — Karte muss sofort erscheinen

---

## Schritt 1 — Shell-Karte ✅ DONE

SerpAPI-Daten, die immer verfügbar sind:
- `title`, `company_name` + `thumbnail` (mit Initialen-Avatar Fallback)
- `detected_extensions.schedule_type` / `salary` / `work_from_home`
- `location`, `detected_extensions.posted_at`
- `description` — als `line-clamp-3` grauer Fließtext

---

## Schritt 2 — Confidence-aware Chips (nach Enrichment) — PLANNED

**a) Skills-Overlap (deterministisch, kein LLM)**
- `buzzwords[]` aus job_queue vs. Skills aus `user_profiles`
- Zeige nur echte Übereinstimmungen als Chips: `React` `TypeScript` `Figma`
- 0 Übereinstimmungen → Chips weglassen

**b) Seniority-Match (binär)**
- `seniority` vs. `experience_level` aus user_profiles
- Match → kein Badge | Mismatch → ⚠️ "Senior gefordert"

**c) Datenlage-Badge (Transparenz)**
- Scrape failed → grauer Badge "Begrenzte Jobdaten" + Tooltip
- LinkedIn-URLs → direkt "Begrenzte Jobdaten" (kein Scrape-Versuch)

---

## Schritt 3 — Progressive Enrichment via Inngest — PLANNED

1. Render sofort Shell-Karten für alle 10 Jobs
2. Feuere `job/swipe-enrich` für Jobs 1–3 (sichtbar)
3. Inngest → `deepScrapeJob()` + `harvestJobData()` → JSONB-Patch in `saved_job_searches`
4. Frontend via Supabase Realtime auf Row subscriben → Karte upgraded sich still
5. Jobs 4–10 enqueued wenn User zu Karte 3 wischt (Prefetch-Trigger)

---

## Technische Constraints

- `deepScrapeJob()` + `harvestJobData()` existieren in `lib/services/job-search-pipeline.ts`
- Inngest Client in `lib/inngest/client.ts`
- Supabase Realtime bereits konfiguriert
- `saved_job_searches.results` ist JSONB-Array
- Vercel Timeout: Inngest-Functions nicht betroffen
- LinkedIn URLs überspringen (Bot-Protection in `deepScrapeJob()`)

---

## Akzeptanzkriterien

- [ ] Karte erscheint sofort ohne Spinner, mit description-Snippet ✅
- [ ] Salary-Badge und Remote-Badge nur wenn Daten vorhanden ✅
- [ ] Skills-Chips zeigen nur echte CV-Übereinstimmungen
- [ ] "Begrenzte Jobdaten"-Badge wenn Scrape failed
- [ ] match_score_overall erscheint NICHT auf Swipe-Karte ✅
- [ ] Inngest-Enrichment läuft non-blocking im Hintergrund
- [ ] Karte updated sich live ohne Reload wenn Enrichment fertig
- [ ] Bei LinkedIn-URLs: kein Scrape, direkt "Begrenzte Jobdaten"
