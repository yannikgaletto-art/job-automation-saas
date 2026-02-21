import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } from 'docx';
import { complete } from '@/lib/ai/model-router';
import { CVMatchResult } from './cv-match-analyzer';

export interface CVProfile {
    name: string;
    contact: string;
    summary: string;
    skills: string[];
    experience: {
        title: string;
        company: string;
        dates: string;
        description: string;
    }[];
    education: {
        degree: string;
        institution: string;
        dates: string;
    }[];
}

const PARSE_PROMPT = (cvText: string, matchResult: CVMatchResult) => `
Du bist ein professioneller CV-Writer. Deine Aufgabe ist es, den Ursprungs-Lebenslauf in ein strukturiertes JSON-Format zu parsen UND dabei die Verbesserungsvorschläge aus unserer Analyse einfließen zu lassen.

⚠️ WICHTIGE ETHIK-REGELN:
1. Erfinde NIEMALS Berufserfahrung, Abschlüsse oder Firmen.
2. Formuliere nur bestehende Erfahrungen besser.
3. Nutze die Vorschläge aus der Analyse, um bestimmte Punkte stärker zu betonen (z.B. Keywords hinzufügen, wenn sie sachlich stimmen).

**URSPRÜNGLICHER LEBENSLAUF:**
\${cvText}

**VORSCHLÄGE ZUR OPTIMIERUNG:**
\${matchResult.requirementRows.filter(r => r.suggestion).map(r => \`- Anforderung: \${r.requirement} -> Vorschlag: \${r.suggestion}\`).join('\\n')}

**ZIEL-KEYWORDS ZUR OPTIMIERUNG (falls zutreffend integrieren):**
\${matchResult.keywordsMissing.join(', ')}

Bitte gib ausschließlich valides JSON im folgenden Format zurück. Schreibe KEINEN Markdown-Codeblock (wie \`\`\`json) und keinen Text davor oder danach, NUR das JSON-Objekt.

{
  "name": "Echter Name des Kandidaten oder [NAME]",
  "contact": "E-Mail / Telefon / Stadt oder [EMAIL]",
  "summary": "Ein auf den Job maßgeschneidertes, starkes Kurzprofil (3-4 Sätze)",
  "skills": ["Skill 1", "Skill 2", "Skill 3"],
  "experience": [
    {
      "title": "Job Titel",
      "company": "Firma",
      "dates": "MM/YYYY - MM/YYYY",
      "description": "Fließtext oder Bullet Points der Aufgaben. Hier die Optimierungsvorschläge einbauen!"
    }
  ],
  "education": [
    {
      "degree": "Abschluss",
      "institution": "Universität/Schule",
      "dates": "MM/YYYY - MM/YYYY"
    }
  ]
}
`;

export async function generateOptimizedCVContent(cvText: string, matchResult: CVMatchResult): Promise<CVProfile> {
    const result = await complete({
        taskType: 'optimize_cv',
        prompt: PARSE_PROMPT(cvText, matchResult),
        temperature: 0.2, // Low temperature for consistent JSON output
        maxTokens: 4000,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude returned no valid JSON for CV generation');

    return JSON.parse(jsonMatch[0]) as CVProfile;
}

export async function createCVDocument(profile: CVProfile): Promise<Buffer> {
    // Helper to create spacing
    const createEmptyParagraph = () => new Paragraph({ text: "" });

    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    text: profile.name,
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                    text: profile.contact,
                    alignment: AlignmentType.CENTER,
                }),
                createEmptyParagraph(),
                new Paragraph({
                    text: "Zusammenfassung",
                    heading: HeadingLevel.HEADING_2,
                }),
                new Paragraph({
                    text: profile.summary,
                }),
                createEmptyParagraph(),
                new Paragraph({
                    text: "Kenntnisse & Fähigkeiten",
                    heading: HeadingLevel.HEADING_2,
                }),
                new Paragraph({
                    text: profile.skills.join(' • '),
                }),
                createEmptyParagraph(),
                new Paragraph({
                    text: "Berufserfahrung",
                    heading: HeadingLevel.HEADING_2,
                }),
                ...profile.experience.flatMap(exp => [
                    new Paragraph({
                        children: [
                            new TextRun({ text: `${exp.title} - ${exp.company}`, bold: true }),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: exp.dates, italics: true, color: "666666" }),
                        ],
                    }),
                    new Paragraph({
                        text: exp.description,
                    }),
                    createEmptyParagraph(),
                ]),
                new Paragraph({
                    text: "Ausbildung",
                    heading: HeadingLevel.HEADING_2,
                }),
                ...profile.education.flatMap(edu => [
                    new Paragraph({
                        children: [
                            new TextRun({ text: `${edu.degree} - ${edu.institution}`, bold: true }),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: edu.dates, italics: true, color: "666666" }),
                        ],
                    }),
                    createEmptyParagraph(),
                ]),
            ],
        }],
    });

    return await Packer.toBuffer(doc);
}
