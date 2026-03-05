---
Version: 1.0.0
Created: 2026-03-05
Status: REFERENZ-DOKUMENT — Wird von AGENT_11.2 gebaut. Dieses Dokument beschreibt die Ausbaustufe.
Priority: MEDIUM — Foundation für Coaching Feature (AGENT_13.x) und zukünftige Multi-Agent-Szenarien
---

# 🏗️ AGENT 11.3 — Remote MCP Server: Architektur & Ausbauplan

> **Für Claude Opus:** Dies ist ein Architektur- und Planungsdokument. Es beschreibt den
> vollständigen Zielzustand des MCP Servers. Phase 1 (Cover Letter Tools) wird von AGENT_11.2
> implementiert. Dieses Dokument definiert wie der Server ausgebaut wird wenn neue Features
> (Coaching, CV Match, Zertifikate) hinzukommen.
>
> **Aufgabe dieses Agents:** Lies die bestehende Implementierung aus AGENT_11.2 und ergänze
> den MCP Server um die hier definierten Tools. Prüfe aktiv ob die Architektur-Entscheidungen
> noch korrekt sind oder ob du bessere Lösungen siehst.

---

## ⛔ FORBIDDEN FILES — ABSOLUTE SPERRZONE

```
lib/ai/model-router.ts                     ← SHARED — nie anfassen
middleware.ts                              ← Nur neue Route-Einträge, keine Modifikation bestehender Einträge
supabase/migrations/*                      ← Nur neue Migration-Dateien anlegen
lib/inngest/cover-letter-*.ts              ← Fremdes Feature
lib/inngest/cv-match-pipeline.ts           ← Fremdes Feature
lib/inngest/certificates-pipeline.ts       ← Fremdes Feature
```

---

## MISSION

Der MCP Server (`app/api/mcp/route.ts`) ist Pathlys zentrales Daten-Interface für alle
AI-Agenten. Er wächst mit jedem neuen Feature um neue Tools. Dieses Dokument beschreibt
die vollständige Architektur: was bereits gebaut ist, was als nächstes kommt, und
welche Design-Prinzipien nie verletzt werden dürfen.

---

## PREREQUISITES — READ FIRST! 🚨

1. **`CLAUDE.md`** — Reduce Complexity, Rate Limits
2. **`ARCHITECTURE.md`** — Systemarchitektur verstehen
3. **`directives/AGENT_11.2_COVER_LETTER_MCP.md`** — Bestehende MCP Implementierung aus Phase 1
4. **`app/api/mcp/route.ts`** — Den bereits existierenden Code lesen (von AGENT_11.2 gebaut)
5. **`directives/FEATURE_COMPAT_MATRIX.md`** — Cross-Feature Ownership
6. **`database/schema.sql`** — Alle Tabellen die neue Tools benötigen

> ⚠️ **Claude Opus:** Wenn AGENT_11.2 noch nicht ausgeführt wurde (d.h. `app/api/mcp/route.ts`
> existiert noch nicht), dann ist dieser Agent ein reines Planungsdokument. Implementiere
> dann erst AGENT_11.2 vollständig, bevor du diesen Agent ausführst.

---

## ARCHITEKTUR-ÜBERSICHT

### Was ist ein Remote MCP Server?

Ein Remote MCP Server ist eine Web-API, die das Model Context Protocol spricht.
Statt Daten als riesigen Text-Block in jeden AI-Prompt zu laden, fragt Claude
den MCP Server per `tool_use` nach genau den Daten, die es gerade braucht.

```
Anthropuc API
    ↓ 
  Claude denkt: "Ich brauche die CV-Daten"
    ↓
  Claude sendet tool_call: { name: "get_cv_data", input: { userId: "..." } }
    ↓
  Dein Backend (app/api/mcp/route.ts) empfängt den Call
    ↓
  Route liest aus Supabase → gibt Daten zurück
    ↓
  Claude erhält Daten und generiert die Antwort
```

### Transport: Streamable HTTP (Pflicht für Vercel)

Vercel Serverless Functions haben kein persistentes State zwischen Requests.
Daher wird **Streamable HTTP** als Transport genutzt — kein Redis/KV Store nötig.

```
PRO:  Null neue Infrastruktur, kein Zusatzkosten, sofort deploybar auf Vercel
CON:  Kein echtes Streaming bei sehr langen Responses (>60 Sekunden)
Wann zu SSE wechseln: Wenn Coaching-Sessions (15min) real-time Streaming benötigen
                      → Dann Vercel KV hinzufügen (~$30/Monat)
```

### Sicherheits-Prinzip (nie verletzen)

Jeder Tool-Call MUSS den `auth.uid()` aus dem Auth-Token ableiten.
Kein Tool gibt Daten eines anderen Users zurück — auch nicht bei direktem ID-Parameter.

```typescript
// ✅ RICHTIG: RLS + Auth-Check
const supabase = createClient() // Server-Side Client nutzt Auth-Token automatisch
const { data: { user } } = await supabase.auth.getUser()
if (!user || user.id !== userId) throw new Error('Unauthorized')

// ❌ FALSCH: userId direkt aus Input nutzen ohne Auth-Verification
const { data } = await supabase.from('documents').eq('user_id', inputUserId)
```

---

## TOOL-REGISTER: VOLLSTÄNDIGER ZIELZUSTAND

### Phase 1 — Cover Letter (von AGENT_11.2 gebaut)

| Tool-Name | Datenquelle | Genutzt von |
|---|---|---|
| `get_cv_data` | `documents` (cv) | Cover Letter, Coaching |
| `get_job_requirements` | `job_queue` | Cover Letter, Coaching, Zertifikate |
| `get_company_research` | `company_research` | Cover Letter, Coaching |
| `get_writing_style` | `documents` (writing_style) | Cover Letter |

### Phase 2 — Coaching Feature (wenn AGENT_13.x aktiv)

| Tool-Name | Datenquelle | Beschreibung |
|---|---|---|
| `get_coaching_dossier` | `coaching_sessions` (neue Tabelle) | Gap-Analyse + Interviewfragen für Session |
| `get_session_history` | `coaching_sessions.conversation_history` | Bisheriger Gesprächsverlauf |
| `save_session_message` | `coaching_sessions` | Speichert neue Nachricht in History |

> **Jetzt:** Diese Tools noch NICHT implementieren. Nur als Platzhalter dokumentieren.
> Implementierung erfolgt wenn AGENT_13.x (Coaching Feature) den Auftrag erhält.

### Phase 3 — Zertifikate (wenn EdTech-Integration aktiv)

| Tool-Name | Datenquelle | Beschreibung |
|---|---|---|
| `get_skill_gaps` | `job_queue` + `documents` | Identifiziert Skill-Lücken zwischen CV und Job |
| `search_courses` | Udemy/Coursera API (extern) | Sucht Kurse für identifizierte Lücken |

> **Jetzt:** Noch nicht implementieren. Udemy Partner API Zugang prüfen bevor Start.

---

## CURRENT STATE (nach AGENT_11.2 Ausführung)

- ✅ `app/api/mcp/route.ts` existiert (von AGENT_11.2)
- ✅ Phase 1 Tools aktiv (get_cv_data, get_job_requirements, get_company_research, get_writing_style)
- ✅ Streamable HTTP Transport konfiguriert
- ✅ Route in middleware.ts eingetragen
- ⚠️ Coaching-Tools noch nicht implementiert (Phase 2)
- ⚠️ Kein Monitoring welche Tools wie oft aufgerufen werden
- ❌ Keine Tool-Usage-Analytics
- ❌ Keine Rate-Limiting auf Tool-Ebene

---

## DEINE AUFGABEN (falls AGENT_11.2 bereits ausgeführt)

### 11.3.1: Tool-Usage Monitoring
**Goal:** Sichtbarkeit welche Tools Claude tatsächlich aufruft.

In `app/api/mcp/route.ts` nach jedem Tool-Call einen Log schreiben:

```typescript
// Jedes Tool-Call in Supabase loggen
async function logToolCall(toolName: string, userId: string, durationMs: number) {
  const supabase = createClient()
  await supabase.from('generation_logs').insert({
    user_id: userId,
    feature: 'mcp_tool_call',
    model: 'n/a',
    tokens_used: 0,
    mcp_tools_called: [toolName],
    metadata: { tool: toolName, duration_ms: durationMs }
  })
}
```

> **Claude Opus:** Prüfe ob `generation_logs` das richtige Schema für diesen Log-Typ hat
> oder ob ein separates `mcp_tool_logs` Schema sinnvoller wäre. Entscheide nach Konsultation
> von `directives/AGENT_5.5_GENERATION_LOGS.md`.

### 11.3.2: Tool-Level Rate Limiting
**Goal:** Verhindern dass ein einzelner User den MCP Server für andere blockiert.

Einfache Implementierung ohne Redis:

```typescript
// In-Memory Rate Limit (Vercel Instance-Level — nicht global, aber gut genug für MVP)
const toolCallCount = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(userId: string): boolean {
  const key = userId
  const now = Date.now()
  const entry = toolCallCount.get(key)
  
  if (!entry || entry.resetAt < now) {
    toolCallCount.set(key, { count: 1, resetAt: now + 60000 }) // 1 Minute Window
    return true
  }
  
  if (entry.count >= 20) return false // Max 20 Tool-Calls/Minute pro User
  entry.count++
  return true
}
```

> **Claude Opus:** Evaluiere ob In-Memory Rate Limiting für Vercel Serverless ausreicht
> (jede Function-Instanz hat eigenen Speicher). Falls nicht: dokumentiere warum
> Vercel KV nötig wäre und was das kostet (~$30/Monat).

### 11.3.3: Coaching-Tool Platzhalter
**Goal:** Die Coaching-Tools als dokumentierte Stubs vorbereiten — kein produktiver Code.

```typescript
// In app/api/mcp/route.ts ERGÄNZEN (nicht ersetzen):
// TODO: Coaching Tools — werden von AGENT_13.x aktiviert
// server.tool('get_coaching_dossier', ...) // DEFERRED — coaching_sessions Tabelle fehlt noch
// server.tool('get_session_history', ...)  // DEFERRED
// server.tool('save_session_message', ...) // DEFERRED
```

### 11.3.4: Architektur-Dokumentation aktualisieren
**Goal:** `ARCHITECTURE.md` und `CLAUDE.md` um MCP Server Informationen ergänzen.

In `ARCHITECTURE.md` unter API Routes ergänzen:
```
- `/api/mcp` (MCP Server — alle AI-Tools, Auth required)
  Tools: get_cv_data, get_job_requirements, get_company_research, get_writing_style
  Transport: Streamable HTTP
  Pending: get_coaching_dossier (Phase 2), search_courses (Phase 3)
```

In `CLAUDE.md` unter Kanonische Import-Pfade ergänzen:
```
| MCP Server | app/api/mcp/route.ts |
```

---

## DESIGN-PRINZIPIEN (für alle zukünftigen Tool-Ergänzungen)

1. **Ein Tool, ein Zweck.** Kein Tool gibt mehr zurück als sein Name verspricht.
2. **Null Trust für User-Input.** Jeder userId-Parameter wird gegen `auth.uid()` geprüft.
3. **Graceful Null Return.** Tools geben nie einen Fehler zurück — sie geben `null` zurück wenn Daten fehlen. Claude entscheidet wie es damit umgeht.
4. **Max 1 Supabase-Query pro Tool.** Kein Tool löst mehrere Queries aus. Bei Bedarf: Join im Query.
5. **Keine Mutations.** MCP Tools lesen nur. Schreiboperationen erfolgen via dedizierte API Routes.
6. **Spalten-Alignment vor dem Coding.** Jeden `.select()` gegen `database/schema.sql` prüfen bevor der Code geschrieben wird.

---

## VERIFICATION CHECKLIST

- [ ] `app/api/mcp/route.ts` existiert (von AGENT_11.2 oder diesem Agent)
- [ ] Alle Phase-1-Tools funktionieren (End-to-End Test mit Cover Letter)
- [ ] Tool-Usage Monitoring schreibt Logs in `generation_logs`
- [ ] Rate Limiting aktiv (200er Response bei Überschreitung)
- [ ] Coaching-Tool Stubs als Kommentare dokumentiert
- [ ] `ARCHITECTURE.md` aktualisiert
- [ ] `npx tsc --noEmit` passes
- [ ] RLS: Kein Cross-User Data Leak möglich (Supabase Service Role darf NICHT genutzt werden)

## SUCCESS CRITERIA
✅ MCP Server ist zentraler, stabiler Daten-Hub für alle AI-Features
✅ Jeder Tool-Call ist nachvollziehbar (Monitoring)
✅ Neue Tools können in < 1 Stunde hinzugefügt werden (Pattern ist etabliert)
✅ Coaching Feature kann sofort auf bestehende Tools (get_cv_data, get_job_requirements) aufbauen
✅ Kein Cross-User Data Leak (RLS Prinzip durchgängig)

---

## ⚠️ PARALLELISIERUNGS-HINWEIS

Dieser Agent modifiziert `app/api/mcp/route.ts` (Ergänzung von Tools).
**Nicht parallel zu AGENT_11.2 (schreibt dieselbe Datei).**
Kann parallel zu Frontend-Agents laufen, die `app/api/mcp/route.ts` nicht berühren.
Dokumentation-Updates (`ARCHITECTURE.md`) können parallel laufen.
