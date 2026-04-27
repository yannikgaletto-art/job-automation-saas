# Pathly V2.0 - DEVELOPER OPERATING MANUAL

**Status:** MANDATORY FOR ALL AI AGENTS
**Version:** 3.9
**Last Updated:** 2026-04-18

---

## ⚠️ PFLICHTLEKTÜRE VOR ANIMATIONEN
→ docs/MOTION_PRINCIPLES.md
Kein Framer Motion Code ohne diese Datei gelesen zu haben.

## ⚠️ MIGRATIONS — AUTORITÄRER PFAD
→ supabase/migrations/ ist das einzige aktive Migrationsverzeichnis.
→ database/migrations/ ist veraltet — NIEMALS neue Migrationen dort anlegen.
→ Neue Migrationen IMMER in: supabase/migrations/

## ⚠️ COMPANY RESEARCH DIRECTIVE
→ directives/company_research.md (die einzige aktuelle Version)
→ AGENT_2.1 und AGENT_3.1 wurden gelöscht

## ⛔ CROSS-FEATURE-SHIELD (NEUE PFLICHT ab 2026-03-03)
→ directives/FEATURE_COMPAT_MATRIX.md
**PFLICHT bei JEDEM Task — keine Ausnahmen.**

Was das ist:
- Abschnitt 1: Feature-spezifische Kompatibilitäts-Matrizen (Cover Letter Modules)
- Abschnitt 2: **Generische Cross-Feature-Ownership-Regeln** — gilt für ALLE Features
- Abschnitt 3: Forbidden Files Liste — Dateien die NUR mit expliziter Freigabe angefasst werden dürfen

Warum das wichtig ist:
- Verhindert, dass ein Fix in Feature A die Features B, C, D crasht
- `model-router.ts` wird von CV Match, Steckbrief, Cover Letter UND Certificates genutzt
- Eine ungeplante Änderung dort hat Blast Radius auf ALLE Features
- Das kostet Zeit, Geld und Vertrauen

**Workflow:**
1. Task erhalten
2. FEATURE_COMPAT_MATRIX.md lesen (Abschnitt 2 + 3)
3. Prüfen: Berührt mein Task eine Forbidden File?
4. Wenn JA: STOPP → User fragen → Freigabe abwarten
5. Wenn NEIN: Fortfahren

## ⚠️ NEUES FEATURE? PFLICHT-ANALYSE ZUERST
→ directives/FEATURE_IMPACT_ANALYSIS.md
Jedes neue Feature braucht eine Impact Map BEVOR Code geschrieben wird.
Impact Map Yannik vorlegen und auf "Go" warten.

## 🔒 DOCUMENTATION SYNC PFLICHT (ab 2026-03-09)
Jede Änderung an der Datenbank oder den API-Routen erfordert zwingend Doku-Updates:
- **Neue SQL-Migration in `supabase/migrations/`** → `database/schema.sql` UND `ARCHITECTURE.md` Tabellenliste aktualisieren
- **Neue API-Route in `app/api/`** → `ARCHITECTURE.md` Route-Struktur aktualisieren
- **Neue DB-Tabelle mit `user_id`** → `docs/SICHERHEITSARCHITEKTUR.md` §3 (SESSION CONTRACT) aktualisieren
- **Entfernung eines API-Endpoints** → `app/_archive/` (nicht löschen), Changelog-Eintrag in CLAUDE.md

Kein PR/Commit ohne diese Updates. Diese Regel existiert, weil die Doku in den letzten Wochen vom Code abgedriftet ist und Agenten dann veraltete Informationen nutzen.

**Anmerkung:** `ARCHITECTURE.md` liegt im Projekt-Root (nicht in `docs/`) und ist die autoritäre System-Design-Doku (V5.2+).

## ⚠️ i18n PROTOCOL (ab 2026-03-17)
→ directives/i18n_protocol.md
Jede Komponente mit User-sichtbaren Strings MUSS `useTranslations()` verwenden.
Kein hardcoded Text in JSX. Neuer key → de + en + es gleichzeitig.

## ⚠️ CV & COVER LETTER QUALITY
→ directives/QUALITY_CV_COVER_LETTER.md
Diese Standards sind BINDEND für alle Dokument-Generationen.
Qualitätsreferenz ist immer T1 (Mission Wertvoll).

## ⚠️ ZURÜCKGESTELLTE FEATURES (Backlog)
→ directives/DEFERRED_FEATURES.md
Liste aller Features, die für V2.0 depriorisiert wurden.

## ⚠️ KANONISCHE IMPORT-PFADE
| Service | Korrekter Import |
|---------|----------------|
| Supabase (Server) | @/lib/supabase/server |
| Supabase (Client) | @/lib/supabase/client |
| Job Search Pipeline | @/lib/services/job-search-pipeline |
| Onboarding Store | @/store/use-onboarding-store |
| Company Card | @/components/company/company-intel-card |
| Mood Symbols (Tag/Nacht) | @/lib/mood/mood-symbols |
| Supabase Admin (Service) | @/lib/supabase/admin |
| Credit Service | @/lib/services/credit-service |
| Credit Gate Middleware | @/lib/middleware/credit-gate |
| Stripe Service | @/lib/services/stripe-service |
| PII Sanitizer | @/lib/services/pii-sanitizer |

---

## 🚀 RECENT FIXES
| Feature | Fix / Implementation |
|---------|----------------------|
| **CV-Profil Welle C — Re-Parse-Button im Profil-Tab (2026-04-27)** | **User-Wunsch: bisher musste ein User einen neuen CV hochladen, um den Parser nochmal laufen zu lassen — disruptiv (alte Doc-Versions anhäufen, Master-Wechsel). Jetzt: Refresh-Icon-Button auf jeder CV-Card, der den Parser auf `documents.metadata.extracted_text` ohne Re-Upload neu laufen lässt. **Implementation:** (1) `lib/services/cv-master-sync.ts` Helper erweitert um `SyncOptions { force?: boolean }` als 4. Parameter — wenn `force=true`, wird die Idempotency-Skip-Logik (Phase 5.8 Health-Check) übersprungen und der Parser läuft IMMER. Default `false` (Match-Pfade verhalten sich identisch). (2) Neue API-Route `app/api/documents/reparse/route.ts` (POST mit `{ cvDocumentId: UUID }`) mit Auth-Guard + document_type='cv' Validation + `maxDuration = 60s` (Claude Haiku ~16s + Buffer). Die Route ruft `syncMasterCvFromDocument(userId, cvDocumentId, admin, { force: true })` — der gewählte Doc wird zum Master (kohärent mit Welle B's impliziter "User-Pick = Master" Vertrag). Status-Codes: 200 (synced), 401 (unauth), 404 (no-document), 422 (no-text), 500 (sync error). (3) UI-Button `components/profil/active-cv-card.tsx` in `renderDocRow`: nur für CV-Docs (nicht CL), zwischen Category-Selector und Download. RefreshCw-Icon mit `animate-spin` während `reparsingId === doc.id`. Disabled bei Re-Parse-in-Progress (verhindert Doppel-Klick-Spam). Toast-Notification bei Erfolg/Fehler. (4) i18n in `locales/{de,en,es}.json` Namespace `upload`: 4 neue Keys (`reparse_title`, `reparse_in_progress`, `reparse_success`, `reparse_failed`). **Tests:** 3 neue Cases in `lib/services/__tests__/cv-master-sync.test.ts` (force=true bypasses idempotency, force=false preserves it, force=true on non-master doc switches master). 11/11 cv-master-sync grün, 529/530 jest gesamt grün (1 pre-existing inngest/health flake), `tsc --noEmit` clean. **Akzeptierte Limitations:** (a) keine Rate-Limit auf der Route — Frontend-Disabled verhindert Spam pro Doc, multi-Doc-Spam realistisch begrenzt (1-3 CVs pro User). (b) Race-Condition Re-Parse + parallel CV-Match: last-writer-wins auf `user_profiles.cv_structured_data`, akzeptabel da Re-Parse explizit user-initiated. (c) Mid-failure-state: wenn Re-Parse-DB-Commit erfolgt aber Network-Drop vor User-Response → Master ist konsistent, User sieht "fehlgeschlagen", kann erneut triggern. **User-Verifikation:** Profil-Tab → Refresh-Icon auf einem CV → Spinner dreht ~16s → Toast "CV neu ausgewertet ✅" → nächster CV-Match nutzt neue cv_structured_data.** |
| **Job-Ingest Welle G — Sync-Extraction-Failure-Diagnose (2026-04-27)** | **Verifizierter Bug aus User-Feedback 2026-04-27 abends: nach manuellem Job-Eingang (virtual7 Senior Manager via Instaffo) war `requirements=null`, `buzzwords=null`, `metadata={}` — Job leer ohne ersichtlichen Grund. Root-Cause: `app/api/jobs/ingest/route.ts:314+` swallow-catched alle AI-Errors mit `console.warn` und schrieb leeren Job ohne Spur (`// Proceed with empty extraction rather than failing the ingest`). Ursache des AI-Fehlers war wahrscheinlich Anthropic-Quota oder transienter Network-Fehler. **Lean-Fix:** (1) Outer-scope Variable `extractionError: string | null` initialisiert. (2) Catch-Block: `console.warn` → `console.error`, errMsg auf 500 chars gecapped + Variable gesetzt. (3) `no_api_key` Branch setzt extractionError zu "AI extraction skipped: no API key configured". (4) Im STEP-4.5 metadata-Update: `if (hasSyncData || extractionError)` triggert den Update auch bei leerer Extraction; persistiert `metadata.extraction_error` + `metadata.extraction_error_at` (ISO-Timestamp). Bei erfolgreicher Re-Run werden beide Felder explizit gelöscht (`delete metadataUpdate.extraction_error`) — kein stale state. **Lean-Decision** (User-Direktive): UX-Erweiterungen (UI-Banner mit roter Fehlermeldung, Auto-Retry beim Job-Open) bewusst NICHT in dieser Welle — sie sind UX-Verbesserungen, nicht Bug-Fixes. Der Backend-Diagnostic-Pfad ist die Voraussetzung für die UI-Welle. Yannik kann nach dem Push einen leeren Job per `select id, metadata->'extraction_error', metadata->>'extraction_error_at' from job_queue where id = '...'` direkt diagnostizieren. **Tests:** keine neuen — Pfad ist API-Route mit Inngest+Supabase+AI-Mocks, Test-Cost > Test-Value für 25-Zeilen-Diagnostic-Fix. Pre-existing 526/527 jest grün, `tsc --noEmit` clean. **Risk-Flag dokumentiert:** wenn AI-Provider PII echo'd (e.g. Description-Echo in Error-Body), landet das in DB. Mitigation: 500-char-cap. Restrisiko niedrig weil Provider-Errors strukturiert sind (rate_limit_exceeded etc.). **Folge-Welle (UX) deferred:** UI-Banner + Auto-Retry-on-Open für leere Jobs.** |
| **CV-Parser Phase 6 — Cert-Roundtrip-Recovery via Raw-Section-Walk (2026-04-27)** | **Verifizierter Bug aus User-E2E auf Avenga-Job: Optimizer-Output zeigt 7 Zertifikate, aber 4 Defekte gegenüber Roh-Text-Cert-Section: (1) "Managementberatung (Emory University)" + 3 Untermodule fehlt komplett im Output; (2) Output-Cert "HR-Transformation & Organisationsentwicklung" hat halluzinierten Issuer "ZF Friedrichshafen AG" obwohl Roh-Text "ZF Getriebe Brandenburg GmbH" zeigt; (3) Cert "Retrospektive Team-Sessions (2022)" im Output, aber NICHT im Roh-Text (LLM-Halluzination aus TEDx-Beschreibung); (4) Universität Potsdam-Subjects: 4 im Roh-Text ("Projektmanagement (2022) Mediation (2021) Präsenzkurs (2020) Rhetorik (2020)"), nur 3 im Output ("Projektmanagement" fehlt). Welle A.8a (`dropProjectLikeCerts`) griff bei Defekt 1+4 nicht weil der LLM die "Projekt-" Prefix entfernt hatte. **Fix:** Neue Pure Function `recoverCertsFromRawSection(certs, rawText)` in `lib/services/cv-parser.ts:1138+` mit 3 Helpers: `extractCertSectionLines(rawText)` walked Section-Header (de/en/es) → Stop-Header (Sprachen/Skills/Berufserfahrung/etc.) mit 30-Zeilen-Defensive-Cap; `extractCertCandidates(lines)` parst Pattern A (`Name (Issuer)` parens-style), Pattern B (`Name I Date I Issuer` pipe-separated, Capital-I = Azure-DI's Pipe-Replacement), Pattern C (`Issuer: Subj1 (Year1) Subj2 (Year2) ...` multi-subject mit ≥2 (Year)-Units), Pattern D (bare line); `tokenOverlapScore(a, b)` mit NFKD-Diakritika-Stripping + 3-Char-Min-Token-Filter. **Strategy CONSERVATIVE** (User-Direktive: false-positive-drop > false-negative-keep): (a) Output-Cert mit Raw-Match (≥0.6 overlap) → keep; wenn Issuer-Token-Overlap <0.5 → Issuer-Correct mit Raw-Wert; sonst keep existing. (b) Output-Cert ohne Raw-Match → KEEP (kein Halluzinations-Drop in v1, weil LLM-Confidence-Check fehlt). (c) Raw-Candidate ohne Output-Match → ADD mit name+issuer+dateText. Skips Section-Header-Noise / Status-Words / Projekt-Prefix / Ultra-Short / Pure-Numeric. Wired im `sorted`-Block NACH `dropProjectLikeCerts` und VOR `sanitizeCertIssuer + truncateCertDescriptionAtNewline + validateDescriptionsAgainstRawText`. **Tests:** 26 neue Cases in `lib/__tests__/cv-parser.test.ts` (5 section-walker: DE/EN/ES + 30-line-cap + no-header-empty; 8 pattern-parser: Pattern A Yannik-Regression, Pattern A pure-Year, Pattern B pipe-with-date, Pattern C multi-subject 4-units, Pattern C 1-unit-falls-back, Pattern D bare, header-noise-skip, ultra-short-skip; 13 end-to-end: Managementberatung-Add, Universität-Potsdam-Projektmanagement-Add, Issuer-Correct-replace, Issuer-Correct-fill-null, Issuer-Correct-keep-overlap, Conservative-keep-hallucinated, Idempotenz-2x, empty-array+raw-Add-all, no-cert-section-noop, Projekt-prefix-skip, Status-word-skip, no-raw-text-noop, extra-fields-preserved). 132/132 cv-parser Tests grün, 526/527 jest gesamt (1 pre-existing inngest/health flake), `tsc --noEmit` clean. **Limitations dokumentiert:** (a) Halluzinations-Drop ist NICHT in v1 — Yanniks "Retrospektive Team-Sessions" bleibt im Output. (b) ZF-Friedrichshafen-Issuer-Bug wird NUR gefixt wenn Raw-Cert nicht Pre-Drop wird durch `dropProjectLikeCerts` (Roh "Projekt- ZF Getriebe..."). v1.1 könnte das Pattern erweitern. **User-Verifikation:** Avenga-Job → Re-Match → Cert-Liste muss "Managementberatung (Emory University)" + "Projektmanagement (Universität Potsdam, 2022)" enthalten.** |
| **CV-Optimizer Phase 7 — Summary-Add-Drop-Bug + Sanitizer-Refactor als Pure Function (2026-04-27)** | **Verifizierter Production-Bug aus User-E2E auf Avenga-Job: Optimizer-Output zeigt Name + Email + Phone (Phase 5.8 ✅), aber `personalInfo.summary` Change wird gedroppt obwohl der User "Ausführlich"-Toggle gewählt hatte und der LLM einen Summary vorgeschlagen hat. Server-Log: `[WARN] Before-text sanitizer: changes dropped due to path mismatch — failures:[{"changeId":"change-1","reason":"personalInfo field empty or missing","path":"personalInfo.summary"}]`. **Root-Cause:** in `app/api/cv/optimize/route.ts` (Vorher-Stelle ~Zeile 526-601) iteriert der Before-Text-Sanitizer alle Changes und droppt jeden personalInfo-Change wenn `realBefore` (Master-Wert) empty ist. ADD-Pass-Through (Vorher-Zeile 536-539) feuert nicht, weil das LLM `type: 'modify'` emittiert (Default in Zeile 481 `type: c.type || 'modify'`) statt `'add'`. Bei Master-CV mit `summary === null` (was bei Yanniks Master der Fall ist, weil der CV-Parser keinen Summary aus dem PDF extrahiert hat) → jeder Summary-Vorschlag fällt durch. **Fix:** (1) Inline-Logik aus `route.ts` (~76 Zeilen) als Pure Function `sanitizeBeforeText(changes, cv)` in `lib/services/cv-optimizer-sanitizer.ts:99+` extrahiert — testbar, deterministisch, mutiert nur `change.before` und ggf. `change.type`. (2) Phase-7-Logik in der personalInfo-Branch: wenn `realBefore` empty UND `change.after` non-empty (nach trim), wird der Change als ADD upgegradet (`change.type = 'add'`, `change.before = ''`) statt gedroppt. Begründung: empty existing field + non-empty proposal ist semantisch ein CREATE, nicht ein MODIFY-Mismatch. Whitespace-only `after` → weiterhin gedroppt (true mismatch). (3) Array-Section-Logik (experience/education/skills/etc.) bleibt unverändert — dort ist empty-as-add eine Halluzinations-Spur weil entityId existiert (Entity ist da, nur das Feld leer = LLM erfindet eine Antwort auf was wir vorher nicht hatten). Lean-Direktive: nur dort fixen wo der Bug ist, kein Cross-Section-Refactor. (4) `route.ts:526-601` ersetzt durch `const beforeSanitize = sanitizeBeforeText(rawJson.changes, translatedCv as any); const verifiedChanges = beforeSanitize.verified; const lookupFailures = beforeSanitize.failures;` — DRY, ~12 Zeilen statt 76. **Tests:** 19 neue Cases in `lib/services/__tests__/cv-optimizer-sanitizer.test.ts` (6 Phase-7 personalInfo-empty-as-ADD: Yannik-Summary-Regression / non-empty-Master / empty+empty=drop / explicit-add-passthrough / targetRole-parallel / whitespace-only=drop, plus 9 Array-Section-Regression: bullet-id-lookup / education-plain-string / skills-items-array-join / non-existent-entityId-drop / non-existent-bulletId-drop / missing-entityId-drop / Idempotenz / empty-array-defensive / add-type-array-passthrough). 42/42 cv-optimizer-sanitizer Tests grün, 500/501 Jest gesamt grün (1 pre-existing inngest/health flake), `tsc --noEmit` clean. **User-Verifikation:** Avenga-Job nochmal CV-Match → Optimizer-Open mit "Ausführlich"-Toggle → erwartet sichtbarer Summary-Vorschlag in der Diff-Liste (war vorher gedroppt). Console-Log "Before-text sanitizer: changes dropped..." sollte für Summary-Path nicht mehr feuern.** |
| **CV-Parser Phase 5 — Fuzzy-Role-Recovery + Education-Bullets + PII-Tier-1-Smart-Fallback (2026-04-27)** | **User-E2E auf "AI TI I CV.pdf" zeigte 4 Parser-Defekte trotz Welle Re-1: (1) experience[0].role auf "Sales & Manager" gekürzt + company=null obwohl rawText "Ingrano Solutions I Sales & Business Development Manager" hatte; (2) experience[1].role "Innovation Consultant" gekürzt von "Innovation Management Consultant"; (3) experience[2] Co-Founder ohne company "Xorder Menues"; (4) personalInfo.name=null obwohl im rawText "Yannik Galetto" steht. Root-Cause: Welle A's `recoverMissingExperienceCompany` nutzte EXACT-Match (`role.toLowerCase() === part.toLowerCase()`) — bei LLM-role-Truncation matched das nicht mehr. Plus PII-Sanitizer flaggte "Transformation Institute" als NAME-Token, alter Tier-1-Fallback nahm den ersten (institutional) Token. **Fixes:** (5.1) Neue exportierte Pure Function `rolesAreFuzzyEqual(role, candidate)` in `lib/services/cv-parser.ts:506+` mit Token-Overlap-Threshold ≥75% (≥1 Token bei single-token roles); plus Job-Prefix-Bonus (Co-Founder/CEO/CTO/Founder etc.: ≥1 Token-Match reicht wenn beide mit gleichem Prefix starten — handled "Co-Founder & CEO" hallucination vs "Co-Founder & Product Owner" rawText). `recoverMissingExperienceCompany` ruft die Funktion auf und restauriert beim Match BEIDE Felder (FULL role aus rawText UND company), nicht nur company. (5.2) Neue Funktion `recoverMissingEducationDescription(education, rawText)` in `cv-parser.ts:570+`: findet degree-Zeile, walk forward, sammelt konsekutive Bullet-Zeilen ("- ", "• ", "– ", "* ") bis nächster `##`-Header oder 12-Zeilen-Cap. Tolerant bei "Abschlussnote: 1,3" Zwischenzeile vor Bullets. Wired in `sorted`-Block vor `validateDescriptionsAgainstRawText`. (5.4+5.7) Tier-1-Smart-Name-Fallback in `parseCvTextToJson:213+`: filtert tokenMap NAME-Einträge per `PERSON_NAME_RE` (TitleCase + TitleCase, je ≥3 chars) und `INSTITUTIONAL_SUFFIX` (institute/gmbh/ag/consulting/solutions/group/university/etc.); pickt ersten realistischen Vor-Nachname. Last-Resort-Fallback (legacy first-token) wenn keine realistic candidates. Verhindert "Transformation Institute" als User-Name. (5.5) Parser-Prompt geschärft: §9 explizite "WÖRTLICHE ÜBERNAHME — KEIN KÜRZEN" Regel mit "Sales & Business Development Manager" als Negativ-Beispiel; §12 Cert-VOLLSTÄNDIGKEIT erweitert um "KEIN VERSCHMELZEN" + "NAMEN WÖRTLICH". **E2E-Verifikation auf Yanniks AI TI extracted_text:** Alle 4 Hauptdefekte gefixt (role + company für Stationen 0/1/2 vollständig, Name="Yannik Galetto"). Residuale Defekte (LLM-Drift): Education[1].description Bullet-Recovery greift im e2e nicht zuverlässig (1/3 Runs); Cert "Managementberatung" fehlt sporadisch — tritt als LLM-Output-Variation auf, deterministisches Recovery erfasst nicht alle Patterns. Diese werden in nachfolgender Welle adressiert. **Tests:** 16 neue Cases in `lib/__tests__/cv-parser.test.ts` (7 rolesAreFuzzyEqual incl. Yannik-Spezifika, 4 recoverMissingExperienceCompany Phase 5.1, 5 recoverMissingEducationDescription Phase 5.2). 106/106 cv-parser-Tests grün, 474/475 jest gesamt grün (1 pre-existing inngest/health flake), `tsc --noEmit` clean. **Diagnose-Skripte hinzugefügt:** `scripts/_debug-ai-ti-cv.ts` lädt extracted_text + parst frisch — reproduziert Parser-Bugs ohne Upload-Round-Trip. **NICHT in dieser Welle:** Education-Description-Hartrecovery (LLM-immun), Cert-Roundtrip-Recovery, ARCHITECTURE.md Re-Sync.** |
| **CV-Match Sub-Bugs 1.A LITE + 1.B + 1.C — DEV/PROD-Parität, Translator-Härtung, Optimizer-Sprach-Guard (2026-04-27)** | **Drei verifizierte Production-Blocker aus Welle-Re-1-E2E behoben (PwC-Diagnose: Snapshot enthielt EN-CV-Daten obwohl User Exxeta gewählt hatte; Optimizer hätte Mixed-Language-Output produziert). **Sub-Bug 1.A LITE — Step-5-Portierung statt Per-Document-Architektur** (CTO-Selbstkorrektur gegen Over-Engineering): neuer SSoT-Helper `lib/services/cv-master-sync.ts` mit Pure Function `syncMasterCvFromDocument(userId, cvDocumentId, supabaseAdmin)` — idempotent (skip wenn `profile.cv_original_file_path === doc.file_url_encrypted`), re-parst extracted_text via parseCvTextToJson, restored full_name aus user_profiles als Tier-1-Override, schreibt user_profiles.cv_structured_data + cv_original_file_path. Status-Enum: synced/skipped/no-document/no-text/error. PROD-Pfad `lib/inngest/cv-match-pipeline.ts:319+` Step 5 von 70 Inline-Zeilen auf 5 Helper-Call-Zeilen refactored (DRY). DEV-Pfad `app/api/cv/match/route.ts:329+` mit denselben Helper-Call vor dem Snapshot-Pin erweitert — heilt den DEV/PROD-Drift, der die PwC-Diagnose verursacht hatte (Snapshot zog stale Master statt re-parsed Doc). 8/8 cv-master-sync Stresstests grün (PwC-Repro, Idempotenz-3x, Multi-Doc-Switching A→B→A, Defensive-Guards no-document/no-text/missing-profile). **Sub-Bug 1.B — needsTranslation-Härtung** (`lib/services/cv-translator.ts:30+`): Sample-Cap erweitert von 3 Bullets auf alle 4 Bullets der ersten 5 Experience-Entries (vorher: round-robin 3 → starvte EN-Bullets bei Yannik-EN-CV mit 6 Stationen). Marker-Sets erweitert um Action-Verb-Patterns: EN_BULLET_MARKERS um leading/developing/managing/orchestrated/spearheaded/co-responsible etc. (45 Patterns); DE_BULLET_MARKERS um geleitet/entwickelt/verantwortet/umgesetzt etc.; ES_BULLET_MARKERS um dirigí/desarrollé/implementé. Threshold ≥2 für DE-Target bleibt (False-Positive-Schutz für englische Eigennamen wie "The Boston Consulting Group"); EN-Target und ES-Target nutzen ≥1 wie zuvor. Alle 16 bestehenden Tests bleiben grün. **Sub-Bug 1.C — Optimizer-Prompt-Refactor + Output-Validator** (`app/api/cv/optimize/route.ts:309+`): NIS-2-Beispiel aus AUTHENTIC KEYWORD WEAVING entfernt (selber Halluzinations-Vektor wie ATS-Phase-2 — LLM las "NIS-2" als "muss-emittieren"); ersetzt durch generisches Pattern (variable X/Y, kein konkreter Eigenname); HARD RULE "Never invent keywords from prior tasks or training data" hinzugefügt. Neuer §OUTPUT LANGUAGE CONSTRAINT (10 Zeilen) am Prompt-Ende explizit: "Mixed-language output is FORBIDDEN", "translate ALL such content to ${lang}", inkl. Allowlist welche Felder übersetzbar sind vs welche identity-locked bleiben. Backend-Validator: neue exportierte Pure Function `detectStringLanguage(text, targetLang): 'matches-target' | 'wrong-language' | 'unknown'` + `countLanguageMarkers(text, lang): number` in cv-translator.ts. Optimizer-Route ruft den Validator nach `triage.kept` für jedes change.after — wrong-language → drop + log-warn `🛡️ [CV Optimize] Language-guard dropped N/M changes`. Defense-in-Depth: Prompt sagt LLM "tu es nicht", Code droppt es deterministisch falls LLM ignoriert. **Tests:** 13 neue cv-translator-Cases (3 Welle-Re-1 EN-CV-Repro inkl. Yannik-3-Stations-Pattern; 9 detectStringLanguage inkl. PwC-Co-Founder-Bullet-Repro + DE-with-EN-Company + Spanish + defensive guards; 3 countLanguageMarkers). 31/31 cv-translator grün, 8/8 cv-master-sync grün, 457/458 jest gesamt grün (1 pre-existing inngest/health flake), `tsc --noEmit` clean. **Architektur-Entscheidung dokumentiert:** Per-Document-Snapshot-Architektur (initial geplant) wäre Over-Engineering gewesen — Step 5 ist die existierende SSoT, der Bug war die fehlende Portierung in DEV. Lean-Direktive eingehalten, ~2h gespart. **Verifikation Pflicht:** PwC-Job CV-Match → Optimizer-Open → Output muss vollständig DE sein (keine "Co-responsible", keine "developing"-Bullets); Console-Log "[cv-match DEV] master sync: synced — …" sichtbar bei DEV. **NICHT in dieser Welle:** Welle C-F (Re-Parse-Button, Valley→ATS-Rename, 2-3-Seiten-Garantie, Edge-Cases).** |
| **CV-Match Score-Guardrail Welle Re-1 — log-only Modus (2026-04-27)** | **Verifizierter Production-Bug aus E2E-Test PwC Senior Consultant BPM: deterministischer Score 38 (korrekt für Werkstudent-Profil vs Senior-Anforderung) wurde von Chips-Consistency-Guardrail auf 77 inflated. Server-Log: 2 Cards level="gap" hatten je 3 weak-touchpoint Chips aus Werkstudent-Projekt, Guardrail upgradete sie auf "solid", recomputed gap-census majorGaps 2→0 → score 38→77. Root-Cause: Guardrail-Annahme "Chips ≥ 1 → MUSS solid sein" ignoriert Seniority/Depth-Constraints — bei Junior-Jobs OK, bei Senior-Jobs systematisch zu mild. **Fix:** Score-Logik aus `cv-match-analyzer.ts:480-570` (90 Zeilen embedded code) in neue Pure-Function-Datei `lib/services/cv-match-scoring.ts` extrahiert. Zwei exportierte Functions: (1) `computeDeterministicScoreFromGapCensus({major, minor, llmRawScore})` — mappt gap-census zu fixed score-band (92/77/72/62/55/45/38/32/15). (2) `applyChipsConsistencyGuardrail(rows, gapCensus, currentScore, opts: {mode})` mit `mode: 'log-only' | 'enforce'`, default `log-only`. Im log-only Modus: nur Detection collected + console.warn("LLM authority preserved, no upgrade"), KEINE Mutation, KEIN Score-Recompute. Enforce-Modus bleibt erhalten als Emergency-Rollback-Pfad. cv-match-analyzer.ts ruft beide neue Functions, default Mode = log-only. **Stresstests:** Neue Suite `lib/services/__tests__/cv-match-scoring.test.ts` mit 26 Cases: 14 Score-Band-Cases (jede Band einzeln + Edge-Cases major≥3 und LLM≤19); STRESSTEST 1 (PwC-Pattern: 2 cards gap+3chips, gap-census={2,2}, startScore=38) → emit 2 detections, level bleibt "gap", score bleibt 38, gapCensus identity-preserved; STRESSTEST 2 (KI-Tools-Pattern: 1 card gap+2chips, gap-census={1,0}, startScore=62) → 1 detection, level bleibt "gap", score bleibt 62; STRESSTEST 3 (Clean path: keine Inkonsistenz, gemischte Levels) → 0 detections, kein Effekt; Defensive Guards (empty array, null, undefined chips); Legacy enforce-mode-Test als Rollback-Beweis (38→77 reproduziert). 26/26 grün, 434/435 jest gesamt grün (1 pre-existing inngest/health-Flake), `tsc --noEmit` clean. **NICHT in dieser Welle (folgen sequenziell pre-Push):** Sub-Bug 1.A (Multi-CV-Architektur — per-document Snapshot statt Master-Override), Sub-Bug 1.B (needsTranslation deterministischer), Sub-Bug 1.C (Optimizer-Prompt-Refactor: NIS-2-Beispiel raus + LANGUAGE-CONSTRAINT). Welle C-F bleiben hinter Multi-CV-Architektur. **User-Verifikation Pflicht:** PwC-Job nochmal CV-Match laufen lassen (Force-Restart-Button), Erwartung Score 32-45, Console-Log zeigt "Chips-consistency observation (LOG-ONLY)" statt "Score corrected".** |
| **CV-Auswahl Optimizer↔Analyzer-Sync (Welle B) — 2026-04-26** | **Behoben: Optimizer und Cover Letter operierten auf `user_profiles.cv_structured_data` (Master-CV / letzter Upload), während CV Match auf einer benutzergewählten oder anderen CV-Version laufen konnte. Wenn der User zwischen Match und Optimizer eine neue CV hochlud, wurde im Optimizer eine andere CV ausgespielt als die, gegen die gematcht wurde — Score-Mismatch, fehlende Stationen, verwirrende Diff-Listen. Lösung: Snapshot-on-Match-Pattern. Bei jedem CV Match wird `user_profiles.cv_structured_data` als Snapshot in `job_queue.metadata.cv_snapshot` geschrieben (mit document_id, document_name, pinned_at). Downstream-Reader (Optimizer, CL Setup, CL Generator) nutzen diesen Snapshot bevorzugt; Master-CV ist Fallback für Legacy-Jobs ohne Snapshot. Neue Datei `lib/services/job-cv-snapshot.ts` mit `buildJobCvSnapshot()` + `resolveJobCv()` als Pure-Functions / SSoT. Writer-Stellen: (1) `lib/inngest/cv-match-pipeline.ts:391+` Step 6 nach Step 5 sync-profile-cv (PROD-Path), (2) `app/api/cv/match/route.ts:280+` DEV-Sync-Path, (3) `app/api/cv/match/route.ts:140+` Persistent-Cache-Restore-Path. Reader-Stellen: (1) `components/cv-optimizer/OptimizerWizard.tsx:217+` über resolveJobCv, (2) `app/api/cover-letter/setup-data/route.ts:217+` neue Priorität #2 (Optimized → Snapshot → Job-Metadata-Legacy → Master), (3) `lib/services/cover-letter-generator.ts:111+` resolveJobCv überschreibt profileData.cv_structured_data wenn Snapshot existiert. Snapshot-Größe: 5-15KB JSON pro Job (akzeptabel in Postgres TOAST). KEINE DB-Migration nötig — `job_queue.metadata` ist bestehende JSONB. Tests: 10 neue Cases in `lib/services/__tests__/job-cv-snapshot.test.ts` (snapshot-build, snapshot-prefer-over-master, master-fallback, null-handling, malformed-snapshot-fallback, identity-preservation). 409/409 Jest grün, `tsc --noEmit` clean. **E2E-Test-Sequenz für User:** (1) CV-v1 hochladen, (2) CV Match auf Job-A laufen lassen, (3) CV-v2 hochladen (neue Master-CV), (4) Optimizer für Job-A öffnen — sollte Console-Log "Using job-pinned CV snapshot" zeigen + Daten von CV-v1 anzeigen, NICHT von CV-v2. (5) Cover Letter für Job-A generieren — sollte ebenfalls v1 verwenden. **NICHT in Welle B:** Re-Parse-Button (Welle C), Valley→ATS-Rename (Welle D), 2-3-Seiten-Garantie (Welle E), Edge-Cases (Welle F).** |
| **CV Preview Härtung Phase 4 Welle A.5–A.8 + Upload Self-Healing (2026-04-26)** | **Fünf zusätzliche deterministische Post-Processors in `lib/services/cv-parser.ts` plus ein Frontend-Fix in `components/profil/active-cv-card.tsx`. **A.5 — `validateDescriptionsAgainstRawText(items, rawText)`**: 5-Wort-Sliding-Window-Check (3-Wort für kurze Descriptions); wenn kein Window aus `cert.description` / `education[].description` im rawText vorkommt → description=null. Edge-Cases: rawText <50 chars → keep all (no context); empty desc → untouched. Wired nach cert-pipeline + nach education-recovery. **A.6 — `cleanLanguageProficiency(languages)`**: strippt führendes Separator-Artefakt (`I `, `| `, `— `, `– `, `- `, `: `) aus `proficiency`; Yannik-Regression "I Muttersprache" → "Muttersprache". Capital "I" nur bei trailing space (Italian-style "Italian B2" bleibt unangetastet). **A.7 — `splitMergedSkillGroups(skills)`**: splittet eine Skill-Gruppe in mehrere wenn `items` ein `\n`-Artefakt enthalten (Sub-Section-Header in Items eingebacken); Yannik-Regression `items: [..., "Bubble\nAdobe", "Lightroom\nMicrosoft"]` → 2 separate Gruppen (Adobe als 2. Kategorie). Trailing empty groups (Microsoft ohne Items) gedroppt. Boundary-Logik: jeder Fragment nach 1. `\n` markiert flush+new-category. **A.8a — `dropProjectLikeCerts(certs)`**: filtert Zertifikate deren `name` mit "Projekt[\\s\\-:]" startet ODER >6 Wörter UND Company-Suffix (GmbH/AG/KG/SE/Inc/Ltd/LLC) enthält; Yannik-Regression cert "Projekt- ZF Getriebe Brandenburg GmbH HR- Transformation & Organisationsentwicklung" gedroppt, "HR-Transformation & Organisationsentwicklung" (ohne Projekt-Prefix) bleibt. **A.8b — `truncateCertDescriptionAtNewline(certs)`**: kappt `cert.description` am ersten `\n`; LLM hatte gelegentlich nächsten Cert-Namen oder Sub-Track-Header in vorherige Description absorbiert ("Datenanalyse...kritisches Denken\nDesign Thinking Coach" → nur erster Teil). **Cert-Pipeline-Reihenfolge im `sorted`-Block:** cleanCertificationNames → CERT_NOISE-Filter → dropProjectLikeCerts → sanitizeCertIssuer → truncateCertDescriptionAtNewline → validateDescriptionsAgainstRawText. **Frontend Self-Healing Upload (`active-cv-card.tsx:240+`):** Next.js dev/Turbopack droppt gelegentlich die XHR-Connection mid-response auf 16-25s lange Upload-Routes, obwohl der Server vollständig durchläuft (Doc + Profile geschrieben) — User sah "Netzwerkfehler beim Upload" obwohl alles korrekt gespeichert. Fix: vor Upload Doc-IDs des Typs snapshot'en; in `xhr.onerror` für 60s alle 2s `/api/documents/list` pollen — wenn neues Doc desselben Typs auftaucht, silent-success → "Fertig ✅". Fallback: nach 60s ohne neues Doc → echte Fehlermeldung. Tests: 89 cv-parser-Cases (50 + 10 A.5 + 7 A.6 + 9 A.7 + 6 A.8-drop + 7 A.8-truncate), 398/399 jest grün (1 pre-existing inngest/health flake), `tsc --noEmit` clean. **E2E-Verifikation:** Yanniks 21:16:36 Re-Upload zeigte: 4 saubere Languages ohne "I"-Prefix, 4 distinkte Skill-Gruppen, 7 Certs (war 8 — Projekt-ZF gedroppt), TEDx-desc grounded in rawText (kept), Universität Potsdam institution gefüllt, Anstellungsart-Suffix korrekt in summary statt role. Pipeline-Latenz: 17s e2e (16s Claude Haiku Parser, ~1s übrige Schritte). Diagnostic-Skript `scripts/debug-parse-cv.ts` läuft parseCvTextToJson direkt gegen `documents.metadata.extracted_text`-Cache — reproduziert Parser-Bugs ohne kompletten Upload-Round-Trip. **NICHT in dieser Welle:** CV-Auswahl-Sync Optimizer↔Analyzer (Welle B), Re-Parse-Button (Welle C), Valley→ATS-Rename (Welle D), 2-3-Seiten-Garantie (Welle E), Edge-Cases (Welle F).** |
| **ATS-Keyword Halluzination Fix Phase 3 — Verbatim-Filter als Defense-in-Depth (2026-04-26)** | **Phase-2 Prompt-Härtung war wirkungslos: Mistral ignorierte die HARD RULE und emittierte weiterhin DSGVO/ISO 27001/Cloud Computing/PCI DSS bei einem SAP-Public-Sector-Job, der keinen Compliance-Bezug hatte (User-Re-Test 2026-04-26 mit SAP "Senior Solution Advisor Public Sector"). Prompt-Engineering ist gegen LLM-Trainingsdaten-Bias zu schwach. Lösung: deterministischer Code-Filter als finaler Verifizierungs-Schritt. Neue exportierte Funktion `filterByVerbatimJDPresence(keywords, jdText)` in `lib/services/ats-keyword-filter.ts:316+`: jedes Keyword muss im JD-Text per (a) exakter Phrase, (b) hyphen-stripped Variante ("Stakeholder-Management" ↔ "Stakeholdermanagement") oder (c) Token-Verifikation auffindbar sein. Token-Logik: Tokens >=4 chars werden per Prefix-Stem (6 chars) gegen Word-Boundary in JD geprüft (handles deutsche Deklination — "Sektor" matched "Sektors", "Öffentlicher" matched "öffentlichen"); Tokens =3 chars (SAP, ERP, OKR, PMP) per striktem Word-Boundary; Tokens <3 chars werden ignoriert. Diakritika via NFKD-Normalisierung gestripped (Umlaute → Basisbuchstabe). Wire-In an 5 Stellen (alle nach existing `filterAtsKeywords`): `lib/inngest/extract-job-pipeline.ts:248+`, `app/api/jobs/import/route.ts:319+`, `app/api/jobs/ingest/route.ts:198+` (cache-path) + `:344+` (fresh-extraction-path), `app/api/jobs/search/process/route.ts:138+`. Tests: 25 neue Cases in `lib/services/__tests__/ats-keyword-filter.test.ts` reproduzieren den SAP-Job-Halluzination-Set (DSGVO/ISO 27001/Cloud Computing/PCI DSS/Projektmanagement REJECTED; Ausschreibungen/Vertrieb/Pilotprojekte/SAP ERP/KI/Öffentlicher Sektor KEPT) plus False-Positive-Guards (Salesforce/Python/AWS/OKR/PMP bleiben; ISO matched nicht "Position"). 170/170 Filter+Prompt-Tests grün, 342/342 Jest gesamt grün, `tsc --noEmit` clean. Verbatim-Filter ist defensiver Drop-Filter — wenn JD <50 chars, werden alle Keywords behalten (no false rejection bei fehlendem Kontext). **Wichtig für Re-Test:** Existing Jobs in DB haben noch alte halluzinierte Keywords; Browser-Extension-Re-Import liefert Duplicate-Response ohne neue Extraction. Vor Re-Test: alte Jobs in Pathly UI löschen.** |
| **CV Preview Härtung Phase 4 Welle A — Languages-Recovery + Skills/Certs/Issuer-Cleanup (2026-04-26)** | **Vier deterministische Post-Processing-Funktionen in `lib/services/cv-parser.ts:567+` (alle exportiert für Tests, alle idempotent), eingewoben in den `sorted`-Block in `parseCvTextToJson` (Zeile 236+). Adressiert die LLM-Variance-Bugs aus Phase-3.1-Re-Upload, die jetzt den größten sichtbaren Pain im PDF-Render verursachten: (1) **`recoverMissingLanguages(rawText)`** — Greift nur wenn LLM-Output nach KNOWN_LANGUAGES-Filter leer ist (gestern: 0 Sprachen statt 4). Findet Section-Header (de/en/es: "Sprachen", "Languages", "Idiomas", "Sprachkenntnisse", "Language Skills"; akzeptiert auch Markdown-Prefix "## "), walk'd bis zum nächsten STOP_HEADER (Zertifikate/Bildung/etc.) mit 20-Zeilen-Defensive-Cap. Pro Zeile: Pattern A `Sprache (C2)`, Pattern B `Sprache I/||/—/–/- Niveau`, Pattern C `Sprache: Niveau` (no-leading-space variant), Pattern D bare-name-only. KNOWN_LANGUAGES-Whitelist + Dedup gegen Duplikate. (2) **`cleanSkillCategories(skills)`** — strippt literal `\n` aus `category` und behält erste non-empty Zeile (Phase-3.1-Bug "IT-Kenntnisse\n\nProgrammierkenntnisse" wird zu "IT-Kenntnisse"). Idempotent für saubere Categories. (3) **`cleanCertificationNames(certs)`** — strippt führende Section-Header-Zeile (CERT_SECTION_HEADERS-Set: zertifikate/zertifizierungen/certifications/weiterbildungen/kurse/etc. de+en+es), kollabiert ansonsten zu erster non-empty Zeile (multi-line-name = immer Defekt). Phase-3.1-Bug "Zertifikate\nManagementberatung" → "Managementberatung". (4) **`sanitizeCertIssuer(certs)`** — droppt `issuer` wenn Wert in ISSUER_NOISE-Set (ehrenamtliche tätigkeit/ehrenamt/werkstudent/praktikum/hobby/volunteer/internship/voluntariado etc.). TEDx-Coach-Regression: issuer="Ehrenamtliche Tätigkeit" → null. **Wiring im `sorted`-Block:** Languages = filteredLanguages (LLM nach Whitelist) ?? recoverMissingLanguages(text); Certs-Pipeline = cleanCertificationNames → CERT_NOISE-Filter → sanitizeCertIssuer; Skills = cleanSkillCategories(validated.skills). Tests: 41 neue Cases in `lib/__tests__/cv-parser.test.ts` (12 recoverMissingLanguages für Yannik-4-Sprachen + Stop-Header + Parens/Colon/Em-Dash + Whitelist-Reject + Dedup + Locale-Variants; 6 cleanSkillCategories für Idempotenz + Whitespace + Multi-Field-Preservation; 8 cleanCertificationNames für DE/EN-Prefix + Idempotenz + Multi-Line-Collapse; 8 sanitizeCertIssuer für TEDx-Regression + Werkstudent + Hobby + Case-Insensitivity + Multi-Field). 50/50 cv-parser.test grün, 322/323 jest grün (1 pre-existing inngest/health flake), `tsc --noEmit` clean. **Erfolgs-Kriterium für Welle A (User-Verifikation):** Re-Upload des CV → Source-DB hat: Languages=4 (vorher 0), Skills ohne `\n` in category, Certifications ohne Section-Header in name, keine "Ehrenamtliche Tätigkeit" als Issuer. Diagnose-Skript: `npx tsx scripts/debug-cv-source.ts info@yannik-galetto.site`. **NICHT in dieser Welle:** CV-Auswahl-Sync Optimizer↔Analyzer (Welle B), Re-Parse-Button (Welle C), Valley→ATS-Rename (Welle D), 2-3-Seiten-Garantie (Welle E), Edge-Cases (Welle F).** |
| **ATS-Keyword Halluzination Fix Phase 2 — Examples raus, Pflicht-Verankerung in 4 Pipelines (2026-04-26)** | **Verifizierter Bug aus Handover `handover_ats_keyword_halluzination_2026-04-26.md`: User hat 4 Jobs via Browser Extension v1.0.8 importiert (TARGUS, valantic, adesso, MHP); in JEDEM Output erschienen DSGVO + ISO 9001/26262/27001 als ATS-Keywords obwohl die JD-Texte keinen Compliance-Bezug hatten. Root-Cause = klassischer In-Context-Bias: die alten Prompts in 4 Pipelines listeten ISO 26262 / DSGVO als INCLUDE-Beispiele und Eigennamen-Whitelist; das LLM las das als "muss emittieren" statt "Kategorie-Beispiel". Fix nach User-Entscheidung D6 ("Examples raus, Pflicht-Verankerung"): **HARD RULE** in jeden Pipeline-Prompt vorne weg ("Each keyword MUST appear verbatim, as a direct translation, or as a clear semantic match in the JD text. If a keyword does NOT appear in the JD, you MUST NOT include it. Never invent keywords from your training data; never carry over keywords from prior tasks. When in doubt, leave it out."). Konkrete ISO-Listen aus den INCLUDE/Eigennamen-Beispielen entfernt; GDPR↔DSGVO↔RGPD bleibt nur noch als reine Übersetzungs-Regel (NICHT als INCLUDE-Beispiel). Salesforce/SAP/Python/Scrum bleiben als generische Kategorie-Beispiele (haben keine Halluzinationen verursacht). Pipelines: `app/api/jobs/import/route.ts:271` (Browser-Extension-Pfad, Sync-Claude), `app/api/jobs/ingest/route.ts:239+` (Manueller Eintrag, Mistral), `lib/inngest/extract-job-pipeline.ts:188+` (Async-Fallback, Mistral), `lib/services/job-search-pipeline.ts:472+` (Job-Search, Claude Haiku) — letztere zusätzlich um Output-Checklist-Frage erweitert ("Steht dieses Keyword wörtlich oder als direkte Übersetzung im obigen JD-Text?"). Defense-in-Depth: `lib/services/ats-keyword-filter.ts` bleibt als Backup-Filter aktiv (Phase 1.2). Tests: neue Test-Suite `lib/services/__tests__/ats-keyword-prompt.test.ts` mit 25 Regression-Cases (Prompt-String-Validierung, kein Live-LLM-Call): pro Pipeline (a) keine ISO 9001/27001/26262 / PCI DSS in der Buzzwords-Block, (b) HARD RULE + verbatim-Anchor present, (c) MUST-NOT-Klausel present, (d) GDPR↔DSGVO Translation preserved, (e) Project-Management Translation-Beispiel preserved. 287/288 Jest grün (1 pre-existing inngest/health Flake — fordert laufenden Inngest-Dev-Server, nicht durch diesen Fix verursacht), `tsc --noEmit` clean. **Verifikation Pflicht (User):** Re-Import der 4 Test-Jobs via Extension → erwartet keine DSGVO/ISO-Halluzinationen mehr. Recall-Risiko (Salesforce/SAP nicht mehr erkannt): mit PTC-Job aus MHP-Test gegenprüfen.** |
| **CV Preview Härtung Phase 3.1 — Deterministisches Parser-Recovery (2026-04-26)** | **Nach Phase-3-Re-Upload zeigte Diagnose-Skript: Education-Halluzination weg ✅ + Anstellungsart-Suffix korrekt ✅, ABER Ingrano Solutions company=null und Co-Founder Xorder Menues company=null und Universität Potsdam institution=null. Root-Cause via `scripts/debug-extracted-text.ts` verifiziert: OCR-Text (Azure DI) ist KORREKT — "Ingrano Solutions I Innovation Manager" steht sauber auf einer Zeile, "Co-Founder - Xorder Menues" auch, "Europäische Medienwissenschaften (B.A.) Universität Potsdam" auch. Der Parser-LLM ignoriert die Prompt-Regeln trotzdem bei manchen Stationen. **Fix:** Zwei deterministische Post-Processing-Funktionen (exportiert für Tests) in `lib/services/cv-parser.ts:447+`: (1) `recoverMissingExperienceCompany(experience, rawText)` — line-based split auf ` I ` / ` | ` Pipe (case-sensitive, Großbuchstabe-I = Azure-DI's Pipe-Replacement) und ` - ` Dash; ROLE_PREFIXES-Set (Co-Founder, CEO, Founder, etc.) disambiguiert Dash-Pattern. (2) `recoverMissingEducationInstitution(education, rawText)` — sucht `degree` im rawText, nimmt Tail bis Zeilenende, akzeptiert nur wenn UNI_HINTS-Regex matched (universität/hochschule/uni/university/institute/akademie/college/etc.) ODER wenn Tail ein All-Caps-Acronym ist (BSP, MIT, etc.). Plus Helper `isPlausibleCompanyToken` (Length + Date-Numeric-Filter + Status-Word-Filter). 14 neue Tests in `lib/__tests__/cv-parser.test.ts` (Yannik-Spezifika: Ingrano/Xorder/Fraunhofer/Medieninnovationszentrum/Universität-Potsdam/BSP-Recovery, plus Idempotenz, Empty-Array, Empty-Role, Date-Token-Rejection, Bogus-Tail-Rejection). 263/263 Jest grün, `tsc --noEmit` clean. **NICHT in dieser Welle:** personalInfo.summary-Recovery (im PDF gibt's keinen Summary, also nichts zu rekonstruieren — User muss UI-Field nutzen oder Optimizer generiert ihn (Bug-2-Fix)). Bug 4 (Cert-Bullets in Skills) bleibt für Phase 5. **User-Anweisung Phase 4:** dritter Re-Upload des CV → triggert frischen Parse mit Recovery → Source-DB sollte jetzt vollständig sein. Diagnose-Skripte (debug-cv-source.ts, check-storage.ts, debug-extracted-text.ts) bleiben im Repo.** |
| **CV Preview Härtung Phase 3 — Source-Diagnose + Translator-Restore + Parser-Prompt (2026-04-26)** | **Phase 1+2 hatten am Symptom gearbeitet (Identity-Lock am Optimizer); Diagnose-Skript `scripts/debug-cv-source.ts` zeigte: (1) Account-Mismatch — Yannik hat 2 Accounts (`yannik.galetto@gmail.com` mit Test-Daten + `info@yannik-galetto.site` mit echten Daten); alle vorigen Untersuchungen gingen auf den falschen Account. (2) Im richtigen Account zeigt cv_structured_data konkrete Parser-Defekte: Ingrano Solutions company=null (Pipe-Pattern "Firma I Rolle I Werkstudent" konsumiert), Co-Founder Xorder Menues company=null (Dash-Pattern), Education halluziniert ("Business Innovation & Entrepreneurship" → "Digital Strategy & Entrepreneurship"), Universität Potsdam fehlt komplett. **Fix 1 — Bug 2 Summary-Prompt** (`app/api/cv/optimize/route.ts:222-228`): bei `summaryMode='full'` (Default) war `summaryInstruction` LEER — neuer else-Branch erzeugt 3-Sätze-Anweisung mit Pflicht "always emit a summary change in diff-list". **Fix 2 — Translator-Restore härten** (`lib/services/cv-translator.ts:247+`): Restore-Liste erweitert um `experience[].role` (Bug 3: Projektleitung→Project Lead-Drift), `education[].degree` (B.Sc. Informatik→Computer Science), `personalInfo.targetRole` (Innovation Manager→Innovationsmanager). Restore-Logik als exportierte Pure Function `restoreImmutableFields()` extrahiert. **Fix 3 — Parser-Prompt schärfen** (`lib/services/cv-parser.ts:94-114`): 3-Pipe-Pattern "Firma I Rolle I Werkstudent/Intern" mit Anstellungsart-Suffix-Regel (Werkstudent/Intern/Praktikum/Trainee/Volontariat/Freelance gehören NIEMALS in role); KPMG-Bindestrich-Beispiel um Suffix-Logik erweitert; PFLICHT "company darf NIEMALS null sein wenn Firmenname erkennbar"; neuer Block 11b für Education (degree wörtlich übernehmen, KEINE Halluzination, institution-Pflicht bei erkennbarer Bildungseinrichtung, "Business Innovation & Entrepreneurship" / "Europäische Medienwissenschaften" als explizite Negativ-Beispiele). Tests: 7 neue Cases in `cv-translator.test.ts` (16/16 grün): Bug-3-Regression Medieninnovationszentrum→Media-Innovation-Centre-Restore, B.Sc.-Informatik-Drift-Restore, targetRole-Restore, Idempotenz, null-Source-Handling, Languages-Array-Recovery, PII-Restore. tsc clean. 248/249 grün (1 Flake `inngest/health.test.ts` pre-existing — fordert laufenden Inngest-Dev-Server). **NICHT in dieser Welle (Phase 4):** Re-Upload des CV durch User ist notwendig damit die Parser-Prompt-Härtung wirkt — bestehende Source-DB bleibt korrupt bis fresh parse läuft. Bug 4 (Cert-Bullets in Skills) bleibt verschoben. Diagnose-Skripte `scripts/debug-cv-source.ts` + `scripts/check-storage.ts` bleiben im Repo als Forensik-Tools für Account/Source-Korruptions-Verdacht.** |
| **Browser Extension v1.0.8 — LinkedIn SDUI Description Heading-Anchor (2026-04-26)** | **Behebt das Folge-Problem nach v1.0.7 Title-Fix: Title kommt korrekt durch (`document.title`-Parser), aber `description` ist auf SDUI Auth-View null/<200 chars und triggert "Stellenbeschreibung unvollständig" Banner permanent — auch nach manuellem `more`-Click + 2x Retry. Repo: `/Users/yannik/.gemini/antigravity/pathly-extension`. Root-Cause autonom diagnostiziert via `WebFetch` + `curl` der LinkedIn Public-View HTML (jobs-guest-frontend, 293KB roh): bestätigt KEIN JSON-LD und die alten Description-Klassen (`description__text`, `jobs-description__content`, etc.) existieren NUR auf Public-View; SDUI Auth-View nutzt obfuskierte Hash-Klassen wie `_885f3d1f`, dort matched KEINER der 5 Layer-Selektoren. Stabiles Muster auf Auth-View: `<h2>About the job</h2>` als Anchor (Content, kein CSS — wird nicht obfuskiert). Fix: neue exportierte Pure-Function `extractDescriptionByHeadingAnchor(doc)` in `src/lib/parsers/linkedin.ts`, defensive 3-Strategy Extraction (1. heading.nextElementSibling.textContent, 2. heading.parentElement.nextElementSibling.textContent, 3. dual-walk-aggregation aus Heading + Heading.parentElement bis zum nächsten Section-Heading). Picks ≥200 chars, längstes Candidate gewinnt, max 5000 chars (Zod-Schema-Cap). Strict-Reject für "About the company" / "Set alert" / "More jobs" / "Company photos" Section-Headings damit nicht versehentlich die Company-Sektion gegrabbed wird. Locale-Coverage: EN ("About the job"), DE ("Über den Job", "Über die Stelle", "Stellenbeschreibung"), ES ("Sobre el empleo/puesto/trabajo", "Descripción del puesto/empleo/trabajo"). `pickLonger(a,b)` zu `pickLongest([...])` extended (3-way merge: JSON-LD/DOM-Klassen/Heading-Anchor). Diagnostic-Logs: jeder Failure-Pfad logged jetzt `[Pathly LinkedIn] anchor-description: candidates too short (lengths=...)` für künftige Drift-Forensik. Tests: neue Vitest-Suite `linkedin-dom.test.ts` mit happy-dom Environment (18/18 grün) covering happy-paths, alle 6 Locale-Patterns, Reject-Logic für 4 wrong-section-headings, realistic-Auth-View structure (mirrors netcompany-DOM mit allen 6 Section-Headings im flachen `<main>`-Layout), defensive Returns (no-heading, too-short, no-content, 5000-Cap), Edge-Cases (Whitespace, Case-Insensitive, h1-vs-h2-Disambiguation). Plus `linkedin.test.ts` 23/23 grün (Title-Parser unverändert). 41/41 vitest grün gesamt. `npx tsc --noEmit` clean, `plasmo build` clean (1574ms), ZIP `pathly-extension-v1.0.8.zip` gepackt (80 KB). `happy-dom@20.9.0` als devDep installiert.** |
| **Browser Extension v1.0.7 — LinkedIn Direct-View Title-Bug FIXED (2026-04-26)** | **Behebt den ungelösten Title-Bug aus v1.0.6 (4 erfolglose Hotfix-Pässe). Repo: `/Users/yannik/.gemini/antigravity/pathly-extension`. Root-Cause via User-DOM-Inspection 2026-04-26 verifiziert: auf `/jobs/view/{id}` Direkt-View URLs schickt LinkedIn (1) ZERO `<script type="application/ld+json">` Tags, (2) den Job-Titel nicht mehr in einem `<h1>`/`<h2>`, (3) keine `.jobs-unified-top-card__*` CSS-Klassen — neue SDUI-Architektur mit obfuskierten Klassen wie `_885f3d1f`. Alle 6 Headings auf der Page sind UI-Chrome ("0 notifications", "About the job", "Set alert for similar jobs", "About the company", "Company photos", "More jobs"). Layer 0 + Layer 1-Klassen + Layer 3 heading-iterator hatten daher KEINE Chance, den echten Titel zu finden. Fix: neue exportierte Pure-Function `extractTitleFromDocumentTitle(documentTitle)` in `src/lib/parsers/linkedin.ts` parst LinkedIn's serverseitig gesetzten `<title>` der Form `{Job-Title} | {Company} | LinkedIn` (verifiziert: `'Business Development Manager - Germany | Netcompany | LinkedIn'`). Layer-Reorg in `parseLinkedIn`: Layer 0 (JSON-LD) → Layer 1 NEU (document.title) → Layer 2 (DOM-Klassen, war Layer 1) → Layer 3 (href, war Layer 2) → Layer 4 (heading-iterator, war Layer 3 — `<main>`-Scope aus Hotfix-4 zurückgerollt). `isUiChromeText` + `isNonJobContent` erweitert um Section-Heading-Patterns (DE/EN/ES) als Defense-in-Depth. Neue Vitest-Suite `linkedin.test.ts` mit 23/23 grünen Cases: real-world Netcompany-Title, Notification-Counter-Stripping `(99+)`, Locale-Varianten DE/EN/ES, defensive Returns für leere/undefined/non-LinkedIn-Inputs, Edge-Cases (Single-Letter, "LinkedIn"-only, lange Titles 200-Char-Cap). Plus neue `vitest.config.ts` mit Path-Alias `~`. `npx tsc --noEmit` clean, `plasmo build` clean, ZIP `pathly-extension-v1.0.7.zip` gepackt (79 KB). v1.0.6-Eintrag bleibt als historische Doku der Fehlpfade.** |
| **CV Preview Härtung Phase 2 — Identity-Lock + Translator-Education + GPA-Strip (2026-04-25)** | **Drei chirurgische Fixes für die im Wavestone-Test sichtbar gewordenen Bugs (Output-Screenshot vom User: "Sales & Business Development" statt "Innovation Manager", Medieninnovationszentrum ohne Rolle, Education komplett auf Englisch trotz DE-Locale, "(approx. GPA 3.7)"-Hint im DE-CV). Strategie A — Identity-Lock im Optimizer: Neuer Service `lib/services/cv-optimizer-sanitizer.ts` mit `FORBIDDEN_FIELDS` Set (role, company, dateRangeText, location, institution, degree, grade, name, email, phone, linkedin, website, language, proficiency, level, issuer, dateText, credentialUrl) als Single-Source-of-Truth + Pure-Function `sanitizeOptimizerChanges()` die in einem Pass triagiert (missing_section / identity_field / protected_entity_remove). `app/api/cv/optimize/route.ts:427+` ersetzt die inline-Filter-Logik durch den Helper-Aufruf, drop-reasons werden geloggt. Plus Prompt-Block 1b "IDENTITY-LOCK" (10 Zeilen) der dem LLM explizit sagt was unantastbar ist + dass Backend silent-droppt. Strategie B — Translator-Prompt explizit (`lib/services/cv-translator.ts:148+`): Field-Whitelist mit JSON-Pfaden (`education[].description (PLAIN STRING — translate the WHOLE string)`, `education[].degree`, `personalInfo.summary`, etc.) + DO-NOT-Liste (skill items, IDs, dates) + STRUCTURAL/FAITHFULNESS/PROPER-NOUNS-Rules. Adressiert Bug "Education bleibt EN obwohl Translator lief" (Translator interpretierte 'description' nur als experience-bullets, nicht als education-Plain-String). Strategie C — Render-Layer-Cleanup: Neuer Helper `cleanGrade()` in `lib/utils/cv-template-helpers.ts` strippt deterministisch `(approx. GPA X.X)` und ähnliche US-Konvertierungen via 2 Regex. ValleyTemplate.tsx ruft cleanGrade(edu.grade) im Render auf; rendert grade-Row nur wenn cleaned non-empty (verhindert leere "Abschlussnote: " bei Grade=nur-Hint). TechTemplate rendert grade gar nicht — kein Touch nötig. Tests: 27 neue Cases in `cv-optimizer-sanitizer.test.ts` (FORBIDDEN_FIELDS Vollständigkeit, Innovation-Manager-Regression, Medieninnovationszentrum-entity-remove-Regression, end-to-end-Triage), 11 neue in `cv-template-helpers.test.ts` (cleanGrade Edge-Cases inkl. "Sehr gut (1,3)"-False-Positive-Schutz). 13/13 Suites, 242/242 Tests grün. tsc clean. **VERSCHOBEN auf Phase 3:** Defekt 4 (Cert-Bullets in Skills-Sektion gewandert) — braucht User-Decision wegen False-Positive-Risiko (Skills wie "Stakeholder Management" sehen Bullet-ähnlich aus). Languages-Missing-Bug auch noch offen (Pruner+Restore-Pfad eingrenzen). PdfViewerWrapper-i18n bleibt eigene Welle.** |
| **CV Preview Härtung Phase 1 (2026-04-25)** | **Zwei chirurgische Fixes basierend auf CTO-Analyse `cto_analysis_cv_preview_render_2026-04-25.md`. (1) Translator-Sampling-Bias behoben in `lib/services/cv-translator.ts:35-83` — `needsTranslation` samplete pre-Fix nur die ersten 8 Experience-Bullets und brach DANN ab, sodass Education + Skills nie für die Sprach-Detection einbezogen wurden. Folge: Mixed-Language-CVs (DE-Experience + EN-Education, sehr häufig) wurden nie geflagged → Translator wurde geskippt → Render zeigte Sprach-Mischmasch trotz DE-Locale. Neue Strategie: max 3 Experience-Bullets (round-robin über die ersten 3 Stationen), ALLE Education-Descriptions + degrees, max 3 Skill-Categories + max 3 Items pro Category, plus personalInfo.summary + targetRole + Experience-Roles. `needsTranslation` wurde von `function` auf `export function` umgestellt für Testbarkeit. Neue Test-Suite `lib/services/__tests__/cv-translator.test.ts` mit 9 Cases (9/9 grün): German-exp + English-edu, English-exp + German-edu, 10-bullet-exp dominiert nicht mehr Sampling, Round-robin über mehrere Stationen, Personal-Summary-only-mismatch, Skill-Items-Sampling, ≥2-Marker-False-Positive-Schutz. (2) Hard-Caps für Skills + Certs in beiden PDF-Templates. ValleyTemplate.tsx: neue Konstanten `MAX_SKILL_CATEGORIES=3` und `MAX_SKILL_ITEMS_PER_CATEGORY=8` parallel zu existierender `MAX_CERTS=6`. Defense-in-Depth gegen AI-Drift (Prompt sagt max 3 Categories — KI lieferte 7 im Screenshot). `data.skills.slice(0, 3).map(...)` und `g.items.slice(0, 8)` einziehen. TechTemplate.tsx parallel gehärtet: gleiche Konstanten + `data.certifications.slice(0, MAX_CERTS)` (TechTemplate hatte vorher gar keinen Cert-Cap). Type-Check clean, 199/200 Jest grün (1 pre-existing inngest/health-Flake). NICHT in dieser Welle: Cert-Validator (Item #3 — kommt in Phase 2 nach Localhost-Test), Languages-Missing-Bug (untersuche in Phase 2), PdfViewerWrapper i18n (Item #4 — eigene Welle).** |
| **Such-Limit Popup (2026-04-25)** | **Pathly-Design: "Später" dark-navy for search reason, waitlist deeplink (de/en/es `billing.search_limit_waitlist`), text size `text-sm`. Job Search "Add Job" → unified `AddJobDialog` (deleted inline ManualJobForm).** |
| **CV Optimizer Phase 2 (2026-04-25)** | **Bug #B: `locale !== 'de'` bypass removed (L1); German `needsTranslation` raised to ≥2 matches (L2 false-positive fix). Bug #C: MAX_CHANGES 12→18, maxTokens 8000→10000, TechTemplate bullet cap `slice(0,4)`. Em-Dash: prompt rule + `change.after` post-processor. InlineCvEditor i18n (14 keys de/en/es, typo fix). Silent-save error: `setOptimizerError(t('error_db_failed'))`. New `error_network` (de/en/es) for `TypeError: Failed to fetch` cases (server unreachable / dev server died) — distinct from server-returned errors.** |
| PDF Download | New API route `/api/documents/download` |
| Company Research | URL validation in research route |
| CV Match | Null guards (Array.isArray) + safeResult normalization in pipeline |
| Certificates | `company` → `company_name` DB column fix; Parallel Perplexity; Stale detection |
| Coaching | Text-Chat Mock Interview, Gap-Analyse, 3 Runden, PREP/3-2-1/CCC frameworks |
| Cover Letter Polish | Inngest `cover-letter/polish` pipeline: Audit Trail, Quote Injection, Critique |
| Cover Letter | `generationWarnings` pipeline fix — correctly passed to API response + UI |
| **Video Script Studio** | **`app/api/video/scripts/generate/route.ts` — Claude Haiku keyword categorization + block generation, `video_scripts` table** |
| **Avatar Picker** | **Animal avatar in Sidebar — 20 choices, saved to `user_profiles.avatar_animal`, Pathly brand colors** |
| **Morning Briefing** | **Popup removed (`morning-briefing.tsx` → returns null)** |
| **QR Code** | **Consent dialog before generation, embedded in Valley/Tech PDF templates** |
| **Azure Document Intelligence** | **PRIMARY CV/Cover Letter extractor (EU, DSGVO-konform). Claude Haiku = Fallback** |
| **CV Optimizer (2026-03-10)** | **Hydration-Fix, Summary-Toggle, Error-Handling with German messages, Zod-Schema generisch** |
| **ValleyTemplate (2026-03-10)** | **Max 3 Bullet-Points hard-cap. Zertifikate in rechte Spalte. KI-Prompt: 2-Seiten HARD RULE** |
| **CV Parser (2026-03-10)** | **Chrono-Sort: `sortExperienceByDate()` post-processing (Heute/MM.YYYY/MM/YYYY/YYYY)** |
| **i18n Tier 1 (2026-03-17)** | **`OptimizerWizard`, `DiffReview`, `command-palette` vollständig i18n. 3 neue Namespaces: `cv_optimizer`, `diff_review`, `command_palette`. ~55 Keys pro Locale (de/en/es).** |
| **Cover Letter i18n (2026-03-18)** | **`HookCard`, `StepHookSelection`, `StepStationMapping`, `StepToneConfig` vollständig i18n. 23 neue Keys (de/en/es). Fixes: `as any` → Union-Type, `intent`-Feld locale-aware für AI-Prompt, `useMemo` Import** |
| **Tone Config Key-Fix (2026-03-18)** | **`tone_data-driven` (Bindestrich) → `tone_data_driven` (Underscore) via `.replace(/-/g, '_')` in `toneOptionIds` useMemo. Root cause: dynamic key generation mit Hyphen statt Underscore** |
| **Formality Toggle i18n (2026-03-18)** | **`language === 'de'` → `language !== 'en' && locale !== 'en'`. ES zeigt Usted/Tú. EN komplett ausgeblendet (kein formell/informell). EN-Locale-Keys von German auf English korrigiert** |
| **Numbers Saved Button (2026-03-18)** | **Redesign: kleiner right-aligned button → full-width dark-navy matching "Start optimization". Label vereinfacht: "OK — numbers saved" → "Numbers Saved" / "Zahlen gespeichert"** |
| **Hiring Manager Critique (2026-03-18)** | **Fix: API 400-Error bei leerem `companyName` → Fallback "the company". Locale-aware Prompts: DE/EN/ES. `locale` Prop in `CoverLetterResultView` via `useLocale()` → Critique antwortet in App-Locale** |
| **Mood Check-in V2 (2026-03-19)** | **Adaptive Check-in mit Tag/Nacht-Symbolen (🌧️→☀️ / 🌑→🌕). Progressive Reduction: 5× Skip → auto-hide. `MoodCheckinContext` in `layout.tsx`. `useMoodCheckIn.tsx` mit Ref-basierter Auth-Subscription (kein Memory Leak). API GET/POST/PATCH mit `.maybeSingle()` und Fail-open. `CheckinSettingsCard` in Settings. i18n (de/en/es). `lib/mood/mood-symbols.ts` als kanonische Utility.** |
| **Cover Letter Language Fix (2026-03-25)** | **Locale-aware generation pipeline. `t(de, en)` helper used across `cover-letter-prompt-builder.ts`, `cover-letter-polish.ts`, `multi-agent-pipeline.ts`, and `cover-letter-judge.ts`. Complete prevention of DE/EN language mix when 'Eng' tone is selected.** |
| **CL Style Anti-Generic (2026-03-25)** | **Extended `StyleAnalysis` with 3 structural fields (`max_commas_per_sentence`, `uses_em_dash`, `rhetorical_contrast_pattern`). Haiku uses 1000 tokens for 9 fields. Prompt builder injects locale-aware structural constraints (blocking em-dashes, "nicht X, sondern Y", enforcing comma budget) natively in `customStyleBlock`.** |
| **CV Match Pipeline (2026-03-26)** | **Local dev fix: `inngest dev` server must be running to process `cv-match/analyze` events. Frontend stale detection aligned with Backend (4min threshold) to prevent dead-zone where frontend looped but API rejected retries.** |
| **CV Optimizer Reload Bug (2026-03-26)** | **Added missing `onComplete` callback in `OptimizerWizard` and bound it to `optimisticStep` in `UnifiedJobRow`. The Job Queue now instantly advances to "Cover Letter" visually after "Save" without requiring a page reload.** |
| **Stripe Monetization V1 (2026-04-01)** | **Credit-basiertes System: Free(6)/Starter(€9,90/20)/Durchstarter(€19,90/50). Atomic `debit_credits()` RPC mit FOR UPDATE Lock. `withCreditGate()` API-Wrapper. Stripe Checkout/Webhook/Portal. Idempotent webhook via `processed_stripe_events`. Centralized `lib/supabase/admin.ts` singleton. `getUserCreditsForClient()` strips `stripeCustomerId`. Billing i18n (de/en/es, 45+ Keys). Feature-Silo §9 in FEATURE_COMPAT_MATRIX.md.** |
| **UX & Video Pipeline Overhaul (2026-04-06)** | **Video UX: Confirm dialogs, preview tab links, Double-Assurance delete endpoint with stable QR tokens. Formality drift fixed via deep style constraints. Credit-loop bypass via Feedback UI integration. CV bullets fully synced to CLI context. Default Intro Scripts available in DE/EN/ES natively.** |
| **CL Pipeline Hardening (2026-04-09)** | **K1: PII personalInfo stripped from CV JSON before prompt. K2: Inngest polish writes metadata ONLY (no content overwrite — Lost Edit Prevention). K3: Multi-Agent Pipeline deprecated (Haiku→Sonnet regression). Blacklist consolidated: 4 lists → 1 SSOT (~74 patterns). Fluff feedback injected into sync-loop. kill-fluff degraded to scan-only (cost=$0). Em-dash utility extracted.** |
| **CL Structural Hardening & Quotes (2026-04-09)** | **Quote-Bridge reformiert ("wurde mir klar" → "Dieser Gedanke begleitete mich"). JD-Zitat Logik repariert (Max 5 Wörter Fragment, Thema statt Organisationsform). Fragment-Validator Check + False-Positive Exclusion für Attributions. Kritischer Prompt Unicode-Escape Bug (escaped `\u201e`) gefixt. Anti-Fluff System 100% test-gesichert.** |
| **CV Data Integrity Hardening (2026-04-17)** | **Root Cause analysiert: `proposal.translated` wurde korrupt in DB gespeichert (PII null, 6→2 Stationen). Fix 1 (`route.ts`): Integrity Guard — nach AI-Optimierung werden PII-Felder (email, phone, location, linkedin, website) und Strukturfelder (languages, certifications, experience/education-Count) aus `cv_structured_data` wiederhergestellt, BEVOR das Proposal in die DB geschrieben wird. Fix 2 (`cv-translator.ts`): PII + Structure Restore nach AI-Translation — company, dateRangeText, institution, grade werden idempotent aus dem Original-CV zurückkopiert. Fix 3 (`OptimizerWizard.tsx`): Layout-Fix sendet immer `cvData` (immutable Original), niemals display-gefiltertes `editablePdfData`. Fix 4 (`cv-merger.ts`): Entity-Level-Remove Parität mit Backend. Fix 5 (`cv-payload-pruner.ts`): Dead Code Fix — Feldname `certificates` → `certifications` (war immer false-y, Cap-at-8 war toter Code).** |
| **CL Phase 5 Hardening (2026-04-24)** | **Regex-Post-Gen-Validator um 9 Patterns erweitert: Kontrast "nicht X, sondern Y", Komparativ-Selbstlob, halluzinierte Studien, 3rd-Person-Firma, ICH-zentrierte Brücke, Unternehmens-Apposition, "[Autor] meinte damit", anthropomorphe Firma ("X hat mich gelehrt"), "war mir sofort klar". Pathly-DNA-Toggle für Custom-Style (default OFF). Prompt-Härtung: §KEIN-ZITAT wenn `!hasQuote`, §FIRMEN-ANSPRACHE (2nd-Person-Pflicht), §AUTOR-ICH-PERSPEKTIVE, §REFERENZBRIEF-KALIBRIERUNG-Checkliste. activeTone bei Custom-Style gemutet. hasQuote via `.quote?.trim()` gehärtet. Upload-Limit-Fix: generierte Drafts (`origin='generated'`) zählen nicht mehr. Wizard-Escape: User kann ohne Hook fortfahren bei leerer Perplexity-Analyse. Conflict-Guard: Custom-Style + DNA-OFF verwirft vor-gewähltes Zitat inline. `multi-agent-pipeline` + `kill-fluff` archiviert (0 Caller). `rhetorical_contrast_pattern` Feld aus StyleAnalysis entfernt (war Konflikt-Quelle). Handover-MD für Wizard-Step-0-Refactor (`memory/project_phase_b_wizard_refactor.md`).** |
| **CL Phase 5.3 Sync-Loop Fix (2026-04-24)** | **Kritischer Architektur-Bug behoben: scanForFluff lief NACH dem Break-Check, wurde bei Judge-PASS umgangen. Folge: "kein X, sondern Y" rutschte durch obwohl Regex korrekt. Fix (`cover-letter-generator.ts:374-383`): scanForFluff ist jetzt Break-Blocker (`judgePassed && !iterFluff.found`). Blacklist um 3 weitere Patterns erweitert: Chat-Floskel "auf ihrem Weg in die digitale Zukunft", Allwissens-Definition "ist bei [Firma] X" / "bei [Firma] heißt/bedeutet X". Klammer-Technik ist jetzt DNA-Pflicht auch OHNE Zitat — JD-Fragment oder Hook wird im Closing aufgegriffen (JD-Reframe-Pattern aus Volkswagen-Referenz). Base: 60 Tests grün.** |
| **Pulse-Card Drag/Click-Separation (2026-04-25)** | **`MissionCard` Layout-Refactor: Body draggable (Title-Bereich hat dnd-Listeners), Category-Icon migriert nach rechts als Link-Button (Click → `router.push(localizedHref(deep_link, locale))`). Behebt Drag-vs-Click-Konflikt: vorher löste Click auf Body Navigation aus, was beim Drag-Versuch versehentlich zu Profil sprang. Neue i18n-Key `dashboard.calendar.open_details` (de/en/es). DRY-Helper `lib/utils/locale-href.ts`, 8 Unit-Tests grün. Accept/Dismiss + Nav-Icon haben `e.stopPropagation()`.** |
| **Job Search Härtung (2026-04-25)** | **Vier Fixes in einer Welle nach CTO-Analyse: (1) Default-Ort `'Berlin'` → `'Deutschland'` für mehr Reichweite, (2) Paywall-Modal-Integration in Job-Search-Page (vorher: Job-Search war die EINZIGE Feature ohne `showPaywall('search')` — User sah nur rotes Banner ohne Upgrade-CTA; jetzt 402-Status + Pre-Click-Tooltip wirken den Upgrade-Funnel an wie bei CV Match/Cover Letter/Optimizer/Video). (3) Company-Mismatch ist nicht mehr Hard-Block — Holdings/Konzern-Strukturen (z.B. L. Possehl ↔ Hänsel Processing) wurden vorher fälschlich abgelehnt. Jetzt Soft-Warn im SteckbriefPreviewModal mit amber Banner; User entscheidet via existing Confirm/Cancel. KEINE DB-Migration nötig — Warning fließt nur durch Response. (4) Framer-Motion-Crash-Fix: `<AnimatePresence mode="popLayout">` entfernt aus pulse-mission-panel.tsx (bekannter Bug bei rapid State-Changes), plus Hydration-Guard auf `PomodoroDoneBanner.createPortal` (User mit Browser-Extensions wie Grammarly bekamen `insertBefore on Knoten` Error). 4 neue i18n-Keys (de/en/es). 67/68 Jest grün (1 pre-existing inngest/health flake).** |
| **Profil-Tab Phase 1 (2026-04-25)** | **Neuer Dashboard-Tab `/dashboard/profil` für Dokument-Verwaltung. Migration in 3 Batches: (B1) `ActiveCVCard` von `app/[locale]/dashboard/settings/` nach `components/profil/` verschoben (git mv, History bewahrt); neue Server-Route `app/[locale]/dashboard/profil/page.tsx`; Sidebar-NavItem mit User-Icon zwischen Feedback und Settings; i18n-Keys (`dashboard.nav.profile`, top-level `profil.{page,documents}`) in de/en/es. (B2) Redirect-Vertrag-Migration: 5 Caller von `/dashboard/settings` auf `/dashboard/profil` umgezogen — `documents-required-dialog.tsx:51`, `cv-match-tab.tsx:345`, `OptimizerWizard.tsx:517`, `pulse/generate/route.ts:151` (deep_link), `command-palette.tsx` (Profil-Entry mit Shortcut `P` + `cmd_profile` Key). (B3) Settings-Documents-Card komplett entfernt + ARCHITECTURE.md Route-Doku aktualisiert. Bonus-Fixes: ActiveCVCard i18n-Schuld vollständig behoben (18 hardcoded DE-Strings auf `t()` umgestellt + locale-aware `formatDate(dateStr, locale)`), Cover-Letter Custom-Style Click triggert jetzt `DocumentsRequiredDialog` mit `type="cover_letter"` (vorher: disabled-Sackgasse). Cmd+K Discoverability via Office Hours geklärt: bleibt im Code, keine Hint-Investment (Pathly-Audience nicht Power-User-fokussiert). Forbidden Files NICHT berührt.** |
| **ATS-Keyword Härtung Phase 1 (2026-04-25)** | **Root-Cause "Bürozeit als ATS-Keyword" behoben in 3 Schritten basierend auf CTO-Analyse. (1) Harvester-Prompt in `lib/services/job-search-pipeline.ts` mit fachlich korrekter Definition + 6 zulässigen Kategorien (Tools, Methoden, Hard Skills, Zertifizierungen, Domain, Berufsbezeichnungen) + expliziter Negativ-Liste (Soft-Skill-Floskeln, Benefits, generische Adjektive, Filler-Phrasen) + Format-Regeln (max 3 Wörter, original casing) + Pre-Output-Checklist erweitert. (2) Neuer Service `lib/services/ats-keyword-filter.ts` mit ~120 Stop-Words in 4 Kategorien — wird in `app/api/jobs/search/process/route.ts` direkt nach `harvestJobData()` aufgerufen. Filter-Logik: exact-match + multi-word-substring + Length-Guards (2-60 chars, max 5 Wörter) + Numbers-only-Drop + Dedup. UI-Filter `LOW_SIGNAL` aus `job-row.tsx` entfernt (Single-Source-of-Truth in der Pipeline). (3) Schema entdoppelt: Doppel-Insert `ats_keywords` + `buzzwords` → nur noch `buzzwords` (alle 6 Reader-Caller nutzen das). `database/schema.sql` mit DEPRECATED-Comment markiert, Drop-Column-Migration für V2.1 vorgemerkt. Tests: 53 neue Jest-Cases in `__tests__/ats-keyword-filter.test.ts` (17 Valid-Keep, 18 Garbage-Remove, Length-Guards, Substring, Dedup, realistic mixed input). `tsc --noEmit` clean. Action #4 (Steckbrief-Modal mit ATS-Editing) bewusst defer'd auf Phase 2 nach Live-Conversion-Daten.** |
| **ATS-Keyword Härtung Phase 1.3 — Locale-Awareness + Cache-Locale-Key (2026-04-25)** | **Option A (Prompt-basierte Übersetzung) in alle 4 Pipelines: Harvester (`harvestJobData`-Signatur erweitert um 3. Param `userLocale`, default 'de' für Backward-Compat), ingest, import, inngest extract — jede Prompt enthält jetzt explizite TARGET-LANGUAGE-Anweisung mit Übersetzungs-Beispielen ("Stakeholder Management" ↔ "Stakeholder-Management" ↔ "Gestión de Stakeholders") + Eigennamen-Whitelist (Salesforce, SAP, Python, Scrum, OKR, PMP, ISO 9001/27001/26262, PCI DSS bleiben Original) + GDPR/DSGVO/RGPD AUSNAHME (sind Sprach-Versionen desselben Standards, normal übersetzen). Ziel: CV-Match-Konsistenz für Cross-Locale-User (englischer Job, deutscher User → deutsche Keywords). Plus DB-Migration `20260425_job_extraction_cache_locale.sql` (production-safe ALTER TABLE ADD COLUMN locale + Unique-Constraint-Replacement (user_id, hash) → (user_id, hash, locale)). Ingest-Cache-Read/Write um locale erweitert — Locale-Wechsel triggert frische Extraction statt alter sprache zu liefern. CTO-Decision: Risk #3 (Mistral Attention bei längerem Prompt) wird beobachtet, nicht präventiv gefixt; Filter ist Defense-in-Depth.** |
| **ATS-Keyword Härtung Phase 1.2 — Pipeline Parity (2026-04-25)** | **Filter in alle 4 Buzzword-Pipelines eingebaut. Vorher war Filter nur in `jobs/search/process` aktiv — drei weitere Schreib-Pfade hatten keinen: (1) `app/api/jobs/ingest/route.ts` (Manueller Eintrag, Mistral) — Filter nach Normalize + bei Cache-Read (Legacy-Hygiene für alte Cache-Einträge). (2) `app/api/jobs/import/route.ts` (Browser Extension via `chrome-extension://` CORS) — Filter nach Normalize, vor DB-Write. (3) `lib/inngest/extract-job-pipeline.ts` (Async-Fallback, Mistral) — Filter nach Normalize, vor Update. Plus 2 Leak-Fixes basierend auf Investigate-Report: Adjektiv-Prefix-Detection (`Hohe Flexibilität` → blocked; Regex `^(hohe\|hohes\|ausgeprägte\|starke\|sehr gute\|...)\s+(stop)$`) und Komposita-Suffix-Stripping (`Projektleitungserfahrung` → `Projektleitung`; Suffixe mit & ohne Fugen-S). Tests: 123/123 grün (von 108). Test-Plan in `docs/Implementation/02_ATS_KEYWORD_HARDENING_TEST_PLAN.md`. `tsc --noEmit` clean. /security-review keine Findings ≥ Confidence 8.** |
| **ATS-Keyword Härtung Phase 1.1 — PDF-Master-List Alignment (2026-04-25)** | **Stop-List + Prompt erweitert nach `docs/ATS_Keywords.docs.pdf` (Master-List 2026, 13 Seiten, 10 Sektionen, Quellen: LinkedIn 2026, HireReady, StylingCV, Personio, Softgarden u.a.). Stop-List wuchs von ~120 auf 130+ Einträge. Neue Stop-Words: Selbstständigkeit, Proaktivität, Hands-on-Mentalität, Detailverliebt, Self-starter, Results-driven, Fast learner, Zukunftsorientiert, Namhaft, Renommiert, Wir suchen, Das erwartet dich, Dein Profil, Ab sofort, Vollzeit, Teilzeit, Unbefristet. **Neue Stop-Liste-Kategorie:** "Überholte Tech-Terme" (PDF Sektion 9): MS Office Suite, Social Media, Web 2.0, EDV-Kenntnisse, Internet-Kenntnisse, PC-Kenntnisse, Computerkenntnisse — diese sind zu generisch für moderne ATS, die spezifische Tools wie Excel/Word/PowerPoint indexieren. Harvester-Prompt um 4 wichtige Blöcke erweitert: (a) "VALIDE SOFT-SKILL-PHRASEN" Whitelist (Stakeholder Management, Cross-Functional Collaboration, P&L Management, etc. — explizit erlaubt obwohl sie wie Soft-Skills aussehen, weil ATS sie als spezifische Kompetenz indexieren), (b) DACH-spezifische Tools/Skills (DATEV, Lexware, Personio, Bilanzbuchhaltung, Prokura, Tarifvertrag), (c) DACH-Zertifizierungen (Industriemeister IHK, Fachinformatiker IHK, Geprüfter Controller IHK, ITIL 4 Foundation), (d) **DACH-KOMPOSITUM-REGEL** (kritisch — PDF Sektion 10): Deutsche ATS indexieren KEINE Komposita; Harvester muss "Projektleitungserfahrung" → "Projektleitung", "Führungskompetenz" → "Führung", "Buchhaltungskenntnisse" → "Buchhaltung" zerlegen. Tests: 108 Cases (von 53), neue Test-Suites für PDF Sektion 6 (valide Soft-Skills), Sektion 10 (DACH-Keywords), Outdated Tech-Terms. `tsc --noEmit` clean.** |
| **Profil-Tab Phase 1.1 — Launch-Waitlist Migration (2026-04-25)** | **Launch-Waitlist-Card aus Settings nach Profil migriert (git mv `launch-waitlist-card.tsx` → `components/profil/`). User-Reasoning: Settings überladen, Pre-Launch-User sollen Waitlist sehen+verstehen (Founder-Feedback-Loop). Settings.page.tsx entrümpelt (Card + Rocket-Import raus). i18n-Namespace `settings.launch_waitlist` → `profil.launch_waitlist` umgezogen (15 Keys × 3 Locales, automatisches Python-Migration-Script). useTranslations-Call in Komponente updated. Profil-Page rendert jetzt 2 Cards: Documents (oben) + Launch-Waitlist (unten). ARCHITECTURE.md Korrektur: `user_settings`-Beschreibung von "LinkedIn/Target Role" auf "Avatar, Sprache" geändert (LinkedIn/Target-Role-Card ist Dead Code, nicht im UI gerendert; DSGVO-konsistent). Verifikation: `tsc --noEmit` clean, `jest` 59/60 (1 pre-existing flake: `inngest/health.test.ts` erfordert laufenden Dev-Server). Flagged für Separat-Cleanup: `app/[locale]/dashboard/settings/profile-card.tsx` ist Dead Code, plus `linkedin_url`/`target_role`-Felder in `user_settings`-Tabelle + `/api/settings/profile`-Route sammeln Daten ohne UI-Caller (DSGVO-Risiko, nicht autonom gefixt).** |
| **Browser Extension v1.0.6 — LinkedIn-Truncation + ATS-Filter-Parität (2026-04-25)** | **Hotfix-Split nach Eng+CEO-Review. Repo: `/Users/yannik/.gemini/antigravity/pathly-extension`. Zwei Probleme gelöst, Problem 2+3 (Diagnostic-Channel) bewusst auf v1.0.7 deferred. **Problem 1 LinkedIn-Truncation:** (a) Expand-Selektoren um 7 neue 2026-Markups erweitert (`button.jobs-description__footer-button-truncated-text`, `show-more-less-html__button`, `aria-label*='see more' i`, plus DE/ES Varianten); (b) `maybeExpandLinkedInDescription` wird bei JEDEM Retry probiert (vorher: nur ersten 2); (c) neue `waitForJsonLd()` mit MutationObserver auf `doc.head` (statt 200ms-Polling — best-practice 2014+, resolves on injection-tick); (d) Total-Wall-Clock-Cap 12s in `tryParseWithRetry` (vorher: 25s+); (e) Retry-Button mit `retryCount`+`retrying` State, Eskalations-Hinweis nach 2 Versuchen ("Scrolle ganz nach unten und klick 'Mehr anzeigen' manuell"); (f) Description-Cap 8000→5000 (Symmetrie mit Server-Zod-Schema, behebt 5000-8000-char 400-Bug); (g) `console.warn` für malformed JSON-LD-Blocks (Telemetrie-Sichtbarkeit). **Problem 4 ATS-Filter-Parität:** Hardcoded 75-Zeilen `extractKeywords()`-Regex aus `JobDetectedView.tsx:309-345` ENTFERNT (war komplett entkoppelt vom Server-`filterAtsKeywords`). Ersetzt durch ehrlichen Hint-Banner "ATS-Keywords werden nach dem Speichern erkannt — du siehst sie im Pathly-Steckbrief" (i18n-Key `keywords_post_save_hint` × de/en/es). **Storage-Versioning:** Neuer `pathly_storage_version`-Key in chrome.storage.local (Default 1) als Foundation für v1.0.7 Schema-Migrations. **Web-Repo:** 3 neue Jest-Test-Cases in `lib/services/__tests__/ats-keyword-filter.test.ts` als Parity-Guard für Extension-Import-Path (Bürozeit-Stripping, Garbage-Description, DACH-Tools-Preservation). 126/126 Jest grün (von 123). **TIMING-Konstanten:** `JSON_LD_WAIT_MS=2000`, `TOTAL_PARSE_CAP_MS=12000`, `RETRY_BUTTON_PENDING_MS=1500` neu in `constants.ts`. Alle neuen i18n-Strings em-dash-frei (`grep '—\|–' src/i18n/*.json` returns empty). Em-Dash-Policy aus CLAUDE.md eingehalten.** |


---

## 🤖 AI STACK (AKTUELL — Stand 2026-03-09)

### Document Extraction (PRIMARY: EU, DSGVO-konform)
```
Azure Document Intelligence (prebuilt-read)
  Endpoint: https://pathly.cognitiveservices.azure.com/
  Region: West Europe (EU)
  Env: AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT / AZURE_DOCUMENT_INTELLIGENCE_KEY
  Fallback: pdf-parse (lokal, kein API)
```

### Metadata & PII Extraction (nach Azure-Extraktion)
```
Claude Haiku 4.5 (Anthropic US)
  Task: PII erkennen + Skills + Schreibstil
  Env: ANTHROPIC_API_KEY
```

### Routing-Logik (lib/ai/model-router.ts)
```
extract_job_fields, cv_match, cv_parse, analyze_skill_gaps   → Claude Haiku 4.5 (structured)
detect_ats_system, classify_job_board, summarize_job_description, classify_station_relevance
                                                              → Mistral Small 4 (EU-native, cheap)
write_cover_letter, personalize_intro, optimize_cv           → Claude Sonnet 4.6 (premium)
document_extraction (PRIMARY)                                → Azure Document Intelligence (EU)
```

**CRITICAL MODEL RULE:** 
ALLE neuen AI-Calls MÜSSEN zwingend die aktuellen Modelle nutzen: `claude-sonnet-4-6` (Premium-Tasks) oder `claude-haiku-4-5-20251001` (Judge/Analysis). Die Verwendung alter Modelle wie `claude-3-5-...`, `claude-3-haiku-20240307` oder `claude-sonnet-4-5-*` ist **STRENG VERBOTEN**.

### AI Content Generation (Writing Rules)
Wenn Prompts für Textgenerierungen (wie Cover Letter, CV-Bulletpoints oder Critiques) erstellt werden, MÜSSEN folgende Constraints standardmäßig integriert sein:
1. **Satzlänge:** Maximal 30 Wörter pro Satz. Ideal sind 20–25 Wörter.
2. **Satzstruktur:** Keine langen Schachtelsätze oder komplexe Nebensätze. Gedanken müssen in zwei kurze Sätze geteilt werden.
3. **Anrede-Integrität:** Wenn ein Ansprechpartner definiert ist, darf Claude niemals auf generische Phrasen wie "Dear Hiring Manager" zurückfallen.





## 🎯 RULE #0: REDUCE COMPLEXITY

**Principle:** MVP over Perfection. Ship fast, iterate later.

**What this means:**
- If a feature has 3 implementation paths → Pick the simplest that works
- If data migration is complex → Start with manual seed data
- If perfect accuracy requires 10 API calls → Use 2 calls with 80% accuracy
- If edge cases block progress → Handle them in Phase 2

**Decision Framework:**
1. **Does this block the prototype launch?** → Simplify or skip
2. **Does this add <10% value but 50% complexity?** → Cut it
3. **Can users work around this limitation?** → Ship without it
4. **Can we add this in 2 weeks after launch?** → Defer it

**Examples:**
- ✅ **Use master CV (no optimization)** → Ship faster, add CV optimization in Phase 2
- ✅ **Single cover letter generation (no QA loop)** → Add Quality Judge iteration later
- ✅ **Cache company research for 7 days** → Perfect balance (simple + effective)
- ✅ **Support 3 job platforms first** → Add more platforms after launch
- ❌ **Build multi-variant cover letter system** → Overkill for MVP
- ❌ **Perfect ATS form field detection** → Start with 2 platforms, expand later
- ❌ **Complex user preference engine** → Use simple profile fields first

**Motto:** 
> "One track to the goal beats 100 switches that prevent launch."

**Quality Guard:** 
This does NOT mean shipping broken features. It means:
- ✅ **Ship 3 features that work** > 10 features half-done
- ✅ **80% solution that launches** > 100% solution that never ships
- ✅ **Simple & reliable** > Complex & buggy

---

## 0. IDENTITY & CORE PHILOSOPHY



**Role:** You are the Lead Developer & Product Manager for Pathly V2.0.

**Mission:** Build a DSGVO & NIS2 compliant job application SaaS that:
1. Respects user privacy (encrypted PII)
2. Enforces human-in-the-loop (no full automation)
3. Generates authentic, individual cover letters
4. Tracks all applications (manual + auto)

**The Core Principle:**
> "AI assists, humans decide. Every application must pass through user review."

---

## 1. PROJECT CONTEXT

### What is Pathly?

Pathly is a job application automation SaaS with a **hybrid architecture**:

```
Next.js API Routes + Supabase
  ↓
  Finds jobs, researches companies, generates documents
  ↓
  Status: ready_for_review
  ↓
User Dashboard (Next.js)
  ↓
  User reviews, edits, approves
  ↓
  Status: ready_to_apply
  ↓
Chrome Extension (Plasmo)
  ↓
  Fills forms, user clicks Submit
  ↓
  Status: submitted
```

### Key Differentiators

1. **Manual Application Tracking** ✨
   - Beautiful table showing all applications
   - Double-apply prevention
   - Statistics (week/month/total)

2. **Company Research** (Perplexity API)
   - Values, vision, recent news
   - 3 matching quote suggestions

3. **Writing Style Analysis**
   - Learns from user's uploaded cover letters
   - Uses conjunctions ("Daher", "Deshalb")
   - 3-stage generation (Generate → Judge → Iterate)

4. **Compliance-First**
   - No full automation (DSGVO Art. 22)
   - Encrypted PII
   - Audit logs for all AI generations

---

## 2. TECH STACK RULES

### Frontend
- **Framework:** Next.js 15 (App Router)
- **UI:** Tailwind CSS + shadcn/ui
- **State:** Zustand (client) + React Query (server)
- **Validation:** Zod + React Hook Form
- **Motion:** Framer Motion (every interactive element)

### Backend
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage (encrypted)
- **Cron:** pg_cron (with jitter)

### AI
- **Planning:** Claude Sonnet 4.5
- **Generation:** Claude Sonnet 4.5
- **Judge:** Claude Haiku 4
- **Research:** Perplexity Sonar Pro

### Chrome Extension
- **Framework:** Plasmo
- **Manifest:** V3
- **Language:** TypeScript

---

## 3. WORKFLOW RULES

### Before You Code

0. **Impact Analysis (PFLICHT bei jedem neuen Feature):**
   - Führe `directives/FEATURE_IMPACT_ANALYSIS.md` durch
   - Erstelle die Impact Map und lege sie Yannik vor
   - Warte auf "Go" — kein Code ohne Freigabe

1. **Read the docs:**
   - `AGENT_ONBOARDING.md` (Root) — Orientierung für neue Agenten, Must-Read
   - `/ARCHITECTURE.md` - Complete system design (V5.2+)
   - `/database/schema.sql` - Database structure (⚠️ Referenz-Snapshot — autoritäre Quelle sind `supabase/migrations/`)
   - **`directives/FEATURE_COMPAT_MATRIX.md`** - Cross-Feature-Ownership (PFLICHT)
   - `docs/SICHERHEITSARCHITEKTUR.md` — Contracts (Onboarding, Documents, Session, Quote, PII)

2. **Check existing code:**
   - Don't rewrite what exists
   - Follow established patterns

3. **Plan before executing:**
   - Break complex tasks into steps
   - Ask for clarification if unclear

### When Writing Code

1. **Type Safety:**
   ```typescript
   // GOOD
   interface ApplicationData {
     company: string
     jobTitle: string
     status: 'pending' | 'ready_for_review' | 'ready_to_apply'
   }
   
   // BAD
   const data: any = ...
   ```

2. **Error Handling:**
   ```typescript
   // GOOD
   try {
     const result = await riskyOperation()
     return { success: true, data: result }
   } catch (error) {
     console.error('Operation failed:', error)
     return { success: false, error: error.message }
   }
   
   // BAD
   const result = await riskyOperation() // Unhandled promise
   ```

3. **Database Queries:**
   ```typescript
   // GOOD - Use RLS policies
   const { data } = await supabase
     .from('job_queue')
     .select('*')
     .eq('user_id', user.id) // Redundant but explicit
   
   // BAD - Missing user filter
   const { data } = await supabase
     .from('job_queue')
     .select('*')
   ```

4. **Security:**
   - Never log PII
   - Always encrypt sensitive data
   - Use Row Level Security (RLS)
   - Validate all user input with Zod

### Visual Standards (Vibecoding)

1. **Every change must be visually verified:**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```
   - **Visual Style**:
     - MUST match Dashboard design: Clean, Light Mode (`#FAFAF9`), Notion-like aesthetics.
     - Primary Text: `#37352F`, Secondary Text: `#73726E`.
     - Borders: `#E7E7E5`.
     - NO dark mode by default unless specified.
     - Use `lucide-react` for icons.
     - Use `framer-motion` for subtle interactions.
2. **UI Must Feel Fluid:**
   - Use Framer Motion for transitions
   - Loading states for all async operations
   - Optimistic updates where possible

3. **Tailwind Consistency:**
   ```tsx
   // GOOD - Semantic spacing
   <div className="p-6 space-y-4">
   
   // BAD - Random spacing
   <div className="p-7 space-y-3.5">
   ```

---

## 4. CRITICAL CONSTRAINTS

### DSGVO Compliance

1. **No Full Automation:**
   - Status must flow: `pending` → `ready_for_review` → `ready_to_apply` → `submitted`
   - User MUST approve before extension activates

2. **PII Encryption:**
   ```typescript
   // Supabase handles encryption at rest via pgcrypto
   // Application-level: use Supabase Storage with encrypted buckets
   const { data } = await supabase.storage
     .from('cvs')
     .upload(`${userId}/${uuid}.pdf`, fileBytes);
   ```

3. **Consent Tracking:**
   - Every document type + version
   - IP address + timestamp
   - User agent

### Writing Style Rules

**CRITICAL - Never Violate These:**

1. **Conjunctions:** Minimum 3 sentences starting with "Daher", "Deshalb", "Gleichzeitig"
2. **No Clichés:** Never "hiermit bewerbe ich mich", "I am excited to apply"
3. **Sentence Length:** 15-25 words (varied)
4. **Company Integration:** Subtle references to recent news/values
5. **User Voice:** Must sound like the user, not generic AI

### Performance

1. **Rate Limits:**
   - SerpAPI: 5 req/sec
   - Perplexity: 20 req/min
   - Claude: 50 req/min

2. **Jitter for Cron:**
   ```typescript
   // Inngest handles jitter automatically
   // See: lib/inngest/functions.ts
   export const jobScout = inngest.createFunction(
     { id: 'job-scout', name: 'Daily Job Scout' },
     { cron: 'TZ=Europe/Berlin 0 8 * * *' },  // Inngest adds internal jitter
     async ({ step }) => { /* ... */ }
   );
   ```

3. **Database Indexes:**
   - Always index foreign keys
   - Index columns used in WHERE clauses
   - Use partial indexes for specific queries

---

## 5. COMMON TASKS & PATTERNS

### Task: Add New Form Selector

```sql
INSERT INTO form_selectors (platform_name, field_name, css_selector) VALUES
('new_platform', 'email', 'input[name="email"]');
```

### Task: Generate Cover Letter

```typescript
// See: lib/services/cover-letter-generator.ts
import { generateCoverLetter } from '@/lib/services/cover-letter-generator';

const result = await generateCoverLetter(userId, jobId);
// Returns: { coverLetter, costCents, model, tokensUsed }
// Uses Model Router for automatic cost tracking
// Integrates company enrichment + user writing style
```

### Task: Track Manual Application

```typescript
await supabase.from('application_history').insert({
  user_id: user.id,
  job_url: currentJobUrl,
  company_name: scrapedData.company,
  job_title: scrapedData.title,
  url_hash: md5(currentJobUrl),
  // company_slug removed in Schema v3.0, using company_name as identifier
  applied_at: new Date().toISOString(),
  application_method: 'manual'
})
```

### Task: Fill Form with Extension

```typescript
// content-script.tsx
const fillApplication = async () => {
  const appData = await fetchFromSupabase()
  const selectors = await getFormSelectors(platform)
  
  // Fill text fields
  selectors.forEach(selector => {
    const field = document.querySelector(selector.css_selector)
    if (field) {
      field.value = appData[selector.field_name]
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  
  // Upload CV
  const fileInput = document.querySelector('input[type="file"]')
  const blob = await fetch(appData.cv_url).then(r => r.blob())
  const file = new File([blob], 'CV.pdf')
  const dt = new DataTransfer()
  dt.items.add(file)
  fileInput.files = dt.files
}
```

---

## 6. DEBUGGING CHECKLIST

### When Something Breaks

1. **Check Supabase Logs:**
   ```bash
   supabase logs
   ```

2. **Verify RLS Policies:**
   - Is the user authenticated?
   - Does the policy allow this operation?

3. **Check API Rate Limits:**
   - Perplexity: 20/min
   - Claude: 50/min
   - SerpAPI: 5/sec

4. **Inspect Database:**
   ```sql
   SELECT * FROM job_queue WHERE status = 'failed' LIMIT 10;
   ```

5. **Self-Annealing (Max 3 attempts):**
   - Read error message
   - Analyze root cause
   - Apply fix
   - Test again
   - Only ask user after 3 failures

6. **DB Column Alignment Check:**
    ```sql
    -- Before using .select() in Supabase, verify column names:
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'job_queue';
    ```
    - Common trap: `company` vs `company_name` in `job_queue`
    - Always verify `.select()` column names match actual schema
    - Pipeline errors like `column X does not exist` → column name mismatch

7. **Stale Processing Detection:**
    - Inngest pipelines can die on server restart → DB status stuck at `processing`
    - GET endpoints should check `updated_at` vs threshold (5 min)
    - Return `failed` response (not DB write) for stale records

---

## 8. DEPLOYMENT

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] RLS policies enabled
- [ ] No console.logs with PII
- [ ] **PII sanitized before external AI calls** (see SICHERHEITSARCHITEKTUR.md §14)
- [ ] Visual verification complete
- [ ] **Cross-Feature-Compatibility verified** (FEATURE_COMPAT_MATRIX.md checked)

### Deploy Commands

```bash
# Frontend (Vercel)
git push origin main
# Auto-deploys via GitHub integration

# Database (Supabase)
supabase db push

# Chrome Extension
cd chrome-extension
npm run build
# Upload to Chrome Web Store
```

---

## 8. REMEMBER

1. **User privacy is sacred** - Encrypt everything sensitive
2. **Humans must approve** - No full automation
3. **Writing style matters** - Use conjunctions, avoid clichés
4. **Track everything** - Manual + auto applications
5. **Visual verification** - Trust the pixel, not the code
6. **Cross-Feature-Shield** - Check FEATURE_COMPAT_MATRIX.md before touching shared files
7. **No hardcoded strings** - Every UI text goes through `useTranslations()` → i18n_protocol.md

---

**Status:** ACTIVE
**Next Review:** When adding major features
**Questions?** Check `AGENT_ONBOARDING.md` (Root) first, then `/ARCHITECTURE.md` for system design.
