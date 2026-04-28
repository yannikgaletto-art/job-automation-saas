
import { z } from 'zod';
import { complete } from '@/lib/ai/model-router';
import { CvStructuredData } from '@/types/cv';
import { sanitizeForAI } from './pii-sanitizer';

/**
 * Strict Zod schema for the LLM's CV parse output.
 *
 * User-Edit-First (2026-04-28): The parser is intentionally minimal — Claude
 * Haiku produces a draft structure and a Zod safeParse falls back to the raw
 * JSON if individual entries fail validation. Post-processors are limited to
 * deterministic noise-filters (section headers, proficiency tokens) that an
 * LLM reliably mis-classifies regardless of prompt quality.
 */
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

// ─── Deterministic noise filters ─────────────────────────────────────────────
// These are small Sets that catch systematic LLM mis-classifications regardless
// of how well the prompt is written.

// Language proficiency tokens that the LLM sometimes puts in `language` instead
// of `proficiency`. Also catches section headers.
const LANG_NOISE = new Set([
  'sprachen', 'languages', 'idiomas', 'sprachkenntnisse', 'language skills',
  'niveau', 'level', 'niveaus', 'levels',
  'muttersprache', 'muttersprachler', 'muttersprachlich', 'native',
  'fremdsprachen', 'weitere sprachen',
  // Proficiency-level tokens used as language names
  'a1', 'a2', 'b1', 'b2', 'c1', 'c2',
  'grundkenntnisse', 'gute kenntnisse', 'sehr gute kenntnisse', 'verhandlungssicher', 'fließend',
]);

// Section-header tokens the LLM sometimes uses as a certification name.
const CERT_NOISE = new Set([
  'zertifikate', 'certificates', 'certifications', 'zertifizierungen',
  'weiterbildung', 'weiterbildungen', 'kurse', 'kurs', 'zertifizierung',
  'aus- und weiterbildung', 'further education',
]);

export async function parseCvTextToJson(text: string): Promise<CvStructuredData> {
  const { sanitized, restoreJson, warningFlags } = sanitizeForAI(text);
  console.log(`🛡️ [cv-parser] PII sanitized before AI call. Found: [${warningFlags.join(', ')}]`);

  const prompt = `Du bist ein präziser Daten-Extraktor für Lebensläufe. Übersetze den folgenden CV-Text in eine strikt strukturierte JSON-Repräsentation.

WICHTIG — OCR-BESONDERHEITEN: Der Text kommt von Azure Document Intelligence.

REGEL 1 — AGGREGIERTE DATUMSSPALTE (häufig bei zweispaltigen CVs):
Wenn mehrere Datumsangaben HINTEREINANDER am Anfang des Erfahrungsabschnitts stehen (z.B. "11.2023  09.2025 07.2022  08.2024 01.2023  03.2023"), sind das Start/End-Datum-PAARE für die Stationen, die danach im Text in DERSELBEN REIHENFOLGE erscheinen.
→ 1. Paar = 1. Station, 2. Paar = 2. Station usw.
→ Datumsangaben die ALLEINE ohne Firmenname/Rolle dastehen gehören IMMER in dateRangeText — NIEMALS als Firma oder Rolle.

REGEL 2 — ROLLE ≠ BULLET-INHALT:
Die Zeile nach "Firma I" enthält die Rolle. Zeilen die mit "Substantiv:" oder "Stichwort:" beginnen (z.B. "KI-Consulting: ...", "Beratung: ...") sind BULLET-PUNKTE in description[].text — NIEMALS die Rolle.

REGEL 3 — PIPE-SEPARATOR " I " ODER " | ":
"Firma I Rolle" oder "Firma | Rolle" → company und role getrennt extrahieren.
Beispiel: "Fraunhofer I Innovation Management Consultant" → company: "Fraunhofer", role: "Innovation Management Consultant"

REGEL 4 — SPRACHEN:
Sprach-Einträge haben immer Name + Niveau. Format im OCR: "Deutsch I Muttersprache", "Englisch I C1 Niveau", "Spanisch I | B2 Niveau".
→ language = Sprachname (z.B. "Deutsch"), proficiency = Niveau-Text (z.B. "Muttersprache", "C1")
→ NIEMALS das Niveau-Token (C1, B2, Muttersprache) als Sprachname verwenden.

REGEL 5 — ZERTIFIKATE:
Zertifikate, Kurse, Lizenzen → certifications. NIEMALS in skills. Die Section-Header selbst ("Zertifikate", "Weiterbildungen") sind KEIN Zertifikatsname.

WEITERE REGELN:
6. Erfinde keine Fakten. Wenn ein Feld nicht im Text steht, lass es null/leer.
7. Übernimm Informationen wörtlich — keine Umformulierung.
8. Generiere für jedes Listen-Element eine eindeutige id (z.B. "exp-1", "edu-2", "skill-3").
9. Generiere für jeden Bullet in experience[].description eine eindeutige id (z.B. "bullet-1-1").
10. Setze "version" auf "2.0".
11. Sortiere experience-Einträge absteigend nach Datum (neueste zuerst).
12. Datumsspannen auf zwei Zeilen ("09.2025\\nHeute") → kombiniere zu "09.2025 - Heute".
13. role enthält NIE Datumsangaben. "Heute", "Present", "seit 2023" gehören in dateRangeText.

OUTPUT: NUR valides JSON, kein Markdown, keine Kommentare. Format:

{
  "version": "2.0",
  "personalInfo": { "name": "...", "email": "...", "phone": "...", "location": "...", "linkedin": "...", "website": "...", "summary": "...", "targetRole": "..." },
  "experience": [
    { "id": "exp-1", "company": "...", "role": "...", "dateRangeText": "...", "location": "...", "summary": "...", "description": [ { "id": "bullet-1-1", "text": "..." } ] }
  ],
  "education": [
    { "id": "edu-1", "institution": "...", "degree": "...", "dateRangeText": "...", "description": "...", "grade": "..." }
  ],
  "skills": [ { "id": "skill-1", "category": "...", "items": ["..."] } ],
  "languages": [ { "id": "lang-1", "language": "...", "proficiency": "...", "level": 4 } ],
  "certifications": [ { "id": "cert-1", "name": "...", "issuer": "...", "dateText": "...", "credentialUrl": "...", "description": "..." } ]
}

CV TEXT:
${sanitized}`;

  const response = await complete({
    taskType: 'cv_parse',
    prompt,
    temperature: 0,
  });

  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude returned no valid JSON block');
  }

  const restoredJsonString = restoreJson(jsonMatch[0]);
  const rawJson = JSON.parse(restoredJsonString);
  console.log(`🔐 [cv-parser] PII restored. Name: ${rawJson.personalInfo?.name ? '✅' : '⚠️ null'}`);

  // ─── Deterministic post-processing ───────────────────────────────────────
  // Applied before Zod validation so the schema sees clean data.

  // Language noise filter: remove entries where `language` is a proficiency
  // token or a section header (LLM systematically confuses these).
  if (Array.isArray(rawJson.languages)) {
    rawJson.languages = rawJson.languages.filter((l: { language?: string }) => {
      const name = (l.language ?? '').trim().toLowerCase();
      return name.length > 0 && !LANG_NOISE.has(name);
    });
  }

  // Certification noise filter: remove entries whose name is a section header.
  if (Array.isArray(rawJson.certifications)) {
    rawJson.certifications = rawJson.certifications.filter((c: { name?: string }) => {
      const name = (c.name ?? '').trim().toLowerCase();
      return name.length > 0 && !CERT_NOISE.has(name);
    });
  }

  const parseResult = cvStructuredDataSchema.safeParse(rawJson);
  if (parseResult.success) {
    return parseResult.data as CvStructuredData;
  }

  // Soft-fail: an LLM that mis-types one field shouldn't kill the whole upload.
  // The user gets to review and fix everything in the confirm dialog anyway.
  const issues = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
  console.warn(`⚠️ [cv-parser] Zod partial validation — using raw JSON. Issues: ${issues}`);
  return {
    version: rawJson.version ?? '2.0',
    personalInfo: rawJson.personalInfo ?? {},
    experience: Array.isArray(rawJson.experience) ? rawJson.experience : [],
    education: Array.isArray(rawJson.education) ? rawJson.education : [],
    skills: Array.isArray(rawJson.skills) ? rawJson.skills : [],
    languages: Array.isArray(rawJson.languages) ? rawJson.languages : [],
    certifications: Array.isArray(rawJson.certifications) ? rawJson.certifications : [],
  } as CvStructuredData;
}
