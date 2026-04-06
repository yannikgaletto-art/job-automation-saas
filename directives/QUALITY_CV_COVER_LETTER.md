# 🏆 QUALITY_CV_COVER_LETTER — Pathly V2.0
**Ziel:** Silicon Valley / Y Combinator Niveau
**Version:** 1.0
**Erstellt:** 2026-02-26
**Status:** AKTIV — PFLICHTLEKTÜRE für alle Cover Letter & CV Agents
**Referenz-Anschreiben:** T1 (Mission Wertvoll) und T2 (Exxeta) — das ist der Qualitätsmaßstab.

---

> **GOLDEN RULE:**
> Ein Cover Letter von Pathly muss so klingen, als hätte Yannik ihn selbst geschrieben —
> an einem seiner besten Tage, mit vollem Kontext über die Firma.
> Wenn ein Personaler denkt "das hat eine KI geschrieben", haben wir versagt.

---

## 1. DIE 3 BATCHES — ÜBERSICHT

```
Batch 1 (Fundament)    → Muss zuerst. Ohne diese Basis ist alles umsonst.
Batch 2 (Qualität)    → Nach Batch 1. Baut auf Style-Analyzer auf.
Batch 3 (Innovation)  → Nach Batch 1+2. Das YC-Wow-Niveau.
```

---

## 🔴 BATCH 1 — Das Fundament
*Kausal: Alles andere hängt hiervon ab.*

### B1.1 — Writing Style Analyzer aktivieren
**Problem:** `metadata.style_analysis` existiert im Schema, wird aber nie befüllt.
**Lösung:** `document-processor.ts` ruft `writing-style-analyzer.ts` auf
nach dem Upload von Referenz-Anschreiben.

**Extrahierte Style-Marker (Pflicht):**
```typescript
interface StyleAnalysis {
  tone: 'professional' | 'storytelling' | 'data-driven' | 'philosophical';
  sentence_length: 'short' | 'medium' | 'long'; // avg Wörter
  conjunctions: string[];     // Top-5: ["Daher", "Deshalb", "Zudem"...]
  greeting: string;           // z.B. "Liebe Anna-Nicole" / "Sehr geehrte..."
  rhetorical_devices: string[]; // ["quote", "anecdote", "rhetorical_question"]
  forbidden_constructs: string[]; // Was der User NIE schreibt
}
```

**Neu gegenüber alter Directive:** `rhetorical_devices` und `forbidden_constructs`
werden jetzt auch extrahiert — nicht nur Konjunktionen.

**Files:**
- Erstellen: `lib/services/writing-style-analyzer.ts`
- Modifizieren: `lib/services/document-processor.ts`

---

### B1.2 — Anti-Fluff Blacklist (15+ Muster)
**Problem:** Generische KI-Phrasen zerstören Authentizität.
**Wichtig:** Nicht Strukturen verbieten ("Ich habe gelernt, dass"), sondern
substanzlose Kalenderspruch-Inhalte danach.

**Blacklist (hart verdrahtet im System Prompt):**
```
VERBOTEN — niemals generieren:
❌ "[Firma] steht für" / "[Firma] verkörpert"
❌ Gedankenstriche als rhetorisches Stilmittel: —
❌ Metaaussagen über Erfolg/Leidenschaft ohne konkreten Beleg:
   z.B. "Erfolg entsteht, wenn man bereit ist, selbst anzupacken"
       "Leidenschaft ist mein Antrieb"
       "Ich brenne für [Thema]"
❌ Passivkonstruktionen ohne Substanz: "wurde mir bewusst", "konnte ich feststellen"
❌ Sätze, die mit "Ich bin" + reinem Adjektiv beginnen:
   z.B. "Ich bin leidenschaftlich", "Ich bin überzeugt"
❌ Sätze über 30 Wörter ohne Komma
❌ "Mit freundlichen Grüßen" nur wenn explizit kein anderer Gruß extrahiert
❌ Alle Floskeln: "hiermit bewerbe ich mich", "mit großem Interesse",
   "I am excited to apply", "I am writing to apply"
❌ Abgehobene Allgemeinplätze die wie Kalenderweisheiten klingen
❌ Sätze die bei einem Leser den Gedanken auslösen: "Das hat ChatGPT geschrieben"
```

**Validierung:** Nach Generierung: Regex-Scan auf alle Blacklist-Terme →
Bei Fund: Automatisch zurück an Claude mit Instruction: "Ersetze alle markierten
Passagen durch konkrete, belegbare Aussagen aus dem User-Profil."

---

### B1.3 — Zitat-System (Reparatur + Ping-Pong Option)
**Problem:** Zitate werden eingequetscht, sind nicht relevant für Firma,
haben keine Begründung.

**Pflicht-Format für jedes Zitat:**
```
[Absatz Ende]

„[Zitat in voller Länge auf eigener Zeile]“
— [Autor, Kontext]

[Begründungs-Satz: Warum dieses Zitat, warum diese Firma, warum jetzt]
```

**Zitat-Relevanz-Anforderungen:**
- Muss direkt zur Firmen-Mission ODER aktuellen News ODER Stellenbeschreibung passen
- Darf NICHT generisch sein (kein "The only way to do great work..."-Apple-Zitat)
- Quelle muss echt und verifizierbar sein (Perplexity-Check)

**Opt-In: Ping-Pong Modus (User-Entscheidung):**
Wenn User aktiviert: Nach dem Zitat kommt eine kurze kritische Gegenposition
(1-2 Sätze), bevor die Brücke zur Firma geschlagen wird.
Beispiel aus T2: *"Ehrlich gesagt war ich davon früher kein Fan, weil...
  Aber je mehr ich euer Produkt X sehe..."*

---

### B1.4 — Auto-Save aller generierten Cover Letters
**Problem:** Wenn User zurückgeht, ist der CL weg.

**Lösung:**
- Jeder generierte CL wird sofort mit `status: 'draft'` in DB gespeichert
- Zurückgehen löscht NICHTS — nur Status bleibt `draft`
- "Meine Entwürfe"-Sektion im Dashboard zeigt alle gespeicherten Versionen
- User kann Entwürfe vergleichen und einen als aktiv markieren

**Sicherheitsarchitektur-Pflicht:** Jeder DB-Insert braucht zwingend
`user_id` + Read-Back-Verifikation (Contract Abschnitt 2).

---

### B1.5 — Stil-Auswahl wirklich verdrahten
**Problem:** `Formal / Storytelling / Daten-getrieben` ändert aktuell nur ein Wort.

**Lösung — Jeder Stil ändert die gesamte Prompt-Struktur:**

| Stil | Struktur | Pflicht-Elemente |
|---|---|---|
| Storytelling | Narrativer Einstieg, Dramaturgie-Bogen | Persönliche Anekdote als Opening, Spannungsbogen |
| Daten-getrieben | Struktur: Claim → Beweis → Implikation | Zahlen/Metriken in jedem Absatz verpflichtend |
| Formal | Klassisch: Einleitung → Hauptteil → Schluss | Kein "Ihr/Du", keine Zitate, kein Ping-Pong |
| Philosophisch | Zitat-Einstieg, konzeptionelle Ebene | Intellektueller Rahmen, Referenzen erlaubt |

---

### B1.6 — Ansprechperson-Binding
**Problem:** Ansprechperson wird nicht in Begrüßung eingebettet.

**Lösung:**
```typescript
// Aus Job-Scraping-Daten:
if (jobData.contact_person) {
  greeting = `Liebe ${jobData.contact_person.first_name}`; // weiblich default
  // oder: `Lieber ${name}` wenn Männlichkeit aus Name erkennbar
} else {
  greeting = userStyle.greeting || 'Sehr geehrte Damen und Herren';
}
```

---

## 🟡 BATCH 2 — Die Qualitäts-Pipeline
*Voraussetzung: Batch 1 vollständig und stabil.*

### B2.1 — Drei-Agenten-Pipeline
**Architektur:**
```
Agent 1: Claude Sonnet → Erster Entwurf (User-Stil + Company-Intel)
    ↓
Agent 2: GPT-4o (Language Judge) → Anti-Fluff, Satz-Rhythmus, KI-Detektion
    ↓
Agent 3: Perplexity Sonar (Fact Checker) → Firmen-Claims verifiziert?
    ↓
Finaler Text (verifiziert, authentisch, faktisch korrekt)
```

**Agent 2 Instruction (GPT-4o):**
```
Du bist ein Language Judge. Deine Aufgabe:
1. Finde alle Sätze die nach KI klingen (Blacklist anwenden)
2. Prüfe Satz-Länge und -Rhythmus: kein Satz über 30 Wörter ohne Komma
3. Prüfe: Klingt das wie ein echter Mensch oder wie ChatGPT?
4. Ersetze alle markierten Passagen durch authentischere Formulierungen
5. Behalte die Struktur und alle Fakten bei
Output: Verbesserter Text + Liste der geänderten Stellen
```

**Agent 3 Instruction (Perplexity):**
```
Prüfe alle Firmenreferenzen im folgenden Cover Letter:
- Sind die genannten News/Ereignisse real und aktuell?
- Stimmen Zitate und Zuschreibungen?
- Gibt es neuere relevante Entwicklungen die erwähnt werden sollten?
Output: Verifiziert ✅ oder: [Fehler] + Korrektur
```

---

### B2.2 — User-Steuerungs-Panel (Opt-In Features)
**Vor der Generierung sieht der User:**

```
┌───────────────────────────────────────────────┐
│  ⚙️ Erweiterte Optionen (optional)          │
├───────────────────────────────────────────────┤
│ ☐ First 90 Days Hypothesis               │
│   KI plant deinen ersten Monat konkret    │
│                                           │
│ ☑ Pain Point Matching (empfohlen)         │
│   Analysiert implizite Firmenschmerzen     │
│                                           │
│ ☐ Vulnerability Injector (max. 2x)        │
│   Baut strategische Schwäche ein          │
│                                           │
│ ☐ Zitate-Ping-Pong                        │
│   Zitat + Gegenposition + Brücke          │
│                                           │
│ ☑ Stations-Selektor (empfohlen)           │
│   Wähle welche Stationen erwähnt werden   │
└───────────────────────────────────────────────┘
```

**Jedes Opt-In-Feature — wie es funktioniert:**

**First 90 Days (1x verwenden):**
```
Basierend auf den letzten News und offenen Stellen der Firma:
"In den ersten 90 Tagen würde ich mich auf 3 Dinge fokussieren:
1. [Konkretes Problem der Firma + User-Lösungsansatz]
2. [Zweites Thema]
3. [Drittes Thema]"
Nur 3 Bulletpoints, kein Roman.
```

**Pain Point Matching (1x verwenden):**
```
Stellenbeschreibungs-Analyse:
- Explizit gesucht: [Python, Teamführung] = Skill Match
- Impliziter Schmerz: "Aufbau eines neuen Teams" = echtes Problem
  → Generator matched User-Station wo genau das passiert ist
  → Nicht "Ich kann das", sondern "Hier habe ich das gelöst: [konkret]"
```

**Vulnerability Injector (max. 2x):**
```
Strategische, authentische Schwäche oder Lernkurve:
"Ich habe bei [Station] schnell gemerkt, dass mein erster Ansatz
zu komplex gedacht war. Das hat mich gezwungen, radikal zu vereinfachen—
ein Prinzip, das ich auch in eurer [Firmen-Kontext] sehe."
REGEL: Darf nie wie eine Entschuldigung klingen, immer als Wachstum framen.
```

---

### B2.3 — Stations-Selektor
**Problem:** Generator erwähnt alle Stationen oder die falschen.
**Lösung:** User wählt vor Generierung explizit 2-3 Stationen.
```
Welche Stationen sollen im Cover Letter vorkommen?
☑ Fraunhofer FOKUS (Innovation Consultant)
☐ KPMG (Public Sector)
☑ Xorder (Co-Founder)
☐ Ingrano Solutions (BDM)
☐ Medieninnovationszentrum
Nur ausgewählte Stationen werden im Generator verwendet.
```

---

### B2.4 — Kill the Fluff Button
**Platzierung:** Im Editor nach der Generierung, rechts unten.
**Mechanik:**
1. User klickt "Kill the Fluff"
2. GPT-4o scannt Text auf Blacklist + Kalenderspruch-Muster
3. Erkannte Phrasen werden rot unterkringelt + Erklärung (Tooltip)
4. Button: "Alle entfernen" → GPT-4o ersetzt durch konkrete, belegbare Aussagen
5. Optional: User kann einzelne Phrasen manuell reviewen
**Kosten:** ~$0.003 pro Klick (on-demand, nicht automatisch)

---

### B2.5 — News-Binding reparieren
**Problem:** Gewählte News wird nicht in CL integriert.
**Lösung:**
```typescript
// News ist verpflichtender Kontext-Anker:
if (selectedNews) {
  systemPrompt += `
  PFLICHT: Die folgende News MUSS organisch im Cover Letter erwähnt werden:
  "${selectedNews.title}" (${selectedNews.date})
  Integriere sie als Brücke zwischen User-Erfahrung und Firma.
  Nicht als Fakt hinwerfen, sondern als Anknüpfungspunkt nutzen.
  `;
}
// Perplexity Fact-Checker verifiziert anschließend die Nennung.
```

---

## 🟢 BATCH 3 — Das Innovation Layer
*Voraussetzung: Batch 1 + 2 stabil (>95% Erfolgsrate)*

### B3.1 — Context X-Ray Slider (Pflicht — kein Kompromiss)
**Idee:** User sieht woher jeder Satz kommt.
**Platzierung:** Toggle-Button oben im Editor: "🔍 X-Ray Mode"

**Farb-Codierung:**
```
🟢 Grün  = Deine Stimme  (gematcht mit Writing Style Profile)
🔵 Blau  = Firmen-Kontext (Company Research / News-Artikel)
🟣 Lila  = Job-Fit       (direkt aus Stellenbeschreibung)
```

**Hover-Verhalten:**
Mouse over markierter Satz → Popup:
```
🔵 Quelle: Perplexity-Research vom 26.02.2026
"Exxeta expandiert nach Wien" — Handelsblatt
Vertrauen: ★★★★☆ (4/5)
```

**Button:** "Ich habe verstanden" → X-Ray deaktiviert, Farben verschwinden.

**Technische Anforderung:**
- Generator muss pro Satz ein Annotation-Tag mitliefern
- Format: `{ text: "Satz", source: "company_research" | "user_style" | "job_fit", reference: "string" }`
- Frontend rendert Tags als farbige Highlights

---

### B3.2 — A/B Hiring Manager Panel
**Ersetzt:** Rechtes Qualitäts-Widget (7.75/10 etc. — wird entfernt)
**Platzierung:** Rechtes Panel im Cover Letter Editor

**UI:**
```
┌───────────────────────────────┐
│ 💼 Für wen schreibst du?     │
├───────────────────────────────┤
│ 🔘 Anna-Nicole W.           │
│   People Lead @ Mission   │
│   "Werteorientiert"        │
│   → Zitat-Einstieg ✓      │
│                           │
│ ○ Marcus H. (CTO)         │
│   "Pragmatisch, Metriken" │
│   → Daten-getrieben        │
│                           │
│ ○ Unbekannt               │
└───────────────────────────────┘
         [Neu generieren →]
```

**Mechanik:**
1. Perplexity sucht automatisch nach Hiring Manager (aus Stellenanzeige extrahiert)
2. Leitet Persona ab: Werte, Hintergrund, vermutliche Prioritäten
3. User wählt Persona → Generator erhält Persona als zusätzlichen Kontext
4. "Neu generieren" → Cover Letter wird für diese Persona optimiert

---

## 2. QUALITÄTSMAßSTÄBE (Referenz)

### Was guten Output definiert — T1 und T2 als Benchmark

**T1 (Mission Wertvoll) macht richtig:**
- Direkter Bezug zum spezifischen Programm ("Planet Narratives")
- 3 klar strukturierte Wirkfelder (nicht generisch)
- Laloux-Zitat passt perfekt zur Firmenphilosophie
- Stations-spezifisch: FOKUS, KPMG, Xorder gezielt gewählt
- Kein einziger Satz der nach KI klingt

**T2 (Exxeta) macht richtig:**
- Grace Hopper Zitat: relevant, erklärt, persönliche Verbindung
- Konkrete Tool-Nennung (Make, Jira, Confluence, Miro)
- Kultur-Absatz: spezifisch ("Prenzlauer Berg", "diversen Team")
- Selbstständigkeit als Co-Founder als Beweis für Eigenverantwortung

**Gemeinsame Qualitäts-DNA:**
- Ansprechperson beim Namen (T1: "Liebe Anna-Nicole", T2: "Liebes Exxeta-Team")
- Zitat auf eigener Zeile, begründet
- Stations-Auswahl bewusst und job-relevant
- Persönliche Haltung sichtbar — keine Bewerbungs-Floskeln
- Abschluss: konkret + Einladung zum Dialog

---

## 3. VERBOTENE ANTI-PATTERNS (Vollständige Liste)

```
NIEMALS generieren — nicht verhandelbar:

❌ "[Firma] steht für" / "[Firma] verkörpert" / "[Firma] repräsentiert"
❌ Gedankenstriche als rhetorisches Stilmittel: —
❌ Substanzlose Erfolgs-Weisheiten:
   "Erfolg entsteht, wenn man bereit ist, selbst anzupacken"
   "Leidenschaft ist mein Antrieb"
   "Ich brenne für [Thema]"
   "Ich glaube fest daran, dass..."
❌ Metaaussagen: "konnte ich feststellen", "wurde mir bewusst"
❌ "Ich bin" + reines Adjektiv: "Ich bin leidenschaftlich", "Ich bin überzeugt"
❌ Sätze über 30 Wörter ohne Komma
❌ "hiermit bewerbe ich mich", "mit großem Interesse"
❌ "I am excited to apply", "I am writing to apply"
❌ Abgehobene Allgemeinplätze die wie Kalenderweisheiten klingen
❌ Aussagen die für jede Firma 1:1 kopierbar wären
❌ Wiederholung von CV-Inhalten ohne Mehrwert
```

---

## 4. VERIFICATION GATES (Cover Letter spezifisch)

Zusätzlich zu Gates A–K aus SICHERHEITSARCHITEKTUR.md und FEATURE_IMPACT_ANALYSIS.md:

- [ ] **Gate CL-1** — Kein Satz aus der Blacklist im generierten Text
- [ ] **Gate CL-2** — `metadata.style_analysis` war befüllt vor Generierung
- [ ] **Gate CL-3** — Zitat steht auf eigener Zeile + hat Begründungssatz
- [ ] **Gate CL-4** — Ansprechperson korrekt eingebettet (wenn verfügbar)
- [ ] **Gate CL-5** — Nur gewählte Stationen werden erwähnt
- [ ] **Gate CL-6** — Gewählte News ist organisch integriert (wenn gewählt)
- [ ] **Gate CL-7** — Auto-Save: CL in DB mit status='draft' gespeichert
- [ ] **Gate CL-8** — Perplexity hat alle Firmenreferenzen verifiziert (Batch 2)
- [ ] **Gate CL-9** — X-Ray Annotations vollständig (Batch 3)

---

## 5. COST STRUCTURE (Updated)

| Batch | Komponente | Kosten/CL |
|---|---|---|
| 1 | Claude Sonnet (Generierung) | ~$0.015 |
| 1 | Style Analysis (Haiku, einmalig) | ~$0.0005 |
| 2 | GPT-4o Language Judge | ~$0.008 |
| 2 | Perplexity Fact Checker | ~$0.006 |
| 2 | Kill the Fluff (on-demand) | ~$0.003 |
| **Gesamt Batch 1** | | **~$0.016** |
| **Gesamt Batch 1+2** | | **~$0.030** |

**Akzeptabel:** Batch 1+2 zusammen < $0.05 pro CL ist vertretbar für die Qualität.

---

## 6. DEFERRED FEATURES (Verweis)

Siehe: `directives/DEFERRED_FEATURES.md`
- D1: Voice Cloning
- D2: GitHub Synthese  
- D3: Multi-Doc Style Averaging
- D4: 90-Days als Dokument
- D5: Semantic Style Similarity

---

> **Letztes Update:** 2026-04-05
> **Nächster Review:** Nach Batch 1 vollständig live
> **Owner:** Yannik Galetto
> **Qualitätsreferenz:** T1 (Mission Wertvoll) + T2 (Exxeta) — die Benchmark-Anschreiben

---

## 7. AUTHENTICITY PRINCIPLES (Update 2026-04-05)

Diese 8 "Golden Rules" wurden aus direkten Trainingssessions destilliert. Sie definieren den Unterschied zwischen "KI-Sprache" (Averaging) und echter, glaubwürdiger Sprache ("Meine Sprache").

| ID | Prinzip | Wie es richtig klingt | KI-Anti-Pattern |
|----|---------|-----------------------|------------------|
| A | **Red Threading** | Ein zentrales Keyword (z.B. "Generalist") aus der Anzeige wird organisch im Intro und im ersten Hauptabsatz aufgegriffen, um eine Brücke zu bauen. | Fakten werden ohne roten Faden in Bulletpoints aneinandergereiht. |
| B | **Pain Point (sachlich)** | *"Ich sehe, dass ihr ein Team neu aufbaut. Ich habe ähnliche Best Practices entwickelt."* | *"Ich bin der ideale Kandidat, um dieses Problem zu lösen."* (Retter-Komplex) |
| C | **Vulnerability-Value Binding**| Authentische Lernkurve aus einer CV-Station, verknüpft mit einem konkreten Firmenwert. KEIN festes Satzmuster — jede Vulnerability muss einzigartig formuliert sein. | *"Als Schwäche könnte man meinen Perfektionismus ansehen."* (Generisch) / Wörtliche Kopie eines Template-Satzes (Prompt Leakage) |
| D | **Fokus-Balance (90 Days)** | *"...mich auf die Engpässe fokussieren; ohne dabei Produktentwicklung und Prozesse aus den Augen zu verlieren."* | *"In den ersten 30 Tagen werde ich zuhören und verstehen."* (Passiv) |
| E | **Enabler-Framing** (Quereinstieg) | *"Mir hat es in der Tech-Beratung sehr geholfen, einen medienwissenschaftlichen Hintergrund zu haben."* | *"Obwohl ich aus einem anderen Bereich komme, habe ich die nötigen Fähigkeiten..."* |
| F | **Souveräne Ambition** | *"Nicht weil es schlecht war; sondern weil ich sehen wollte, ob ich dieselben Probleme mit mehr Budget schneller lösen kann."* | *"Aufbauend auf diesen wertvollen Erfahrungen suche ich eine neue Herausforderung."* |
| G | **Minimalistisches Closing**| *"Wenn der Termin passt: Ich bin die nächsten Wochen flexibel/verfügbar."* | *"Ich würde mich sehr über die Möglichkeit eines Gesprächs freuen..."* |
| H | **Aktiver Skill-Beweis** | *"Bei [Firma] habe ich mich für die Strategie X eingesetzt."* (Zeigt Aktion) | *"Die Strategie X zählte zu meinen Kernverantwortlichkeiten."* (Listet auf) |
| I | **Intro-Dichte** | Max. 1 Organisation namentlich in der Einleitung. Zweite Referenz → Hauptteil. | Intro nennt 3 CV-Stationen → kein Futter für Hauptteil. |
| J | **Subjekt-bezogene Firmenreferenz** | *"Nach meiner Recherche zu Ihren Projekten…"*, *"Auf LinkedIn sind mir Ihre Beiträge aufgefallen…"* | *"[Firma] agiert an der Schnittstelle…"* (allwissend) |
| K | **Persönliche Kompetenz-Reflexion** | *"Aus diesen Erfahrungen habe ich gelernt, sowohl X als auch Y einzunehmen."* | *"Die Kombination aus X und Y ermöglicht es mir…"* (generisch) |
| L | **Rhetorische Übergangs-Frage** | *"Bei Ingrano habe ich mich gefragt, wie wir NIS-2 nicht als Last, sondern als Ressource positionieren."* | Absätze ohne Übergang aneinandergereiht. |
| M | **Logische Kohärenz** | Firmenbrücke + Station müssen thematisch zusammenpassen. *"EYs Fokus auf Nachhaltigkeit erinnert mich an meine Zeit als Co-Founder der Nachhaltigkeitsstrategie."* | *"EYs Fokus auf Nachhaltigkeit erinnert mich an meine Arbeit im Vertrieb."* (kein logischer Bezug) |
| N | **Eloquenz + Bescheidenheit** | *"Daher gehe ich zuversichtlich ran."*, *"Ich freue mich, von Ihrer Expertise zu lernen."* | *"Ich bringe eine solide Grundlage mit."*, *"Meine Erfahrung befähigt mich."* (anmaßend) |

**Klammer-Technik (Optional):** Bei `storytelling` oder `philosophisch` Presets darf im Closing kurz auf den Eingangs-Gedanken (z.B. ein Zitat) zurückgegriffen werden.

**Format-Regeln (Update 2026-04-06):**
- Maximale Satzlänge: 25 Wörter (Target). Claude überschreitet Fast-Targets systematisch um 10-15%, daher 25 statt 30.
- Max. 2 Kommas pro Satz. Bei mehr → Satz aufteilen.
- KEIN Gedankenstrich (– oder —). Semikolon (;) oder Punkt verwenden.
- Gedankenstrich-Enforcement: Prompt-Anweisung + Post-Generation Regex (`text.replace(/\s*[–—]\s*/g, '; ')`).
