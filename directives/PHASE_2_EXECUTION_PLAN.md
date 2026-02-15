# 🚀 PHASE 2 AGENT EXECUTION PLAN

**Erstellt:** 2026-02-14  
**Version:** 1.0  
**Status:** Ready for Deployment

---

## 📋 ÜBERSICHT

Du hast jetzt **4 spezialisierte Agent-Prompts** für Phase 2:

1. **Agent 2.1** - Company Research Enhancement
2. **Agent 2.2** - CV Optimization Engine
3. **Agent 2.3** - Quality Judge Loop
4. **Director** - Critical Quality Testing

---

## ⚙️ AUSFÜHRUNGSREIHENFOLGE

### ✅ PARALLEL MÖGLICH

**Agents 2.1, 2.2, und 2.3 können PARALLEL gestartet werden!**

**Warum?**
- Sie arbeiten an **unabhängigen Services**
- Keine gegenseitigen Abhängigkeiten
- Verschiedene Datenbank-Tabellen
- Verschiedene API-Endpoints

**Beispiel:**
```bash
# Terminal 1
Agent 2.1 → Company Research Enhancement

# Terminal 2  
Agent 2.2 → CV Optimization

# Terminal 3
Agent 2.3 → Quality Judge Loop
```

### ⚠️ SEQUENZIELL ERFORDERLICH

**Director MUSS NACH ALLEN anderen Agents laufen!**

**Reihenfolge:**
```
┌─────────────────────────────────────┐
│  Agent 2.1 (Company Research)       │
│  Agent 2.2 (CV Optimization)        │ → PARALLEL
│  Agent 2.3 (Quality Judge)          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  ALLE 3 AGENTEN FERTIG              │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Director - Quality Testing         │ → SEQUENZIELL
│  (Testet & Repariert ALLES)         │
└─────────────────────────────────────┘
```

---

## 📁 ERSTELLTE DATEIEN

Die folgenden Prompts sind bereit:

### 1. Agent 2.1 - Company Research Enhancement
**Datei:** `directives/AGENT_2.1_COMPANY_RESEARCH.md`

**Aufgaben:**
- LinkedIn Activity Extraction via Perplexity
- Improved Quote Suggestion Algorithm (85%+ Match Scores)
- Frontend UI für Company Research

**Erwartete Outputs:**
- `lib/services/company-enrichment.ts` (enhanced)
- `lib/services/quote-matcher.ts` (new)
- Updated UI component für Quote Selection

---

### 2. Agent 2.2 - CV Optimization Engine
**Datei:** `directives/AGENT_2.2_CV_OPTIMIZATION.md`

**Aufgaben:**
- CV Optimization Service (Claude Sonnet 4.5)
- Before/After Comparison UI
- ATS Score Calculation (0-100)

**KRITISCHE REGEL:**
- ❌ **KEINE HALLUZINATIONEN!** Nur wahre Fakten.

**Erwartete Outputs:**
- `lib/services/cv-optimizer.ts` (new)
- `components/cv/cv-comparison.tsx` (new)
- `app/api/cv/optimize/route.ts` (new)

---

### 3. Agent 2.3 - Quality Judge Loop
**Datei:** `directives/AGENT_2.3_QUALITY_JUDGE.md`

**Aufgaben:**
- Quality Judge Service (Claude Haiku 4)
- Iterative Generator Loop (max 3 Iterations)
- Quality Feedback UI (4 Dimensions Scoring)

**Target:** 8/10 Quality Score

**Erwartete Outputs:**
- `lib/services/quality-judge.ts` (new)
- Updated `lib/services/cover-letter-generator.ts` (with loop)
- `components/cover-letter/quality-feedback.tsx` (new)

---

### 4. Director - Critical Quality Testing
**Datei:** `directives/DIRECTOR_QUALITY_TESTING.md`

**Aufgaben:**
- Code Audit (line-by-line review)
- Database Integrity Tests
- API Endpoint Testing (cURL + Browser)
- Frontend Testing (alle Edge Cases!)
- Integration Testing (E2E Flow)
- Risk Assessment (Security, Performance, UX)
- **FIX EVERYTHING** (keine Bugs toleriert!)
- Create QUALITY_REPORT.md

**Mindset:** "If it can break, it WILL break in production."

---

## 🎯 WICHTIGE RICHTLINIEN (FÜR ALLE AGENTS)

### Prerequisites (MÜSSEN gelesen werden!)

**ALLE Agents MÜSSEN folgendes lesen:**

1. ✅ `docs/ARCHITECTURE.md` - System Architecture
2. ✅ `docs/DESIGN_SYSTEM.md` - UI/UX Standards  
3. ✅ `CLAUDE.md` - **"Reduce Complexity!"** (CRITICAL!)
4. ✅ `database/schema.sql` - Database Schema

### Coding Standards

- ✅ TypeScript (NO `any` types)
- ✅ Error Handling (try-catch ÜBERALL)
- ✅ Notion-like Aesthetic (`bg-[#FAFAF9]`, clean forms)
- ✅ Environment Variables documented
- ✅ Browser Testing (mit Screenshots!)

---

## ✅ SUCCESS CRITERIA

### Agent 2.1 (Company Research)
- [ ] LinkedIn activity extracted (5-7 posts)
- [ ] Quote match scores ≥ 85%
- [ ] UI matches Notion aesthetic
- [ ] 7-day cache works

### Agent 2.2 (CV Optimization)
- [ ] CV optimized truthfully (NO hallucinations)
- [ ] ATS score ≥ 75 for matched jobs
- [ ] Before/after comparison UI works
- [ ] User can accept/revert changes

### Agent 2.3 (Quality Judge)
- [ ] Judge scores consistently (4 dimensions)
- [ ] Max 3 iterations enforced
- [ ] Target score 8/10 reached in 80%+ cases
- [ ] Quality feedback UI shows scores

### Director (Quality Testing)
- [ ] ALL bugs found and fixed
- [ ] E2E flow works (onboarding → cover letter)
- [ ] Security verified (no vulnerabilities)
- [ ] Performance acceptable (<10s API calls)
- [ ] QUALITY_REPORT.md created

---

## 🚨 KRITISCHE WARNUNGEN

### FÜR ALLE AGENTS:

1. **"Reduce Complexity!"** - Keep it simple (aus `CLAUDE.md`)
2. **NO Over-Engineering** - MVP approach only
3. **Test Everything** - Browser-Tests REQUIRED
4. **Document Changes** - walkthroughs.md mit Screenshots

### FÜR Agent 2.2 (CV Optimization):

⚠️ **CRITICAL RULE:**
```
NEVER hallucinate!
NEVER invent experience!
NEVER add fake skills!
```

### FÜR Agent 2.3 (Quality Judge):

⚠️ **MAX 3 ITERATIONS:**
```
Don't loop forever!
If score < 8 after 3 tries, use best attempt.
```

### FÜR DIRECTOR:

⚠️ **READ ALL WALKTHROUGHS:**
```
/Users/yannik/.gemini/antigravity/brain/e0f62fef-a60c-4bd0-ad3c-c90b61dd1b75/walkthrough.md
```
Alle bisherigen Walkthroughs durchlesen, um Kontext zu verstehen und potenzielle Fehler zu finden!

---

## 📊 ERWARTETE ZEITAUFWÄNDE

| Agent | Geschätzte Dauer | Komplexität |
|-------|------------------|-------------|
| Agent 2.1 | 2-3 Stunden | Medium (Perplexity Integration) |
| Agent 2.2 | 3-4 Stunden | High (CRITICAL: No Hallucinations!) |
| Agent 2.3 | 2-3 Stunden | Medium (Loop Logic) |
| Director | 4-6 Stunden | Very High (Testing EVERYTHING) |

**Total:** ~11-16 Stunden (bei paralleler Ausführung: ~4-6h für Agents + 4-6h für Director = **8-12h**) 

---

## 🎬 STARTBEFEHL

### Option 1: Parallel (Empfohlen)

**3 separate Gemini 3 Pro Instanzen gleichzeitig starten:**

```
Instance 1:
"Bitte führe die Aufgaben aus, die in directives/AGENT_2.1_COMPANY_RESEARCH.md beschrieben sind. Lies zuerst ALLE Prerequisites!"

Instance 2:
"Bitte führe die Aufgaben aus, die in directives/AGENT_2.2_CV_OPTIMIZATION.md beschrieben sind. Lies zuerst ALLE Prerequisites!"

Instance 3:
"Bitte führe die Aufgaben aus, die in directives/AGENT_2.3_QUALITY_JUDGE.md beschrieben sind. Lies zuerst ALLE Prerequisites!"
```

**Sobald ALLE 3 fertig:**

```
Instance 4 (Director):
"Bitte führe die kritischen Tests aus, die in directives/DIRECTOR_QUALITY_TESTING.md beschrieben sind. Lies ALLE Walkthroughs und Prerequisites zuerst!"
```

### Option 2: Sequenziell (Sicherer, aber langsamer)

```
1. Agent 2.1 → fertig → walkthrough.md erstellt
2. Agent 2.2 → fertig → walkthrough.md erstellt  
3. Agent 2.3 → fertig → walkthrough.md erstellt
4. Director → testet ALLES → QUALITY_REPORT.md erstellt
```

---

## ✨ FINALE DELIVERABLES

Nach Abschluss aller Agents hast du:

### Code:
- ✅ 3 neue Services (company-enrichment, cv-optimizer, quality-judge)
- ✅ 3 neue UI Components (quote selection, cv comparison, quality feedback)
- ✅ 3 neue API Routes

### Documentation:
- ✅ 4 Walkthroughs (Agents 2.1, 2.2, 2.3 + ihre Screenshots)
- ✅ 1 QUALITY_REPORT.md (vom Director)

### Quality Assurance:
- ✅ Alle Bugs gefunden und gefixt
- ✅ E2E Flow getestet
- ✅ Production-ready Code

---

**🚀 Viel Erfolg! Die Prompts sind extrem detailliert und führen die Agents Schritt für Schritt durch.**
