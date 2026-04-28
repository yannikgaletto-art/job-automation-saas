# USER_EDIT_FIRST_PLAN_2026-04-28
## CV-Parser: User-Edit-First Architecture

**Status:** PLAN — awaiting "Go" before any code is written
**Branch:** cv-reset (after Architecture Reset)
**Date:** 2026-04-28

---

## 1. MISSION

Replace the current architecture where the LLM (Claude Haiku) is the primary source of truth for CV structure with one where **the user is the primary source of truth**.

Current flow (broken):
```
PDF → Azure OCR → Claude Haiku parses → cv_structured_data (LLM decides everything)
```

Target flow:
```
PDF → Azure OCR → Minimal LLM parse → Show user in edit UI → User confirms/corrects → cv_structured_data
```

The 18 post-processor functions that grew `cv-parser.ts` from 419 to 1596 lines were all compensating for LLM variance. The fundamental fix is: **give the user control, not the LLM.**

---

## 2. ARCHITECTURE: 1-LLM-STAGE WITH USER CONFIRMATION

### Step 1 — Parse (LLM, 1 call, simple prompt)
- Claude Haiku extracts structured JSON from OCR text
- Prompt is SHORT and prescriptive (no edge-case handling)
- Output may contain LLM errors — that's OK, user will fix them

### Step 2 — Show diff (UI)
- New component `CvEditConfirmDialog` appears after upload
- Shows extracted fields: name, stations (role + company + dates), education, certifications, languages, skills
- User can inline-edit each field before saving
- "Looks good" button → saves as-is
- "Edit" button → inline form per field

### Step 3 — Save (deterministic, no LLM)
- User-confirmed JSON saved to `user_profiles.cv_structured_data`
- No further LLM processing on save

---

## 3. CONCRETE UI COMPONENT PROPOSAL

### CvEditConfirmDialog (new component)
**File:** `components/profil/cv-edit-confirm-dialog.tsx`

```
┌─────────────────────────────────────────────────────┐
│  Lebenslauf erkannt — stimmt das?                    │
│                                                     │
│  Name:           [Yannik Galetto          ] ✎       │
│                                                     │
│  Berufserfahrung                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ Innovation Manager  │ Ingrano Solutions      │   │
│  │ 01/2022 – heute     │                [✎] [🗑]│   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ Co-Founder          │ Xorder Menus           │   │
│  │ 06/2019 – 12/2021   │                [✎] [🗑]│   │
│  └──────────────────────────────────────────────┘   │
│  [+ Station hinzufügen]                             │
│                                                     │
│  Bildung                                            │
│  ┌──────────────────────────────────────────────┐   │
│  │ M.Sc. Innovation    │ Universität Potsdam    │   │
│  │ 2020 – 2022         │                [✎] [🗑]│   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  [Sieht gut aus — Speichern]  [Alles bearbeiten]    │
└─────────────────────────────────────────────────────┘
```

### Trigger Points
1. After CV upload (existing upload flow in `active-cv-card.tsx`)
2. After re-parse button click (existing `app/api/documents/reparse/route.ts`)

### Data Flow
```
upload → /api/documents/upload → returns parsed JSON (not yet saved)
                                        ↓
                            CvEditConfirmDialog opens
                                        ↓
                            User edits/confirms
                                        ↓
                    POST /api/documents/confirm-parse
                    { documentId, confirmedStructure }
                                        ↓
                    saves to user_profiles.cv_structured_data
```

---

## 4. BACKEND CHANGES

### New API Route: /api/documents/confirm-parse
**File:** `app/api/documents/confirm-parse/route.ts`
- POST: `{ documentId: UUID, confirmedStructure: CvStructuredData }`
- Auth guard + ownership check
- Zod validation of `confirmedStructure`
- Writes to `user_profiles.cv_structured_data`
- Updates `user_profiles.cv_original_file_path`

### Modified: /api/documents/upload
- Returns parsed JSON in response body (does NOT save to profile yet)
- Current: saves immediately → parse confirm → save
- New: parse only → return to UI for confirmation → /confirm-parse saves

### Modified: /api/documents/reparse
- Returns parsed JSON in response body (does NOT save to profile yet)
- Same pattern as upload

---

## 5. WHAT GETS DELETED FROM cv-parser.ts

The 15 post-processor functions added in patch-waves A.5 through Phase 8 are
removed because user confirmation replaces them:

| Function | Lines | Why removed |
|---|---|---|
| `recoverMissingExperienceCompany` | ~40 | User confirms company directly |
| `recoverMissingEducationInstitution` | ~35 | User confirms institution directly |
| `recoverMissingEducationDescription` | ~45 | User confirms/adds bullets |
| `recoverMissingLanguages` | ~60 | User sees language section in dialog |
| `recoverCertsFromRawSection` | ~120 | User confirms cert list |
| `dropProjectLikeCerts` | ~20 | User decides what's a cert |
| `truncateCertDescriptionAtNewline` | ~10 | User edits description |
| `validateDescriptionsAgainstRawText` | ~50 | User is the ground truth |
| `cleanCertificationNames` | ~25 | User edits names |
| `sanitizeCertIssuer` | ~20 | User edits issuer |
| `cleanSkillCategories` | ~15 | User edits categories |
| `splitMergedSkillGroups` | ~25 | User edits groups |
| `cleanLanguageProficiency` | ~20 | User edits proficiency |
| `stripGradeFromEducationDescription` | ~30 | User edits grade field |
| `normaliseForMatch` helper | ~10 | No longer needed |

**Result:** cv-parser.ts drops from 419 → ~150 lines (LLM call + Zod validation only)

---

## 6. ESTIMATE

| Phase | Work | Time |
|---|---|---|
| P1: Split upload response (parse vs save) | 2 routes + type changes | 2h |
| P2: /api/documents/confirm-parse | New route | 1h |
| P3: CvEditConfirmDialog UI | New component, i18n 3 locales | 4h |
| P4: Wire dialog into upload + reparse flow | active-cv-card.tsx changes | 1h |
| P5: Delete 15 post-processors from cv-parser.ts | Careful deletion + test updates | 2h |
| P6: E2E test + polish | Manual smoke test | 1h |
| **Total** | | **~11h** |

---

## 7. ACCEPTANCE CRITERIA

After implementation, a new agent or Yannik himself can verify:

1. **Upload flow:** Upload a PDF → `CvEditConfirmDialog` appears with extracted fields — no auto-save
2. **Name fix:** If LLM extracted wrong name, user can correct it in the dialog before saving
3. **Station fix:** If LLM missed "Co-Founder" company, user can add it — one click
4. **Confirm:** Click "Sieht gut aus — Speichern" → profile saved → no post-processor needed
5. **cv-parser.ts line count:** `wc -l lib/services/cv-parser.ts` returns ≤ 160
6. **TypeScript:** `npx tsc --noEmit` clean
7. **Tests:** All non-flake tests pass

---

## 8. RISKS + MITIGATIONS

| Risk | Mitigation |
|---|---|
| User skips dialog (closes without confirming) | Save parsed data anyway as fallback (same as today) |
| Dialog too complex, users abandon upload | Keep it simple: name + stations only in v1; certs/skills collapse behind "Advanced" |
| LLM parse is SO bad user can't recognize their CV | Show raw OCR text alongside parsed fields as reference |
| Mobile UX | Dialog is full-screen on mobile (shadcn Sheet instead of Dialog) |

---

## 9. WHAT THIS PLAN DOES NOT INCLUDE

- Editing bullets within stations (v2 — stations confirm is v1)
- AI-suggested completions in the edit form
- Batch import of multiple CVs (Single-CV invariant still applies)
- The optimizer still uses `cv_structured_data` as-is — no changes there

---

## NOTE TO NEXT AGENT

Before touching any code:
1. Read `directives/FEATURE_COMPAT_MATRIX.md` Section 2+3
2. Confirm with Yannik that this plan gets "Go"
3. Write tests first (TDD) — `parseCvTextToJson` has no post-processors to test, but the confirm-parse route and CvEditConfirmDialog logic need unit tests
4. Do NOT touch `model-router.ts`, `middleware.ts`, or existing migrations

The cv-reset branch already has `cv-parser.ts` at 419 lines. This plan brings it to ~150 lines. REDUCE COMPLEXITY is the law.
