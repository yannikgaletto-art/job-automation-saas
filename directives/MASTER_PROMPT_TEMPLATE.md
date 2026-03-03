# 🏗️ MASTER PROMPT TEMPLATE — Pathly V2.0 Agent Directive

> **Wiederverwendbare Vorlage** für alle Phasen-Prompts.
> Kopiere dieses Template und ersetze alle `{{PLATZHALTER}}` mit den konkreten Werten.

---

## ⛔ FORBIDDEN FILES — ABSOLUTE SPERRZONE

**Diese Dateien dürfen WEDER gelesen NOCH geschrieben werden, es sei denn der Task bezieht sich EXPLIZIT auf sie.**

**Jede ungeplante Berührung ist ein kritischer Cross-Feature-Contamination-Fehler.**

```
lib/ai/model-router.ts                          ← SHARED — alle Features nutzen dies
lib/inngest/cv-match-pipeline.ts                ← Feature: CV Match
lib/inngest/cover-letter-*.ts                   ← Feature: Cover Letter
lib/inngest/certificates-pipeline.ts            ← Feature: Certificates
app/dashboard/components/cv-match/*             ← Feature: CV Match
app/dashboard/components/steckbrief/*           ← Feature: Steckbrief
app/api/cover-letter/*                          ← Feature: Cover Letter (außer explizit beauftragt)
middleware.ts                                   ← SYSTEM-LEVEL
supabase/migrations/*                           ← DB-SCHEMA (nur via explizite Migration-Tasks)
```

**Wenn dein geplanter Fix eine dieser Dateien berühren würde:**
1. STOPP sofort
2. Erkläre dem User WARUM du sie anfassen müsstest
3. Warte auf explizite Freigabe

**Warum diese Regel existiert:**
- `model-router.ts` wird von CV Match, Steckbrief, Cover Letter UND Certificates genutzt
- Jede Änderung dort hat Blast Radius auf ALLE Features
- Ein "kleiner Fix" in einem Feature crasht drei andere Features
- Das kostet Zeit, Geld und Vertrauen

**Siehe auch:** `directives/FEATURE_COMPAT_MATRIX.md` für detaillierte Ownership-Regeln.

---

## MISSION
{{MISSION_BESCHREIBUNG — Was soll der Agent erreichen? 1-2 Sätze.}}

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow
   - Study the relevant section for this phase
   - Understand how this feature fits into the overall pipeline

2. **`docs/DESIGN_SYSTEM.md`** — UI/UX Standards
   - Follow Notion-like aesthetic (`bg-[#FAFAF9]`, clean forms)
   - Maintain consistency with existing components

3. **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"**
   - MVP-first approach
   - No over-engineering
   - Lean implementation

4. **`directives/FEATURE_COMPAT_MATRIX.md`** — **PFLICHT bei jedem Task**
   - Cross-Feature-Ownership-Regeln (Abschnitt 2)
   - Feature-spezifische Kompatibilitäts-Matrix (Abschnitt 1)
   - Verhindert Cross-Feature-Contamination

5. **`docs/MASTER_PLAN.md`** — Overall Roadmap
   - Check current phase status
   - Understand dependencies between phases

6. **`AGENTS.md`** — Agent Architecture
   - Understand which agents are involved
   - Check for overlapping responsibilities

7. **`directives/{{RELEVANT_DIRECTIVE}}.md`** — Phase-specific directive (if exists)

8. **`database/schema.sql`** — Database Schema
   - Verify all table columns match your code
   - Check RLS policies and indexes
   - **TRAP:** `job_queue.company_name` (NICHT `company`)

8. **`directives/FEATURE_COMPAT_MATRIX.md`** — Feature-Silo Rules
   - Check Section 4+ for Feature-Silo boundaries
   - Identify Forbidden Files before coding

---

## ⛔ FORBIDDEN FILES — Define Before Coding

Bevor du Code schreibst, definiere **explizit** welche Dateien Sperrzone sind:

```
# Beispiel für Certificates-Feature:
lib/ai/model-router.ts            ← SHARED — NICHT anfassen
lib/inngest/cv-match-pipeline.ts   ← FREMDES FEATURE
middleware.ts                      ← SYSTEM-LEVEL
```

**Regel:** Wenn eine geplante Änderung eine Forbidden File berühren würde → STOPP → Erkläre warum → Warte auf Freigabe.

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Read ALL prerequisite docs listed above
- Check existing services in `lib/services/` for reusable patterns
- Check existing components in `components/` for UI consistency
- Verify database columns match your planned queries
- **Check Forbidden Files list** — ensure your task doesn't touch them

### 2. 🧹 Reduce Complexity
- **MVP first** — Implement the simplest working version
- **No premature optimization** — Only optimize if measured performance issue
- **Reuse existing patterns** — Don't reinvent what's already built
- **Max 200 lines per file** — Split if larger

### 3. 📁 Proper Filing
- New services → `lib/services/{{service-name}}.ts`
- New components → `components/{{feature}}/{{component-name}}.tsx`
- New API routes → `app/api/{{feature}}/{{action}}/route.ts`
- New skills/workflows → `.agent/workflows/{{workflow-name}}.md`
- Update `docs/MASTER_PLAN.md` to mark completed tasks

### 4. 🎖️ Senior Engineer Autonomy
- Make architectural decisions independently
- Handle edge cases without asking
- Write production-quality code (proper types, error handling, logging)
- Document non-obvious decisions with inline comments

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes (no new TypeScript errors)
- [ ] New service integrates with existing API routes
- [ ] New components render correctly in existing layouts
- [ ] Database queries match schema columns exactly (`.select()` vs actual columns)
- [ ] Environment variables are documented in `.env.example`
- [ ] **No Forbidden Files were touched** (unless explicitly approved)

### 6. ⚡ Efficiency
- Parallel file reads where possible
- Batch database operations
- Reuse existing Supabase client instances
- Don't duplicate code that exists in other services

### 7. 📝 Additional Standards
- **TypeScript strict** — No `any` types
- **Error handling** — `try/catch` on all async operations
- **Logging** — Console logs with emoji prefixes (✅ ❌ ⚠️ 💾 🔍)
- **Types/Interfaces** — Export for reuse across services
- **Imports** — Use `@/` path aliases consistently

---

## CURRENT STATE
{{BESCHREIBUNG DES AKTUELLEN ZUSTANDS}}
- ✅ Was bereits existiert
- ⚠️ Was teilweise existiert
- ❌ Was fehlt

---

## YOUR TASK

### {{PHASE_NR}}.1: {{AUFGABE_1_TITEL}}
**Goal:** {{Ziel}}
**Implementation:**
```typescript
// Code-Skeleton hier
```

### {{PHASE_NR}}.2: {{AUFGABE_2_TITEL}}
**Goal:** {{Ziel}}
**Implementation:**
```typescript
// Code-Skeleton hier
```

*(Weitere Aufgaben nach Bedarf)*

---

## VERIFICATION CHECKLIST
- [ ] All prerequisite docs read and cross-referenced
- [ ] Forbidden Files list checked — none touched without approval
- [ ] `npx tsc --noEmit` passes
- [ ] Browser test on localhost:3000 confirms functionality
- [ ] No breaking changes to existing features
- [ ] `docs/MASTER_PLAN.md` updated (tasks checked off)
- [ ] New environment variables added to `.env.example`

## SUCCESS CRITERIA
✅ {{Kriterium 1}}
✅ {{Kriterium 2}}
✅ {{Kriterium 3}}

## EXECUTION ORDER
1. Read all prerequisite documents
2. Check Forbidden Files — confirm task scope doesn't touch them
3. {{Step 3}}
4. {{Step 4}}
5. Test interoperability
6. Update documentation

---

## ⚠️ PARALLELISIERUNGS-HINWEIS
{{Kann dieser Agent parallel zu anderen laufen? Wenn ja, welche? Wenn nein, warum nicht?}}
