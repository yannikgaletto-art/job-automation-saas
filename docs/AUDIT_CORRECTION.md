---
# AUDIT_CORRECTION — Pathly Änderungsprotokoll
> Jede strukturelle Änderung am Repo wird hier protokolliert.
> Dieses Dokument ist die Rückverfolgbarkeit bei Problemen.
> Format: Datum | Was | Warum | Vorher | Nachher

---

## 2026-02-24 — Initiale Bereinigung (Audit-basiert)

### Gelöscht
| Datei | Grund | Zuletzt aktiv |
|-------|-------|--------------|
| delete_dummies.ts | Ad-hoc Script, kein Import | Nie |
| get-db.ts | Ad-hoc DB Debug-Script, ersetzt durch lib/supabase/server.ts | 2026-02-20 |
| query_db.js | Ad-hoc Suche, kein Import | 2026-02-24 |
| test-ingest.js | Test-Script, kein Import | Nie |
| test-jobs.ts | Debug-Script, kein Import | 2026-02-20 |
| test_apis.py | Python in TS-Projekt, kein Import | Nie |
| test_env.py | Python in TS-Projekt, kein Import | Nie |
| test_query.sql | Einzeilige SQL-Query, kein Nutzen | 2026-02-24 |
| sql-steckbrief.md | Migration existiert als 013_add_steckbrief_columns.sql | 2026-02-20 |
| sql-steckbrief.txt | Duplikat von sql-steckbrief.md | 2026-02-20 |
| .next_dev_log.txt | Dev-Server-Log (1.3 MB), in .gitignore aufgenommen | Auto-generiert |
| stats.md | Alle Werte 0/TBD, kein Nutzen | 2026-02-20 |
| BRIEFING-REVIEW.md | Handover-Dok, nach 4 Tagen überholt | 2026-02-20 |
| directives/AGENT_2.1_COMPANY_RESEARCH.md | Veraltet, ersetzt durch directives/company_research.md | Unbekannt |
| directives/AGENT_3.1_COMPANY_RESEARCH.md | Veraltet, ersetzt durch directives/company_research.md | Unbekannt |
| components/company-research-card.tsx | Null Imports, ersetzt durch components/company/company-intel-card.tsx | Unbekannt |

### Verschoben
| Von | Nach | Grund |
|-----|------|-------|
| FLUID_MOTION_COMPLETE.md (Root) | docs/MOTION_PRINCIPLES.md | Motion-Referenz gehört in docs/, nicht Root |

### In .gitignore aufgenommen
| Eintrag | Grund |
|---------|-------|
| .next_dev_log.txt | Wird automatisch generiert, gehört nicht ins Repo |

---
## Offen — Noch nicht umgesetzt (Warten auf Prompt 2+3)
- [x] ARCHITECTURE.md auf aktuellen Stand reduzieren
- [x] supabase/migrations/ als autoritatives Migrationsverzeichnis festlegen
- [x] Alle /dashboard/applications Links fixen (Route wurde umbenannt)
- [x] CLAUDE.md aktualisieren (Motion Principles, Migrations-Pfad)

## 2026-02-24 — Route Fix: /dashboard/applications → /dashboard/job-queue
| Datei | Was geändert |
|-------|-------------|
| Keine | Es wurden im Code keine kaputten Links auf diese Route mehr gefunden. |

## 2026-02-24 — ARCHITECTURE.md Aktualisierung
- Veraltete Abschnitte entfernt: Python-Code, Playwright, ScraperAPI, company_slug
- Route-Struktur auf aktuellen app/ Stand gebracht
- Migrations-Klarstellung: supabase/migrations/ ist autoritativ

## 2026-02-24 — Sentry Error Monitoring eingerichtet
- @sentry/nextjs installiert
- sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts erstellt
- next.config.js mit withSentryConfig gewrappt
- global-error.tsx als Fallback-UI erstellt
- PII-Filterung in beforeSend aktiviert (DSGVO-konform)
---
