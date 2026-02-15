# 🏗️ MASTER PROMPT TEMPLATE — Pathly V2.0 Agent Directive

> **Wiederverwendbare Vorlage** für alle Phasen-Prompts.
> Kopiere dieses Template und ersetze alle `{{PLATZHALTER}}` mit den konkreten Werten.

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

4. **`docs/MASTER_PLAN.md`** — Overall Roadmap
   - Check current phase status
   - Understand dependencies between phases

5. **`AGENTS.md`** — Agent Architecture
   - Understand which agents are involved
   - Check for overlapping responsibilities

6. **`directives/{{RELEVANT_DIRECTIVE}}.md`** — Phase-specific directive (if exists)

7. **`database/schema.sql`** — Database Schema
   - Verify all table columns match your code
   - Check RLS policies and indexes

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Read ALL prerequisite docs listed above
- Check existing services in `lib/services/` for reusable patterns
- Check existing components in `components/` for UI consistency
- Verify database columns match your planned queries

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
- [ ] Database queries match schema columns exactly
- [ ] Environment variables are documented in `.env.example`

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
2. {{Step 2}}
3. {{Step 3}}
4. Test interoperability
5. Update documentation

---

## ⚠️ PARALLELISIERUNGS-HINWEIS
{{Kann dieser Agent parallel zu anderen laufen? Wenn ja, welche? Wenn nein, warum nicht?}}
