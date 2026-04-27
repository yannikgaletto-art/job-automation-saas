
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
  const { sanitized, restoreJson, warningFlags, tokenMap } = sanitizeForAI(text);
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
   - **WÖRTLICHE ÜBERNAHME — KEIN KÜRZEN:** Der Wert von \`role\` MUSS exakt der Berufsbezeichnung im CV-Text entsprechen. Wenn der Text "Sales & Business Development Manager" sagt, MUSS role = "Sales & Business Development Manager" — NIEMALS abkürzen zu "Sales & Manager", "BD Manager", "Manager" oder ähnlichen Vereinfachungen. Der gleiche Grundsatz gilt für \`company\`: vollständiger Firmenname aus dem Text, nicht selbst-verkürzt.
   - 2-Teile-Pattern: "Ingrano Solutions I AI Business Development Manager"
     → company: "Ingrano Solutions", role: "AI Business Development Manager"
   - 3-Teile-Pattern (Anstellungsart-Suffix): "Fraunhofer FOKUS I Innovation Consultant I Werkstudent"
     → company: "Fraunhofer FOKUS", role: "Innovation Consultant", summary: "Werkstudent"
   - 3-Teile-Pattern: "Medieninnovationszentrum I Projektleitung I Werkstudent"
     → company: "Medieninnovationszentrum", role: "Projektleitung", summary: "Werkstudent"
   - Anstellungsart-Tokens (Werkstudent, Intern, Praktikum, Trainee, Volontariat, Freelance) gehören NIEMALS in role — sie gehören in summary oder werden weggelassen.
   - Beispiel Sprachen: "Deutsch I Muttersprache" → language: "Deutsch", proficiency: "Muttersprache"
   - Das "I" als Trennzeichen gilt nur wenn es ALLEIN steht (Leerzeichen beiderseits).
   - NIEMALS nur den Teil vor oder nach dem "I" extrahieren — IMMER ALLE Teile auswerten.
   - PFLICHT: Bei mehrfachem Pipe MUSS company aus dem ersten Teil extrahiert werden — niemals null/leer lassen, wenn das erste Token erkennbar ein Firmenname ist.
10. **DATUM-REKONSTRUKTION (MEHRZEILIG):**
   - OCR liefert Start- und Enddatum oft auf GETRENNTEN Zeilen, z.B.: "09.2025\nHeute" oder "11.2023\n09.2025"
   - Diese MÜSSEN als "09.2025 - Heute" bzw. "11.2023 - 09.2025" kombiniert werden.
   - NIEMALS nur "Heute" oder nur "11.2023" als dateRangeText speichern — IMMER vollständige Spanne.
   - Wenn nach einer Jahreszahl eine weitere Jahreszahl oder "Heute"/"Present" auf der nächsten Zeile folgt: → kombiniere zu "START - END".
11. **ARBEITGEBER MIT BINDESTRICH-ABTEILUNG (FIRMA - ABTEILUNG):**
   - Format "FIRMA - ABTEILUNG" (kein Jobtitel vor dem Strich): company=FIRMA, role=ABTEILUNG.
   - Beispiel: "KPMG - Public Sector Consulting I Intern" → company: "KPMG", role: "Public Sector Consulting", summary: "Intern"
   - Beispiel: "KPMG - Central Services I Intern" → company: "KPMG", role: "Central Services", summary: "Intern"
   - AUSNAHME: Wenn der Teil VOR dem Strich ein Jobtitel ist (Co-Founder, CEO, Manager, Founder, Owner, Partner, Director, Lead): role=erster Teil, company=zweiter Teil.
   - Beispiel: "Co-Founder - Xorder Menues" → role: "Co-Founder", company: "Xorder Menues"
   - PFLICHT: company darf NIEMALS null/leer sein wenn ein Firmenname im Header erkennbar ist. Wenn unsicher: Setze company auf den vollständigen Header-Text vor der Datumsangabe — das ist besser als null.
11b. **EDUCATION — STUDIENGANG UND UNIVERSITÄT:**
   - degree: Übernimm den GENAUEN Studiengangsnamen aus dem CV — KEINE Umformulierung, KEINE Verkürzung, KEINE "Modernisierung".
   - VERBOTEN: "Business Innovation & Entrepreneurship" zu "Digital Strategy & Entrepreneurship" zu ändern (Halluzination).
   - VERBOTEN: "Europäische Medienwissenschaften" zu "Medien" zu verkürzen.
   - institution: PFLICHT-FELD wenn im CV erkennbar. Häufige deutsche Patterns:
     - "Studiengangsname (M.Sc.) BSP" → degree: "Studiengangsname (M.Sc.)", institution: "BSP"
     - "Studiengangsname (B.A.) Universität Potsdam" → degree: "Studiengangsname (B.A.)", institution: "Universität Potsdam"
     - "Universität/Hochschule/FH/TU [NAME]" am Zeilenende oder nach degree → das ist die institution.
   - NIEMALS institution null lassen wenn eine Bildungseinrichtung im Header oder direkt darunter steht.
12. **ZERTIFIKATE — OCR-MUSTER:**
   - Zeile 1: Zertifikatsname, ggf. mit Aussteller in Klammern oder nach "I"-Separator (z.B. "Design Thinking Coach (Hasso-Plattner-Institut)")
   - Zeile 2+: Komma-getrennte Kompetenzbereiche → das ist das "description"-Feld des Zertifikats
   - GRUPPIERTE INSTITUTION: Eine Zeile nur mit Institutionsname (z.B. "Universität Potsdam") gefolgt von mehreren Einzel-Einträgen mit Jahreszahl → ALLE sind separate Zertifikate mit issuer: "Universität Potsdam"
   - VOLLSTÄNDIGKEIT: Erfasse JEDES Zertifikat einzeln — keines darf fehlen oder übersprungen werden. Wenn die Zertifikate-Sektion 7 Einträge zeigt, MÜSSEN 7 Einträge im JSON erscheinen.
   - **KEIN VERSCHMELZEN:** Wenn zwei aufeinanderfolgende Zeilen wie "Cert A (Issuer X)" und "Cert B (Issuer Y)" auftreten, sind das ZWEI separate Zertifikate — nicht eines mit zusammengezogenem Namen.
   - **NAMEN WÖRTLICH:** cert.name wird wörtlich aus dem Text übernommen. Keine Vereinfachung, keine Umformulierung.
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

    // Phase 5.4 + 5.7 + 5.8 (2026-04-27): Tier-1 PII fallback. If the LLM
    // ignored the __NAME_0__ / __EMAIL_0__ / __PHONE_0__ tokens and emitted
    // personalInfo.{name,email,phone}=null directly, recover from tokenMap.
    // Pattern observed on Yannik's Exxeta CV: email + phone in raw text but
    // missing from rendered Optimizer output (Avenga job 04fce3f0 e2e).
    if (!rawJson.personalInfo) rawJson.personalInfo = {};

    // Helper: pick first token by prefix
    const pickToken = (prefix: string): string | null => {
      const key = Array.from(tokenMap.keys()).find((k) => k.startsWith(prefix));
      return key ? (tokenMap.get(key) ?? null) : null;
    };

    // Name: smart fallback — filter realistic person names, avoid institutional tokens.
    // Phase 8 (2026-04-27): expanded stop list to reject German common nouns and
    // city names that pass the TitleCase + TitleCase pattern. Real-world repro:
    // CV header "Exxeta 04.08.1996 in Berlin   Familienstatus: ledig" produced
    // "Berlin Familienstatus" as the picked name — both tokens are TitleCase, both
    // ≥3 chars, and the old INSTITUTIONAL_SUFFIX did not catch "Familienstatus".
    if (!rawJson.personalInfo.name) {
      const INSTITUTIONAL_SUFFIX = /\b(institute|institut|gmbh|ag|kg|se|inc|ltd|llc|corp|company|consulting|solutions|group|technologies|systems|labs|studios|partners|holdings|university|universität|hochschule|fachhochschule|akademie|college|school)\b/i;
      // Phase 8: German common-nouns / form-labels that often sit next to the
      // user's actual name in CV headers but aren't names themselves.
      const GERMAN_COMMON_NOUN = /\b(familienstatus|familienstand|geburtsdatum|geburtstag|geburtsort|geburtsname|anschrift|adresse|wohnort|wohnsitz|telefon|mobil|kontakt|email|e-mail|alter|nationalität|staatsangehörigkeit|personalien|persönliche|profil|lebenslauf|berufserfahrung|ausbildung|kenntnisse|sprachen|zertifikate)\b/i;
      // Phase 8: Major German cities (case-insensitive — "Berlin" alone is location not name).
      const GERMAN_CITY = /^(berlin|münchen|munchen|hamburg|köln|koeln|frankfurt|stuttgart|düsseldorf|duesseldorf|leipzig|bremen|hannover|hanover|essen|dortmund|nürnberg|nuernberg|dresden|bonn|mannheim|karlsruhe|wiesbaden|münster|muenster|aachen|braunschweig|kiel|chemnitz|magdeburg|freiburg|krefeld|halle|mainz|lübeck|luebeck|erfurt|rostock|kassel|potsdam|wien|zürich|zurich|bern|basel|genf|geneva|salzburg|innsbruck|graz|linz)\b/i;
      const PERSON_NAME_RE = /^[A-ZÄÖÜ][a-zäöüß]{2,}\s+[A-ZÄÖÜ][a-zäöüß]{2,}(\s+[A-ZÄÖÜ][a-zäöüß]+)*$/;

      const candidates = Array.from(tokenMap.entries())
        .filter(([k]) => k.startsWith('__NAME_'))
        .map(([, v]) => v)
        .filter((v) => {
          const trimmed = v.trim();
          if (!PERSON_NAME_RE.test(trimmed)) return false;
          if (INSTITUTIONAL_SUFFIX.test(trimmed)) return false;
          if (GERMAN_COMMON_NOUN.test(trimmed)) return false;
          // Reject if the FIRST token is a major German city (e.g. "Berlin Familienstatus")
          const firstToken = trimmed.split(/\s+/)[0];
          if (GERMAN_CITY.test(firstToken)) return false;
          return true;
        });

      if (candidates.length > 0) {
        rawJson.personalInfo.name = candidates[0];
        console.log(`🔧 [cv-parser] Tier-1 name fallback (smart) → "${rawJson.personalInfo.name}"`);
      } else {
        const fallback = pickToken('__NAME_');
        if (fallback) {
          rawJson.personalInfo.name = fallback;
          console.log(`🔧 [cv-parser] Tier-1 name fallback (last-resort) → "${rawJson.personalInfo.name}"`);
        }
      }
    }

    // Email: simple first-token fallback (emails are deterministic — no false positives)
    if (!rawJson.personalInfo.email) {
      const fallback = pickToken('__EMAIL_');
      if (fallback) {
        rawJson.personalInfo.email = fallback;
        console.log(`🔧 [cv-parser] Tier-1 email fallback → "${fallback}"`);
      }
    }

    // Phone: simple first-token fallback
    if (!rawJson.personalInfo.phone) {
      const fallback = pickToken('__PHONE_');
      if (fallback) {
        rawJson.personalInfo.phone = fallback;
        console.log(`🔧 [cv-parser] Tier-1 phone fallback → "${fallback}"`);
      }
    }
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

    // Languages: filter LLM output by whitelist; if that drops everything,
    // fall back to deterministic recovery from the raw OCR text.
    const filteredLanguages = (validated.languages ?? []).filter((l: any) => {
      const lang = (l.language || '').trim().toLowerCase();
      return lang.length > 0 && KNOWN_LANGUAGES.has(lang);
    });
    const languages = cleanLanguageProficiency(
      (filteredLanguages.length > 0
        ? filteredLanguages
        : recoverMissingLanguages(text)) as Array<{ proficiency?: string | null;[k: string]: any }>
    );

    // Certifications: clean section-header prefixes from `name`, then drop
    // entries whose name is JUST a section header, then drop project-like
    // names that the LLM mis-bucketed into certs, then sanitize issuer,
    // truncate descriptions at newline (next-cert-name absorption guard),
    // then run hallucination validation.
    const cleanedCerts = cleanCertificationNames(
      (validated.certifications ?? []) as Array<{ name?: string | null;[k: string]: any }>
    );
    const certsAfterNoise = cleanedCerts.filter((c: any) => {
      const name = (c.name || '').trim().toLowerCase();
      return name.length > 0 && !CERT_NOISE.has(name);
    });
    const certsAfterProjectDrop = dropProjectLikeCerts(certsAfterNoise);
    // Phase 6 (2026-04-27): roundtrip recovery against raw cert section.
    // Adds raw-only candidates (e.g. "Managementberatung (Emory University)")
    // and corrects hallucinated issuers when raw disagrees clearly.
    const certsAfterRoundtrip = recoverCertsFromRawSection(certsAfterProjectDrop, text);
    const certifications = validateDescriptionsAgainstRawText(
      truncateCertDescriptionAtNewline(
        sanitizeCertIssuer(
          certsAfterRoundtrip as Array<{ issuer?: string | null;[k: string]: any }>
        ) as Array<{ description?: string | null;[k: string]: any }>
      ),
      text
    );

    const sorted = {
      ...validated,
      // The LLM occasionally drops `company` even when the OCR text shows
      // "Firma I Rolle" or "Co-Founder - Firma" cleanly on one line. Recover
      // deterministically from the original text before downstream consumers
      // see the gap.
      experience: dropExperienceDuplicatedAsCert(
        recoverMissingExperienceStation(
          recoverMissingExperienceCompany(
            sortExperienceByDate(
              (validated.experience ?? []).map((e: any) => ({
                ...e,
                role: stripRoleDateMarkers(e.role),
              }))
            ) as Array<{ role?: string | null; company?: string | null; [k: string]: any }>,
            text
          ),
          text
        ),
        certifications,
      ),
      // Same drop pattern for education.institution when "Studiengang (X.Y.) Universität ..." sits on one line.
      // validateDescriptionsAgainstRawText drops fully-fabricated descriptions.
      // Phase 5.2 (2026-04-27): recoverMissingEducationDescription restores bullet
      // lists that the LLM dropped when present in the raw text.
      // Phase 8 (2026-04-27): stripGradeFromEducationDescription cleans
      // "Abschlussnote: X,Y" lines out of description (they belong in `grade`).
      education: stripGradeFromEducationDescription(
        validateDescriptionsAgainstRawText(
          recoverMissingEducationDescription(
            recoverMissingEducationInstitution(
              (validated.education ?? []) as Array<{ degree?: string | null; institution?: string | null; description?: string | null; [k: string]: any }>,
              text
            ) as Array<{ degree?: string | null; description?: string | null; [k: string]: any }>,
            text
          ) as Array<{ description?: string | null; [k: string]: any }>,
          text
        )
      ),
      // Skills: strip literal `\n` artefacts from category — observed pattern
      // "IT-Kenntnisse\n\nProgrammierkenntnisse" after Phase-3.1 re-upload.
      // Then split groups whose items contain `\n` (sub-section headers stuck
      // inside item strings, e.g. "Bubble\nAdobe" → split into 2 groups).
      skills: splitMergedSkillGroups(
        cleanSkillCategories(
          (validated.skills ?? []) as Array<{ category?: string | null;[k: string]: any }>
        ) as Array<{ id?: string; category?: string | null; items?: string[];[k: string]: any }>
      ),
      languages,
      certifications,
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

/**
 * Fuzzy role-token check: returns true if all "content tokens" (≥3 chars) of
 * `role` appear in `candidate` (case-insensitive substring). This handles
 * the LLM-truncation case where parser shortened "Sales & Business Development
 * Manager" → "Sales & Manager" and the exact-match recovery missed it.
 *
 * Examples (true):
 *   role="Sales & Manager", candidate="Sales & Business Development Manager"
 *   role="Innovation Consultant", candidate="Innovation Management Consultant"
 *   role="Co-Founder", candidate="Co-Founder & Product Owner"
 * Examples (false):
 *   role="Designer", candidate="Manager"  — zero token overlap
 */
export function rolesAreFuzzyEqual(role: string, candidate: string): boolean {
  const tokenize = (s: string) =>
    s.toLowerCase().split(/[\s,/&|]+/).filter((t) => t.replace(/[^a-z0-9-]/g, '').length >= 3);
  const roleTokens = tokenize(role);
  const candTokens = tokenize(candidate);
  if (roleTokens.length === 0 || candTokens.length === 0) return false;
  if (role.trim().toLowerCase() === candidate.trim().toLowerCase()) return true;
  const candLower = candidate.toLowerCase();
  const matched = roleTokens.filter((t) => candLower.includes(t)).length;

  // Phase 5.6 (2026-04-27): Job-prefix bonus. If both role and candidate start
  // with the same job-title prefix (Co-Founder, CEO, Manager etc.), accept the
  // match even at lower token-overlap — the LLM can hallucinate suffixes
  // ("Co-Founder & Product Owner" vs "Co-Founder & CEO") but the canonical
  // role identity is encoded in the prefix.
  const JOB_PREFIXES = ['co-founder', 'cofounder', 'founder', 'ceo', 'cto', 'cfo', 'coo', 'cmo'];
  const roleLower = role.trim().toLowerCase();
  const sharedPrefix = JOB_PREFIXES.find((p) => roleLower.startsWith(p) && candidate.trim().toLowerCase().startsWith(p));
  if (sharedPrefix && matched >= 1) return true;

  return roleTokens.length === 1
    ? matched === 1
    : matched >= Math.ceil(roleTokens.length * 0.75);
}

/**
 * Welle A.5 + Phase 5.1 (2026-04-27): If the LLM dropped `experience[].company`
 * OR truncated `experience[].role`, search the raw text for "Firma I role" or
 * "JobTitle - Firma" patterns and restore both fields from the rawText.
 *
 * Phase 5.1 upgrade: matches roles by FUZZY token overlap (≥75%) instead of
 * exact equality, so role-truncation no longer breaks recovery. Restores the
 * FULL role string from rawText whenever fuzzy match is positive — the rawText
 * is the source of truth.
 *
 * Idempotent: experience entries that already have BOTH role and company
 * matching the rawText are untouched.
 * Exported for testing.
 */
export function recoverMissingExperienceCompany<T extends { role?: string | null; company?: string | null }>(
  experience: T[],
  rawText: string
): T[] {
  const ROLE_PREFIXES = new Set([
    'co-founder', 'cofounder', 'founder', 'gründer', 'mitgründer',
    'ceo', 'cto', 'cfo', 'coo', 'cmo',
    'manager', 'director', 'lead', 'head', 'partner', 'owner',
    'consultant', 'berater', 'analyst', 'praktikant', 'intern',
  ]);

  const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  return experience.map((entry) => {
    const role = (entry.role || '').trim();
    const company = (entry.company || '').trim();
    if (role.length === 0) return entry;
    // Fast-path: both fields present and exact-match in rawText → no-op.
    if (company.length > 0 && rawText.toLowerCase().includes(role.toLowerCase())) return entry;

    for (const line of lines) {
      // Pattern A: "<COMPANY> I <ROLE>" or "<COMPANY> | <ROLE>"
      const parts = line.split(/\s+[I|]\s+/);
      if (parts.length >= 2) {
        const roleIdx = parts.findIndex((p) => rolesAreFuzzyEqual(role, p));
        if (roleIdx > 0) {
          const companyCandidate = parts[0].trim();
          const fullRole = parts[roleIdx].trim();
          if (isPlausibleCompanyToken(companyCandidate)) {
            const patched: T = { ...entry };
            if (company.length === 0) (patched as { company?: string | null }).company = companyCandidate;
            if (fullRole.length > role.length) (patched as { role?: string | null }).role = fullRole;
            return patched;
          }
        }
      }

      // Pattern B: "<JOBTITLE> - <COMPANY>" — role contains a known job-title prefix.
      const roleLower = role.toLowerCase();
      const startsWithRolePrefix = Array.from(ROLE_PREFIXES).some(
        (p) => roleLower === p || roleLower.startsWith(p + ' ') || roleLower.startsWith(p + ' &') || roleLower.startsWith(p + '-')
      );
      if (startsWithRolePrefix) {
        const dashSplit = line.split(/\s+-\s+/);
        if (dashSplit.length >= 2) {
          const before = dashSplit[0].trim();
          const beforeNoDate = before.replace(/^\d{1,2}[./]\d{4}\s+/, '').trim();
          if (rolesAreFuzzyEqual(role, beforeNoDate)) {
            const companyCandidate = dashSplit[1].trim();
            if (isPlausibleCompanyToken(companyCandidate)) {
              const patched: T = { ...entry };
              if (company.length === 0) (patched as { company?: string | null }).company = companyCandidate;
              if (beforeNoDate.length > role.length) (patched as { role?: string | null }).role = beforeNoDate;
              return patched;
            }
          }
        }
      }
    }
    return entry;
  });
}

/**
 * Phase 5.2 (2026-04-27): If `education[].description` is null/empty BUT the
 * raw text shows a bullet list directly under the degree line, restore those
 * bullets as the description. Yannik's AI TI CV regression: Bachelor entry
 * had "- Medienrecht und Kulturökonomie / - Medienanalyse... / - Interkulturelle Kompetenz"
 * in the raw text but description was null in the parser output.
 *
 * Strategy: locate degree in raw text; walk forward; collect consecutive lines
 * starting with bullet markers ("- ", "• ", "– ", "* "); stop on next heading
 * line, blank line + non-bullet, or after 8 bullets max. Returns trimmed multi-line
 * string. Conservative — does NOT add prose paragraphs, only bullet lists.
 *
 * Idempotent: education entries with non-empty description are untouched.
 * Exported for testing.
 */
export function recoverMissingEducationDescription<T extends { degree?: string | null; description?: string | null }>(
  education: T[],
  rawText: string
): T[] {
  const BULLET_RE = /^\s*[-•–*]\s+(.+?)\s*$/;
  const lines = rawText.split('\n');

  return education.map((entry) => {
    const degree = (entry.degree || '').trim();
    const desc = typeof entry.description === 'string' ? entry.description.trim() : '';
    if (desc.length > 0 || degree.length === 0) return entry;

    // Find the line containing the degree. Use case-insensitive substring on first 30 chars
    // to tolerate minor LLM normalization (e.g. trailing whitespace differences).
    const degreeKey = degree.slice(0, 30).toLowerCase();
    const degreeLineIdx = lines.findIndex((l) => l.toLowerCase().includes(degreeKey));
    if (degreeLineIdx === -1) return entry;

    // Phase 8 (2026-04-27): grade-line patterns that must NOT be absorbed as a bullet.
    // Repro: Yannik's M.Sc. description ended up with "- Abschlussnote: 1,3" as the
    // first bullet AND a separate bold grade line above — duplicate render. The grade
    // belongs in education[].grade, not in description[].
    const GRADE_LINE_RE = /^\s*[-•–*]?\s*(abschlussnote|note|grade|gpa|gesamtnote|durchschnittsnote)\s*:/i;

    // Walk forward up to 12 lines, collecting consecutive bullets.
    // Non-bullet lines are tolerated BEFORE bullets are seen (e.g. "Abschlussnote: 1,3"
    // sits between degree line and the bullet list). Once bullets start, a non-bullet
    // line ends the collection. Hard-stop at the next markdown section header.
    const collected: string[] = [];
    let sawBullet = false;
    for (let i = degreeLineIdx + 1; i < Math.min(lines.length, degreeLineIdx + 13); i++) {
      const line = lines[i];
      if (line.trim().startsWith('##')) break; // markdown section change
      // Phase 8: skip grade lines whether they're bullet-prefixed or not.
      if (GRADE_LINE_RE.test(line)) continue;
      const m = line.match(BULLET_RE);
      if (m) {
        collected.push(m[1].trim());
        sawBullet = true;
        if (collected.length >= 8) break;
        continue;
      }
      if (sawBullet) break;
    }

    if (collected.length === 0) return entry;
    return { ...entry, description: collected.join('\n') };
  });
}

/**
 * Recovers `education[].institution` when missing. Pattern observed on
 * Yannik's CV: "Europäische Medienwissenschaften (B.A.) Universität Potsdam"
 * — degree + institution on one OCR line, LLM keeps degree but drops institution.
 *
 * Strategy: find the degree string in raw text; the trailing chunk after the
 * last "(X.Y.)" or after the degree's last word is the institution candidate.
 * Conservative: only recovers when the candidate looks like a university name.
 */
export function recoverMissingEducationInstitution<T extends { degree?: string | null; institution?: string | null }>(
  education: T[],
  rawText: string
): T[] {
  const UNI_HINTS = /(universität|hochschule|fachhochschule|\bfh\b|\btu\b|\buni\b|university|institute|akademie|college|school|school of|escuela|universidad|universidade)/i;

  return education.map((entry) => {
    const degree = (entry.degree || '').trim();
    const inst = (entry.institution || '').trim();
    if (inst.length > 0 || degree.length === 0) return entry;

    // Find degree in raw text, then look at the rest of that line.
    const idx = rawText.indexOf(degree);
    if (idx === -1) return entry;
    const lineEnd = rawText.indexOf('\n', idx);
    const tail = rawText.slice(idx + degree.length, lineEnd === -1 ? rawText.length : lineEnd).trim();
    if (tail.length === 0 || tail.length > 120) return entry;
    if (!UNI_HINTS.test(tail) && !/[A-Z]{2,}/.test(tail)) return entry; // BSP, MIT etc are all-caps acronyms
    return { ...entry, institution: tail };
  });
}

/**
 * Recovers `languages[]` when the LLM emitted an empty array even though a
 * Languages section is clearly present in the OCR text. Observed pattern in
 * Phase-3.1 re-upload run: 4 sauber strukturierte Einträge (Deutsch, Englisch,
 * Französisch, Spanisch) ALLE übersprungen.
 *
 * Strategy:
 *   1. Locate a Languages section header (de/en/es) in the raw text.
 *   2. Walk subsequent lines until a likely next-section header or EOF.
 *   3. For each line, parse "<Language> [I|||—|-|:] <Proficiency>" or
 *      "<Language> (<Proficiency>)" or just "<Language>".
 *   4. Filter by KNOWN_LANGUAGES whitelist (same defense-in-depth as before).
 *   5. Generate stable ids ("lang-recovered-1", ...).
 *
 * Idempotent only at the input level: returning [] when no section is found
 * means the caller can fall back to the LLM result. Caller must decide whether
 * to invoke this recovery (typically: only if the filtered LLM list is empty).
 * Exported for testing.
 */
export function recoverMissingLanguages(rawText: string): Array<{
  id: string;
  language: string;
  proficiency: string | null;
}> {
  // Allow leading markdown markers (#, ##, ###) and optional trailing colon —
  // the OCR text often comes through with markdown-style section headers.
  const SECTION_HEADERS = /^#{0,3}\s*(sprachen|languages|idiomas|sprachkenntnisse|language skills)\s*:?\s*$/i;
  const STOP_HEADERS = /^#{0,3}\s*(zertifikate|zertifizierungen|certifications|certificates|berufserfahrung|experience|bildung|ausbildung|education|skills|kenntnisse|interessen|hobbys|hobbies|projekte|projects|references|referenzen|weiterbildungen?|publikationen|publications)\s*:?\s*$/i;
  const lines = rawText.split('\n');

  // 1. Find the Languages section start.
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SECTION_HEADERS.test(lines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return [];

  const recovered: Array<{ id: string; language: string; proficiency: string | null }> = [];
  // 2. Walk lines until next section, EOF, or 20-line defensive cap.
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 20); i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    if (STOP_HEADERS.test(line)) break;

    // 3. Parse separator patterns. Order matters: try the most specific first.
    let language = '';
    let proficiency: string | null = null;

    // Pattern A: "Deutsch (C2)" or "English (Native)" — parens-style.
    const parensMatch = line.match(/^([A-Za-zÀ-ÿ]+)\s*\(([^)]+)\)\s*$/);
    if (parensMatch) {
      language = parensMatch[1].trim();
      proficiency = parensMatch[2].trim();
    } else {
      // Pattern B: pipe / dash / em-dash separator (require space both sides —
      // capital "I" is Azure DI's typographic-pipe replacement).
      let parts = line.split(/\s+[I|—–\-]\s+/);
      // Pattern C: colon separator (allow no leading whitespace, e.g. "Deutsch: Muttersprache").
      if (parts.length < 2) {
        parts = line.split(/\s*:\s+/);
      }
      if (parts.length >= 2) {
        language = parts[0].trim();
        proficiency = parts.slice(1).join(' ').trim() || null;
      } else {
        // Pattern D: bare language name on its own line.
        language = line;
      }
    }

    // 4. Whitelist filter — reject anything that isn't a known language.
    const lower = language.toLowerCase();
    if (!KNOWN_LANGUAGES.has(lower)) continue;
    // Dedup: if we already recovered this language, skip.
    if (recovered.some((r) => r.language.toLowerCase() === lower)) continue;

    recovered.push({
      id: `lang-recovered-${recovered.length + 1}`,
      language,
      proficiency,
    });
  }

  return recovered;
}

/**
 * Cleans Skills categories that contain literal `\n` characters from the LLM
 * concatenating a section header with the actual category. Observed pattern:
 *   { category: "IT-Kenntnisse\n\nProgrammierkenntnisse", items: ["Python", ...] }
 *
 * Strategy: split category on `\n`, take the first non-empty line. The
 * subsequent lines (if any) are typically section noise that the user can
 * recover via the optimizer UI; preserving them in items[] would corrupt the
 * downstream filter chain.
 *
 * Idempotent: a category without `\n` is returned untouched.
 * Exported for testing.
 */
export function cleanSkillCategories<T extends { category?: string | null;[k: string]: any }>(
  skills: T[]
): T[] {
  return skills.map((skill) => {
    const category = (skill.category || '').toString();
    if (!category.includes('\n')) return skill;
    const firstNonEmpty = category
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    return { ...skill, category: firstNonEmpty ?? null };
  });
}

/**
 * Section-header tokens that occasionally leak into `certifications[].name`
 * when the LLM concatenates a header line with the first cert. Lowercased.
 */
const CERT_SECTION_HEADERS = new Set<string>([
  'zertifikate', 'zertifizierungen', 'zertifizierung',
  'certificates', 'certifications', 'certification',
  'certificados', 'certificaciones',
  'weiterbildungen', 'weiterbildung', 'fortbildungen',
  'kurse', 'courses', 'cursos',
]);

/**
 * Strips a leading section-header line from `cert.name` when the LLM produced
 * something like "Zertifikate\nManagementberatung". Conservative: only strips
 * when the first line matches the known CERT_SECTION_HEADERS set.
 *
 * Idempotent: a name without `\n` or without a header prefix is untouched.
 * Exported for testing.
 */
export function cleanCertificationNames<T extends { name?: string | null;[k: string]: any }>(
  certs: T[]
): T[] {
  return certs.map((cert) => {
    const name = (cert.name || '').toString();
    if (!name.includes('\n')) return cert;
    const lines = name.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return cert;
    if (CERT_SECTION_HEADERS.has(lines[0].toLowerCase())) {
      const rest = lines.slice(1).join(' ').trim();
      if (rest.length > 0) return { ...cert, name: rest };
    }
    // Even if the first line is not a section header, collapse the multi-line
    // name to its first non-empty line — `\n` in a cert name is always wrong.
    return { ...cert, name: lines[0] };
  });
}

/**
 * Status-words that occasionally appear as `cert.issuer` when the LLM
 * misclassifies an annotation. Observed: "TEDx Coaching" cert had
 * issuer="Ehrenamtliche Tätigkeit" — a status, not an organization. Lowercased.
 */
const ISSUER_NOISE = new Set<string>([
  'ehrenamtliche tätigkeit', 'ehrenamtliche tatigkeit',
  'ehrenamt', 'ehrenamtlich',
  'freiwilligenarbeit', 'freiwillig',
  'werkstudent', 'praktikum', 'praktikant',
  'volontariat', 'trainee',
  'hobby', 'hobbys', 'hobbies', 'interesse', 'interessen',
  'voluntary work', 'volunteer work', 'volunteer', 'volunteering',
  'internship', 'intern',
  'voluntariado',
]);

/**
 * Drops `cert.issuer` when its value is a status-word rather than a real
 * organization name. Idempotent. Exported for testing.
 */
export function sanitizeCertIssuer<T extends { issuer?: string | null;[k: string]: any }>(
  certs: T[]
): T[] {
  return certs.map((cert) => {
    const issuer = (cert.issuer || '').toString().trim().toLowerCase();
    if (issuer.length === 0) return cert;
    if (ISSUER_NOISE.has(issuer)) {
      return { ...cert, issuer: null };
    }
    return cert;
  });
}

/**
 * Drops cert entries whose `name` is actually a project description rather
 * than a real certificate name. Observed pattern on Yannik's CV:
 *   { name: "Projekt- ZF Getriebe Brandenburg GmbH HR- Transformation & Organisationsentwicklung", ... }
 * — the LLM bucketed a project entry into certifications.
 *
 * Reject signals:
 *   (a) name starts with "Projekt" / "Projekt-" / "Projekt:" — German project prefix
 *   (b) name has >6 words AND contains a company-suffix token (GmbH/AG/KG/SE/Inc/Ltd/LLC)
 *   — real cert names are short and never carry company suffixes
 *
 * Exported for testing.
 */
export function dropProjectLikeCerts<T extends { name?: string | null;[k: string]: any }>(
  certs: T[]
): T[] {
  const COMPANY_SUFFIX = /\b(GmbH|AG|KG|SE|Inc\.?|Ltd\.?|LLC|SA|S\.?A\.?|B\.?V\.?|N\.?V\.?)\b/;
  return certs.filter((cert) => {
    const name = (cert.name || '').toString().trim();
    if (name.length === 0) return false;
    if (/^Projekt[\s\-:]/i.test(name)) return false;
    const wordCount = name.split(/\s+/).length;
    if (wordCount > 6 && COMPANY_SUFFIX.test(name)) return false;
    return true;
  });
}

/**
 * Truncates `cert.description` at the first newline. The LLM sometimes
 * absorbs the next certificate's name (or a sub-track header) into the
 * preceding description. Observed pattern:
 *   { description: "Datenanalyse für unternehmerische Entscheidungen...\nDesign Thinking Coach" }
 * — "Design Thinking Coach" is the NEXT cert, not a description continuation.
 *
 * Conservative: keep only text up to the first `\n`. Idempotent.
 * Exported for testing.
 */
export function truncateCertDescriptionAtNewline<
  T extends { description?: string | null;[k: string]: any }
>(certs: T[]): T[] {
  return certs.map((cert) => {
    const desc = (cert.description || '').toString();
    if (!desc.includes('\n')) return cert;
    const firstChunk = desc.split('\n')[0].trim();
    return { ...cert, description: firstChunk.length > 0 ? firstChunk : null };
  });
}

/**
 * Splits a single merged skill group into multiple groups when individual
 * items contain newlines that should have been section-header breaks.
 * Observed pattern on Yannik's CV:
 *   { category: "IT-Kenntnisse", items: ["Python", "Bubble\nAdobe", "Lightroom\nMicrosoft", ...] }
 * The "\n" inside an item marks where a new sub-section header began in the
 * source text but the LLM concatenated it onto the preceding item.
 *
 * Strategy: scan each item; when one contains `\n`, the substring BEFORE
 * the `\n` finishes the current group, and the substring AFTER becomes the
 * category header of a new (initially empty) group. Subsequent items belong
 * to that new group until the next `\n`. Empty groups (header with no
 * items, e.g. when two `\n`-splits occur back-to-back) are dropped.
 *
 * Idempotent: a group with no `\n` items is returned unchanged.
 * Exported for testing.
 */
export function splitMergedSkillGroups<
  T extends { id?: string; category?: string | null; items?: string[]; [k: string]: any }
>(skills: T[]): T[] {
  const result: T[] = [];
  for (const group of skills) {
    const items = group.items ?? [];
    const baseId = group.id ?? 'skill';
    let currentCategory = group.category ?? null;
    let currentItems: string[] = [];
    let splitIndex = 0;

    const flush = () => {
      if (currentItems.length === 0) return;
      result.push({
        ...group,
        id: splitIndex === 0 ? baseId : `${baseId}-split-${splitIndex}`,
        category: currentCategory,
        items: currentItems,
      });
      splitIndex++;
    };

    for (const item of items) {
      if (typeof item === 'string' && item.includes('\n')) {
        // Preserve every fragment (including empty ones) so boundary count is faithful.
        const parts = item.split('\n').map((p) => p.trim());
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (i === 0) {
            // First fragment extends the current group (if non-empty).
            if (part.length > 0) currentItems.push(part);
          } else {
            // Each subsequent fragment is a boundary: flush current group,
            // start a new one with this part as the category header.
            flush();
            currentCategory = part.length > 0 ? part : null;
            currentItems = [];
          }
        }
      } else if (typeof item === 'string') {
        currentItems.push(item);
      }
    }
    flush();
  }
  return result;
}

/**
 * Strips a leading separator artifact ("I ", "| ", "— ", "– ", "- ", ": ")
 * from `proficiency` when the LLM mis-parsed an OCR pipe character as the
 * first token of the value. Observed on Yannik's CV where Azure DI emits
 * "Deutsch I Muttersprache" — the LLM sometimes copies the "I" into
 * proficiency instead of using it as a separator.
 *
 * Idempotent: a clean proficiency value is untouched. Exported for testing.
 */
export function cleanLanguageProficiency<
  T extends { proficiency?: string | null; [k: string]: any }
>(languages: T[]): T[] {
  return languages.map((lang) => {
    const prof = (lang.proficiency || '').toString();
    if (prof.length === 0) return lang;
    // Strip leading "I ", "| ", em/en-dash, plain dash, or colon followed by whitespace.
    // Capital "I" only when followed by a space (so "Italian" stays intact).
    const cleaned = prof.replace(/^([I|—–\-:])\s+/, '').trim();
    if (cleaned === prof) return lang;
    return { ...lang, proficiency: cleaned.length > 0 ? cleaned : null };
  });
}

/**
 * Drops `item.description` when no 5-consecutive-word window from the
 * description appears in rawText. This catches fully-fabricated descriptions
 * emitted by the LLM for certs/education entries that have no description text
 * in the original PDF (e.g. "TEDx-Coach / seit 2022" → LLM invents two
 * sentences about coaching methodology).
 *
 * Rationale for 5-word threshold: too short and legitimate paraphrasing trips
 * it; 5+ words is specific enough to be a real trace in the source text.
 *
 * Edge cases:
 *   - description shorter than 5 words → use 3-word window (catches short
 *     but real extracts like "Zertifizierter Design Thinking Coach")
 *   - rawText shorter than 50 chars → no context to validate, keep all
 *   - empty description → untouched
 *
 * Applied to cert.description and education[].description only. Experience
 * bullets are handled separately by the optimizer. Exported for testing.
 */
export function validateDescriptionsAgainstRawText<
  T extends { description?: string | null; [k: string]: any }
>(items: T[], rawText: string): T[] {
  if (rawText.length < 50) return items;
  // Welle F (2026-04-27): normalise whitespace + bullet-prefixes on BOTH sides
  // before substring match. Education description recovery (Phase 5.2) writes
  // the text WITH bullet prefixes; raw OCR text uses newlines as separators.
  // Without normalisation, "- module a - module b" never matches "module a\n
  // module b" verbatim, and the validator falsely drops legitimate recoveries.
  const normaliseForMatch = (s: string) => s
    .toLowerCase()
    .replace(/[\-•*–]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lowerRaw = normaliseForMatch(rawText);
  return items.map((item) => {
    const desc = (item.description || '').trim();
    if (desc.length === 0) return item;
    const stripped = normaliseForMatch(desc);
    const words = stripped.split(/\s+/).filter((w) => w.length > 1);
    const windowSize = words.length >= 5 ? 5 : words.length >= 3 ? 3 : 0;
    if (windowSize === 0) return item; // too short to validate
    for (let i = 0; i <= words.length - windowSize; i++) {
      const window = words.slice(i, i + windowSize).join(' ');
      if (lowerRaw.includes(window)) return item;
    }
    return { ...item, description: null };
  });
}

/**
 * Heuristic: does this token look like a real company/organisation name?
 * Rejects pure date fragments, pure numbers, common header words.
 */
function isPlausibleCompanyToken(token: string): boolean {
  if (token.length < 2 || token.length > 80) return false;
  if (/^\d{2,}\.?\d*$/.test(token)) return false; // dates / numbers only
  const lower = token.toLowerCase();
  const NOISE = new Set([
    'heute', 'present', 'aktuell', 'laufend', 'now', 'current',
    'berufserfahrung', 'experience', 'bildungsweg', 'education',
    'werkstudent', 'intern', 'praktikum', 'trainee', 'volontariat', 'freelance',
  ]);
  if (NOISE.has(lower)) return false;
  // Reject if token is JUST a job-status word
  return true;
}

/**
 * Phase 8 (2026-04-27) — strip "Abschlussnote: X,Y" / "Note: X,Y" lines from
 * education[].description AND extract them into education[].grade if grade is
 * missing. Repro: Yannik's M.Sc. ended up with "Abschlussnote: 1,3" both as a
 * bold prefix line AND as the first description bullet, while education[].grade
 * was null — render duplicated the value visibly.
 *
 * Idempotent. Pure function. Exported for testing.
 */
export function stripGradeFromEducationDescription<
  T extends { description?: string | null; grade?: string | null;[k: string]: any }
>(education: T[]): T[] {
  const GRADE_LINE_RE = /^\s*[-•–*]?\s*(?:abschlussnote|note|grade|gpa|gesamtnote|durchschnittsnote)\s*:\s*([^\n]+?)\s*$/i;
  return education.map((entry) => {
    const desc = typeof entry.description === 'string' ? entry.description : '';
    if (desc.length === 0) return entry;
    let extractedGrade: string | null = null;
    const cleaned = desc
      .split('\n')
      .filter((line) => {
        const m = line.match(GRADE_LINE_RE);
        if (m) {
          if (!extractedGrade) extractedGrade = m[1].trim();
          return false; // drop the grade line
        }
        return true;
      })
      .join('\n')
      .trim();
    const next: T = { ...entry, description: cleaned.length > 0 ? cleaned : null };
    if (extractedGrade && !((entry.grade || '').toString().trim().length > 0)) {
      next.grade = extractedGrade;
    }
    return next;
  });
}

/**
 * Phase 6 (2026-04-27) — Cert-Roundtrip-Recovery
 *
 * The LLM-parsed certifications array is often incomplete or misattributed
 * relative to the raw OCR text. Observed defects on Yannik's Exxeta CV:
 *   - "Managementberatung (Emory University)" present in raw, absent in output
 *   - "Universität Potsdam: Projektmanagement (2022) ..." present in raw,
 *     only 3 of 4 sub-courses recovered into the array
 *   - Output cert "HR-Transformation" had issuer "ZF Friedrichshafen AG"
 *     while raw clearly said "ZF Getriebe Brandenburg GmbH"
 *
 * Strategy (CONSERVATIVE — false-positive drop is worse than false-negative keep):
 *   1. Walk the cert section in raw text, extract candidate certs by 3 patterns:
 *      A. "Name (Issuer)" — parens-style
 *      B. "Name I Date I Issuer" — pipe-separated
 *      C. "Issuer: Subj (Year) Subj (Year) ..." — multi-subject group
 *   2. For each existing output cert, find the best raw candidate by token-overlap:
 *      - High overlap (>=0.6) → keep cert; correct issuer if raw issuer differs and
 *        the existing issuer has zero token overlap with the raw one (likely halluc).
 *      - Low overlap → keep unchanged (we do NOT drop hallucinated certs here).
 *   3. For each unmatched raw candidate, ADD it as a new cert.
 *
 * Idempotent. Pure function. Exported for testing.
 */
interface CertCandidate {
  name: string;
  issuer: string | null;
  dateText: string | null;
}

function isCertSectionHeader(line: string): boolean {
  return /^#{0,3}\s*(zertifikate|zertifizierungen|certifications|certificates|weiterbildungen|weiterbildung|fortbildungen|kurse|courses|cursos|certificados)\s*:?\s*$/i.test(line);
}

function isCertStopHeader(line: string): boolean {
  return /^#{0,3}\s*(sprachen|languages|idiomas|sprachkenntnisse|berufserfahrung|experience|bildung|ausbildung|education|skills|kenntnisse|interessen|hobbys|hobbies|projekte|projects|references|referenzen|publikationen|publications|persönliche|personal)\s*:?\s*$/i.test(line);
}

export function extractCertSectionLines(rawText: string): string[] {
  if (!rawText || rawText.length < 50) return [];
  const lines = rawText.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isCertSectionHeader(lines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return [];
  const out: string[] = [];
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 30); i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    if (isCertStopHeader(line)) break;
    out.push(line);
  }
  return out;
}

export function extractCertCandidates(lines: string[]): CertCandidate[] {
  const out: CertCandidate[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length < 4) continue;
    if (/^\d+$/.test(line)) continue;

    // Pattern C: Multi-subject "Issuer: Subj1 (Year1) Subj2 (Year2) ..."
    // Only triggers when colon is followed by >=2 (Year)-units.
    const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch) {
      const issuer = colonMatch[1].trim();
      const rest = colonMatch[2];
      const yearMatches = [...rest.matchAll(/([^()]+?)\s*\((\d{4})\)/g)];
      if (yearMatches.length >= 2) {
        for (const m of yearMatches) {
          const subjName = m[1].trim().replace(/^[,;]\s*/, '').trim();
          if (subjName.length === 0) continue;
          out.push({ name: subjName, issuer, dateText: m[2] });
        }
        continue;
      }
    }

    // Pattern A: "Name (Issuer)" or "Name (Year)"
    const parensMatch = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parensMatch) {
      const name = parensMatch[1].trim();
      const inside = parensMatch[2].trim();
      if (/^\d{4}$/.test(inside)) {
        out.push({ name, issuer: null, dateText: inside });
      } else {
        out.push({ name, issuer: inside, dateText: null });
      }
      continue;
    }

    // Pattern B: pipe-separated "Name I [Date] I [Issuer]"
    // Capital "I" is Azure DI's pipe-replacement; pipe also possible.
    const parts = line.split(/\s+[I|]\s+/);
    if (parts.length >= 2) {
      const name = parts[0].trim();
      let issuer: string | null = null;
      let dateText: string | null = null;
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i].trim();
        if (/\b\d{4}\b/.test(p) && !dateText) {
          dateText = p;
        } else if (!issuer) {
          issuer = p;
        }
      }
      if (name.length >= 3) out.push({ name, issuer, dateText });
      continue;
    }

    // Pattern D: bare line — fallback. Skip section-header-noise entirely.
    if (CERT_SECTION_HEADERS.has(line.toLowerCase())) continue;
    if (line.length < 5) continue;
    out.push({ name: line, issuer: null, dateText: null });
  }
  return out;
}

export function tokenOverlapScore(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[\s\-_/.,;:()]+/)
        .filter((t) => t.length >= 3),
    );
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) if (tokensB.has(t)) overlap++;
  return overlap / Math.min(tokensA.size, tokensB.size);
}

export function recoverCertsFromRawSection<
  T extends { id?: string; name?: string | null; issuer?: string | null; dateText?: string | null; [k: string]: any }
>(certifications: T[], rawText: string): T[] {
  const sectionLines = extractCertSectionLines(rawText);
  if (sectionLines.length === 0) return certifications;

  const candidates = extractCertCandidates(sectionLines);
  if (candidates.length === 0) return certifications;

  const MATCH_THRESHOLD = 0.6;
  const ISSUER_DIVERGENCE_THRESHOLD = 0.5;
  const matchedCandidateIndices = new Set<number>();
  const corrected: T[] = [];

  for (const cert of certifications) {
    const certName = (cert.name || '').toString();
    if (certName.length === 0) {
      corrected.push(cert);
      continue;
    }

    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < candidates.length; i++) {
      if (matchedCandidateIndices.has(i)) continue;
      const score = tokenOverlapScore(certName, candidates[i].name);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1 && bestScore >= MATCH_THRESHOLD) {
      matchedCandidateIndices.add(bestIdx);
      const match = candidates[bestIdx];
      // Issuer-Correct: replace existing issuer when raw clearly disagrees.
      if (match.issuer && match.issuer.length > 0) {
        const existingIssuer = (cert.issuer || '').trim();
        if (existingIssuer.length === 0) {
          corrected.push({ ...cert, issuer: match.issuer });
          continue;
        }
        const issuerOverlap = tokenOverlapScore(existingIssuer, match.issuer);
        if (issuerOverlap < ISSUER_DIVERGENCE_THRESHOLD) {
          corrected.push({ ...cert, issuer: match.issuer });
          continue;
        }
      }
      corrected.push(cert);
    } else {
      // No raw match — keep unchanged. Conservative: we do not drop possible
      // hallucinations here because false-positive drop is worse than keep.
      corrected.push(cert);
    }
  }

  // Add unmatched raw candidates as new certs. Skip noisy candidates.
  let recoveredCount = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (matchedCandidateIndices.has(i)) continue;
    const candidate = candidates[i];
    const lowerName = candidate.name.toLowerCase().trim();
    if (CERT_SECTION_HEADERS.has(lowerName)) continue;
    if (ISSUER_NOISE.has(lowerName)) continue;
    // Reject "Projekt-" prefixed candidates (handled by dropProjectLikeCerts elsewhere).
    if (/^projekt[\s\-:]/i.test(candidate.name)) continue;

    recoveredCount++;
    corrected.push({
      id: `cert-recovered-${recoveredCount}`,
      name: candidate.name,
      issuer: candidate.issuer,
      dateText: candidate.dateText,
      description: null,
    } as unknown as T);
  }

  return corrected;
}

/**
 * Welle 2A (2026-04-27): Drops experience entries that are duplicates of
 * a certification entry. Repro: Yannik's Exxeta CV has the cert
 * "HR-Transformation @ ZF GmbH (2022)" — the parser-LLM occasionally
 * mis-classifies it as an experience entry (role="HR-Transformation &
 * Organisationsentwicklung", company="ZF"). Identify by token overlap
 * between role↔cert.name AND company↔cert.issuer.
 *
 * Conservative thresholds (avoid false positives on legitimate stations):
 *   - role↔cert.name overlap ≥ 0.7
 *   - either: company+issuer both present AND overlap ≥ 0.5
 *     OR:    role↔cert.name overlap ≥ 0.85 (very strong on its own)
 *
 * Idempotent. Pure function. Exported for testing.
 */
export function dropExperienceDuplicatedAsCert<TExp extends { role?: string | null; company?: string | null;[k: string]: any }>(
  experience: TExp[],
  certifications: Array<{ name?: string | null; issuer?: string | null;[k: string]: any }>,
): TExp[] {
  if (!Array.isArray(certifications) || certifications.length === 0) return experience;
  // Helper: count meaningful (≥3 char) tokens — prevents single-token role hits.
  const tokenCount = (s: string): number =>
    s.toLowerCase().split(/[\s\-_/.,;:()]+/).filter((t) => t.length >= 3).length;
  return experience.filter((exp) => {
    const role = (exp.role || '').toString().trim();
    const company = (exp.company || '').toString().trim();
    if (role.length === 0) return true; // can't compare without role
    // Require at least 2 meaningful tokens in role to engage the duplicate check.
    // Otherwise a single-token role like "Manager" matches any cert name containing "Manager".
    if (tokenCount(role) < 2) return true;
    for (const cert of certifications) {
      const certName = (cert.name || '').toString().trim();
      const certIssuer = (cert.issuer || '').toString().trim();
      if (certName.length === 0) continue;
      if (tokenCount(certName) < 2) continue;
      const roleOverlap = tokenOverlapScore(role, certName);
      if (roleOverlap < 0.7) continue;
      // Strong signal: company-issuer agreement
      if (company.length > 0 && certIssuer.length > 0) {
        const companyOverlap = tokenOverlapScore(company, certIssuer);
        if (companyOverlap >= 0.5) return false; // drop — clear cert duplicate
      }
      // Very strong role overlap on its own (covers cases where issuer is null)
      if (roleOverlap >= 0.85) return false;
    }
    return true;
  });
}

/**
 * Welle 2B (2026-04-27): Recovers missing experience stations from the raw
 * OCR text. Repro: Yannik's Exxeta CV has 6 stations in the source PDF;
 * the parser occasionally drops "Ingrano Solutions I Innovation Manager"
 * because that line is wedged between an education entry and the next
 * experience header in Azure DI's flattened text.
 *
 * Strategy: scan rawText for "<COMPANY> I <ROLE>" or "<COMPANY> | <ROLE>"
 * pipe patterns where the role contains a known job-title suffix
 * (Manager, Consultant, Founder, etc.). For each candidate not present
 * in `existingExperience` (fuzzy-matched on company tokens), append a
 * minimal entry with role + company. Bullets/dates stay empty — better
 * a present-but-incomplete station than a silently-dropped one.
 *
 * False-positive guards:
 *   - role MUST contain a job-title suffix
 *   - company MUST be a plausible company token (not a date, not a
 *     status word, not an institutional suffix-only)
 *   - role + company combined ≤ 80 chars (prevents grabbing whole
 *     bullet lines that happen to contain "Manager" or "I")
 *   - duplicate suppression by company-token-overlap ≥ 0.7
 *
 * Idempotent. Pure function. Exported for testing.
 */
export function recoverMissingExperienceStation<TExp extends { id?: string; role?: string | null; company?: string | null;[k: string]: any }>(
  experience: TExp[],
  rawText: string,
): TExp[] {
  if (!rawText || rawText.length < 50) return experience;

  // Job-title suffix words. Conservative: must appear as a whole word.
  const JOB_TITLE_SUFFIX = /\b(?:Manager|Director|Consultant|Founder|Co-Founder|Cofounder|CEO|CTO|CFO|COO|CMO|Lead|Head|Owner|Coach|Specialist|Architect|Developer|Designer|Officer|Analyst|Coordinator|Engineer|Strateg(?:ist|e)|Berater|Berater(?:in)?|Praktikant(?:in)?|Intern|Werkstudent(?:in)?|Trainee|Volunteer|Volontär(?:in)?)\b/i;

  // Phrases: split rawText by line OR by 2+ whitespace clusters (Azure DI flattens columns).
  // Use newline as primary boundary; fallback to phrase splits is too noisy.
  const lines = rawText.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);

  const candidates: Array<{ company: string; role: string }> = [];
  // Capital-I (the Azure DI pipe replacement) and standard pipe — separated by spaces.
  // Pattern: anchor allows mid-line matches; group 2 stops at a sentence boundary
  // (colon/semicolon/comma/period, double whitespace, next pipe, or end-of-line).
  // The colon stop is critical for Yannik's Exxeta CV: "Ingrano Solutions I Innovation Manager Tech-Driven Efficiency:"
  // — without it, group 2 over-captures into the bullet body.
  const pipeRe = /(?:^|\s{2,})([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9&.\- ]{1,55}?)\s+[I|]\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9&.\- ]{1,55}?)(?=\s+[I|]\s|\s{2,}|[.:;,]|$)/g;

  for (const line of lines) {
    pipeRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pipeRe.exec(line)) !== null) {
      const candidateCompany = m[1].trim();
      const candidateRoleRaw = m[2].trim();
      if (candidateCompany.length === 0 || candidateRoleRaw.length === 0) continue;
      // Role must contain a job-title suffix
      const suffixMatch = JOB_TITLE_SUFFIX.exec(candidateRoleRaw);
      if (!suffixMatch) continue;
      // Trim role: keep everything up to and including the first job-title suffix word.
      // Drops trailing bullet text like "Innovation Manager Tech-Driven Efficiency"
      // → "Innovation Manager".
      const endOfSuffix = suffixMatch.index + suffixMatch[0].length;
      const candidateRole = candidateRoleRaw.slice(0, endOfSuffix).trim();
      if (candidateRole.length === 0) continue;
      if (candidateCompany.length + candidateRole.length > 80) continue;
      // Company must be plausible
      if (!isPlausibleCompanyToken(candidateCompany)) continue;
      // Skip pure date-like or numeric companies
      if (/^\d/.test(candidateCompany)) continue;
      candidates.push({ company: candidateCompany, role: candidateRole });
    }
  }

  if (candidates.length === 0) return experience;

  // Dedup candidates against each other by company-overlap
  const uniqueCandidates: Array<{ company: string; role: string }> = [];
  for (const c of candidates) {
    const dup = uniqueCandidates.find((u) => tokenOverlapScore(u.company, c.company) >= 0.7);
    if (!dup) uniqueCandidates.push(c);
  }

  const recovered = [...experience];
  let addedCount = 0;
  for (const c of uniqueCandidates) {
    const existing = recovered.find((e) => {
      const eCompany = (e.company || '').toString().trim();
      if (eCompany.length === 0) return false;
      return tokenOverlapScore(eCompany, c.company) >= 0.7;
    });
    if (!existing) {
      addedCount++;
      const id = `exp-recovered-${addedCount}`;
      recovered.push({
        id,
        role: c.role,
        company: c.company,
        dateRangeText: null,
        location: null,
        description: [],
      } as unknown as TExp);
    }
  }

  return recovered;
}
