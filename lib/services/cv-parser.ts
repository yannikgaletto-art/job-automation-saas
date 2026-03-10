
import { z } from 'zod';
import { complete } from '@/lib/ai/model-router';
import { CvStructuredData } from '@/types/cv';

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
  })).nullish(),
});


export async function parseCvTextToJson(text: string): Promise<CvStructuredData> {
  const prompt = `
Du bist ein präziser Daten-Extraktor für Lebensläufe.
Deine Aufgabe ist es, den folgenden rohen CV-Text in eine strikt strukturierte JSON-Repräsentation zu übersetzen.

**REGELN FÜR DIE EXTRAKTION:**
1. Erfinde KEINE Fakten ("No Hallucinations"). Wenn ein Feld im Text nicht existiert, lass es weg oder setze es auf null/leer.
2. Formuliere nichts um. Übernimm die Informationen so originalgetreu wie möglich.
3. **WICHTIG (IDs)**: Generiere für jedes Element in Listen (experience, education, skills, languages) eine eindeutige ID (z.B. "exp-1", "edu-2", "skill-3").
4. Generiere auch für JEDEN Bullet Point in \`experience[].description\` eine eindeutige ID (z.B. "bullet-1-1").
5. Setze "version" auf "2.0".
6. **CHRONOLOGICAL ORDER (CRITICAL):** Die \`experience\`-Einträge MÜSSEN nach Datum absteigend sortiert sein (neueste zuerst). "Heute"/"Present" = aktuellste Position = Array-Index 0. Achte auf korrekte Zuordnung: Jede Firma muss mit ihrem korrekten Datumsbereich verknüpft werden — NICHT einfach in der Reihenfolge des Textes übernehmen, sondern semantisch korrekt zuordnen.
7. **DATE-COMPANY MATCHING**: Lies den gesamten CV-Text zuerst vollständig, bevor du die Zuordnung machst. Stelle sicher, dass jede Firma/Rolle mit dem korrekten Datumsbereich (Start - Ende) verknüpft wird. Bei OCR-extrahiertem Text kann die Textreihenfolge FALSCH sein — prüfe die logische Konsistenz.

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
    { "id": "cert-1", "name": "...", "issuer": "...", "dateText": "...", "credentialUrl": "..." }
  ]
}

**CV TEXT ZUR EXTRAKTION:**
${text}
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

    const rawJson = JSON.parse(jsonMatch[0]);
    console.log('🔍 Parsed raw JSON from Claude successfully');

    // Verify strictly with Zod
    const validated = cvStructuredDataSchema.parse(rawJson);
    console.log('✅ Zod validation passed for structured CV data');

    // Post-processing: sort experience by end-date descending (newest first)
    // This is a safety net in case Claude returns entries in wrong order
    const sorted = {
      ...validated,
      experience: sortExperienceByDate(validated.experience),
    };

    return sorted as CvStructuredData;
  } catch (error: any) {
    console.error('❌ Failed to parse CV to JSON:', error.message);
    throw error;
  }
}

/**
 * Sort experience entries by end-date descending (newest first).
 * Handles: "09.2025 - Heute", "01/2023 - 12/2024", "2020 - 2022", "09.2025 - Present"
 * Falls back to original order if dates can't be parsed.
 */
function sortExperienceByDate(
  entries: Array<{ id: string; dateRangeText?: string | null;[key: string]: any }>
): typeof entries {
  const parseEndDate = (dateRange: string | null | undefined): number => {
    if (!dateRange) return 0;
    const lower = dateRange.toLowerCase().trim();

    // "Heute" / "Present" / "current" = far future
    if (/heute|present|current|aktuell/i.test(lower)) return 99999999;

    // Find the end part (after " - " or " – " or "–")
    const parts = dateRange.split(/\s*[-–]\s*/);
    const endPart = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();

    if (/heute|present|current|aktuell/i.test(endPart)) return 99999999;

    // Try MM.YYYY or MM/YYYY format
    const mmYyyy = endPart.match(/(\d{1,2})[./](\d{4})/);
    if (mmYyyy) return parseInt(mmYyyy[2]) * 100 + parseInt(mmYyyy[1]);

    // Try just YYYY
    const yyyy = endPart.match(/(\d{4})/);
    if (yyyy) return parseInt(yyyy[1]) * 100;

    return 0;
  };

  return [...entries].sort((a, b) => parseEndDate(b.dateRangeText) - parseEndDate(a.dateRangeText));
}
