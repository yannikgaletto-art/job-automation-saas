---
Version: 1.1.0
Last Updated: 2026-02-26
Status: AKTIV — PFLICHTLEKTÜRE vor jedem neuen Feature
Gehört zu: CLAUDE.md, SICHERHEITSARCHITEKTUR.md
---

# 🗺️ FEATURE_IMPACT_ANALYSIS — Pathly V2.0

> **GOLDEN RULE:** Kein neues Feature ohne vollständige Impact Map.
> Diese Analyse passiert VOR dem ersten Code-Commit — nicht danach.
> Antigravity präsentiert die Impact Map und wartet auf Yannik's "Go" bevor Code geschrieben wird.

---

## SCHRITT 1 — FEATURE FOOTPRINT KARTIEREN (Pflicht)

Für jedes neue Feature MUSS der Agent diese 5 Fragen schriftlich beantworten,
bevor Code geschrieben wird:

### 1.1 Upstream-Abhängigkeiten (Daten-Input)
- Welche DB-Tabellen liest dieses Feature?
- Welche bestehenden Services/APIs ruft es auf?
- Welche User-Daten müssen zwingend existieren, damit das Feature funktioniert?
  → Für jede Pflichtvoraussetzung: Was passiert, wenn sie fehlt? (→ Empty/Blocking State definieren)

### 1.2 Downstream-Auswirkungen & Side Effects (Daten-Output)
- Welche bestehenden Routes/Pages sind betroffen?
- **Side Effects:** Triggert dieses Feature Inngest-Background-Jobs oder externe APIs (Claude/Perplexity)?
- Verändert es bestehende Status-Felder (z.B. in `job_queue`), auf die andere Frontend-Teile lauschen?
- Verändert es bestehende API-Response-Formate? (Breaking Changes → Downstream-Consumers prüfen)

### 1.3 Security & Database (RLS Pflicht)
- Muss `middleware.ts` angepasst werden? (Neue Route → Auth-Guard zwingend eintragen)
- Muss `ARCHITECTURE.md` (Route-Struktur) aktualisiert werden?
- Muss `database/schema.sql` oder eine Migration erstellt werden?
- **KRITISCH:** Wenn eine neue DB-Tabelle oder Spalte erstellt wird:
  Wurden RLS-Policies (`.eq('user_id', auth.uid())`) explizit eingeplant?
  → Ohne RLS = Blocker. Kein Merge ohne verifizierte RLS.

### 1.4 Empty & Blocking States (Pflicht — kein Feature ohne diese Planung)
Für jeden Upstream-Datenpunkt gilt: Was sieht der User, wenn er fehlt?

| Fehlender Datenpunkt | UI-Reaktion | CTA |
|---|---|---|
| Kein CV hochgeladen | Blocking State mit Warnung | → Settings: CV hochladen |
| Onboarding nicht abgeschlossen | Redirect zu /onboarding | — |
| Keine Jobs in der Queue | Empty State mit Illustration | → Job Search starten |
| (Neues Feature: Zeilen hier ergänzen) | ... | ... |

### 1.5 Component Audit (Reduce Complexity — Pflicht)
- Welche UI-Elemente werden benötigt (Cards, Modals, Buttons, Tabs)?
- **WICHTIG:** Welche *existierenden* Komponenten aus `components/` können
  wiederverwendet werden, statt neue zu schreiben?
- Erst wenn keine passende Komponente existiert, darf eine neue gebaut werden.

---

## SCHRITT 2 — IMPACT MAP DOKUMENTIEREN (Pflicht vor dem Coding)

Der Agent schreibt die Impact Map als Block BEVOR er mit der Implementierung beginnt.
Diese Map wird Yannik zur Freigabe vorgelegt. Erst nach "Go" wird Code geschrieben.

**Format (immer exakt so):**

```
## IMPACT MAP — [Feature Name]

Upstream:              documents(cv), user_settings(onboarding_completed), job_queue(status/count)
Downstream & Side Effects: neue API Route /api/roadmap, keine Inngest-Trigger, KEIN Breaking Change
Security/DB:           Neue Route in middleware.ts eintragen. Keine neuen Tabellen (RLS safe).
Contracts berührt:     Abschnitt 2 (Documents), Abschnitt 3 (Session), Abschnitt 8 (API Auth)
Empty States:          kein CV → Blocking "Lade deinen Lebenslauf hoch" + CTA zu Settings
                       keine Jobs → Empty State "Starte deine erste Jobsuche"
Component Audit:       Nutzt existierende <Button>, <Card>, <EmptyState>. Kein neues UI-Pattern.
Breaking Changes:      KEINE
Parallelisierung:      Kann parallel laufen. middleware.ts wird berührt → kein anderer Agent gleichzeitig.
```

---

## SCHRITT 3 — PARALLELISIERUNGS-CHECK

Bevor das Feature gestartet wird, diese Fragen beantworten:

- Verändert dieses Feature `middleware.ts`?
  → Kein anderer Agent darf gleichzeitig daran arbeiten.
- Verändert es `database/schema.sql` oder eine Migration?
  → Dieser Batch muss isoliert und alleine laufen.
- Verändert es bestehende API-Response-Formate?
  → Alle Frontend-Stellen prüfen, die diesen Endpoint konsumieren.

---

## SCHRITT 4 — VERIFICATION GATES (nach Implementierung)

Zusätzlich zu den Gates A–F aus `docs/SICHERHEITSARCHITEKTUR.md`:

- [ ] **Gate G** — Neues Feature funktioniert mit leerem User-Account (Empty/Blocking States greifen korrekt)
- [ ] **Gate H** — RLS verifiziert: User sieht ausschließlich eigene Daten (kein Cross-User-Leak möglich)
- [ ] **Gate I** — Alle Upstream-Abhängigkeiten haben definierten Error/Blocking State
- [ ] **Gate J** — `ARCHITECTURE.md` und `MASTER_PLAN.md` wurden aktualisiert
- [ ] **Gate K** — `npx tsc --noEmit` passes (kein neuer TypeScript-Fehler durch dieses Feature)

---

## BEISPIEL — Roadmap-Reiter (Referenz für künftige Features)

**Feature:** Neuer Dashboard-Reiter `/dashboard/roadmap`

```
## IMPACT MAP — Roadmap-Reiter

Upstream:              user_settings(onboarding_completed), documents(cv, document_type='cv'),
                       job_queue(status/count), application_history(count)
Downstream & Side Effects: neue Route /dashboard/roadmap, neue API /api/roadmap/status,
                       kein Inngest-Trigger, KEIN Breaking Change an bestehenden APIs
Security/DB:           Route in middleware.ts absichern. Keine neuen Tabellen.
                       RLS: alle Queries über bestehende user_id-gefilterte Services.
Contracts berührt:     Abschnitt 2 (CV-Lookup), Abschnitt 3 (user_id Filter zwingend),
                       Abschnitt 8 (Auth Guard für neue API Route)
Empty States:          kein CV → Blocking Banner "Lade deinen Lebenslauf hoch" + CTA Settings
                       keine Jobs gestartet → "Starte deine erste Jobsuche" mit CTA
                       keine Bewerbungen → "Noch keine Bewerbungen" Empty State
Component Audit:       Nutzt existierende <Card>, <Button>, <Badge>, <Progress>.
                       Neue Komponente: <RoadmapMilestone> (kein Äquivalent vorhanden).
Breaking Changes:      KEINE
Parallelisierung:      Kann parallel zu anderen Features laufen.
                       AUSNAHME: middleware.ts wird berührt → nicht parallel zu anderen Routes.
```

**Gate G:** Frisch registrierter User sieht Blocking State "CV fehlt" — kein leeres Dashboard.
**Gate H:** RLS geprüft via SQL: User sieht nur eigene Dokumente und Jobs.

---

## ⚠️ VERBOTENE ANTI-PATTERNS (gelten auch für neue Features)

```typescript
// ❌ VERBOTEN: Neue Feature-Route ohne Auth-Guard in middleware.ts
// → Route ist öffentlich zugänglich

// ❌ VERBOTEN: Neue Tabelle ohne RLS-Policy
// → Alle User-Daten für alle sichtbar

// ❌ VERBOTEN: Feature ohne Empty State für fehlende Upstream-Daten
// → User sieht leeres / kaputtes UI ohne Erklärung

// ❌ VERBOTEN: Neue UI-Komponenten ohne Component Audit
// → Code-Duplizierung, Inkonsistenz im Design System

// ❌ VERBOTEN: Impact Map überspringen weil "das Feature ist klein"
// → Kleine Features verursachen die größten Bugs in bestehenden Workflows
```

---

> Dieses Dokument wird nach jedem neuen Feature um neue Learnings erweitert.
> Letzte Aktualisierung: 2026-02-26
