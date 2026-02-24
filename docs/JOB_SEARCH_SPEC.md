# Pathly — Job Search & Scraping Spezifikation

> **Status:** In Development · Stand: Feb 2026
> **Scope:** Job Search Tab (UI) · Scraping Pipeline · Soft-Filter Judge System · Supabase Integration · Job Queue Anbindung
> **Template:** Orientiert sich am `Master_Prompt_Template.md` aus [`dev-playbook/directives/`](https://github.com/yannikgaletto-art/dev-playbook/tree/main/directives) — alle Sektionen (Goal, Inputs, Tools, Process, Outputs, Edge Cases, Error Handling, Testing Protocol) sind vorhanden.

---

## Goal

Einen vollständigen, qualitätsgesicherten Job-Search-Flow für Pathly implementieren, der via SerpAPI Jobs findet, via Firecrawl tief scrapcht, via GPT-4o-mini Rohdaten extrahiert, via Claude 3.5 Sonnet den Culture Fit bewertet und die strukturierten Ergebnisse in Supabase speichert — sodass die nachgelagerten Agenten (Steckbrief, CV Match, CV Optimizer, Cover Letter) sofort auf vollständige, halluzinationsfreie Kontextdaten zugreifen können.

---

## Inputs

| Parameter | Pflichtfeld | Typ | Beispielwert |
|---|---|---|---|
| `jobtitel` | ✅ Ja | String (+ KI-Vorschläge via CV) | `"Innovation Consultant"` |
| `ort` | ✅ Ja | String + Geolocation | `"Berlin"`, `"Remote"` |
| `erfahrungslevel` | ❌ Optional | Enum: entry / mid / senior / lead | `"mid"` |
| `company_values` | ❌ Optional | Multi-Tag | `["Autonomie", "Qualität"]` |
| `org_type` | ❌ Optional | Toggle-Gruppe | `["startup", "ngo"]` |
| `diversity_important` | ❌ Optional | Boolean Toggle | `true` |
| `sustainability_important` | ❌ Optional | Boolean Toggle | `true` |
| `leadership_style_pref` | ❌ Optional | Integer Slider 1–5 | `4` (autonom) |
| `innovation_level_pref` | ❌ Optional | Integer Slider 1–5 | `5` (modern) |
| `purpose_keywords` | ❌ Optional | Freitext / Tags | `["Klimawandel", "Deep Tech"]` |

---

## Tools / Services

| Tool | Rolle | Kosten (ca.) |
|---|---|---|
| **SerpAPI** (Google Jobs Engine) | Meta-Suche: Job-URL, Titel, Firma, Ort | ~$0.005–0.015 / Request |
| **Firecrawl** | Deep-Scrape: Volltext der Stellenanzeige als LLM-Markdown | ~$0.57 / 1.000 Requests |
| **GPT-4o-mini** | Harvester: Roh-Extraktion strukturierter Felder aus Markdown | ~$0.0001 / Job |
| **Claude 3.5 Sonnet** | Judge: Culture Fit Scoring + Red Flags + Empfehlung | ~$0.002–0.005 / Job |
| **Perplexity Sonar Pro** | Fallback: Company Research bei dünner Stellenanzeige | ~$0.005 / Request |
| **Supabase** | Datenpersistenz: Tabellen `jobs` + `user_values` | bestehend |

**Kosten-Prinzip:** GPT-4o-mini als billiger "Filter & Extraktor" — Claude nur für Jobs, die den Vor-Filter bestehen. Das reduziert Claude-Kosten auf ~15% aller Jobs.

---

## 1. UI: "Job Search" Tab

### 1.1 Neue Navigation (Main)

Der Tab `Job Search` ist ein eigenständiger Reiter in der Hauptnavigation von Pathly — gleichgestellt mit Dashboard, Bewerbungen und Profil.

```
[ Dashboard ] [ Job Search ] [ Bewerbungen ] [ Profil ]
```

### 1.2 Layout des Job Search Tabs

```
┌──────────────────────────────────────────────────────────┐
│  🔍 JOB SEARCH                                          │
│                                                          │
│  [Jobtitel eingeben...]     [Ort eingeben...]  [Suchen] │
│                                                          │
│  💡 Pathly schlägt vor (basierend auf deinem CV):       │
│  [ Innovation Consultant ] [ BD Manager ] [ Ventures ]  │
│                                                          │
│  ▼ Erweiterte Filter (optional)                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Erfahrungslevel    [Entry][Mid][Senior][Lead]       │ │
│  │ Organisationsform  [Startup][Konzern][NGO][Staat]   │ │
│  │ Diversität         [Toggle: Wichtig / Egal]         │ │
│  │ Nachhaltigkeit     [Toggle: Wichtig / Egal]         │ │
│  │ Führungsstil       [Autonom ←——————→ Hierarchisch]  │ │
│  │ Innovationsgrad    [Modern ←——————→ Traditionell]   │ │
│  │ Vision / Purpose   [Freitext: z.B. "Klimawandel"]  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ERGEBNISSE (14 Jobs gefunden)                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🟢 92%  Patagonia Berlin  — Sustainability Manager │ │
│  │ 🟢 87%  Enpal Berlin      — Partner Manager        │ │
│  │ 🟡 64%  Siemens Berlin    — Innovation Consultant  │ │
│  │ 🔴 31%  Deutsche Bank     — BD Manager             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [Job öffnen]  [In Queue aufnehmen ▶]                   │
└──────────────────────────────────────────────────────────┘
```

### 1.3 Job-Karte (Side Panel nach Klick)

```
┌────────────────────────────────────────┐
│  Patagonia Berlin                      │
│  Sustainability Manager · Berlin       │
│  Hybrid · Mid/Senior                   │
│                                        │
│  MATCH-SCORE: 92%                      │
│  ✅ Purpose-Fit: "Klimaschutz"          │
│  ✅ Führungsstil: Autonom (Präferenz 4) │
│  ✅ Org-Form: B-Corp (bevorzugt)        │
│  ⚠️  Erfahrung: 6J req. (du: 4J)      │
│                                        │
│  JUDGE-EMPFEHLUNG (Claude):            │
│  "Starker Culture Fit. Erfahrungs-    │
│   Gap kommunikabel via Anschreiben."  │
│                                        │
│  RED FLAGS: keine                      │
│  GREEN FLAGS: B-Corp, Net Zero 2030    │
│                                        │
│  ATS KEYWORDS:                         │
│  [Sustainability][ESG][Stakeholder]    │
│                                        │
│  [Steckbrief lesen]                    │
│  [In Queue aufnehmen ▶]                │
└────────────────────────────────────────┘
```

### 1.4 Jobtitel-Vorschläge (CV-basiert)

Beim ersten Öffnen analysiert ein Claude-Prompt das CV des Users und schlägt 3–5 passende Jobtitel vor. Diese sind als Chips dargestellt und füllen das Suchfeld per Klick.

```
Prompt: "Analysiere dieses CV und schlage die 5 passendsten Jobtitel vor.
Antworte nur mit einer JSON-Liste: ['Titel 1', 'Titel 2', ...]"
```

---

## 2. Scraping & Parsing Pipeline

### 2.1 Datenfluss (Übersicht)

```
[User Suchanfrage]
       │
       ▼
[SCHRITT 1: SerpAPI — Google Jobs]
  Query: "Innovation Consultant Berlin"
  Output: Liste von Job-URLs, Titel, Firma, Ort, Kurzbeschreibung
       │
       ▼
[SCHRITT 2: Firecrawl — Deep Scrape der Original-URL]
  Input: apply_link aus SerpAPI
  Output: Vollständiger Jobtext als LLM-ready Markdown
  Hinweis: LinkedIn-URLs direkt → kein Scraping möglich (Bot-Schutz)
           → Nur SerpAPI-Vorschau nutzen
       │
       ▼
[SCHRITT 3a: GPT-4o-mini — Harvester]
  Input: Firecrawl Markdown
  Output: Strukturiertes "Roh-JSON" (nur Extraktion, kein Scoring)
  Trigger: Immer — kein Pre-Filter
       │
       ▼
[SCHRITT 3b: Claude 3.5 Sonnet — Judge]
  Input: Roh-JSON + user_values Profil
  Output: Finales JSON mit Match-Score, Reasoning, Red/Green Flags
  Trigger: NUR wenn Harvester-Output ≥ 50% der Pflichtfelder befüllt
  Fallback: Wenn Stellenanzeige < 500 Zeichen → Perplexity Company Research
       │
       ▼
[SCHRITT 4: Supabase — Persistenz]
  Tabelle: jobs
  Status: "pending_review" (wartet auf User-Bestätigung)
       │
       ▼
[SCHRITT 5: User bestätigt → "In Queue aufnehmen"]
  Status: "in_queue"
  → Alle Agenten (Steckbrief, CV Match, CV Opt, Cover Letter)
    greifen auf strukturiertes JSON zu — kein Re-Parsing nötig
```

### 2.2 Schritt 1: SerpAPI — Google Jobs API

```typescript
const params = {
  engine: "google_jobs",
  q: `${jobtitel} ${ort}`,
  location: ort,
  hl: "de",
  chips: "date_posted:week",  // Nur Jobs der letzten Woche
  ltype: "1",                  // Fulltime only
  api_key: process.env.SERPAPI_API_KEY
};
```

**Was SerpAPI liefert:**
- Jobtitel, Firma, Ort, Kurzbeschreibung
- `apply_link` (URL zur Original-Stellenanzeige)
- `detected_extensions` (remote, fulltime, salary, posted_at)

**Was SerpAPI NICHT liefert (→ Firecrawl):**
- Vollständige Anforderungslisten (oft auf 200 Zeichen gekürzt)
- Culture / Values Sektion
- Benefits & Perks
- About-the-Company Text

### 2.3 Schritt 2: Firecrawl — Deep Scrape

```typescript
const scrapeResult = await firecrawl.scrapeUrl(job.apply_link, {
  formats: ['markdown'],
  onlyMainContent: true,   // Kein Header/Footer/Nav-Müll
  waitFor: 2000,           // Warten auf JS-Rendering
  timeout: 30000
});

const markdown = scrapeResult.markdown;
```

**Wichtige Einschränkung:**
LinkedIn-URLs direkt können nicht gescrapt werden (Bot-Schutz, ToS-Verletzung). Für LinkedIn-Jobs: nur SerpAPI-Vorschautext nutzen und `about_company_raw` via Perplexity befüllen.

### 2.4 Schritt 3a: GPT-4o-mini — Der Harvester

**Rolle:** Schnelle, günstige Rohextraktion. Kein Scoring. Kein Werten. Nur Text-Extraktion.
**Kosten:** ~$0.0001 pro Job (GPT-4o-mini: $0.15/1M Input Tokens).
**Regel:** Halluziniere NICHTS. Wenn ein Feld fehlt → `null`.

**System Prompt:**
```
Du bist ein präziser Daten-Extraktions-Assistent.
Extrahiere die folgenden Felder aus dem Markdown einer Stellenanzeige.
Halte dich STRIKT an das JSON-Schema.
Erfinde NICHTS. Wenn ein Feld im Text nicht vorkommt: null zurückgeben.
```

**User Prompt (mit JSON-Schema):**
```
Extrahiere aus diesem Stellenanzeigen-Text:

{firecrawl_markdown}

JSON-Schema:
{
  "job_title": "string",
  "company_name": "string",
  "location": "string",
  "work_model": "remote | hybrid | onsite | unknown",
  "contract_type": "fulltime | parttime | freelance | unknown",
  "experience_years_min": "number | null",
  "experience_years_max": "number | null",
  "experience_level_stated": "entry | mid | senior | lead | unknown",
  "hard_requirements": ["string"],
  "soft_requirements": ["string"],
  "tasks": ["string"],
  "benefits_and_perks": ["string"],
  "about_company_raw": "string | null",
  "mission_statement_raw": "string | null",
  "diversity_section_raw": "string | null",
  "sustainability_section_raw": "string | null",
  "leadership_signals_raw": "string | null",
  "tech_stack_mentioned": ["string"],
  "ats_keywords": ["string"],
  "salary_range": "string | null",
  "application_deadline": "string | null"
}
```

### 2.5 Schritt 3b: Claude 3.5 Sonnet — Der Judge

**Rolle:** Nuancierte Bewertung des Culture Fits. Erkennt Zwischentöne, Greenwashing
und Red Flags. Gleicht gegen das User-Werteprofil ab.
**Kosten:** ~$0.002–0.005 pro Job (Claude Sonnet: $3.00/1M Input Tokens).
**Trigger:** Wird nur aufgerufen wenn Harvester-Output ≥ 50% der Pflichtfelder befüllt.

**System Prompt:**
```
Du bist der ehrliche Karriere-Coach und strategische Berater von {user.name}.

Du hast Zugang zu:
1. Den extrahierten Daten einer Stellenanzeige (JSON).
2. Dem persönlichen Werteprofil des Users.

Deine Aufgabe: Bewerte den "Culture Fit" und die realistische Erfolgschance
dieser Bewerbung. Sei ehrlich — auch wenn es unbequem ist.
Halluziniere KEINE Informationen. Alles muss aus den gegebenen Daten stammen.
```

**User Prompt:**
```
USER WERTEPROFIL:
{
  "experience_level": "{user_values.experience_level}",
  "company_values": {user_values.company_values},
  "preferred_org_type": {user_values.org_type},
  "diversity_important": {user_values.diversity_important},
  "sustainability_important": {user_values.sustainability_important},
  "leadership_style_pref": "{user_values.leadership_style} (1=hierarchisch, 5=autonom)",
  "innovation_level_pref": "{user_values.innovation_level} (1=traditionell, 5=modern)",
  "purpose_keywords": {user_values.purpose_keywords}
}

EXTRAHIERTE JOB-DATEN:
{harvester_json}

Bewerte nach diesen Kriterien und gib ein JSON zurück:

{
  "match_score_overall": 0-100,
  "score_breakdown": {
    "experience_fit": 0-100,
    "values_fit": 0-100,
    "org_type_fit": 0-100,
    "diversity_fit": 0-100,
    "sustainability_fit": 0-100,
    "leadership_fit": 0-100,
    "innovation_fit": 0-100,
    "purpose_fit": 0-100
  },
  "judge_reasoning": "Max. 3 Sätze: Warum dieser Score?",
  "recommendation": "apply | consider | skip",
  "red_flags": ["string"],
  "green_flags": ["string"],
  "knockout_reason": "string | null"
}
```

### 2.6 Soft-Filter Scoring-Logik (Judge-Regeln)

| Filter | Was Claude bewertet | Scoring-Regel |
|---|---|---|
| **Erfahrung** | Nicht nur Jahre, sondern Verantwortungslevel. "5 Jahre absitzen" ≠ "5 Jahre Führung". | Gap > 2J UND kein transferierbares Äquivalent → Score 20 |
| **Werte** | Semantisches Matching: "Autonomie" ↔ "eigenverantwortlich", "trust-based". | `(gematchte_werte / user_werte) * 100` |
| **Org-Form** | Analyse via `about_company_raw`. Sucht: "GmbH", "e.V.", "VC-backed", "Bundesbehörde". | Nicht im Preferred-Set → Score 0 (Knockout) |
| **Diversität** | Unterscheidet konkretes Handeln ("Frauenquote 40%", "ERGs") von Standard-Disclaimer ("equal opportunity employer"). | Konkrete Maßnahmen: Score 90–100. Nur Disclaimer: Score 20. |
| **Nachhaltigkeit** | Prüft auf Greenwashing: B-Corp-Zertifikat, Net-Zero-Ziel vs. "We care about the planet". | Kern-Businessmodell = nachhaltig: Score 100. Greenwashing: Score 30. |
| **Führungsstil** | Analyse der Aufgaben-Verben. "Berichten an..." = hierarchisch. "Gestalten", "Entscheiden" = autonom. | Mapping auf User-Slider. Abstand > 2 → Score 30. |
| **Innovation** | Tech-Stack-Freshness. Slack/Notion/Figma = modern. SAP/Fax/Lotus Notes = traditionell. | `(moderne_tools / alle_tools) * 100` |
| **Purpose** | Mission-Statement Analyse. Generisch ("Marktführer") vs. problemorientiert ("Ozeane säubern"). | Keyword-Match mit `user_values.purpose_keywords`. |

---

## 3. Supabase Datenbankschema

### 3.1 Tabelle: `user_values`

Wird einmalig beim Onboarding befüllt. Im Job Search Tab nur als Voreinstellung angezeigt.

```sql
CREATE TABLE user_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Harte Präferenzen
  preferred_job_titles TEXT[],
  preferred_locations TEXT[],

  -- Weiche Präferenzen (Soft Filter)
  experience_level TEXT,                   -- 'entry' | 'mid' | 'senior' | 'lead'
  company_values TEXT[],                   -- ['Autonomie', 'Qualität', 'Impact']
  preferred_org_type TEXT[],               -- ['startup', 'ngo', 'konzern', 'staat']
  diversity_important BOOLEAN DEFAULT false,
  sustainability_important BOOLEAN DEFAULT false,
  leadership_style_pref INTEGER,           -- 1 (hierarchisch) bis 5 (autonom)
  innovation_level_pref INTEGER,           -- 1 (traditionell) bis 5 (modern)
  purpose_keywords TEXT[],                 -- ['Klimawandel', 'Deep Tech']

  -- Knockout-Kriterien
  no_go_org_types TEXT[],
  max_commute_minutes INTEGER,
  min_remote_days INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Tabelle: `jobs`

Zentrale Tabelle. Enthält alle Daten — von Roh-Scraping bis KI-Score.
Ist die Single Source of Truth für alle nachgelagerten Queue-Agenten.

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Rohdaten (SerpAPI)
  job_title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  location TEXT,
  apply_link TEXT,
  serpapi_raw JSONB,

  -- Firecrawl Output
  firecrawl_markdown TEXT,

  -- Harvester Output (GPT-4o-mini)
  work_model TEXT,
  contract_type TEXT,
  experience_years_min INTEGER,
  experience_years_max INTEGER,
  experience_level_stated TEXT,
  hard_requirements TEXT[],
  soft_requirements TEXT[],
  tasks TEXT[],
  benefits_and_perks TEXT[],
  about_company_raw TEXT,
  mission_statement_raw TEXT,
  diversity_section_raw TEXT,
  sustainability_section_raw TEXT,
  leadership_signals_raw TEXT,
  tech_stack_mentioned TEXT[],
  ats_keywords TEXT[],
  salary_range TEXT,
  application_deadline TEXT,

  -- Judge Output (Claude 3.5 Sonnet)
  match_score_overall INTEGER,             -- 0-100
  score_breakdown JSONB,                   -- {experience_fit: 70, values_fit: 90, ...}
  judge_reasoning TEXT,
  recommendation TEXT,                     -- 'apply' | 'consider' | 'skip'
  red_flags TEXT[],
  green_flags TEXT[],
  knockout_reason TEXT,

  -- Workflow Status
  status TEXT DEFAULT 'pending_review',
  -- Status-Flow:
  -- pending_review    → Angezeigt in Job Search, noch nicht in Queue
  -- in_queue          → User hat "In Queue aufnehmen" geklickt
  -- steckbrief_done   → Steckbrief Tab abgeschlossen
  -- cv_match_done     → CV Match Tab abgeschlossen
  -- cv_opt_done       → CV Optimizer Tab abgeschlossen
  -- cover_letter_done → Cover Letter Tab abgeschlossen
  -- submitted         → Bewerbung abgeschickt
  -- rejected | offer

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Anbindung an die Job Queue

> ⚠️ **HINWEIS: Aktuell manuell — noch kein Automatisierungs-Befehl.**
> Dieser Abschnitt dokumentiert die Intention. Die technische Umsetzung erfolgt erst,
> wenn der manuelle Prozess vollständig validiert und stabil ist.

### 4.1 Warum die Vorstrukturierung entscheidend ist

Ohne Pipeline: Jeder Agent (CV Match, Cover Letter) liest die rohe Stellenanzeige neu → mehr Tokens, mehr Kosten, mehr Inkonsistenz.

Mit Pipeline: Alle Agenten greifen nur auf das strukturierte JSON in Supabase zu. Kein Re-Parsing. Kein Re-Interpretieren. Sofort einsatzbereit.

### 4.2 Welche Daten welcher Agent nutzt

**A. Steckbrief Agent**

```
tasks[]                → "AUFGABEN" Sektion
hard_requirements[]    → "QUALIFIKATIONEN" Sektion
benefits_and_perks[]   → "BENEFITS" Sektion
ats_keywords[]         → "ATS KEYWORDS" Sektion
work_model             → Badge "Remote / Hybrid"
experience_level_stated → Badge "Level: Mid/Senior"
judge_reasoning        → Intro-Beschreibung
green_flags[]          → Highlights
red_flags[]            → Warnungen
```

**B. CV Match Agent**

Prompt-Struktur:
```
ANFORDERUNGEN (aus DB):
{hard_requirements} + {soft_requirements}

CV DES USERS:
{user.cv_text}

Für jede Anforderung:
1. Ist sie im CV nachweisbar? (JA / TEILWEISE / NEIN)
2. Wo im CV ist der Beleg?
3. Verbesserungsvorschlag wenn TEILWEISE oder NEIN.
```

**C. CV Optimizer Agent**

Prompt-Struktur:
```
PRIORITÄRE ATS-KEYWORDS (aus DB):
{ats_keywords}

NIEDRIGSTE SCORES (aus score_breakdown):
{score_breakdown.experience_fit} → priorisiere Erfahrungs-Bullet-Points
{score_breakdown.domain_fit}     → ergänze Domain-Wissen

CV DES USERS (aktuell):
{user.cv_text}

Optimiere so, dass ATS-Keywords natürlich integriert sind.
Erfinde NICHTS. Stärke nur, was bereits vorhanden ist.
```

**D. Cover Letter Agent**

Prompt-Struktur:
```
ÜBER DIE FIRMA (aus DB):
Mission: {mission_statement_raw}
Kultur: {benefits_and_perks}
Purpose: {sustainability_section_raw}

GREEN FLAGS: {green_flags}

USER BACKGROUND: {user.cv_summary}

Schreibe ein Anschreiben, das zeigt, dass der User diese Firma
wirklich versteht — nicht generisch. Nutze konkrete Firmenbezüge.
```

### 4.3 Status-Flow

```
[Job Search Tab]
      │
      │  User klickt "In Queue aufnehmen"
      ▼
pending_review ──→ in_queue
                       │
               ┌───────┴──────────────────┐
               │                          │
          Steckbrief                 Alle Daten bereits
          öffnet sofort              in Supabase —
               │                    kein API-Call nötig
               ▼
          steckbrief_done
               │
               ▼
          cv_match_done
               │
               ▼
          cv_opt_done
               │
               ▼
          cover_letter_done
               │
               ▼
           submitted
```

---

## 5. Was APIs können — und was nicht

### 5.1 Zuverlässig extrahierbar

| Datenpunkt | Quelle | Zuverlässigkeit |
|---|---|---|
| Jobtitel, Firma, Ort | SerpAPI | ✅ >95% |
| Remote / Hybrid / Onsite | SerpAPI + Firecrawl | ✅ >85% |
| Vollständige Anforderungen | Firecrawl (Karriereseite) | ✅ >85% |
| ATS-Keywords | GPT-4o-mini Extraktion | ✅ Hoch |
| About-Company Text | Firecrawl | ✅ Hoch |
| Benefits / Perks | Firecrawl + Claude | 🟡 Mittel |

### 5.2 Nicht direkt aus Stellenanzeigen lesbar

Diese Filter können nicht direkt aus dem Text gelesen werden. Claude inferiert sie aus Sprache und Signalen:

| Datenpunkt | Problem | Lösung |
|---|---|---|
| **Unternehmenswerte** | Selten explizit als Liste | Claude inferiert aus Sprache & Mission |
| **Führungsstil** | Nie direkt genannt | Claude analysiert Verb-Typen in Aufgaben |
| **Diversität (Qualität)** | Alle behaupten divers zu sein | Claude unterscheidet Maßnahmen vs. Disclaimer |
| **Nachhaltigkeit (Tiefe)** | Greenwashing verbreitet | Claude bewertet Kern-Businessmodell |
| **Innovationsgrad** | Subjektiv | Claude analysiert Tech-Stack + Methoden |
| **Vision / Purpose** | Zu vage in 80% der Anzeigen | Perplexity Company Research als Fallback |

**Perplexity Fallback:**
```
Wenn firecrawl_markdown < 500 Zeichen:
→ Perplexity Sonar Pro Call:
  "Suche aktuelle Informationen über [company_name]:
   Unternehmenskultur, Führungsstil, Diversity-Initiativen,
   Nachhaltigkeitsstrategie, Mission Statement."
```

---

## 6. Edge Cases

- **LinkedIn-URLs direkt:** Bot-Schutz aktiv → nur SerpAPI-Vorschautext nutzen, Firecrawl-Schritt überspringen.
- **Karriereseite nicht erreichbar:** Firecrawl Timeout (>30s) → Job mit verfügbaren SerpAPI-Daten speichern, `firecrawl_markdown = null`.
- **Harvester < 50% Pflichtfelder:** Claude-Judge wird NICHT aufgerufen. Job erhält `match_score_overall = null`, Status bleibt `pending_review`, UI zeigt "Unvollständige Daten – manuell prüfen".
- **Duplicate Jobs:** Gleicher `job_title` + `company_name` + `location` innerhalb 7 Tagen → Upsert statt Insert (updated_at aktualisieren).
- **Stellenanzeige in Englisch:** Kein Problem — Claude und GPT-4o-mini arbeiten mehrsprachig. `ats_keywords` auf Originalsprache lassen.
- **Perplexity Company Research fehlgeschlagen:** `sustainability_section_raw`, `diversity_section_raw` auf `null` setzen. Judge verwendet `"unknown"` für betroffene Score-Felder.

---

## 7. Error Handling

### 7.1 API-Fehler

```typescript
// Retry-Logik für alle externen Calls
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  backoffMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const wait = backoffMs * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 7.2 Fehlerzustände in der DB

```typescript
// Fehlerstatus direkt in Supabase schreiben
await supabase.from('jobs').update({
  status: 'error',
  error_message: error.message,
  error_step: 'firecrawl | harvester | judge',
  updated_at: new Date().toISOString()
}).eq('id', job.id);
```

### 7.3 Halluzinations-Schutz

- GPT-4o-mini Harvester: Temperatur = `0.0` (deterministisch, kein Erfinden).
- Claude Judge: Temperatur = `0.1` (minimal für Nuancen, kein Erfinden).
- Beide Prompts enthalten explizit: *"Halluziniere NICHTS. Wenn ein Feld fehlt → null."*
- Validierung: Nach jedem Modell-Call Schema-Validation mit Zod/TypeScript.

---

## 8. Kosten & Performance

| Schritt | Tool | Kosten / 100 Jobs | Performance |
|---|---|---|---|
| Job-Suche | SerpAPI (100 Results) | ~$1.00 | <2 Sek |
| Deep-Scrape | Firecrawl (100 URLs) | ~$0.57 | 2–5 Sek/URL |
| Harvester | GPT-4o-mini (100 Calls) | ~$0.02 | <1 Sek |
| Judge | Claude Sonnet (nur ~15 Jobs) | ~$0.05 | 2–4 Sek |
| **Gesamt** | | **~$1.64** | ~5–10 Min |

→ **Kosten pro verarbeitetem Job in der Queue: ~$0.016**

---

## 9. Testing Protocol

### 9.1 Unit Tests

```bash
# Einzelne Pipeline-Schritte testen
jest tests/unit/serpapi.test.ts       # SerpAPI Query-Bau & Parsing
jest tests/unit/firecrawl.test.ts     # Markdown-Extraktion
jest tests/unit/harvester.test.ts     # GPT-4o-mini JSON-Validierung
jest tests/unit/judge.test.ts         # Claude Score-Plausibilität
```

### 9.2 Integrations-Test

```bash
# Vollständige Pipeline mit echten APIs (kleiner Umfang)
jest tests/integration/pipeline.test.ts --query="Innovation Consultant Berlin" --count=3

# Erwartetes Ergebnis:
# ✅ SerpAPI: 3 Jobs gefunden
# ✅ Firecrawl: Markdown extrahiert (>500 Zeichen)
# ✅ Harvester: JSON vollständig (>80% Felder befüllt)
# ✅ Judge: match_score_overall vorhanden (0-100)
# ✅ Supabase: Row in 'jobs' Tabelle mit status='pending_review'
```

### 9.3 Judge-Qualitäts-Test

```typescript
// Test: Judge erkennt Greenwashing
const greenwashingJob = {
  sustainability_section_raw: "We are committed to a greener future.",
  about_company_raw: "Oil & Gas exploration company.",
  mission_statement_raw: "Maximizing shareholder value."
};
expect(judgeOutput.score_breakdown.sustainability_fit).toBeLessThan(40);
expect(judgeOutput.red_flags).toContain(expect.stringMatching(/greenwash/i));

// Test: Judge erkennt echte Nachhaltigkeit
const genuineJob = {
  sustainability_section_raw: "B-Corp zertifiziert. Net Zero bis 2028. 100% erneuerbare Energie.",
  about_company_raw: "Solarenergie Unternehmen, deutsches erstes grünes Unicorn."
};
expect(judgeOutput.score_breakdown.sustainability_fit).toBeGreaterThan(85);
```

### 9.4 End-to-End Test (manuell)

```
1. Job Search Tab öffnen
2. "Sustainability Manager" + "Berlin" eingeben
3. Suchen klicken
4. Warten auf Ergebnisse (max 30 Sek)
5. Job mit höchstem Score öffnen
6. Side Panel prüfen: Score, Reasoning, Red/Green Flags, ATS Keywords
7. "In Queue aufnehmen" klicken
8. In Bewerbungen prüfen: Status "in_queue"
9. Steckbrief öffnen: Daten müssen sofort verfügbar sein (kein Loader)
```

---

## Outputs (Deliverables)

- **Job Search Tab** im Pathly Main (UI): Liste mit Match-Scores, Side Panel, "In Queue aufnehmen" Button
- **`jobs` Tabelle in Supabase**: Vollständig befüllt nach Pipeline-Durchlauf
- **`user_values` Tabelle in Supabase**: Einmalig beim Onboarding befüllt
- **Steckbrief, CV Match, CV Opt, Cover Letter**: Nutzen `jobs`-Tabelle als Single Source of Truth

---

## Master Prompt Template Compliance

Dieses Dokument orientiert sich am `Master_Prompt_Template.md` aus [`dev-playbook/directives/`](https://github.com/yannikgaletto-art/dev-playbook/tree/main/directives).

### ✅ Sections Included:
1. **Goal** — Klares, einzeiliges Ziel ✅
2. **Inputs** — Alle Parameter mit Typ, Pflichtfeld, Beispiel ✅
3. **Tools/Services** — Vollständige Dependency-Liste mit Kosten ✅
4. **Process** — Schritt-für-Schritt mit Prompts und Code ✅
5. **Outputs (Deliverables)** — Klar markiert ✅
6. **Edge Cases** — Plattform-spezifische Ausnahmefälle ✅
7. **Error Handling** — Retry-Logik, DB-Fehlerstatus, Halluzinations-Schutz ✅
8. **Testing Protocol** — Unit, Integration, Judge-Qualität, E2E ✅

### ✅ Qualitätsprinzipien:
- **Human-in-the-Loop:** Kein Job landet automatisch in der Queue — immer User-Bestätigung ✅
- **Kein Halluzinations-Risiko:** Temperatur 0.0/0.1, explizite Null-Regeln, Zod-Validierung ✅
- **Kosteneffizienz:** GPT-4o-mini als Harvester, Claude nur für Top-Kandidaten ✅
- **Single Source of Truth:** Alle Agenten greifen auf dieselbe Supabase-Tabelle zu ✅

---

*Letzte Aktualisierung: Feb 2026 · Yannik Galetto*
