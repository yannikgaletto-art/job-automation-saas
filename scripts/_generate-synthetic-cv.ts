/**
 * Generiert das synthetische CV-PDF (Anna Müller) für E2E-Tests.
 *
 * Output: Übergang/test-fixtures/synthetic-cv-anna-mueller.pdf
 *
 * Lauf:
 *   npx tsx scripts/_generate-synthetic-cv.ts
 *
 * Idempotent — überschreibt das PDF beim Re-Lauf.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const OUTPUT = path.resolve(__dirname, '../Übergang/test-fixtures/synthetic-cv-anna-mueller.pdf');

const CONTENT = [
  { line: 'Anna Müller', size: 22, bold: true, gap: 8 },
  { line: 'Hauptstraße 42, 10115 Berlin  |  anna.mueller@example.com  |  +49 30 12345678', size: 9, bold: false, gap: 4 },
  { line: 'linkedin.com/in/anna-mueller-test', size: 9, bold: false, gap: 16 },

  { line: 'Zusammenfassung', size: 13, bold: true, gap: 6 },
  { line: 'Erfahrene Produktmanagerin mit 8 Jahren Hintergrund in B2B-SaaS und FinTech.', size: 10, bold: false, gap: 2 },
  { line: 'Spezialisiert auf Discovery-Prozesse, Stakeholder-Alignment und datengetriebene', size: 10, bold: false, gap: 2 },
  { line: 'Roadmap-Planung. Suche eine Senior-PM-Rolle in einem wachsenden Tech-Unternehmen.', size: 10, bold: false, gap: 14 },

  { line: 'Berufserfahrung', size: 13, bold: true, gap: 6 },

  { line: 'FinTech-Beispiel GmbH  |  Senior Product Manager', size: 11, bold: true, gap: 2 },
  { line: 'Berlin  |  03.2022 – Heute', size: 9, bold: false, gap: 4 },
  { line: '• Verantwortlich für Onboarding-Flow eines B2B-Payment-Produkts mit 200+ Geschäftskunden', size: 10, bold: false, gap: 2 },
  { line: '• Steigerung der Activation-Rate von 38% auf 67% durch Funnel-Restrukturierung', size: 10, bold: false, gap: 2 },
  { line: '• Führung eines cross-funktionalen Teams aus 6 Engineers, 2 Designern, 1 Data-Analystin', size: 10, bold: false, gap: 10 },

  { line: 'SaaS-Beispiel AG  |  Product Manager', size: 11, bold: true, gap: 2 },
  { line: 'München  |  06.2019 – 02.2022', size: 9, bold: false, gap: 4 },
  { line: '• Aufbau des ersten Self-Service-Channels für ein Enterprise-SaaS-Produkt', size: 10, bold: false, gap: 2 },
  { line: '• Conversion-Optimierung mit Mixpanel; Trial-to-Paid-Steigerung um 24%', size: 10, bold: false, gap: 10 },

  { line: 'Startup-Beispiel UG  |  Junior Product Manager', size: 11, bold: true, gap: 2 },
  { line: 'Hamburg  |  09.2016 – 05.2019', size: 9, bold: false, gap: 4 },
  { line: '• Eigenverantwortliche Roadmap für mobile Consumer-App', size: 10, bold: false, gap: 2 },
  { line: '• User-Research mit 50+ Interviews, Synthese in actionable User-Stories', size: 10, bold: false, gap: 14 },

  { line: 'Bildung', size: 13, bold: true, gap: 6 },
  { line: 'Master of Science  |  Wirtschaftsinformatik', size: 11, bold: true, gap: 2 },
  { line: 'Technische Universität München  |  09.2014 – 08.2016  |  Note: 1,7', size: 10, bold: false, gap: 8 },
  { line: 'Bachelor of Arts  |  Betriebswirtschaftslehre', size: 11, bold: true, gap: 2 },
  { line: 'Universität Hamburg  |  09.2011 – 07.2014', size: 10, bold: false, gap: 14 },

  { line: 'Sprachen', size: 13, bold: true, gap: 6 },
  { line: '• Deutsch (Muttersprache)   • Englisch (C2)   • Spanisch (B2)', size: 10, bold: false, gap: 14 },

  { line: 'Skills', size: 13, bold: true, gap: 6 },
  { line: 'Product Management: Roadmapping, OKRs, User Story Mapping, Discovery, Prioritization', size: 10, bold: false, gap: 2 },
  { line: 'Tools: Jira, Confluence, Figma, Mixpanel, Amplitude, Productboard', size: 10, bold: false, gap: 2 },
  { line: 'Methoden: Scrum, Kanban, Design Thinking, Lean Startup, JTBD', size: 10, bold: false, gap: 2 },
  { line: 'Domain: B2B SaaS, FinTech, Mobile Consumer', size: 10, bold: false, gap: 14 },

  { line: 'Zertifikate', size: 13, bold: true, gap: 6 },
  { line: 'Certified Scrum Product Owner (CSPO)  |  Scrum Alliance  |  2020', size: 10, bold: false, gap: 2 },
  { line: 'Pragmatic Marketing Certified  |  Pragmatic Institute  |  2021', size: 10, bold: false, gap: 0 },
];

async function main() {
  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const pageWidth = 595;
  const pageHeight = 842;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const item of CONTENT) {
    if (y < margin + 20) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(item.line, {
      x: margin,
      y,
      size: item.size,
      font: item.bold ? fontBold : fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });
    y -= item.size + item.gap;
  }

  const bytes = await pdf.save();

  const outDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT, bytes);
  console.log(`✅ Synthetic-CV erzeugt: ${OUTPUT}`);
  console.log(`   Größe: ${bytes.length} Bytes (${(bytes.length / 1024).toFixed(1)} KB)`);
  console.log(`   Pages: ${pdf.getPageCount()}`);
}

main().catch((err) => {
  console.error('❌ PDF-Erzeugung fehlgeschlagen:', err);
  process.exit(1);
});
