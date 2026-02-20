# PATHLY V2.0 – STATS

**Last updated:** 2026‑02‑11  
**Owner:** Yannik – updated by founder or automation scripts  

Dieses Dokument ist die zentrale Übersicht über Produkt‑ und Systemmetriken.  
Es soll **kurz, zahlenfokussiert** sein – Detailanalysen gehören in Notion, Sheets oder Dashboards.

---

## 1. HOW TO UPDATE

- Manuell nach wichtigen Releases oder Experimenten, oder  
- Automatisch via Script (z.B. Supabase → CSV → Update), sobald das stabil ist.  
- Immer: Datum + Quelle der Zahlen dazuschreiben.

---

## 2. CORE PRODUCT METRICS

| Metric                             | Definition                                                | Target (H1 2026) | Current | Last updated | Source        |
|------------------------------------|-----------------------------------------------------------|------------------|---------|-------------|---------------|
| MAU (active job seekers)          | Nutzer mit ≥1 Bewerbung in letzten 30 Tagen              | 50               | 0       | 2026‑02‑11  | Supabase TBD  |
| Applications / active user / week | Durchschnitt aktive Bewerbungen pro User pro Woche       | 15+              | 0       | 2026‑02‑11  | Event logs    |
| Response rate                      | % Bewerbungen mit Antwort (Interview/Absage)             | 5–10%            | 0       | 2026‑02‑11  | User tracking |
| Time saved per application        | Selbstberichtete Zeiteinsparung vs. manuell (in Minuten) | 20+              | n/a     | 2026‑02‑11  | Surveys       |

> Hinweis: Bis echte Daten existieren, bleiben „Current“ und „Source“ bewusst leer oder 0.

---

## 3. FUNNEL METRICS

Wir betrachten den Funnel pro Job:

1. `scraped` → 2. `matched` → 3. `researched` → 4. `cv_optimized` →  
5. `cover_letter_generated` → 6. `ready_for_review` → 7. `ready_to_apply` → 8. `submitted` → 9. `responded`

| Stage                    | Symbol | Target Conversion (von vorheriger Stufe) | Current | Notes |
|--------------------------|--------|-------------------------------------------|---------|-------|
| Scraped → Matched        | S→M    | 30–50%                                    |         |       |
| Matched → Researched     | M→R    | 100% (alle gematchten Jobs)              |         |       |
| Researched → CV Opt.     | R→CV   | 90%+                                      |         |       |
| CV Opt. → CL Generated   | CV→CL  | 90%+                                      |         |       |
| CL Generated → Ready Rev | CL→RR  | 90%+                                      |         |       |
| Ready Rev → Ready Apply  | RR→RA  | 30–70% (User‑Filter)                      |         |       |
| Ready Apply → Submitted  | RA→S   | 80–100%                                   |         |       |
| Submitted → Responded    | S→Resp | 5–10%                                     |         |       |

Diese Tabelle wird später von einem Script befüllt (z.B. tägliche Aggregation).

---

## 4. QUALITY METRICS

### Writing Quality (Agent 5)

| Metric                            | Target       | Current | Notes |
|-----------------------------------|-------------|---------|-------|
| Ø Haiku Overall Score             | ≥ 8.5 / 10  |         |       |
| First‑Pass Approval Rate          | ≥ 50%       |         |       |
| Letters flagged `needs_review`    | < 20%       |         |       |
| Manuelle Heavy‑Edits pro Letter   | ↓ über Zeit |         |       |

### Research Quality (Agent 3)

| Metric                      | Target       | Current | Notes |
|-----------------------------|-------------|---------|-------|
| Cache Hit Rate              | ≥ 50%       |         |       |
| Fallback Rate (SERP)       | < 20%       |         |       |
| Gemeldete Halluzinationen   | 0           |         |       |

---

## 5. OPERATIONAL METRICS

| Metric                       | Target             | Current | Notes           |
|------------------------------|--------------------|---------|-----------------|
| Daily scrape runtime         | < 10 Minuten       |         |                 |
| API‑Costs / Bewerbung       | < 0.20 €           |         | grobe Schätzung |
| System uptime (dashboard)    | > 99% (Monatsbasis)|         |                 |

---

## 6. CHANGELOG (STATS)

- **2026‑02‑11** – Initial draft created, alle Werte auf 0/TBD gesetzt.
