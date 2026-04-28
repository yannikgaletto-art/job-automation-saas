
import { z } from 'zod';
import { complete } from '@/lib/ai/model-router';
import { CvStructuredData } from '@/types/cv';
import { sanitizeForAI } from './pii-sanitizer';

/**
 * Strict Zod schema for the LLM's CV parse output.
 *
 * User-Edit-First (2026-04-28): The parser is intentionally minimal — Claude
 * Haiku produces a draft structure and a Zod safeParse falls back to the raw
 * JSON if individual entries fail validation. NO post-processors anymore;
 * the user reviews and corrects the result via CvEditConfirmDialog.
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

export async function parseCvTextToJson(text: string): Promise<CvStructuredData> {
  const { sanitized, restoreJson, warningFlags } = sanitizeForAI(text);
  console.log(`🛡️ [cv-parser] PII sanitized before AI call. Found: [${warningFlags.join(', ')}]`);

  const prompt = `Du bist ein präziser Daten-Extraktor für Lebensläufe. Übersetze den folgenden CV-Text in eine strikt strukturierte JSON-Repräsentation.

WICHTIG: Der Text kommt von einem OCR-System. Bei zweispaltigen CVs können Datumsangaben und Firmen DURCHEINANDER stehen. Lies den Text vollständig und ordne SEMANTISCH zu — welche Firma gehört zu welchem Datum? Nutze inhaltliche Hinweise (Seniorität, Branche, Technologien).

REGELN:
1. Erfinde keine Fakten. Wenn ein Feld nicht im Text steht, lass es null/leer.
2. Übernimm die Informationen wörtlich — keine Umformulierung.
3. Generiere für jedes Listen-Element eine eindeutige id (z.B. "exp-1", "edu-2", "skill-3").
4. Generiere für jeden Bullet in experience[].description eine eindeutige id (z.B. "bullet-1-1").
5. Setze "version" auf "2.0".
6. Sortiere experience-Einträge absteigend nach Datum (neueste zuerst).
7. Pipe-Separator " I ": "Firma I Rolle" → company + role getrennt extrahieren.
8. Datumsspannen können auf zwei Zeilen stehen ("09.2025\\nHeute") — kombiniere zu "09.2025 - Heute".
9. role-Feld enthält NIE Datumsangaben. "Heute", "Present", "seit 2023" gehören in dateRangeText.
10. Zertifikate, Kurse, Lizenzen → certifications. NIEMALS in skills.

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
