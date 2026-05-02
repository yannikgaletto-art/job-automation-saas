/**
 * 3x Variance-Test: LLM-Bold-Format für Responsibilities/Qualifications
 * Tests die neue Prompt-Instruktion "**key phrase** detail" auf dem KPS-Job-Text.
 *
 * Lauf: npx tsx scripts/_test-bold-bullets.ts
 */
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const JOB_TEXT = `
Über die Position
Du suchst nicht nur einen Job, sondern eine strategische Schlüsselrolle an der Schnittstelle zwischen Business und Technologie? Als Business Consultant bei KPS bist du die rechte Hand unseres Proposal Leads bei hochkarätigen, internationalen Ausschreibungsprozessen im Spannungsfeld zwischen Digitalisierungsstrategie, Prozessoptimierung und IT-Implementierung.

Deine Aufgaben:
Ausschreibungs-Management: Du unterstützt bei großen internationalen Tender-Verfahren und nutzt dabei aktiv AI-gestützte Analyse- und Text-Tools, um erstklassige Angebote zu erstellen.
Innovations-Treiber: Du identifizierst Potenziale zur Prozessoptimierung und Effizienzsteigerung durch künstliche Intelligenz im Rahmen des Proposal Managements für digitale Transformationsprojekte.
Strategie-Transfer: Du übersetzt komplexe Kundenanforderungen in eine kreative und innovative Darstellung von Lösungen, welche den Wettbewerbsvorsprung unserer Kunden dauerhaft sichern.
Verantwortung: Du übernimmst frühzeitig eigenständige Aufgabenpakete mit der klaren Perspektive, dich mittelfristig zum Projektleiter oder Proposal-Lead zu entwickeln.

Das bringst Du mit:
Background: Abgeschlossenes Studium (BWL, Wirtschaftsinformatik, Informatik) oder vergleichbare Qualifikation.
Mindset: Hohe Affinität zu AI-Tools (LLMs, Copilots) und Drive, diese proaktiv zu integrieren.
Skills: Erste Erfahrung in der Unternehmensberatung (2-3 Jahre) sowie strukturierte Arbeitsweise.
Tool-Set: Routinierter Umgang mit MS Office (Teams, Excel, Word) mit exzellenten PowerPoint-Visualisierungs-Skills.
Sprachen: Verhandlungssicheres Deutsch und Englisch.
`;

const SYSTEM_PROMPT = `Extract the following information from the job description as JSON. All text fields MUST be written in Deutsch. Return ONLY valid JSON, no markdown.

IMPORTANT for lists (responsibilities, qualifications):
- Write condensed, complete sentences — approximately 20% shorter than the original.
- Preserve the core message of each point. No abbreviating to mere keywords.
- NO copy-paste of the original, but an informed condensation.
- Start each bullet with **key phrase** (max 4 words, the core action or concept), followed by the detail. Example: "**Leitet Executive-Workshops** zur Identifikation von Kundenschmerzen."

Schema: {"responsibilities":["max 6 bullets"],"qualifications":["max 5 bullets"]}`;

async function runOnce(run: number): Promise<void> {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`RUN ${run}/3`);
    console.log('─'.repeat(60));

    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JOB_TEXT }],
    });

    const text = (response.content[0] as { type: string; text: string }).text.trim();

    let parsed: { responsibilities?: string[]; qualifications?: string[] };
    try {
        parsed = JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : { responsibilities: [], qualifications: [] };
    }

    console.log('\nRESPONSIBILITIES:');
    (parsed.responsibilities ?? []).forEach((r, i) => {
        const hasBold = r.includes('**');
        console.log(`  ${i + 1}. [${hasBold ? '✅ bold' : '❌ plain'}] ${r}`);
    });

    console.log('\nQUALIFICATIONS:');
    (parsed.qualifications ?? []).forEach((q, i) => {
        const hasBold = q.includes('**');
        console.log(`  ${i + 1}. [${hasBold ? '✅ bold' : '❌ plain'}] ${q}`);
    });

    const totalBullets = (parsed.responsibilities?.length ?? 0) + (parsed.qualifications?.length ?? 0);
    const boldBullets = [...(parsed.responsibilities ?? []), ...(parsed.qualifications ?? [])].filter(b => b.includes('**')).length;
    console.log(`\n  → ${boldBullets}/${totalBullets} Bullets mit **bold** (${Math.round(boldBullets / totalBullets * 100)}%)`);
}

async function main() {
    console.log('🧪 3x Variance-Test: LLM Bold-Format (Option C)');
    console.log('Model: claude-haiku-4-5-20251001 | temperature: 0');
    console.log('Job: KPS AG Business Consultant\n');

    for (let i = 1; i <= 3; i++) {
        await runOnce(i);
        if (i < 3) await new Promise(r => setTimeout(r, 1000));
    }

    console.log('\n' + '═'.repeat(60));
    console.log('FERTIG — Ergebnisse oben für Cross-Check mit Opus 4.7');
    console.log('═'.repeat(60));
}

main().catch(console.error);
