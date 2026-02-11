# Pathly V2.0 – ACTIONS (TACTICAL BACKLOG)

**Last updated:** 2026‑02‑11  
**Owner:** Yannik – Single source of truth für „What's next?“  

Dieses Dokument ist die **Taktik‑Ebene**: konkrete Tasks, die direkt AGENTS.md, Directives und die Architektur umsetzen.  
Strategie steht in `mission.md`, Systemdesign in `docs/ARCHITECTURE.md`, Agent‑Teamstruktur in `AGENTS.md`.

---

## 1. PRIORITY LEVELS

- **P0 – Critical Now**  
  Blockiert Kernfluss oder Sicherheit/DSGVO. Wird als Nächstes gemacht.

- **P1 – Important**  
  Stärkt Kernprodukt, aber nicht akut blockierend.

- **P2 – Nice‑to‑Have / Experiments**  
  Ideen, Optimierungen, Experimente.

Status‑Werte: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

---

## 2. CURRENT TOP‑LEVEL GOALS (NEXT 4–6 WEEKS)

1. **End‑to‑end Single‑Job Flow für Säule 1**:  
   „User gibt Job‑URL ein → Research → CV → Anschreiben → Review im Dashboard.“

2. **Stabile Research + Company‑Intel Pipeline** (DSGVO‑safe, ohne Halluzinationen).  

3. **MVP Automation (Säule 2)** mit kleinem, kontrolliertem Nutzerkreis.

---

## 3. ACTION TABLE

> Regel: Bevor du Code schreibst, prüfe, ob der Task schon hier steht. Wenn nicht: Eintragen.

| ID  | Priority | Area              | Task                                                                    | Status       | Notes |
|-----|----------|-------------------|-------------------------------------------------------------------------|-------------|-------|
| A01 | P0       | Agent 1 + DB      | `execution/scrape_job.py` an Supabase `job_queue` anbinden              | TODO        | Use RLS‑safe service role |
| A02 | P0       | Agent 3           | Perplexity‑Skill + `execution/research_company.py` mit real API‑Key testen | TODO    | Start mit Sandbox Company‑Liste |
| A03 | P0       | Agent 4+5 (Pillar1)| End‑to‑end Test: Job‑URL → Research → CV → CL → Anzeige im UI          | TODO        | Manuell mit 1 User durchspielen |
| A04 | P1       | Chrome Extension  | Minimum Flow: Approved Application → Form‑AutoFill auf einer Plattform  | TODO        | Start mit Greenhouse only |
| A05 | P1       | Observability     | Einfaches Logging‑Dashboard (Errors, Scrape‑Success‑Rate, API‑Kosten)   | TODO        | Kann als einfache Supabase View starten |
| A06 | P2       | UX                | Onboarding‑Flow, der Säule 1 vs Säule 2 erklärt                         | TODO        | Low‑fi, kann Text‑only sein |

Füge neue Zeilen unten an, ändere existierende nicht retrospektiv (stattdessen neue ID mit Verweis).

---

## 4. WORKFLOW FÜR DICH / FÜR AI‑AGENTEN

1. **Planung**  
   - Lies `mission.md` + `AGENTS.md`.  
   - Definiere 3–5 nächste Actions hier in `actions.md` (P0/P1).

2. **Umsetzung**  
   - Für jeden Task: prüfe passende **Directive** (`directives/*.md`).  
   - Implementiere/aktualisiere Script in `execution/` oder Skill in `skills/`.

3. **Abschluss**  
   - Setze Status auf `DONE`.  
   - Wenn es ein Meilenstein ist:
     - Aktualisiere `stats.md` (Metriken).  
     - Trage im passenden Projektlog (z.B. `past.md` falls vorhanden) ein.

---

## 5. CHANGELOG (ACTIONS)

- **2026‑02‑11** – Removed Owner column (solo project), unified project name to Pathly V2.0.
- **2026‑02‑11** – Initial draft mit Fokus auf: Pillar‑1‑Flow, Research‑Stabilität, MVP‑Automation.
