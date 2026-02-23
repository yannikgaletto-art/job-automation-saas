# Pathly — Vertriebs- & Go-To-Market Playbook

> **Solo-Founder Edition** · Stand: Feb 2026  
> Stack: Next.js 15 · Supabase · Claude · Perplexity · Inngest · Gemini Ultra (Veo, Flow, Whisk)

---

## 0. Vision & Gründer-Story

### Mission

> **Ich möchte den Bewerbungsprozess revolutionieren — damit die richtigen Menschen die richtigen Jobs bekommen, Fähigkeiten geteilt werden und niemand mehr als Bittsteller bewirbt.**

### Gründer-Story (für About-Page, LinkedIn, Product Hunt)

> Letztes Jahr wurde ich gekündigt.
>
> Ich saß vor einem leeren Notion-Dokument, 20 offenen Job-Boards und einem wachsenden Gefühl von Ohnmacht. Das war nicht das erste Mal, dass ich Bewerbungen schreiben musste — aber es war das erste Mal, dass mir klar wurde: **Das System ist gebrochen.**
>
> Nicht weil es zu wenig Jobs gibt. Sondern weil der Prozess Menschen dazu bringt, generische Dokumente an HR-Bots zu schicken, in der Hoffnung, durch einen Algorithmus zu rutschen. Kein Mensch sollte so Job suchen.
>
> Also habe ich mir mein eigenes Bewerbungs-Dashboard gebaut: **Pathly.**
>
> Pathly recherchiert Unternehmen, passt CV und Anschreiben auf jede Stelle an — nicht vollautomatisch, sondern mit dir als Entscheider. Du siehst jeden Vorschlag. Du genehmigst oder lehnst ab. Und du bewirbst dich nicht mehr mit einem Dokument, sondern mit deinem Gesicht und deiner Stimme.
>
> Mein Ziel: Dass die richtigen Menschen die richtigen Jobs bekommen. Dass Skills geteilt werden. Dass Jobsuche wieder menschlich ist.

---

## 0.1 UX-Prinzip: Was macht Nutzer wirklich glücklich?

> Emotional Design ist kein Nice-to-have — es ist der Unterschied zwischen einem Tool, das jemand *nutzt*, und einem, das jemand *liebt*.

| Bedürfnis | Emotion | Wie Pathly es auslöst |
|---|---|---|
| **Orientierung** | Sicherheit, Kontrolle | Onboarding-Flow (10 Fragen, ~5 min) · klares Job-Queue-Dashboard |
| **Fortschritt sehen** | Stolz, Motivation | Visueller Bewerbungs-Progress (Job → CV → Review → Sent) · Streak / Aktivitäts-Feed |
| **Qualität erleben** | Vertrauen, Wert | Nur High-Match Jobs in der Queue (Claude-Scoring) · keine Flut von irrelevanten Stellen |
| **Ästhetik** | Freude, Aufmerksamkeit | Motion UI (Framer Motion) · sauberes Design System · Dark/Light Mode |
| **Musik / Fokus** | Flow-State | Pomodoro Timer (bereits gebaut) · Optional: Ambient Sound Integration |
| **Verbindung** | Zugehörigkeit, Mut | Talent Discovery Mode (Headhunter finden dich) · Skill-Sharing Community |
| **Augenhöhe** | Würde, Selbstwert | Human-in-the-Loop (du entscheidest) · Video Pitch statt Anschreiben |
| **Überraschung** | Begeisterung | Micro-Interactions bei Approval · Celebration Animations bei erstem Interview |

### Micro-Copy-Prinzipien

- Erfolg-Messaging: *„Du bist bereit — viel Erfolg!"* statt *„Submission complete."*
- Fehler-Messaging: *„Das können wir kurz nochmal prüfen."* statt *„Error 422."*
- Leerer Zustand: Ermutigung statt leerer Fläche: *„Starte dein erstes Profil — dauert 5 Minuten."*

---

## 0.2 Produkt-Feature-Map (MVP → V2)

### Feature 1 — Smart Onboarding + Job Matching

**Was:** 10-Fragen-Onboarding (~5 Minuten) definiert dein Werte-Profil:
- 3–5 **Must-haves** (z.B. Remote ≥3 Tage, Berlin, Startup-Umfeld)
- 3–5 **No-gos** (z.B. kein Pendeln >30 Min, keine Finanzbranche, kein Konzern)

**Wie:** Supabase-Tabelle `user_values`. Jeder gescrapte Job wird via Inngest durch eine Claude-Scoring-Funktion bewertet. Jobs mit Low-Match (`score < 60`) kommen gar nicht erst in die Queue.

**Scraping:** SerpAPI oder Firecrawl für strukturierte Job-Daten. Tabellarische Queue-Ansicht: Titel | Firma | Match-Score | Remote-Status | Frist.

**Buildbar:** `user_values`-Tabelle + Scoring-Funktion im Inngest-Flow → **1–2 Tage**.

**Gemeinwohl:** Weniger sinnlose Bewerbungen → weniger Frust auf beiden Seiten.

---

### Feature 2 — Human-in-the-Loop Diff View (DSGVO Art. 22)

**Was:** Der Nutzer sieht immer ein **Vorher/Nachher** — Original-CV/Anschreiben vs. KI-optimierte Version. Jede Änderung kann einzeln akzeptiert oder abgelehnt werden (wie Git-Diff für Menschen).

**Warum:** DSGVO Art. 22 verbietet vollautomatische Entscheidungen mit Rechtsfolgen. Pathly ist compliant *by design* — kein Greenwashing.

**Wie:** Zweiter Claude-Prompt-Pass mit spezifischer System-Instruction (`"Zeige nur Änderungen, keine vollständigen Neugenerierungen"`). Diff-Ansicht im bestehenden Dashboard mit Farbcodes (grün = Hinzufügung, rot = Entfernung).

**Buildbar:** 2. Claude-Pass + Diff-Komponente im Dashboard → **1 Tag**.

**Gemeinwohl:** Bewerber gehen als Gleichwertige in Gespräche, nicht als Bittsteller.

---

### Feature 3 — Guided Video Pitch (Das Anti-Anschreiben)

**Was:** Statt eines 400-Wort-Fließtexts fungiert Pathly als „Regisseur" für ein 2-minütiges Loom-Video. Du bewirbst dich mit deinem Gesicht, deiner Stimme und einer klaren Lösungsorientierung.

**Pathly-Workflow:**

1. **Context** (Perplexity): Pathly analysiert die Firma und den Job. Extrahiert ein zentrales Problem oder ein aktuelles Ziel der Firma.
2. **Claude-Scripting** — kein Anschreiben, sondern ein **Video-Briefing** (3 Bulletpoints):
   - **Hook (0–15 Sek):** Wer bist du und warum genau diese Firma?
   - **Value (15–90 Sek):** Welches Problem siehst du (aus dem Research) und wie kannst du mit deinen Skills (aus CV) sofort helfen?
   - **Call to Action (90–120 Sek):** Eine entspannte, menschliche Einladung zum Kennenlernen.
3. **Teleprompter-Modus:** Das Dashboard zeigt die Bulletpoints groß an. Du nimmst daneben Loom auf.
4. **Output:** Pathly generiert eine kurze E-Mail/Nachricht, in der das Video das Highlight ist (Loom auto-generiert Preview-GIFs).

**Warum es funktioniert:**
- **Radikale Menschlichkeit:** Mimik, Lächeln, Tonalität transportieren Empathie in Sekunden. Das kann keine KI faken.
- **Augenhöhe:** Du trittst als Experte auf, der bei einem konkreten Problem hilft — nicht als Bewerber Nummer 847.
- **Vertrauensvorschuss:** Ein Video aufzunehmen erfordert Mut und zeigt echtes Commitment.

**Buildbar:** Teleprompter-View (read-only Modal im Dashboard) + E-Mail-Template-Generator → **1–2 Tage**.

---

### Feature 4 — Talent Discovery Mode (Skill-Marketplace)

**Was:** Eine Spalte im Dashboard, in der du dich nicht *bewirbst*, sondern *anbietest*. Headhunter und Unternehmen finden dich — nicht nach Lebenslauf, sondern nach Skills und Haltung.

**Profil-Elemente:**
- Was macht dir Spaß? (Freitext + Tags)
- Wo bist du besonders gut? (Skills-Grid)
- Welche Skills kannst du mit anderen teilen? (Peer-Learning-Angebot)
- Verfügbarkeit & Präferenzen (Remote/Hybrid, Standort, Vollzeit/Freelance)

**Skill-Sharing-Aspekt:** Nutzer sehen gegenseitig, welche Skills jemand teilt (z.B. *„Ich biete: TypeScript Code Reviews · Ich suche: Figma-Basics"*). Community-Aspekt entsteht organisch.

**Buildbar:** Eigene `talent_profile`-Tabelle in Supabase + öffentliche Profil-Page → **2–3 Tage**.

**Gemeinwohl:** Skills-Ökonomie statt CV-Bingo.

---

## 1. Phasen-Roadmap mit OKRs

> Zeitrahmen: 3 Quartale. Als Solo-Founder maximal 3 Key Results pro OKR.

---

### 🔵 Q1 (Wochen 1–12) — Validierung & Early Adopters

**Objective:** Beweisen, dass echte Menschen für Pathly zahlen.

| Key Result | Messgröße | Deadline |
|---|---|---|
| KR1 | 20 zahlende Beta-User (Early Access) | Woche 8 |
| KR2 | 10 User-Interviews geführt, Zusammenfassung dokumentiert | Woche 4 |
| KR3 | Waitlist mit 100+ Einträgen | Woche 10 |

**Initiatives Q1:**
- [ ] Landing Page live (Waitlist + Stripe Early Access)
- [ ] Founder-Outbound: 15 LinkedIn-DMs/Tag (Zielgruppe: „Open to Work")
- [ ] Reddit/XING-Communities: 3 problemorientierte Posts/Woche
- [ ] Onboarding-Flow (10 Fragen) implementiert
- [ ] Job-Scraping (SerpAPI/Firecrawl) + Claude-Scoring im Inngest-Flow

---

### 🟡 Q2 (Wochen 13–24) — Content Engine & Public Launch

**Objective:** Sichtbarkeit aufbauen und Pathly öffentlich launchen.

| Key Result | Messgröße | Deadline |
|---|---|---|
| KR1 | 500 organische Website-Besucher/Monat | Woche 20 |
| KR2 | Product Hunt Launch — Top 10 des Tages | Woche 16 |
| KR3 | 50 aktive Nutzer (min. 1 Bewerbung via Pathly gesendet) | Woche 24 |

**Initiatives Q2:**
- [ ] Content-Pipeline-Agent (Gemini Ultra → LinkedIn Posts, Veo → Videos)
- [ ] Product Hunt Launch (Dienstag/Mittwoch, früh morgens UTC)
- [ ] Talent Discovery Mode live (Beta)
- [ ] 3 Case Studies von Beta-Nutzern (mit Loom-Video Testimonials)
- [ ] Kooperation: 2 Universitäten / 1 Jobcenter als Pilot

---

### 🟢 Q3 (Wochen 25–36) — Community & Revenue

**Objective:** Pathly zur ersten Anlaufstelle für Jobsuchende machen.

| Key Result | Messgröße | Deadline |
|---|---|---|
| KR1 | MRR €2.000 (ca. 40 zahlende Nutzer) | Woche 36 |
| KR2 | Skill-Sharing-Community mit 100 aktiven Profilen | Woche 32 |
| KR3 | 1 Hochschul-Partnerschaft (formalisiert) | Woche 30 |

**Initiatives Q3:**
- [ ] Pricing-Seite live (Freemium + Pro)
- [ ] Community-Listener-Agent (Reddit/LinkedIn täglich)
- [ ] Headhunter-Zugang (Talent Discovery API)
- [ ] Skill-Sharing-Feature live
- [ ] AppSumo / LTD-Plattform für initiale Revenue-Spitze

---

## 2. Content-Plan: Gemini Ultra als Produktions-Motor

### 2.1 Die 3 Content-Pillars

| Pillar | Thema | Formatbeispiele |
|---|---|---|
| **Story & Journey** | Kündigung → Pathly, Build-in-Public Updates | LinkedIn Long-Form, TikTok Vlog |
| **Bewerbungs-Wissen** | CV-Tipps, Anschreiben, Firmen-Research | Karussell, How-to Video, Thread |
| **System & Ethik** | DSGVO, Human-in-the-Loop, KI in Bewerbungen | LinkedIn Thought Leadership |

### 2.2 Gemini Ultra Workflow — 1 Idee → Multi-Asset-Kampagne

```
[ Du: 2-Satz-Idee ]
        ↓
[ Gemini (Text) ]
  → LinkedIn Long-Form (Story + Lesson)
  → 3 Hook-Varianten
  → TikTok-Skript (60–90s)
  → 5 Headline-Varianten
        ↓
[ Flow ]
  → Storyboard: Intro → Problem → Turning Point → Lösung → CTA
        ↓
[ Veo ]
  → Video-Rendering (Dashboard-Screens, Animations, Story-Overlays)
  → Export für TikTok, LinkedIn, IG Reels
        ↓
[ Whisk ]
  → Thumbnails & Cover-Visuals
  → Branded Mockups (Device-Frames, Pathly-UI-Shots)
        ↓
[ Gemini Repurposing ]
  → 5 kurze "One-Idea"-Snippets
  → Q&A-Format für Kommentare
  → Karussell-Outline
```

### 2.3 Wöchentlicher Posting-Rhythmus

| Tag | Aktion | Zeit |
|---|---|---|
| **Montag** | Analytics lesen · 1 Kernidee definieren · Gemini-Briefing schreiben | 60–90 min |
| **Dienstag** | 15 LinkedIn-DMs · Post #1 live (Story/Journey) | 60 min |
| **Donnerstag** | Kommentare beantworten · Post #2 live (Wissen/Tipp) | 60 min |
| **Freitag** | TikTok/Reel mit Veo fertigstellen + posten · Weekly Reflection | 60–90 min |

### 2.4 Launch-Post Template (Product Hunt Day)

**Hook:**
> *„Ich wurde gekündigt. Also habe ich mein eigenes Bewerbungs-Dashboard gebaut."*

**Mid:** Kurzgeschichte (3 Absätze max) + Screenshot/Video von Pathly.

**CTA:**
> *„Wenn du gerade Bewerbungen schreibst — probier die Beta und sag mir ehrlich, was kacke ist. Link in den Kommentaren."*

**Ton-Regel:** Persönlich, direkt. Kein Corporate-„Wir freuen uns zu verkünden".

---

## 3. Distribution-Kanäle

### 3.1 Kanal-Matrix

| Kanal | Warum | Erste Schritte |
|---|---|---|
| **LinkedIn (organisch)** | Zielgruppe aktiv, Job-Content viralisiert | 3 Posts/Woche, DM-Outreach |
| **TikTok** | Junge Jobsuchende, hohe organische Reichweite | 2–3 Reels/Woche via Veo |
| **Reddit** | r/jobsearch, r/Jobsuche, r/cscareerquestions | 3x/Woche problemorientiert |
| **Product Hunt** | Tech-Community, Early Adopters | 1x großer Launch (Q2) |
| **Indie Hackers** | Build-in-public Audience | Wöchentliche Updates |
| **XING** | Deutschsprachiger Markt | Communities nutzen |

### 3.2 Hochschulen, FHs & Jobcenter (B2I-Kanal)

> **Strategie:** Nicht als Sales-Call anklopfen — als Gemeinwohl-Partnerschaft.

**Warum:**
- Karrierezentren an Hochschulen haben tausende aktive Jobsuchende und keine eigenen AI-Tools
- Jobcenter suchen aktiv nach Digitalisierungs-Lösungen
- Hohe Glaubwürdigkeit durch institutionelle Empfehlung → organischer Waitlist-Aufbau

**Vorgehen (je smarter, einfacher, effizienter):**

1. **Email-Outreach** an Karriereservice-Leitungen (FH Berlin, TU Berlin, HTW, HWR etc.):
   > *„Wir bieten euren Studierenden kostenlosen Zugang zu Pathly Beta als Pilotprojekt — wir brauchen nur 5 Tester und Feedback."*
2. **Jobcenter-Ansatz:** Lokale Jobcenter Berlin → Präsentation als Digitalisierungstool
3. **Workshops:** 60-Min-Session *„Dein erster Job mit KI-Unterstützung"* → Waitlist-Aufbau on-site
4. **Student Ambassador Programm:** 1–2 Studierende pro Hochschule bekommen Free Pro Access und berichten in ihren Netzwerken

**Weitere Institutionen:**
- Bundesagentur für Arbeit (Digital-Initiativen)
- ESF-geförderte Weiterbildungsträger
- Coding Bootcamps (Developer Academies etc.)
- Recruiting-Events & Karrieremessen (digitalSTAGE Berlin etc.)

### 3.3 Launch-Verzeichnisse (Q2)

- Product Hunt
- Betalist / Microlaunch / Fazier
- Indie Hackers „Launch"
- *There's an AI for that*
- SaaSHub / AlternativeTo
- AppSumo (Q3, Revenue-Sprint)

---

## 4. Antigravity Automation-Stack

> **Prinzip:** Alles, was mehr als 15 Minuten täglich kostet, wird automatisiert.  
> Dein einziger manueller Job: Content freigeben + User-Interviews führen.

### Agent 1 — Content-Pipeline-Agent

```
Input:  Du (Stichpunkt / Voice Note)
         ↓
Perplexity: Trendrecherche zum Thema
         ↓
Gemini: Content-Briefing (Hooks, Outline, CTAs)
         ↓
Claude: Text-Drafts (LinkedIn, Newsletter, Threads)
         ↓
Flow/Veo: Video-Assets
         ↓
[ DEIN APPROVE ]
         ↓
Buffer/LinkedIn API: Auto-Post
```

### Agent 2 — Outbound & CRM-Agent

- ICP-Filterung: LinkedIn-Profile → Scoring („Open to Work" + Zielbranche)
- Message-Drafts mit Personalisierung via Gemini (du genehmigst)
- Logging in Supabase: Antworten + Pain Points kategorisiert
- Wöchentliche Zusammenfassung: *„Diese 5 Pain Points wurden am häufigsten genannt"*

### Agent 3 — Community Listener

- Täglicher Scan: Reddit, LinkedIn, IndieHackers
- Keywords: *Bewerbung, cover letter, job search, gekündigt, Stellensuche*
- Output: Liste relevanter Threads + vorgeschlagene Kommentare (wertgebend, kein Pitch)

### Agent 4 — Analytics-Synthesizer (Weekly)

```
Inputs:  Website-Metriken · LinkedIn · Onboarding-Completion · Bewerbungs-Events
          ↓
Gemini-Summary:
  „Was hat diese Woche funktioniert?"
  „Welche Markt-Signale sehen wir?"
  „Welche Experimente nächste Woche?"
```

---

## 5. Wochenplan (Solo-Founder Kapazitätsschutz)

> **Gesamtaufwand Marketing & Vertrieb: max. 5 Stunden/Woche.**

```
MO  [90 min] Analytics · Kernidee der Woche · Gemini-Briefing starten
DI  [60 min] 15 LinkedIn-DMs · Post #1 live
MI  [0 min]  Agents laufen · du baust Pathly
DO  [60 min] Kommentare · Post #2 live
FR  [60 min] TikTok/Reel approvieren + posten · Weekly Reflection
WE  [0 min]  Frei. Kein Marketing.
```

---

## 6. Erfolgsmetriken (Dashboard-KPIs)

| Metrik | Q1-Ziel | Q2-Ziel | Q3-Ziel |
|---|---|---|---|
| Waitlist-Größe | 100 | 500 | 2.000 |
| Zahlende Nutzer | 20 | 50 | 150 |
| MRR | €200 | €800 | €2.000 |
| LinkedIn-Follower | 200 | 800 | 2.500 |
| User Interviews | 10 | 25 | — |
| Hochschul-Partner | — | 2 Pilot | 3 formalisiert |

---

*Letzte Aktualisierung: Feb 2026 · Yannik Galetto*
