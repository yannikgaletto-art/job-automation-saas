---
Version: 1.0.0
Created: 2026-03-05
Status: AKTIV — Wartet auf Yannik's "Go"
Priority: HIGH — Token-Kostenreduktion + Architektur-Foundation für Coaching Feature
---

# 🏗️ AGENT 11.2 — Cover Letter Pipeline: MCP-Architektur + Legacy Fallback

> **Für Claude Opus:** Du hast Senior Engineer Autonomie. Die bestehende Pipeline ist
> Produktiv und generiert täglich Cover Letters. Sie darf NIEMALS brechen.
> Deine erste Pflicht ist Backward Compatibility — erst dann kommt das Neue.

---

## ⛔ FORBIDDEN FILES — ABSOLUTE SPERRZONE

```
lib/ai/model-router.ts                     ← SHARED — alle Features nutzen dies — NICHT anfassen
lib/inngest/cover-letter-*.ts              ← Bestehende Pipeline — NUR über Fallback-Wrapper erweitern
app/api/cover-letter/generate/route.ts     ← Bestehendes API-Interface — NICHT anfassen
app/api/cover-letter/critique/route.ts     ← Fremdes Feature
middleware.ts                              ← SYSTEM-LEVEL — nur neue Einträge, keine Modifikation
supabase/migrations/*                      ← DB-SCHEMA — kein neues Schema für dieses Feature
```

> **Wichtig:** `lib/services/cover-letter-generator.ts` ist der einzige Einstiegspunkt
> den du modifizieren darfst — und nur durch Ergänzung einer Try/Catch-Wrapper-Schicht.
> Die bestehende Logik darin bleibt byte-for-byte erhalten.

---

## MISSION

Implementiere eine MCP-basierte Datenabruf-Schicht für die Cover Letter Generierung.
Claude soll via `tool_use` gezielt Daten (CV, Job, Writing Style, Company Research) abrufen
statt alle Daten im Voraus als Monolith in den Prompt zu laden. Die bestehende Pipeline
bleibt vollständig erhalten als automatischer Fallback bei jedem MCP-Fehler.

**Kernprinzip:** Dual-Path-Architektur
```
Generierungsanfrage
       ↓
  try: MCP-Pfad (neu) → Claude holt Daten on-demand
  catch: Legacy-Pfad (bestehend) → unveränderter heutiger Code
       ↓
  generation_logs → Pfad-Tracking (welcher Pfad wurde genutzt?)
```

---

## PREREQUISITES — READ FIRST! 🚨

1. **`CLAUDE.md`** — "Reduce Complexity!" + Rate Limits (Claude: 50 req/min)
2. **`ARCHITECTURE.md`** — Cover Letter Pipeline Architektur verstehen
3. **`directives/cover_letter_generation.md`** — Vollständige Writing Style Direktive
4. **`directives/AGENT_5.2_COVER_LETTER_FRONTEND.md`** — Frontend-Kontrakte
5. **`directives/AGENT_5.3_COVER_LETTER_VALIDATION.md`** — Validierungsregeln
6. **`directives/AGENT_5.5_GENERATION_LOGS.md`** — Logging-Schema (PFLICHT — du musst es ergänzen)
7. **`directives/FEATURE_COMPAT_MATRIX.md`** — Abschnitt 2 + 3 (Forbidden Files)
8. **`database/schema.sql`** — Spalten von `documents`, `job_queue`, `company_research`, `generation_logs` exakt kennen
9. **`lib/services/cover-letter-generator.ts`** — Den bestehenden Code Zeile für Zeile lesen
10. **`lib/inngest/cover-letter-*.ts`** — Inngest-Integration verstehen (READ ONLY — nicht modifizieren)

> ⚠️ **Claude Opus Direktive:** Lies die bestehende `cover-letter-generator.ts` vollständig.
> Erstelle dir mental ein Mapping: Welche Daten werden HEUTE als Kontext in den Prompt
> geladen? Das sind genau die Tool-Definitionen die du bauen wirst.

---

## IMPACT MAP (von Agent zu verifizieren)

```
## IMPACT MAP — Cover Letter MCP-Architektur

Upstream:              documents (cv + writing_style), job_queue (steckbrief, anforderungen),
                       company_research (gecachte Perplexity-Daten), user_profiles (preferences)
Downstream & Side Effects:
                       generation_logs (neuer Eintrag: mcp_path boolean)
                       NEUE Datei: app/api/mcp/route.ts (MCP Server)
                       MODIFIZIERT: lib/services/cover-letter-generator.ts (Wrapper ergänzt)
                       KEIN Breaking Change an bestehenden API-Response-Formaten
Security/DB:           app/api/mcp Route in middleware.ts eintragen (Auth-Guard Pflicht).
                       Alle MCP-Tool-Calls müssen user_id aus Auth-Token ableiten (RLS).
                       KEINE neue DB-Tabelle (generation_logs um eine Spalte erweitern — Migration nötig).
Contracts berührt:     generation_logs Schema-Erweiterung (neue Spalte: used_mcp_path BOOLEAN)
Empty States:          CV nicht vorhanden → MCP Tool gibt Fehler → Fallback auf Legacy (silent)
                       Kein Company Research gecacht → Tool gibt null zurück → Claude ignoriert es
Component Audit:       Kein neues UI. Ausschließlich Backend-Änderungen.
Breaking Changes:      KEINE — Fallback garantiert identisches Verhalten bei Fehlern
Parallelisierung:      middleware.ts wird berührt → nicht parallel zu AGENT_11.1.
                       generation_logs Migration → nicht parallel zu anderen DB-Migrations.
```

> ⚠️ **Claude Opus Aufgabe:** Verifiziere die Upstream-Datenquellen gegen den tatsächlichen
> Code in `cover-letter-generator.ts`. Die Impact Map muss jeden Datenpunkt aufführen,
> den der bestehende Code in den Prompt lädt.

---

## CURRENT STATE

- ✅ Cover Letter Pipeline funktioniert produktiv (Generate → Judge → Iterate)
- ✅ `generation_logs` trackt Token-Verbrauch, Scores, Modell
- ✅ Writing Style Vectors in `documents` Tabelle
- ✅ Company Research gecacht in `company_research` Tabelle
- ⚠️ Alle Kontextdaten werden als Monolith in den System Prompt geladen (hoher Token-Verbrauch)
- ⚠️ `@vercel/mcp-adapter` ist noch nicht im Projekt (`package.json` prüfen)
- ❌ Kein MCP Server existiert
- ❌ `generation_logs` trackt nicht welcher Pfad genutzt wurde (MCP vs. Legacy)

---

## DEINE AUFGABEN

### 11.2.1: Dependency Installation
**Goal:** `@vercel/mcp-adapter` zum Projekt hinzufügen.

```bash
npm install @vercel/mcp-adapter @modelcontextprotocol/sdk
```

Nach Installation:
- `package.json` prüfen ob Versionen kompatibel mit Next.js 15
- `npx tsc --noEmit` ausführen — keine neuen TypeScript-Fehler

### 11.2.2: DB-Migration — generation_logs Erweiterung
**Goal:** Tracking ob MCP-Pfad genutzt wurde.

Neue Migration in `supabase/migrations/` (NICHT in `database/migrations/`):

```sql
-- supabase/migrations/[timestamp]_add_mcp_path_to_generation_logs.sql
ALTER TABLE generation_logs
  ADD COLUMN IF NOT EXISTS used_mcp_path BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mcp_tools_called TEXT[] DEFAULT '{}';

COMMENT ON COLUMN generation_logs.used_mcp_path IS
  'TRUE wenn MCP tool_use Pfad genutzt, FALSE wenn Legacy Prompt-Pfad';
COMMENT ON COLUMN generation_logs.mcp_tools_called IS
  'Liste der aufgerufenen MCP Tool-Namen in dieser Generierung';
```

> **Constraints aus CLAUDE.md:** Migrations IMMER in `supabase/migrations/` — niemals in `database/migrations/`.

### 11.2.3: MCP Server Route
**Goal:** Zentraler MCP Server als neue API Route.

**Neue Datei:** `app/api/mcp/route.ts`

```typescript
// app/api/mcp/route.ts
// ⚠️ NEUE DATEI — berührt keine bestehenden Dateien
import { createMcpHandler } from '@vercel/mcp-adapter'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// WICHTIG: Alle Tool-Calls müssen den auth.uid() aus der Session ableiten
// Kein Tool gibt Daten eines anderen Users zurück

const handler = createMcpHandler(
  (server) => {

    // Tool 1: CV-Daten abrufen
    server.tool(
      'get_cv_data',
      'Gibt den strukturierten Lebenslauf des aktuellen Users zurück. ' +
      'Enthält Berufserfahrung, Skills, Ausbildung und Writing Style Vektor.',
      { userId: z.string().uuid() },
      async ({ userId }) => {
        const supabase = createClient()
        // RLS stellt sicher dass userId == auth.uid()
        const { data, error } = await supabase
          .from('documents')
          .select('content, writing_style, document_type')
          .eq('user_id', userId)
          .eq('document_type', 'cv')
          .single()
        if (error || !data) return { content: [{ type: 'text', text: 'CV nicht gefunden' }] }
        return { content: [{ type: 'text', text: JSON.stringify(data) }] }
      }
    )

    // Tool 2: Job-Anforderungen abrufen
    server.tool(
      'get_job_requirements',
      'Gibt Steckbrief und Anforderungen für einen spezifischen Job zurück. ' +
      'Enthält Titel, Anforderungen, Unternehmen, Gehaltsrange, Culture Fit Score.',
      { jobId: z.string().uuid() },
      async ({ jobId }) => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('job_queue')
          .select('job_title, company_name, requirements, job_description, culture_fit_score, salary_range')
          .eq('id', jobId)
          .single()
        if (error || !data) return { content: [{ type: 'text', text: 'Job nicht gefunden' }] }
        return { content: [{ type: 'text', text: JSON.stringify(data) }] }
      }
    )

    // Tool 3: Company Research abrufen
    server.tool(
      'get_company_research',
      'Gibt gecachte Unternehmensrecherche zurück (Werte, News, Zitate). ' +
      'Gibt null zurück wenn kein Cache existiert — dann ohne Company Research generieren.',
      { jobId: z.string().uuid() },
      async ({ jobId }) => {
        const supabase = createClient()
        const { data: job } = await supabase
          .from('job_queue')
          .select('company_name')
          .eq('id', jobId)
          .single()
        if (!job) return { content: [{ type: 'text', text: 'null' }] }
        const { data } = await supabase
          .from('company_research')
          .select('research_data, quotes, cached_at')
          .eq('company_name', job.company_name)
          .order('cached_at', { ascending: false })
          .limit(1)
          .single()
        return { content: [{ type: 'text', text: JSON.stringify(data ?? null) }] }
      }
    )

    // Tool 4: Writing Style Analyse abrufen
    server.tool(
      'get_writing_style',
      'Gibt den persönlichen Schreibstil-Vektor und Beispielformulierungen des Users zurück. ' +
      'Basis für authentische Cover Letters im Stil des Users.',
      { userId: z.string().uuid() },
      async ({ userId }) => {
        const supabase = createClient()
        const { data } = await supabase
          .from('documents')
          .select('writing_style')
          .eq('user_id', userId)
          .not('writing_style', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        return { content: [{ type: 'text', text: JSON.stringify(data?.writing_style ?? null) }] }
      }
    )
  },
  {},
  // Transport: Streamable HTTP (kein Redis/KV Store benötigt)
  { maxDuration: 60 }
)

export { handler as GET, handler as POST }
```

> **Claude Opus:** Prüfe die tatsächlichen Spaltennamen in `database/schema.sql` BEVOR du
> die `.select()` Queries schreibst. Häufige Falle: `job_queue.company_name` (NICHT `company`).
> Passe die Queries an das tatsächliche Schema an.

### 11.2.4: Fallback-Wrapper in cover-letter-generator.ts
**Goal:** Dual-Path implementieren ohne bestehende Logik zu berühren.

**Modifizierte Datei:** `lib/services/cover-letter-generator.ts`

Prinzip: Die bestehende Funktion `generateCoverLetter` wird NICHT verändert.
Stattdessen wird ein neuer Wrapper-Export obendrüber gelegt:

```typescript
// Am ANFANG der Datei ergänzen (neue Imports):
import Anthropic from '@anthropic-ai/sdk' // falls noch nicht importiert

// NEUE Export-Funktion (ersetzt den bestehenden öffentlichen Aufruf):
export async function generateCoverLetterWithMcpFallback(
  userId: string,
  jobId: string
) {
  const mcpToolsCalled: string[] = []

  // Versuch 1: MCP-basierter Pfad
  try {
    const result = await generateWithMcpPath(userId, jobId, mcpToolsCalled)
    // Log: MCP-Pfad erfolgreich
    await logGenerationPath(result.logId, true, mcpToolsCalled)
    return result
  } catch (error) {
    console.warn('⚠️ MCP-Pfad fehlgeschlagen, Fallback auf Legacy:', error)
    // KEIN Sentry hier — das ist erwartetes Verhalten während der Rollout-Phase
  }

  // Versuch 2: Bestehende Legacy-Pipeline (unveränderter Code)
  const result = await generateCoverLetter(userId, jobId) // <- BESTEHENDE FUNKTION
  await logGenerationPath(result.logId, false, [])
  return result
}

// PRIVATE: MCP-basierter Generierungspfad
async function generateWithMcpPath(
  userId: string,
  jobId: string,
  mcpToolsCalled: string[]
) {
  // Claude mit tool_use — holt Daten on-demand
  // Die Tools korrespondieren 1:1 mit dem MCP Server in app/api/mcp/route.ts
  // Implementierung: tool_use loop bis kein tool_call mehr in response
}

// PRIVATE: Generation Log um MCP-Pfad-Info ergänzen
async function logGenerationPath(
  logId: string | undefined,
  usedMcp: boolean,
  tools: string[]
) {
  if (!logId) return
  const supabase = createClient()
  await supabase
    .from('generation_logs')
    .update({ used_mcp_path: usedMcp, mcp_tools_called: tools })
    .eq('id', logId)
}
```

> **Claude Opus:** Die Signatur der bestehenden `generateCoverLetter` Funktion darf
> sich NICHT ändern. Alle bestehenden Aufrufer dieser Funktion müssen weiter funktionieren.
> Nur neue Aufrufer sollen `generateCoverLetterWithMcpFallback` nutzen.

### 11.2.5: API Route aktualisieren
**Goal:** Den neuen Wrapper in der API Route nutzen — ohne das Interface zu brechen.

In `app/api/cover-letter/generate/route.ts`:
- Import ändern: `generateCoverLetter` → `generateCoverLetterWithMcpFallback`
- Sonst NICHTS ändern (Response-Format identisch)

> Diese Datei steht auf der Forbidden Files Liste. **Minimale chirurgische Änderung:**
> Nur der Import-Pfad und der Funktionsname — keine weitere Modifikation.
> Yannik's explizite Freigabe für diese eine Änderung gilt als erteilt durch diesen Task.

### 11.2.6: MCP Route absichern
**Goal:** `/api/mcp` in `middleware.ts` eintragen.

In `middleware.ts` — nur einen Eintrag ergänzen:
```typescript
// Bestehende Route-Liste um folgenden Eintrag ergänzen:
'/api/mcp', // MCP Server — Auth required
```

---

## VERIFICATION CHECKLIST

- [ ] Prerequisites vollständig gelesen
- [ ] `database/schema.sql` gegen alle `.select()` Queries abgeglichen
- [ ] Bestehende Cover Letter Generierung funktioniert unverändert (manuell testen)
- [ ] MCP-Pfad bei Fehler fällt silent auf Legacy zurück (Fehler simulieren)
- [ ] `generation_logs` zeigt `used_mcp_path: true` bei erfolgreichem MCP-Call
- [ ] `generation_logs` zeigt `used_mcp_path: false` bei Fallback
- [ ] `/api/mcp` Route in `middleware.ts` eingetragen
- [ ] `ARCHITECTURE.md` um neue Route `/api/mcp` ergänzt
- [ ] `npx tsc --noEmit` passes
- [ ] `.env.example` aktualisiert (falls neue Env-Variablen)
- [ ] DB-Migration in `supabase/migrations/` (NICHT `database/migrations/`)
- [ ] RLS: MCP-Tools geben ausschließlich Daten des eingeloggten Users zurück

## SUCCESS CRITERIA
✅ Cover Letter Generierung funktioniert weiterhin ohne Unterbrechung
✅ Bei MCP-Erfolg: Claude holt Daten on-demand via tool_use
✅ Bei MCP-Fehler: Automatischer, stiller Fallback auf Legacy-Pipeline
✅ `generation_logs` zeigt welcher Pfad genutzt wurde
✅ Token-Verbrauch im MCP-Pfad messbar (via generation_logs.tokens_used)
✅ Kein Breaking Change an bestehenden API-Response-Formaten

## EXECUTION ORDER
1. Prerequisites lesen (besonders `cover-letter-generator.ts` und Schema)
2. Impact Map gegen Code verifizieren, OPEN QUESTIONS dokumentieren
3. DB-Migration schreiben + deployen (`supabase db push`)
4. `@vercel/mcp-adapter` installieren
5. MCP Server Route anlegen (11.2.3)
6. Fallback-Wrapper implementieren (11.2.4)
7. API Route minimal anpassen (11.2.5)
8. `middleware.ts` Eintrag (11.2.6)
9. Legacy-Pipeline manuell testen (muss identisch bleiben)
10. MCP-Fehlerfall testen (Claude-API deaktivieren → Fallback muss greifen)
11. Yannik mit Messergebnissen informieren (Token-Verbrauch MCP vs. Legacy)

---

## ⚠️ PARALLELISIERUNGS-HINWEIS

Dieser Agent berührt `middleware.ts` (ein Eintrag) und `supabase/migrations/` (eine neue Migration).
**Nicht parallel zu AGENT_11.1 (ebenfalls middleware.ts) oder anderen DB-Migrations-Tasks.**
Der Fallback-Wrapper kann parallel entwickelt werden, die Migration muss solo deployt werden.
