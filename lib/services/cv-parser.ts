
import { z } from 'zod';
import { complete } from '@/lib/ai/model-router';
import { CvStructuredData } from '@/types/cv';
import { sanitizeForAI } from './pii-sanitizer';

export const cvStructuredDataSchema = z.object({
  version: z.string(),
  personalInfo: z.object({
    name: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    location: z.string().nullish(),
    linkedin: z.string().nullish(),
    website: z.string().nullish(),
    summary: z.string().nullish(),
    targetRole: z.string().nullish(),
  }),
  experience: z.array(z.object({
    id: z.string(),
    company: z.string().nullish(),
    role: z.string().nullish(),
    dateRangeText: z.string().nullish(),
    location: z.string().nullish(),
    summary: z.string().nullish(),
    description: z.array(z.object({ id: z.string(), text: z.string() })),
  })),
  education: z.array(z.object({
    id: z.string(),
    institution: z.string().nullish(),
    degree: z.string().nullish(),
    dateRangeText: z.string().nullish(),
    description: z.string().nullish(),
    grade: z.string().nullish(),
  })),
  skills: z.array(z.object({
    id: z.string(),
    category: z.string().nullish(),
    items: z.array(z.string()),
    displayMode: z.enum(['tags', 'comma', 'bars']).nullish(),
  })),
  languages: z.array(z.object({
    id: z.string(),
    language: z.string().nullish(),
    proficiency: z.string().nullish(),
    level: z.number().min(1).max(5).nullish(),
  })),
  certifications: z.array(z.object({
    id: z.string(),
    name: z.string().nullish(),
    issuer: z.string().nullish(),
    dateText: z.string().nullish(),
    credentialUrl: z.string().nullish(),
    expiryDate: z.string().nullish(),
    description: z.string().nullish(),
  })).nullish(),
});


export async function parseCvTextToJson(text: string): Promise<CvStructuredData> {
  // ═══ DSGVO Phase 2: Sanitize PII before AI call ═══
  const { sanitized, restoreJson, warningFlags } = sanitizeForAI(text);
  console.log(`🛡️ [cv-parser] PII sanitized before AI call. Found: [${warningFlags.join(', ')}]`);

  const prompt = `
Du bist ein präziser Daten-Extraktor für Lebensläufe.
Deine Aufgabe ist es, den folgenden rohen CV-Text in eine strikt strukturierte JSON-Repräsentation zu übersetzen.

⚠️ **KRITISCHE WARNUNG — OCR-REIHENFOLGE:**
Der Text wurde von einem OCR-System (Azure Document Intelligence) extrahiert.
Die Reihenfolge der Textblöcke im Input entspricht NICHT zwingend der logischen Reihenfolge des Lebenslaufs!
Insbesondere bei zweispaltigen CVs können Daten, Firmennamen und Beschreibungen DURCHEINANDER stehen.
Du MUSST daher den gesamten Text lesen und die Zuordnung SEMANTISCH vornehmen.

**HÄUFIGSTES FEHLERMUSTER (2-Spalten-Layout):**
Der OCR-Text enthält oft ERST einen Block aller Datumspaare und DANN einen Block aller Rollen/Firmen.
Beispiel: "01.2020  06.2022  07.2018  12.2019  Firma A Senior Manager  Firma B Junior Analyst"
→ FALSCH wäre: Firma A = 01.2020-06.2022 und Firma B = 07.2018-12.2019 (einfache textreihenfolge)
→ Du musst stattdessen SEMANTISCH prüfen: Welche Aufgaben/Technologien passen zu welcher Firma UND welchem Zeitraum? Nutze Seniorität, Branchenwissen und logische Konsistenz.

**2-PASS-STRATEGIE (PFLICHT):**
PASS 1: Lies den GESAMTEN Text und sammle ALLE Datumsangaben, Firmennamen und Rollen.
PASS 2: Ordne sie logisch zu — welche Firma gehört zu welchem Datumsbereich? Nutze inhaltliche Hinweise (z.B. Seniorität, Branche, Technologien) um korrekte Zuordnungen zu finden.

**REGELN FÜR DIE EXTRAKTION:**
1. Erfinde KEINE Fakten ("No Hallucinations"). Wenn ein Feld im Text nicht existiert, lass es weg oder setze es auf null/leer.
2. Formuliere nichts um. Übernimm die Informationen so originalgetreu wie möglich.
3. **WICHTIG (IDs)**: Generiere für jedes Element in Listen (experience, education, skills, languages) eine eindeutige ID (z.B. "exp-1", "edu-2", "skill-3").
4. Generiere auch für JEDEN Bullet Point in \`experience[].description\` eine eindeutige ID (z.B. "bullet-1-1").
5. Setze "version" auf "2.0".
6. **CHRONOLOGICAL ORDER (CRITICAL):** Die \`experience\`-Einträge MÜSSEN nach Datum absteigend sortiert sein (neueste zuerst). "Heute"/"Present" = aktuellste Position = Array-Index 0. Achte auf korrekte Zuordnung: Jede Firma muss mit ihrem korrekten Datumsbereich verknüpft werden — NICHT einfach in der Reihenfolge des Textes übernehmen, sondern semantisch korrekt zuordnen.
7. **DATE-COMPANY MATCHING**: Lies den gesamten CV-Text zuerst vollständig, bevor du die Zuordnung machst. Stelle sicher, dass jede Firma/Rolle mit dem korrekten Datumsbereich (Start - Ende) verknüpft wird. Bei OCR-extrahiertem Text kann die Textreihenfolge FALSCH sein — prüfe die logische Konsistenz.
8. **SECTION MARKERS**: Der Text kann Markdown-artige Abschnittsmarkierungen enthalten (z.B. "## Berufserfahrung"). Nutze diese als Hilfe, um die CV-Sektionen zu unterscheiden.
9. **PIPE-SEPARATOR "I" IN ERFAHRUNG UND SPRACHEN:**
   - Beispiel Erfahrung: "Ingrano Solutions I AI Business Development Manager"
     → company: "Ingrano Solutions", role: "AI Business Development Manager"
   - Beispiel Sprachen: "Deutsch I Muttersprache" → language: "Deutsch", proficiency: "Muttersprache"
   - Das "I" als Trennzeichen gilt nur wenn es ALLEIN steht (Leerzeichen beiderseits).
   - NIEMALS nur den Teil vor oder nach dem "I" extrahieren — IMMER beide Seiten auswerten.
10. **DATUM-REKONSTRUKTION (MEHRZEILIG):**
   - OCR liefert Start- und Enddatum oft auf GETRENNTEN Zeilen, z.B.: "09.2025\nHeute" oder "11.2023\n09.2025"
   - Diese MÜSSEN als "09.2025 - Heute" bzw. "11.2023 - 09.2025" kombiniert werden.
   - NIEMALS nur "Heute" oder nur "11.2023" als dateRangeText speichern — IMMER vollständige Spanne.
   - Wenn nach einer Jahreszahl eine weitere Jahreszahl oder "Heute"/"Present" auf der nächsten Zeile folgt: → kombiniere zu "START - END".
11. **ARBEITGEBER MIT BINDESTRICH-ABTEILUNG (FIRMA - ABTEILUNG):**
   - Format "FIRMA - ABTEILUNG" (kein Jobtitel vor dem Strich): company=FIRMA, role=ABTEILUNG.
   - Beispiel: "KPMG - Public Sector Consulting" → company: "KPMG", role: "Public Sector Consulting"
   - Beispiel: "KPMG - Central Services" → company: "KPMG", role: "Central Services"
   - AUSNAHME: Wenn der Teil VOR dem Strich ein Jobtitel ist (Co-Founder, CEO, Manager, etc.): role=erster Teil, company=zweiter Teil.
   - Beispiel: "Co-Founder - Xorder Menues" → role: "Co-Founder", company: "Xorder Menues"
12. **ZERTIFIKATE — OCR-MUSTER:**
   - Zeile 1: Zertifikatsname, ggf. mit Aussteller in Klammern oder nach "I"-Separator (z.B. "Design Thinking Coach (Hasso-Plattner-Institut)")
   - Zeile 2+: Komma-getrennte Kompetenzbereiche → das ist das "description"-Feld des Zertifikats
   - GRUPPIERTE INSTITUTION: Eine Zeile nur mit Institutionsname (z.B. "Universität Potsdam") gefolgt von mehreren Einzel-Einträgen mit Jahreszahl → ALLE sind separate Zertifikate mit issuer: "Universität Potsdam"
   - VOLLSTÄNDIGKEIT: Erfasse JEDES Zertifikat einzeln — keines darf fehlen oder übersprungen werden.
13. **RAUSCHEN IGNORIEREN:**
   - "Sprachen", "Zertifikate", "Certifications", "Niveau", "Level", "Muttersprache" allein sind KEINE eigenständigen Einträge.
   - Abschnittsüberschriften wie "Weitere Kompetenzen", "Berufserfahrung", "Bildungsweg" sind KEINE Daten, sondern Strukturmarkierungen — ignorieren.
14. **ROLE-FELD: NIEMALS Datumsmarker:**
   - Das Feld \`role\` enthält NUR die Berufsbezeichnung — NIEMALS Datumsangaben.
   - VERBOTEN in role: "Heute", "Present", "Actualidad", "seit 2023", "09.2025", "09.2025 - Heute".
   - Diese Angaben gehören ausschließlich ins Feld \`dateRangeText\`.
   - Beispiel FALSCH: role = "AI Business Development Manager\\nHeute"
   - Beispiel RICHTIG: role = "AI Business Development Manager", dateRangeText = "09.2025 - Heute"
15. **SPRACHEN vs. ZERTIFIKATE — 2-SPALTEN-TRENNUNG:**
   - Viele CVs haben Sprachen und Zertifikate NEBENEINANDER in zwei Spalten.
   - Die OCR interleavt dann die Zellen: "Zertifikate Niveau Microsoft Spanisch Design Thinking..."
   - Du MUSST semantisch trennen: Nur echte Sprachennamen (Deutsch, Englisch, Spanisch, Französisch, Italienisch, etc.) gehören in \`languages\`.
   - "Microsoft", "Hasso-Plattner-Institut", "TÜV", "Azure", "Design Thinking" etc. sind NIEMALS Sprachen → gehören in \`certifications\`.
   - PFLICHT: Extrahiere ALLE im Text erkennbaren Sprachen (typisch: 2-4 Sprachen pro deutsch-sprachiges CV, inkl. Muttersprache Deutsch + Englisch).

**ZUSÄTZLICHE HINWEISE ZUR DATENSTRUKTUR:**
- \`dateRangeText\`: z.B. "01/2020 - 12/2022" oder "2018 - Heute"
- \`description\`: Muss ein Array von Objekten der Form \`{ "id": "bullet-x", "text": "..." }\` sein.
- **WICHTIG: Zertifikate (Kurse, Lizenzen, Zertifizierungen) gehören IMMER in \`certifications\`, NIEMALS in \`skills\`.** \`skills\` enthält ausschließlich Fähigkeiten/Kompetenzen.
- \`targetRole\`: Extrahiere die Berufsbezeichnung/Rolle aus dem CV-Titel oder der Überschrift (z.B. "Innovation Manager", "Software Engineer"). Falls nicht erkennbar, null.
- \`website\`: Portfolio, GitHub, persönliche Website — falls vorhanden.
- \`level\` (Sprachen): Schätze eine Zahl 1-5 basierend auf der Proficiency-Angabe: 1=Grundkenntnisse/A1, 2=A2/B1, 3=B2/gut, 4=C1/fließend/verhandlungssicher, 5=C2/Muttersprache.
- \`credentialUrl\`: Falls eine Verifizierungs-URL für ein Zertifikat angegeben ist.
- \`grade\`: Notendurchschnitt oder GPA, falls angegeben.

**OUTPUT-FORMAT (STRIKT JSON):**
Return ONLY valid JSON. No markdown framing (\`\`\`json\`), no comments, no intro/outro text.
Das JSON muss exakt diesem Schema entsprechen:

{
  "version": "2.0",
  "personalInfo": { "name": "...", "email": "...", "phone": "...", "location": "...", "linkedin": "...", "website": "...", "summary": "...", "targetRole": "..." },
  "experience": [
    {
      "id": "exp-1",
      "company": "...",
      "role": "...",
      "dateRangeText": "...",
      "location": "...",
      "summary": "...",
      "description": [ { "id": "bullet-1-1", "text": "..." } ]
    }
  ],
  "education": [
    { "id": "edu-1", "institution": "...", "degree": "...", "dateRangeText": "...", "description": "...", "grade": "..." }
  ],
  "skills": [
    { "id": "skill-1", "category": "...", "items": ["...", "..."] }
  ],
  "languages": [
    { "id": "lang-1", "language": "...", "proficiency": "...", "level": 4 }
  ],
  "certifications": [
    { "id": "cert-1", "name": "...", "issuer": "...", "dateText": "...", "credentialUrl": "...", "description": "..." }
  ]
}

**CV TEXT ZUR EXTRAKTION:**
${sanitized}
    `;

  try {
    const response = await complete({
      taskType: 'cv_parse',
      prompt,
      temperature: 0,
    });

    // Try to match JSON block in case Claude ignores our "no markdown" rule
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Claude returned no valid JSON block');
    }

    // ═══ DSGVO Phase 2: Restore PII tokens in JSON before parsing ═══
    const restoredJsonString = restoreJson(jsonMatch[0]);
    const rawJson = JSON.parse(restoredJsonString);
    console.log(`🔐 [cv-parser] PII restored in structured JSON. Name: ${rawJson.personalInfo?.name ? '✅' : '⚠️ null'}`);
    console.log('🔍 Parsed raw JSON from Claude successfully');

    // Use safeParse instead of parse so a partially invalid Claude response
    // (e.g. wrong field type in one experience entry) does NOT kill the entire
    // CV upload. We log a warning and return the raw data coerced to the type.
    const parseResult = cvStructuredDataSchema.safeParse(rawJson);
    let validated: any;
    if (parseResult.success) {
      console.log('✅ Zod validation passed for structured CV data');
      validated = parseResult.data;
    } else {
      const issues = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      console.warn(`⚠️ [cv-parser] Zod validation partially failed — using raw JSON as fallback. Issues: ${issues}`);
      // Ensure the raw JSON at least has the minimum required top-level structure
      validated = {
        version: rawJson.version ?? '2.0',
        personalInfo: rawJson.personalInfo ?? {},
        experience: Array.isArray(rawJson.experience) ? rawJson.experience : [],
        education: Array.isArray(rawJson.education) ? rawJson.education : [],
        skills: Array.isArray(rawJson.skills) ? rawJson.skills : [],
        languages: Array.isArray(rawJson.languages) ? rawJson.languages : [],
        certifications: Array.isArray(rawJson.certifications) ? rawJson.certifications : [],
      };
    }

    // Post-processing: sort + deterministic noise filters + role sanitization
    const CERT_NOISE = new Set(['zertifikate', 'certificates', 'certifications', 'zertifizierungen', 'weiterbildung', 'weitere kompetenzen']);
    const sorted = {
      ...validated,
      experience: sortExperienceByDate(
        (validated.experience ?? []).map((e: any) => ({
          ...e,
          role: stripRoleDateMarkers(e.role),
        }))
      ),
      languages: (validated.languages ?? []).filter((l: any) => {
        const lang = (l.language || '').trim().toLowerCase();
        return lang.length > 0 && KNOWN_LANGUAGES.has(lang);
      }),
      certifications: (validated.certifications ?? []).filter((c: any) => {
        const name = (c.name || '').trim().toLowerCase();
        return name.length > 0 && !CERT_NOISE.has(name);
      }),
    };

    return sorted as CvStructuredData;
  } catch (error: any) {
    console.error('❌ Failed to parse CV to JSON:', error.message);
    throw error;
  }
}

/**
 * Sort experience entries by end-date descending (newest first).
 *
 * Handles all common date range formats found in German and international CVs:
 *   "09.2025 - Heute"          → current job
 *   "01/2023 - 12/2024"        → MM/YYYY
 *   "2020 - 2022"              → YYYY only
 *   "09.2025 - Present"        → English present
 *   "seit 01/2023"             → German "since" (open-ended = current)
 *   "ab 2022"                  → German "from" (open-ended = current)
 *   "bis Heute"                → German "until today"
 *   "Q1 2024 - Q3 2025"        → quarterly notation
 *   "2023–" or "2023 –"        → open-ended with em-dash (no end = current)
 *
 * Falls back to original order if dates can't be parsed.
 */
function sortExperienceByDate(
  entries: Array<{ id: string; dateRangeText?: string | null;[key: string]: any }>
): typeof entries {
  const parseEndDate = (dateRange: string | null | undefined): number => {
    if (!dateRange) return 0;
    const raw = dateRange.trim();
    const lower = raw.toLowerCase();

    // Open-ended / current job indicators — always sort first
    if (/heute|present|current|aktuell|laufend|\bnow\b/i.test(lower)) return 99999999;

    // German "seit" or "ab" prefix = job started at date and is current
    if (/^(seit|ab)\s/i.test(lower)) return 99999999;

    // Open-ended trailing dash: "2023 –" or "2023–" with nothing after
    if (/\d{4}\s*[-–]\s*$/.test(raw)) return 99999999;

    // Find the end part (after " - " or " – ")
    // Handles: "01.2020 - 12.2022", "01/2020 – 12/2022"
    const parts = raw.split(/\s*[-–]\s*/);
    const endPart = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();

    // Re-check the end part for current indicators
    if (/heute|present|current|aktuell|laufend/i.test(endPart)) return 99999999;

    // Quarterly format: "Q1 2024" → treat as Jan (Q1), Apr (Q2), Jul (Q3), Oct (Q4)
    const quarterMatch = endPart.match(/Q([1-4])\s*(\d{4})/i);
    if (quarterMatch) {
      const quarter = parseInt(quarterMatch[1]);
      const year = parseInt(quarterMatch[2]);
      const month = [3, 6, 9, 12][quarter - 1]; // end-of-quarter month
      return year * 100 + month;
    }

    // MM.YYYY or MM/YYYY (German or international format)
    const mmYyyy = endPart.match(/(\d{1,2})[./](\d{4})/);
    if (mmYyyy) return parseInt(mmYyyy[2]) * 100 + parseInt(mmYyyy[1]);

    // YYYY/MM (ISO-ish reverse format)
    const yyyyMm = endPart.match(/(\d{4})\/(\d{1,2})/);
    if (yyyyMm) return parseInt(yyyyMm[1]) * 100 + parseInt(yyyyMm[2]);

    // Just YYYY (no month — use 12 as end-of-year conservative estimate)
    const yyyy = endPart.match(/(\d{4})/);
    if (yyyy) return parseInt(yyyy[1]) * 100 + 12;

    return 0;
  };

  return [...entries].sort((a, b) => parseEndDate(b.dateRangeText) - parseEndDate(a.dateRangeText));
}

/**
 * Strips date markers (Heute/Present/09.2025/seit 2023) from the role field.
 *
 * Root cause: OCR often outputs 2-column layouts where dates are visually adjacent
 * to the role title on a separate line. Claude then concatenates them into role
 * (e.g. "AI Business Development Manager\nHeute"). Dates belong in `dateRangeText`,
 * NOT in `role`. This post-processor enforces that invariant deterministically.
 *
 * Pattern coverage (word-boundary safe, won't touch "Today's Solutions" etc.):
 *   - Trailing standalone markers: "…Manager\nHeute", "…Engineer Present"
 *   - Trailing date ranges: "…Manager 09.2025 - Heute"
 *   - Newline-separated fragments: "…Manager\n09.2025\nHeute"
 *   - German "seit 2023", Spanish "desde 2023"
 */
export function stripRoleDateMarkers(role: string | null | undefined): string | null | undefined {
  if (!role) return role;
  let cleaned = role
    // Strip trailing "Heute/Present/Actualidad" preceded by newline or whitespace (word-boundary)
    .replace(/[\s\n\r]+(Heute|Present|Actualidad|Currently|Aktuell|laufend)\b\s*$/gi, '')
    // Strip trailing date range: "09.2025 - Heute", "01/2020 – 12/2022"
    .replace(/[\s\n\r]+\d{1,2}[./-]\d{2,4}(\s*[-–—]\s*(Heute|Present|Actualidad|Currently|Aktuell|\d{1,2}[./-]\d{2,4}|\d{4}))?\s*$/gi, '')
    // Strip trailing year-only range: "2020 - 2022", "2023 - Heute"
    .replace(/[\s\n\r]+\d{4}(\s*[-–—]\s*(Heute|Present|Actualidad|Currently|Aktuell|\d{4}))?\s*$/gi, '')
    // Strip trailing "seit 2023" / "ab 2023" / "desde 2023"
    .replace(/[\s\n\r]+(seit|ab|desde|since)\s+\d{4}\s*$/gi, '')
    // Collapse any remaining internal newlines + whitespace
    .replace(/[\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : role;
}

/**
 * Whitelist of known languages in de/en/es (app's supported locales).
 *
 * Why a whitelist: OCR from 2-column layouts (SPRACHEN adjacent to ZERTIFIKATE)
 * routinely leaks cert column values ("Microsoft", "Azure", "TÜV") and section
 * headers ("Niveau", "Zertifikate") into the languages array. A strict whitelist
 * is the only deterministic defense against this — blacklists are whack-a-mole.
 *
 * Users with rare languages not on this list can add them via the optimizer UI
 * after upload. Covered: 60+ major world languages in all 3 app languages.
 */
export const KNOWN_LANGUAGES = new Set<string>([
  // Core European (de/en/es forms)
  'deutsch', 'german', 'alemán', 'alemana', 'aleman',
  'englisch', 'english', 'inglés', 'ingles', 'inglesa',
  'spanisch', 'spanish', 'español', 'espanol', 'española', 'castellano',
  'französisch', 'french', 'francés', 'frances', 'francesa',
  'italienisch', 'italian', 'italiano', 'italiana',
  'portugiesisch', 'portuguese', 'portugués', 'portugues', 'portuguesa',
  'niederländisch', 'dutch', 'nederlands', 'holandés', 'holandes', 'holandesa',
  'schwedisch', 'swedish', 'sueco', 'sueca',
  'norwegisch', 'norwegian', 'noruego', 'noruega',
  'dänisch', 'danish', 'danés', 'danes', 'danesa',
  'finnisch', 'finnish', 'finés', 'fines', 'finesa', 'finlandés',
  'isländisch', 'icelandic', 'islandés',
  'polnisch', 'polish', 'polaco', 'polaca',
  'tschechisch', 'czech', 'checo', 'checa',
  'slowakisch', 'slovak', 'eslovaco', 'eslovaca',
  'slowenisch', 'slovenian', 'esloveno', 'eslovena',
  'ungarisch', 'hungarian', 'húngaro', 'hungaro', 'húngara',
  'rumänisch', 'romanian', 'rumano', 'rumana',
  'bulgarisch', 'bulgarian', 'búlgaro', 'bulgaro', 'búlgara',
  'kroatisch', 'croatian', 'croata',
  'serbisch', 'serbian', 'serbio', 'serbia',
  'bosnisch', 'bosnian', 'bosnio', 'bosnia',
  'mazedonisch', 'macedonian', 'macedonio',
  'albanisch', 'albanian', 'albanés', 'albanes',
  'griechisch', 'greek', 'griego', 'griega',
  'russisch', 'russian', 'ruso', 'rusa',
  'ukrainisch', 'ukrainian', 'ucraniano', 'ucraniana',
  'weißrussisch', 'belarusian', 'bielorruso',
  'litauisch', 'lithuanian', 'lituano',
  'lettisch', 'latvian', 'letón', 'leton',
  'estnisch', 'estonian', 'estonio',
  'türkisch', 'turkish', 'turco', 'turca', 'türkçe', 'turkce',
  // Non-European major
  'chinesisch', 'chinese', 'chino', 'china', 'mandarin', 'mandarín', 'kantonesisch', 'cantonese',
  'japanisch', 'japanese', 'japonés', 'japones', 'japonesa',
  'koreanisch', 'korean', 'coreano', 'coreana',
  'vietnamesisch', 'vietnamese', 'vietnamita',
  'thai', 'thailändisch', 'tailandés', 'tailandesa',
  'indonesisch', 'indonesian', 'indonesio', 'indonesia',
  'malaysisch', 'malay', 'malayo', 'malaya',
  'filipino', 'tagalog',
  'hindi', 'urdu', 'bengalisch', 'bengali', 'punjabi', 'tamil', 'telugu',
  'arabisch', 'arabic', 'árabe', 'arabe',
  'hebräisch', 'hebrew', 'hebreo', 'hebrea',
  'persisch', 'persian', 'farsi', 'persa',
  'suaheli', 'swahili',
  // Regional / minority
  'katalanisch', 'catalan', 'catalán', 'catala', 'català',
  'baskisch', 'basque', 'vasco', 'euskara',
  'galizisch', 'galician', 'gallego',
  'walisisch', 'welsh', 'galés',
  'irisch', 'irish', 'irlandés', 'gaeilge',
  'schottisch', 'scottish', 'gaelic', 'gaelisch',
  'luxemburgisch', 'luxembourgish', 'luxemburgués',
  'schweizerdeutsch', 'swiss german',
  'latein', 'latin', 'latín',
  'esperanto',
  // Sign languages
  'gebärdensprache', 'sign language', 'lengua de signos', 'dgs', 'asl', 'bsl',
]);
