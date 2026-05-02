# 🤖 Pathly E2E Auto-Tests (Tier 1)

> **Halbautonomes Test-Setup.** Der Agent klickt durch Pathly auf Vercel-Preview, prüft DB-State via Supabase-Service-Role, generiert Reports. Fixes IMMER mit User-Approval-Gate.

**Status:** Tier 1 Skelett — produktionsreif für die in `MasterPrompt §6` skizzierten Flows. Erweiterung pro Iteration.

---

## 🔥 1. Was hier läuft (und was NICHT)

### ✅ Macht der Agent autonom
- Browser steuern (Playwright + Chromium)
- DB-State lesen (Supabase Service-Role, alle Tables)
- Test-User anlegen + cascade-löschen
- AI-Variance-Check (3x-Run)
- Pollution-Check vor + nach Test
- Reports generieren

### ❌ Macht der Agent NICHT (ohne Yannik-Approval)
- Code-Fixes pushen
- Forbidden Files anfassen
- DB-Daten echter User modifizieren
- Git-Operationen über Read-Only hinaus
- Stripe-/Resend-Side-Effects ignorieren

---

## 📦 2. Erst-Setup (nur 1× nötig)

```bash
# 1. Playwright + Browser installieren
npm install -D @playwright/test dotenv
npx playwright install chromium

# 2. .env.test aus Template anlegen
cp tests/e2e-auto/.env.test.example tests/e2e-auto/.env.test

# 3. .env.test mit echten Werten befüllen (siehe Template-Kommentare)
#    NIEMALS commiten — .gitignore schützt nur das default-Pattern.

# 4. Synthetic-CV-PDF erzeugen (DSGVO-Pflicht)
#    Vorlage: Übergang/test-fixtures/synthetic-cv-anna-mueller.md
#    Anleitung in der Datei selbst (3 Optionen: Pandoc / Browser-Druck / Online-Tool)
```

---

## 🚀 3. Tests ausführen

```bash
# Alle Specs in der definierten Reihenfolge
npm run test:e2e

# Nur Smoke (Phase 0)
npm run test:e2e:smoke

# Nur Phase 1 (Q1-Q5 Bug-Regression)
npm run test:e2e:regression

# Nur Phase 2 (Golden Path)
npm run test:e2e:golden

# Manueller Cleanup (immer am Ende ODER bei abgebrochenem Run)
npm run test:e2e:cleanup

# HTML-Report öffnen
npx playwright show-report tests/e2e-auto/playwright-report
```

---

## 📊 4. Spec-Reihenfolge

Specs sind nummeriert, damit Playwright sie alphabetisch in der richtigen Reihenfolge fährt:

| File | Phase | Was |
|------|-------|-----|
| `00-smoke.spec.ts` | 0 | Vercel-Preview erreichbar + Supabase-Key gültig + DB clean |
| `01-q3-name-regression.spec.ts` | 1A | Q3 Name-Bug Reproduktion |
| `02-golden-path.spec.ts` | 2 | Sign-up → CV-Upload → Job-Add → Match → Optimizer → CL |
| `99-pollution-cleanup.spec.ts` | 8 | Atomarer Test-User-Cleanup + Pollution-Verify |

**Erweiterung:** Pro neuem Bug → neuen Spec mit Nummer dazwischen (z.B. `03-q4-optimizer-no-cv.spec.ts`).

---

## 🛡️ 5. Sicherheits-Garantien

### DSGVO
- Synthetic-CV (Anna Müller) ist Default. Yanniks reale PII NUR in `01-q3-name-regression.spec.ts` und mit garantiertem Cleanup.
- Cleanup ist atomar in `99-pollution-cleanup.spec.ts` + manuell triggerbar.
- Service-Role-Key NIE in Git (`.env.test` in `.gitignore`).

### PROD-DB-Pollution
- Test-User-Pattern (`anna.mueller.test+e2e`) ist eindeutig und disjunkt zu echten User-Mails.
- `99-pollution-cleanup.spec.ts` läuft IMMER am Ende; bei Fail → manuelle SQL-DELETE-Anweisung im Output.
- Phase 0 hat einen Pollution-Check VOR allen Tests — wenn alte Pollution gefunden wird, brechen alle Tests ab.

### Auto-Heal-Schutz
- Diese Suite fixt KEINEN Code. Sie reportet nur.
- Bei FAIL → Agent öffnet Investigate-Skill → Hypothese → Yannik-Approval → Fix-PR.
- Niemals Auto-Push, niemals Auto-Merge.

---

## 🔧 6. Wenn Selektoren brechen

Pathly hat keine `data-testid`-Attribute. Selektoren basieren auf Text/Role.

**Bei Selector-Brüchen NICHT in den Spec-Files fixen.** Update zentral in `helpers/selectors.ts` — alle Specs ziehen daraus.

Beispiel — neuer Locator:
```ts
// helpers/selectors.ts
export const ui = {
  // ...
  newFeatureButton: (page: Page) =>
    page.getByRole('button', { name: /mein neues feature/i }),
};
```

---

## 📝 7. Report-Format (was du nach jedem Run lieferst)

Pflicht-Layer-Reporting (siehe MasterPrompt §1):

```
[E2E-Run 2026-05-01]
✅ Layer 1 Jest unit:           472/472
✅ Layer 2 npm run build:       compiled successfully
✅ Layer 3 Vercel-Preview:      https://...vercel.app
✅ Layer 4 Visual-Check:        manuell, kein Layout-Bruch
❌ Layer 5 AI-3x-Variance:      Q3 — Run 1 "Anna Müller", Run 2 "Anna M.", Run 3 "Anna Müller"
✅ Layer 6 DB-Pollution:        0 Rows in allen 5 Tables
⏸️  Layer 7 User-Smoke:          wartet auf Yannik

NICHT "alles grün" sagen. Layer einzeln berichten.
```

---

## ⚠️ 8. Bekannte Grenzen (Tier 1)

- **Visual-Regression:** Playwright macht Screenshots, aber keine Pixel-Diffs. Setup-Erweiterung Tier 1.5.
- **AI-Variance:** Kann nur 3x parallel testen, nicht 100x. Statistisch limitiert.
- **Inngest-Background-Jobs:** Async-Layer ist über Polling-Loops in den Specs simuliert; echte Inngest-Cloud-Tests brauchen MCP-Server (Tier 2).
- **Mobile-Browser:** Nur Chromium-Desktop konfiguriert. Mobile in `playwright.config.ts` `projects` ergänzen.
- **Cold-Starts:** Vercel-Serverless ist beim ersten Request langsam. Tests haben 60-90s Timeouts → robust.

---

## 🚧 9. Erweiterungs-Backlog (für zukünftige Iterationen)

- [ ] Q1 (Multi-CL-Drift) als Spec
- [ ] Q2 (Locale-Switch) als Spec
- [ ] Q4 (Optimizer "Kein Lebenslauf") als Spec
- [ ] Q5 (Cert-Gruppierung) als Spec
- [ ] Phase 3 Cross-Feature-Snapshot
- [ ] Phase 4 ATS-Halluzination 3 Jobs
- [ ] Phase 4D Score-Inflation
- [ ] Phase 4.5 Inngest/Realtime/Cron
- [ ] Phase 5 Billing/Auth/i18n
- [ ] Phase 6 Browser-Extension Cross-Repo
- [ ] Visual-Regression mit Percy oder Chromatic (Tier 1.5)
- [ ] Slack/Discord-Webhook-Reporter (TEST_REPORT_WEBHOOK)
- [ ] CI-Integration via GitHub-Actions

Pro Erweiterung: 1 neuer Spec, 1 Helper-Update, 1 README-Eintrag, 1 MasterPrompt-Update.
