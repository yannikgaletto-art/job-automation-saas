# 🗂️ DEFERRED FEATURES — Pathly V2.0
**Status:** Backlog — Nicht in Batch 1–3 enthalten
**Letztes Update:** 2026-02-26
**Grund:** Zu hohe Komplexität oder zu hohes Fehlerrisiko für aktuelle Phase.
**Review:** Nach Stabilisierung von Batch 1 + 2

---

## Warum dieser File existiert

Nicht jede gute Idee gehört sofort ins Produkt.
Diese Features wurden bewertet, für wertvoll befunden — aber zurückgestellt,
weil sie entweder eine eigene Infrastruktur brauchen oder das Fehlerrisiko
im aktuellen Entwicklungsstand zu hoch ist.

> **Regel:** Kein Feature aus dieser Liste wird implementiert, bevor Batch 1 + 2
> vollständig stabil laufen (>95% Erfolgsrate, User-Feedback positiv).

---

## 🎤 Feature D1 — Voice Cloning über Audio-Samples

**Original-Idee:** User spricht 60-Sekunden-Sprachnachricht. Pathly transkribiert
via Whisper API, extrahiert Rhythmus, Füllwörter und Leidenschaft — und baut
genau diese Sprechweise in den Cover Letter ein.

**Warum zurückgestellt:**
- Technisches Transkribieren (Whisper) = trivial ✅
- Stiltransfer von Sprache → Schrift = fundamental anderes Problem ❌
- Menschen reden und schreiben grundlegend verschieden
- Würde zu umgangssprachlichen, fragmentierten Cover Letters führen
- Kein klares Qualitätssignal ob Output besser oder schlechter ist

**Fehlerwahrscheinlichkeit:** ~55–60%
**Aufwand:** Eigene Audio-Pipeline (Whisper API + Style Extractor + Evaluator)

**Revisit-Bedingung:**
- Writing Style Analyzer (B1.1) hat ≥6 Monate Daten
- Mindestens 500 Cover Letters generiert und bewertet
- A/B-Test: Voice-Stil vs. Text-Stil — User-Präferenz gemessen

**Technischer Stack (wenn bereit):**
```
Audio-Input (Browser MediaRecorder API)
  ↓
OpenAI Whisper API → Transkript
  ↓
Claude Haiku → Style-Extraktion aus Transkript
  ↓
Separate Style-Dimension: "spoken_rhythm" in metadata.style_analysis
  ↓
Cover Letter Generator → Gewichtung spoken_rhythm vs. written_style
```

---

## 🔗 Feature D2 — GitHub/Portfolio-to-Text Synthese

**Original-Idee:** Pathly zieht die letzten 3 Commits/PRs aus dem GitHub-Profil
des Users und integriert sie organisch in den Cover Letter.
*"Als ich kürzlich das Caching in unserer Next.js-App optimierte (Ladezeit -40%)..."*

**Warum zurückgestellt:**
- Eigene OAuth-Integration mit GitHub API nötig
- Commit-Messages sind oft zu technisch/kryptisch für Cover Letters
- Qualitäts-Filter nötig (nicht jeder Commit ist relevant)
- Datenschutz: Privat-Repos dürfen nicht ausgelesen werden
- Scope-Creep: Verschiebt Pathly von "Job Tool" zu "Developer Portfolio Tool"

**Fehlerwahrscheinlichkeit:** ~35% (technisch lösbar, aber Qualitätsrisiko hoch)
**Aufwand:** GitHub OAuth + Commit-Parser + Relevanz-Filter + Prompt-Integration

**Revisit-Bedingung:**
- Primär relevant für Developer-Zielgruppe (nicht aktueller Fokus: PMs, Designer, BDM)
- Erst wenn Pathly >1000 aktive User hat und Developer-Segment signifikant ist
- Als optionales "Developer Mode"-Feature, nicht Standard

---

## 📊 Feature D3 — Multi-Document Style Averaging

**Original-Idee:** User lädt 2–3 Referenz-Anschreiben hoch. Pathly analysiert alle
und mittelt den Stil — robusteres Writing Profile als aus einem einzigen Dokument.

**Warum zurückgestellt:**
- Sinnvoll erst wenn Style Analyzer (B1.1) einzeln stabil läuft
- Averaging-Logik: Wie gewichtet man widersprüchliche Stile?
- Edge Case: User hat nur ein Anschreiben (häufiger Fall)
- Kein Blocking-Problem — Single-Document Analysis ist gut genug für MVP

**Fehlerwahrscheinlichkeit:** ~20% (konzeptionell einfach, nur Timing-Frage)
**Aufwand:** Gering — Erweiterung von writing-style-analyzer.ts

**Revisit-Bedingung:**
- B1.1 (Writing Style Analyzer) ist stabil und produktiv
- User-Feedback zeigt: Style-Match ist wichtigste Verbesserungsprioritaet
- Implementierung: ≤1 Tag Aufwand wenn Basis steht

**Schnell-Implementierung (wenn ready):**
```typescript
// Einfach: Alle Cover-Letter-Dokumente des Users analysieren
// Conjunctions: Union aller Listen
// Tone: Häufigster Wert (Mode)
// Sentence Length: Durchschnitt
// Greeting: Aus dem neuesten Dokument
const profiles = await Promise.all(coverLetterDocs.map(analyzeWritingStyle));
const mergedProfile = mergeStyleProfiles(profiles);
```

---

## 🧠 Feature D4 — "First 90 Days" als vollständiges Sub-Dokument

**Original-Idee (Extended Version):** Nicht nur 3 Bulletpoints im Cover Letter,
sondern ein separates, generierbares "First 90 Days Plan" PDF als Bewerbungsanhang.

**Warum zurückgestellt:**
- Die Light-Version (3 Bulletpoints im CL) ist in Batch 2 enthalten ✅
- Die Heavy-Version (eigenes Dokument) ist ein komplett anderes Produkt-Feature
- Braucht: Eigenes Template, eigenen Generator, eigene UI, eigenes DB-Schema
- Risiko: Dilution — Pathly verliert Fokus auf Cover Letter

**Revisit-Bedingung:**
- Nur wenn User-Research zeigt, dass "90-Day-Plan" als Anhang häufig gefordert wird
- Phase 4 Kandidat (nach stabilem Launch)

---

## 🔮 Feature D5 — Semantic Style Similarity Search

**Original-Idee:** Nutze `writing_style_embedding` (VECTOR 1536, bereits im Schema)
um ähnliche User-Stile zu finden. "Users wie du tendieren zu..."
Verbessert Generierungsvorschläge für neue User ohne viele Trainingsdaten.

**Warum zurückgestellt:**
- Braucht kritische Masse: >500 analysierte Cover Letters
- Datenschutz-Implikationen: User-Stile dürfen nicht cross-user verglichen werden
  ohne explizites Opt-in (DSGVO-relevant!)
- pgvector Setup und Performance-Testing nötig

**Revisit-Bedingung:**
- DSGVO-Consent für Style-Aggregation implementiert
- >500 User mit analysierten Dokumenten
- pgvector Index optimiert

---

## 📅 Review-Kalender

| Feature | Nächster Review | Trigger |
|---|---|---|
| D1 Voice Cloning | Q3 2026 | Nach 500 generierten CLs |
| D2 GitHub Synthese | Q4 2026 | Wenn Developer-Segment >20% |
| D3 Multi-Doc Averaging | Nach Batch 2 | Wenn B1.1 stabil |
| D4 90-Days Dokument | Q4 2026 | User-Research Ergebnis |
| D5 Semantic Similarity | Q1 2027 | Nach 500+ User-Profiles |
| D6 DOCX Export | Q3 2026 | Recruiter-Feedback zu PDF-Parsing |

---

## 📄 Feature D6 — DOCX Export

**Original-Idee:** CV als .docx-Datei exportieren für maximale ATS-Kompatibilität.
Manche Recruiting-Systeme parsen PDFs fehlerhaft — DOCX würde das umgehen.

**Warum zurückgestellt:**
- @react-pdf/renderer erzeugt bereits ATS-lesbare PDFs ✅
- DOCX-Generierung braucht eigene Engine (docx-templater oder ähnlich)
- Separates Template-System nötig (react-pdf ≠ DOCX-Renderer)
- Kein User-Feedback das PDF-Parsing-Probleme meldet

**Fehlerwahrscheinlichkeit:** ~25% (technisch lösbar, aber hoher Aufwand)
**Aufwand:** docx-templater Setup + separate Templates + Download-Logik

**Revisit-Bedingung:**
- >100 CV-Downloads und Recruiter-Feedback gesammelt
- Wenn >10% der Recruiter PDF-Parsing-Probleme melden
- Oder wenn ein Enterprise-Kunde DOCX explizit fordert

---

> Dieses Dokument wird laufend ergänzt.
> Neue zurückgestellte Features hier dokumentieren — nie einfach "fallen lassen".
> **Owner:** Yannik Galetto
> **Letzte Aktualisierung:** 2026-02-26
