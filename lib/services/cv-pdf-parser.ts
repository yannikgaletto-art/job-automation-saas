/**
 * cv-pdf-parser.ts
 *
 * EU-native CV parser. PDF goes directly to Mistral (Frankreich) — no OCR
 * heuristics, no PII tokenization, no Y-sort layout reconstruction.
 *
 * Pipeline:
 *   PDF → Mistral OCR (mistral-ocr-latest) → markdown
 *       → Mistral Medium parses markdown → JSON
 *
 * Replaces: extractTextWithAzure() + parseCvTextToJson() for the upload path.
 * Schema is shared with the legacy parser so downstream consumers are unchanged.
 */

import { cvStructuredDataSchema } from './cv-parser';
import type { CvStructuredData } from '@/types/cv';

const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
const OCR_MODEL = 'mistral-ocr-latest';
const PARSE_MODEL = 'mistral-medium-latest';

const PARSE_PROMPT = `Extrahiere die CV-Daten als JSON.

Schema:
{
  "version": "2.0",
  "personalInfo": { "name": "...", "email": "...", "phone": "...", "location": "...", "summary": "..." },
  "experience": [{ "id": "exp-1", "company": "...", "role": "...", "dateRangeText": "...", "location": "...", "description": [{ "id": "bullet-1-1", "text": "..." }] }],
  "education":  [{ "id": "edu-1", "institution": "...", "degree": "...", "dateRangeText": "...", "description": "...", "grade": "..." }],
  "skills":     [{ "id": "skill-1", "category": "...", "items": ["..."] }],
  "languages":  [{ "id": "lang-1", "language": "...", "proficiency": "..." }],
  "certifications": [{ "id": "cert-1", "name": "...", "issuer": "...", "dateText": "...", "description": "..." }]
}

Regeln:
- Wörtliche Übernahme — keine Umformulierung.
- Felder die im CV fehlen: null oder [].
- IDs: exp-1, edu-1, bullet-1-1, etc.
- experience absteigend nach Datum (neueste zuerst).
- dateRangeText: erstes Datum = Start, zweites = Ende. Beispiel "09.2025 - Heute". NIEMALS verkehrt herum.
- Section-Header (z.B. "Zertifikate", "Sprachen", "Berufserfahrung") sind KEINE Einträge.
- Pipe-Separator " I " oder " | ": linke Seite = Firma/Sprache, rechte = Rolle/Niveau.
- Bullets gehören zu der Station ÜBER ihnen — niemals zur folgenden.
- certifications[].description: ALLE nicht-leeren Zeilen direkt unter dem Zertifikatsnamen bis zur nächsten Zertifikats-Überschrift gehören in description (Plain-String, eine Zeile pro Zeilenumbruch "\n"). Auch wenn 3 oder mehr Stichpunkte stehen — alle übernehmen, niemals droppen. Section-Header wie "Zertifikate" sind KEINE Beschreibung.
- KONKRETES BEISPIEL für certifications[].description:
  Input:
    Managementberatung (Emory University)
    - Datenanalyse für unternehmerische Entscheidungen
    - Führung & Management
    - Strategisches und kritisches Denken
  Output: { "name": "Managementberatung", "issuer": "Emory University", "description": "Datenanalyse für unternehmerische Entscheidungen\nFührung & Management\nStrategisches und kritisches Denken" }
  ⚠️ description=null bei vorhandenen Bullets ist ein FEHLER.
- certifications[].issuer: nur dann setzen, wenn der Issuer in Klammern hinter dem Namen steht ("Managementberatung (Emory University)" → issuer="Emory University") ODER per " I "-Pipe danach ("TEDx-Coach I seit 2022 I Ehrenamtliche Tätigkeit" → issuer null oder "Ehrenamtliche Tätigkeit"). Wenn weder Klammer noch Pipe: issuer=null. NIEMALS die erste Beschreibungs-Zeile als issuer einsortieren — sie gehört dann in description.
- "Note: 1,3" oder "Note: X,Y" am Ende einer Cert-Beschreibung: behalte es in description. Nicht als eigenes Feld extrahieren.

OUTPUT: NUR das JSON-Objekt, kein Markdown, kein Kommentar.`;

export interface CvParseResult {
    structured: CvStructuredData;
    /** Mistral OCR markdown — used as extracted_text cache by callers. */
    markdown: string;
}

export async function parseCvFromPdf(pdfBuffer: Buffer): Promise<CvParseResult> {
    if (!MISTRAL_KEY) throw new Error('MISTRAL_API_KEY is not configured');

    const base64 = pdfBuffer.toString('base64');

    // Step 1: OCR — PDF → markdown
    const ocrRes = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OCR_MODEL,
            document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64}` },
        }),
    });
    if (!ocrRes.ok) {
        throw new Error(`Mistral OCR failed (${ocrRes.status}): ${(await ocrRes.text()).slice(0, 300)}`);
    }
    const ocrBody = await ocrRes.json() as { pages?: { markdown?: string }[] };
    const markdown = (ocrBody.pages || []).map(p => p.markdown || '').join('\n\n');
    if (!markdown || markdown.length < 100) {
        throw new Error(`Mistral OCR returned empty markdown (${markdown.length} chars)`);
    }

    // Step 2: Parse markdown → JSON
    const chatRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${MISTRAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: PARSE_MODEL,
            temperature: 0,
            max_tokens: 8000,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: PARSE_PROMPT },
                { role: 'user', content: `CV-TEXT (Mistral OCR Markdown):\n\n${markdown}` },
            ],
        }),
    });
    if (!chatRes.ok) {
        throw new Error(`Mistral parse failed (${chatRes.status}): ${(await chatRes.text()).slice(0, 300)}`);
    }
    const chatBody = await chatRes.json() as { choices?: { message?: { content?: string } }[] };
    const content = chatBody.choices?.[0]?.message?.content || '';

    let rawJson: any;
    try {
        rawJson = JSON.parse(content);
    } catch (e) {
        throw new Error(`Mistral returned invalid JSON: ${(e as Error).message}`);
    }

    // Soft-validate: same pattern as legacy parser. An LLM mis-typing one field
    // shouldn't kill the whole upload — the user reviews everything in the
    // confirm dialog anyway.
    const parseResult = cvStructuredDataSchema.safeParse(rawJson);
    if (parseResult.success) return { structured: parseResult.data as CvStructuredData, markdown };

    const issues = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    console.warn(`⚠️ [cv-pdf-parser] Zod partial validation — using raw JSON. Issues: ${issues}`);
    const fallback = {
        version: rawJson.version ?? '2.0',
        personalInfo: rawJson.personalInfo ?? {},
        experience: Array.isArray(rawJson.experience) ? rawJson.experience : [],
        education: Array.isArray(rawJson.education) ? rawJson.education : [],
        skills: Array.isArray(rawJson.skills) ? rawJson.skills : [],
        languages: Array.isArray(rawJson.languages) ? rawJson.languages : [],
        certifications: Array.isArray(rawJson.certifications) ? rawJson.certifications : [],
    } as CvStructuredData;
    return { structured: fallback, markdown };
}
