# Agent Onboarding — Pathly V2.0

Pflichtlektüre für jeden Agenten, der an diesem Repo arbeitet.

---

## Regel: Folgenabschätzung vor jeder Änderung

Bevor du eine Änderung implementierst, führe intern durch:

1. **Komplexitäts-Check** — Wie viele andere Files/Services sind betroffen?
2. **Kaskadenrisiko** — Welche Folgeprobleme kann diese Änderung auslösen? (Score 1-5)
3. **Simpler-Path-Test** — Gibt es einen Weg mit weniger Änderungen zum gleichen Ziel?

Oberste Direktive: **Reduce Complexity. Im Zweifel weniger tun.**
Wenn Kaskadenrisiko ≥ 3: Stopp — kurze Rückfrage bevor du weiter machst.

---

## Regel: Supabase-Hinweise IMMER mit Direkt-Link UND Environment-Markierung

Wenn du Yannik auf eine Supabase-Tabelle, SQL-Migration, RLS-Policy, Auth-User-Record oder ein Storage-Bucket verweist:

1. **Gib IMMER den Dashboard-Direkt-Link mit** — Yannik findet die Pfade sonst nicht im UI.
2. **Sag IMMER explizit ob PROD oder DEV** — wir haben zwei Projekte. Verwechslung = Production-Datenrisiko.
3. **Bei Migrations:** standardmäßig **erst DEV → Smoke → dann PROD**. Niemals direkt PROD ohne explizite User-Freigabe.

### Die zwei Projekte

| Env | Project-Ref | URL | Wofür |
|---|---|---|---|
| 🟢 **DEV** | `lteuokkwuvkjqyxxihbk` | `https://lteuokkwuvkjqyxxihbk.supabase.co` | Lokale Tests, Vercel-Preview, Initiativ-Feature-Smoke. Sicher zum Migrations-Probieren. |
| 🔴 **PROD** | `relxxxbinjktjtdhlngh` | `https://relxxxbinjktjtdhlngh.supabase.co` | Echte User-Daten. NIEMALS ohne explizite User-Bestätigung berühren. |

Quelle der Wahrheit: `.env.local` zeigt aktuell aktive Project-Ref. `.env.preview.initiativ.local` zeigt DEV. `.env.prod-backup.local` zeigt PROD.

### Standard-Link-Templates (immer Env-Label dazuschreiben)

Ersetze `<PROJECT_REF>` durch `lteuokkwuvkjqyxxihbk` (DEV) oder `relxxxbinjktjtdhlngh` (PROD):

| Was du erwähnst | Pfad-Template |
|---|---|
| Eine Tabelle (Editor) | `https://supabase.com/dashboard/project/<PROJECT_REF>/editor` (Tabelle dann links auswählen) |
| SQL-Migration / SQL-Statement | `https://supabase.com/dashboard/project/<PROJECT_REF>/sql/new` |
| Migrations-Liste | `https://supabase.com/dashboard/project/<PROJECT_REF>/database/migrations` |
| Auth-Users (E-Mail / User-ID) | `https://supabase.com/dashboard/project/<PROJECT_REF>/auth/users` |
| RLS-Policies | `https://supabase.com/dashboard/project/<PROJECT_REF>/auth/policies` |
| Storage-Buckets | `https://supabase.com/dashboard/project/<PROJECT_REF>/storage/buckets` |
| Logs (Postgres/Auth/Edge) | `https://supabase.com/dashboard/project/<PROJECT_REF>/logs/explorer` |
| API-Keys / Project-Settings | `https://supabase.com/dashboard/project/<PROJECT_REF>/settings/api` |
| DB-Functions / RPCs | `https://supabase.com/dashboard/project/<PROJECT_REF>/database/functions` |
| Cron-Jobs (`pg_cron`) | `https://supabase.com/dashboard/project/<PROJECT_REF>/database/cron-jobs` |

### Beispiele für gute Antworten

```
✅ "Migration ZUERST auf 🟢 DEV ausführen:
    https://supabase.com/dashboard/project/lteuokkwuvkjqyxxihbk/sql/new
    Datei: supabase/migrations/20260510_initiativ_discovery_credit_event.sql

    Nach grünem Smoke dann auf 🔴 PROD:
    https://supabase.com/dashboard/project/relxxxbinjktjtdhlngh/sql/new"

✅ "Check `initiativ_triggers` Tabelle auf 🟢 DEV:
    https://supabase.com/dashboard/project/lteuokkwuvkjqyxxihbk/editor
    (Tabelle links in der Sidebar auswählen)"

❌ "Lauf die Migration in Supabase aus."          (kein Link, kein Env, Yannik findet's nicht)
❌ "Schau in die DB nach."                        (welche von beiden?)
❌ "https://supabase.com/dashboard/project/.../sql/new"  (Env-Label fehlt — gefährlich)
```

### SQL-Statements zum Ausführen

Wenn du eine SQL-Statement gibst die Yannik laufen lassen soll:
1. Env explizit nennen (🟢 DEV / 🔴 PROD)
2. Direkt-Link zum SQL Editor des richtigen Projekts
3. Vollständiges SQL als Code-Block zum Copy-Paste
4. Erwartete Output-Zeile ("Success. No rows returned." o.ä.)
5. Verify-Schritt mit Editor-Link auf die betroffene Tabelle

---

## Regel: DB-Inhalte selber abfragen, NICHT Yannik nachgucken lassen

**Anti-Pattern:** "Schau mal in der `initiativ_triggers` Tabelle nach was drin steht und sag mir Bescheid."

**Richtig:** SELBER abfragen via REST-API mit Service-Role-Key, dann Ergebnis interpretieren.

**Wie:**

```bash
# DEV
SUPABASE_URL=$(grep -E "^NEXT_PUBLIC_SUPABASE_URL" .env.preview.initiativ.local | cut -d'"' -f2 | head -1)
SERVICE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY" .env.preview.initiativ.local | cut -d'"' -f2 | head -1)

# PROD
# SUPABASE_URL=$(grep -E "^NEXT_PUBLIC_SUPABASE_URL" .env.prod-backup.local | cut -d'"' -f2 | head -1)
# SERVICE_KEY=$(grep -E "^SUPABASE_SERVICE_ROLE_KEY" .env.prod-backup.local | cut -d'"' -f2 | head -1)

# Generic select via PostgREST
curl -s "$SUPABASE_URL/rest/v1/<table_name>?select=<cols>&order=<col>.desc&limit=20" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" | python3 -m json.tool

# Filter example: where user_id = 'xyz'
# &user_id=eq.xyz

# Count: ?select=count
# Aggregate via SQL: nutze /rest/v1/rpc/<function_name> wenn vorhanden
```

**Wann:** IMMER bevor du Yannik fragst "was steht in der Tabelle". Auch zum Verifizieren dass Migrations gewirkt haben, dass Inserts erfolgreich waren, dass RLS Policies richtig greifen.

**Service-Role-Key Sicherheits-Regel:** Niemals den Key in die Chat-Antwort schreiben. Inline im Bash-Befehl ist OK weil Bash-Output gefiltert wird, aber NIE als Klartext in deine User-Antwort.

**Wenn DB-Inspect ein Bild zeigt das du nicht selbst lesen kannst** (z.B. Performance-Charts, Realtime-Logs-UI): DANN ist Yannik-Hilfe legitim und gib einen Direkt-Link.
