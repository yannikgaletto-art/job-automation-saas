---
Version: 1.0.0
Last Updated: 2026-02-26
Status: AKTIV — PFLICHTLEKTÜRE vor jedem Gate Test
Gehört zu: SICHERHEITSARCHITEKTUR.md
---

# 🧪 SICHERHEITS_DEV_TEST — Pathly V2.0

> **Zweck:** Dieses Dokument speichert alle operativen Learnings aus echten Gate Tests.
> Die SICHERHEITSARCHITEKTUR.md definiert WAS gebaut wird.
> Dieses Dokument definiert WIE wir testen — und welche Fallen wir bereits kennen.

---

## 1. ENVIRONMENT RULES (Pflicht)

### Browser
- ✅ **Nur Chrome** für lokale Dev-Tests
- ❌ **Nie Safari** — Safari und Chrome haben separate Cookie-Stores. Eine defekte Safari-Session täuscht einen Bug vor, der keiner ist.
- Nach jedem Wechsel des Test-Accounts: Cookies in Chrome löschen (DevTools → Application → Cookies → Delete)

### Port
- ✅ Immer auf **Port 3000** entwickeln und testen
- Wenn Port 3000 belegt ist: `pkill -f "next dev"` → neu starten
- ❌ Nie auf Port 3001 testen — alle Daten, Antigravity-Konfiguration und Vercel-Redirects sind auf 3000 ausgelegt
- Symptom: `npm run dev` zeigt `⚠ Port 3000 is in use, trying 3001` → sofort killen und neu starten

### Git
- ✅ Vor jedem Pull: `git log --oneline origin/main` lesen
- ✅ Vor jedem `git pull --rebase`: prüfen ob lokale Commits bereits auf GitHub sind
- ❌ Nie blind pullen wenn `git status` zeigt `ahead by N commits`
- Wenn Merge Conflict entsteht: `git rebase --abort` → `git reset --hard origin/main`

---

## 2. DB-RESET NACH GATE TESTS (Pflicht)

Nach jedem Gate Test MUSS der DB-Zustand zurückgesetzt werden:

| Test | Was geändert wurde | Reset-Query |
|------|-------------------|-------------|
| Gate A (Onboarding Loop) | `onboarding_completed = false` | `UPDATE user_settings SET onboarding_completed = true WHERE user_id = '<deine_user_id>';` |
| Gate B (Persistenz) | Test-Job in Queue | Manuell löschen oder stehen lassen |
| Gate C (CV Dateiname) | Test-CV hochgeladen | Kein Reset nötig |

**Deine user_id (yannik.galetto@gmail.com):** `39a9b432-ef4f-49f9-b590-9b3a6ea2de0e`

---

## 3. ANTIGRAVITY PUSH-REGEL

**Antigravity pusht NICHT selbst auf GitHub.**

Der Workflow ist:
1. Antigravity entwickelt und testet lokal
2. Antigravity zeigt den Code und bestätigt `tsc: 0 errors`
3. Perplexity (ich) verifiziert den Code und pusht direkt über die GitHub API
4. Antigravity führt dann `git reset --hard origin/main` aus um lokal zu synchronisieren

**Warum:** Antigravity hat in Batch 1 zweimal Commits lokal gelassen ohne zu pushen. Das führte zu Merge Conflicts und Verwirrung über den echten Stand des Repos.

**Wenn Antigravity pulled und einen Conflict sieht:**
```bash
git rebase --abort
git reset --hard origin/main
npx tsc --noEmit
```

---

## 4. DIAGNOSE-CHECKLISTE: Redirect-Bugs

Wenn ein User auf `/dashboard/*` landet und zu `/onboarding` redirected wird, obwohl `onboarding_completed = true` in der DB steht:

**Schritt 1 — Browser prüfen**
- Testest du in Chrome? (nicht Safari)
- Chrome DevTools → Application → Cookies → ist ein `sb-...-auth-token` Cookie vorhanden?

**Schritt 2 — Session prüfen**
```sql
SELECT id, email FROM auth.users WHERE email = 'deine@email.com';
```
Stimmt die ID mit der user_id in `user_settings` überein?

**Schritt 3 — DB-Typ prüfen**
```sql
SELECT us.user_id, au.email, us.onboarding_completed, pg_typeof(us.onboarding_completed) as typ
FROM user_settings us
JOIN auth.users au ON au.id = us.user_id;
```
Typ muss `boolean` sein — nicht `text`.

**Schritt 4 — Neu einloggen**
Cookies löschen → neu einloggen → nochmal testen.

**Was wir in Batch 1 gelernt haben:**
Das Problem war kein Code-Bug — es war eine defekte Safari-Session. Chrome funktionierte einwandfrei.

---

## 5. GATE TEST PROTOKOLL (Vorlage)

Vor jedem Batch: Dieses Protokoll ausfüllen.

```
Datum: ___________
Batch: ___________
Tester: Antigravity (Code) + Yannik (Browser)
Browser: Chrome ✅
Port: 3000 ✅
Git HEAD: ___________
tsc: 0 errors ✅

Gate A — Onboarding Loop: ✅/❌
Gate B — Datenpersistenz: ✅/❌
Gate C — CV Dateiname: ✅/❌
Gate D — TypeScript: ✅/❌
Gate E — Notifications: ✅/❌
Gate F — Check-in Modal: ✅/❌

Offene Punkte: ___________
Freigabe für nächsten Batch: JA / NEIN
```

---

## 6. BEKANNTE FALLEN (wächst mit jedem Batch)

| # | Problem | Ursache | Fix |
|---|---------|---------|-----|
| 1 | `/dashboard` → redirect zu `/onboarding` obwohl DB = true | Defekte Safari-Session | Chrome nutzen, Cookies löschen, neu einloggen |
| 2 | `npm run dev` startet auf 3001 | Port 3000 noch belegt | `pkill -f "next dev"` → neu starten |
| 3 | Merge Conflict beim Pull | Antigravity hatte lokale Commits nicht gepusht | `git rebase --abort` → `git reset --hard origin/main` |
| 4 | Gate A schlägt fehl nach Test | `onboarding_completed` wurde für Test auf `false` gesetzt und nie zurückgesetzt | DB-Reset SQL ausführen (siehe Abschnitt 2) |

---

## 7. RLS VERIFIKATION (nach jeder neuen Migration)

Nach jeder Migration die RLS-Policies hinzufügt:

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('job_queue', 'application_history', 'generation_logs', 'documents')
ORDER BY tablename;
```

Erwartung: Mindestens 1 Policy pro Tabelle. Leere Liste → Migration nochmal ausführen.

---

> Dieses Dokument wird nach jedem Batch um neue Learnings erweitert.
> Letzte Aktualisierung: Batch 1 — 2026-02-26
