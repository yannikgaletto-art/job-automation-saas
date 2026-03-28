# Feature Impact Analysis: Consistent 2-Page CV System

**Status:** Design Approved — Teilweise implementiert  
**Owner:** Yannik Galetto  
**Erstellt:** 2026-03-10  

---

## Problem Statement

CVs mit unterschiedlichen Inhaltsmengen (3 vs. 8 Berufserfahrungen, 5 vs. 15 Skills, etc.) 
erzeugen inkonsistente Seitenlayouts: manche CVs haben 1.5 Seiten, andere 4+ Seiten.

**Ziel:** Jeder CV soll konsistent 2 Seiten haben:
- **Seite 1:** Berufserfahrung + Ausbildung
- **Seite 2:** Skills, Sprachen, Zertifikate

---

## Architecture: 3-Layer Content Budget System

```
┌──────────────────────────────────────────────────┐
│  Layer 1: AI Content-Length Guardrails            │
│  (cv/optimize/route.ts — PROMPT v2.1)            │
│                                                   │
│  ├─ Max 3 Bullets pro Erfahrung                   │
│  ├─ Max 20 Wörter pro Bullet                      │
│  ├─ Max 3 Sätze Summary                           │
│  ├─ >5 Erfahrungen → ältere auf 1 Bullet           │
│  ├─ Quality Gate: jeder Change braucht Substanz    │
│  └─ Authentic Keyword Weaving (ATS-Keywords)       │
├──────────────────────────────────────────────────┤
│  Layer 2: Template Page Structure                 │
│  (ValleyTemplate.tsx / TechTemplate.tsx)           │
│                                                   │
│  ├─ Page 1: Header + Summary + Experience + Edu   │
│  ├─ Page 2: Skills + Languages + Certifications   │
│  ├─ wrap={false} auf Experience-Blöcken            │
│  └─ minPresenceAhead={40} auf Skills/Certs         │
├──────────────────────────────────────────────────┤
│  Layer 3: OPTIONAL FUTURE — AI Layout Judge       │
│  (Nicht implementiert — nur bei Bedarf)            │
│                                                   │
│  └─ Post-render: PDF Seitenzahl prüfen            │
│  └─ If >2 Seiten → re-run optimizer mit           │
│     strengeren Constraints                         │
└──────────────────────────────────────────────────┘
```

---

## Implementation Status

| Layer | Status | Datei |
|-------|--------|-------|
| Layer 1 (AI Guardrails) | ✅ Implementiert | `app/api/cv/optimize/route.ts` |
| Layer 2 (Template Structure) | ✅ Implementiert | `ValleyTemplate.tsx`, `TechTemplate.tsx` |
| Layer 3 (AI Layout Judge) | ⏸ Deferred | Nur bei User-Feedback zu >2-Seiten-CVs |

---

## Was muss VORHER passieren

1. **cv-parser** muss V2-Felder extrahieren (targetRole, level, credentialUrl) ✅
2. **cv/optimize** muss Content-Length Guardrails enforced ✅
3. **Template** nutzt `minPresenceAhead` für Orphan Prevention ✅
4. **User** kann im DiffReview Änderungen übernehmen/ablehnen ✅

---

## Risiken

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|--------------------| ------------|
| Claude ignoriert Constraints | 15% | `PROMPT_VERSION` tracking, Self-Judge Validation + Backend cap bei 12 |
| 20-Wort-Limit führt zu Overflow | 10% | Layer 2 Templates + ≥5-Stationen-Regel (1 Bullet) + ≥6 Stationen (1 Bullet älteste 2) |
| Keyword Weaving halluziniert | 15% | Authenticity Gate im Prompt + Before-Text Sanitizer blockt ungenaue Pfade |
| Bestehende CVs haben V1-Format | 100% (erwartet) | Alle V2-Felder sind `nullish()` — backward compatible |
