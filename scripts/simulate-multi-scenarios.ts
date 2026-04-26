/**
 * Multi-scenario simulation of the surgical hallucination filter.
 * Covers: SAP-Public-Sector, EY-Healthcare, MetaDesign, Tieto-FinTech,
 * Compliance-JD (DSGVO actually mentioned), Tech-EN-JD.
 *
 * Usage: npx tsx scripts/simulate-multi-scenarios.ts
 */

import { filterAtsKeywords, filterByVerbatimJDPresence } from '../lib/services/ats-keyword-filter';

interface Scenario {
    name: string;
    jd: string;
    mistralOutput: string[];
    mustSurvive: string[];
    mustBeRemoved: string[];
}

const SCENARIOS: Scenario[] = [
    {
        name: 'SAP Public Sector (DE-JD, DE-locale) — original hallucination case',
        jd: `Bei SAP gestaltest du die digitale Zukunft der öffentlichen Verwaltung.
Identifikation neuer Geschäftspotenziale für SAP im öffentlichen Sektor.
Entwicklung von Go-to-Market-Initiativen. Stakeholder-Netzwerk aufbauen.
Pilotprojekte und Leuchtturmvorhaben. Vertrieb und Ausschreibungen.
Cloud ERP, Daten und KI. Digitale Transformation.`,
        mistralOutput: ['Ausschreibungen', 'Cloud Computing', 'Digitale Transformation', 'DSGVO', 'ERP', 'Go-to-Market', 'ISO 27001', 'KI', 'Öffentlicher Sektor', 'Pilotprojekte', 'SAP ERP', 'Vertrieb'],
        mustSurvive: ['Ausschreibungen', 'Digitale Transformation', 'ERP', 'Go-to-Market', 'KI', 'Öffentlicher Sektor', 'Pilotprojekte', 'SAP ERP', 'Vertrieb'],
        mustBeRemoved: ['Cloud Computing', 'DSGVO', 'ISO 27001'],
    },
    {
        name: 'EY Healthcare Consulting (DE-JD, DE-locale)',
        jd: `Als Projektleiter Healthcare bei EY Business Consulting begleitest du Krankenhäuser
und Krankenkassen bei strategischen Projekten im Gesundheitswesen. Du wendest agile
Methoden wie Scrum oder klassische Wasserfall-Ansätze an. Design Thinking, Risikomanagement
und Qualitätssicherung sind wichtige Aspekte. Erfahrung im Projektmanagement vorausgesetzt.`,
        mistralOutput: ['Agile Teams', 'Design Thinking', 'DSGVO', 'Gesundheitswesen', 'ISO 27001', 'ISO 9001', 'Krankenhäuser', 'Krankenkassen', 'PCI DSS', 'Projektmanagement', 'Qualitätssicherung', 'Risikomanagement', 'Scrum', 'Wasserfall'],
        mustSurvive: ['Agile Teams', 'Design Thinking', 'Gesundheitswesen', 'Krankenhäuser', 'Krankenkassen', 'Projektmanagement', 'Qualitätssicherung', 'Risikomanagement', 'Scrum', 'Wasserfall'],
        mustBeRemoved: ['DSGVO', 'ISO 27001', 'ISO 9001', 'PCI DSS'],
    },
    {
        name: 'Compliance Officer JD (DE-JD where DSGVO actually IS in JD)',
        jd: `Als Compliance Officer bist du verantwortlich für die Einhaltung der DSGVO und
ISO 27001 Standards. Du implementierst Policies gemäß GDPR, koordinierst Audits
und arbeitest mit dem Datenschutzbeauftragten. Erfahrung mit ISO 9001 ist ein Plus.`,
        mistralOutput: ['DSGVO', 'GDPR', 'ISO 27001', 'ISO 9001', 'Compliance', 'Audits', 'Datenschutz'],
        mustSurvive: ['DSGVO', 'GDPR', 'ISO 27001', 'ISO 9001', 'Compliance', 'Audits', 'Datenschutz'],
        mustBeRemoved: [],
    },
    {
        name: 'Tech English JD (EN-JD, DE-locale → translation case)',
        jd: `Senior Software Engineer with strong Python and TypeScript experience.
Salesforce integrations using SAP, microservices with Node.js, deploy to AWS.
Scrum, OKR and PMP certification is a plus. PostgreSQL and Redis required.
Stakeholder collaboration across product and engineering teams.`,
        mistralOutput: ['Salesforce', 'Python', 'TypeScript', 'SAP', 'Node.js', 'AWS', 'Scrum', 'OKR', 'PMP', 'PostgreSQL', 'Redis', 'Stakeholder-Management', 'DSGVO', 'ISO 27001'],
        mustSurvive: ['Salesforce', 'Python', 'TypeScript', 'SAP', 'Node.js', 'AWS', 'Scrum', 'OKR', 'PMP', 'PostgreSQL', 'Redis', 'Stakeholder-Management'],
        mustBeRemoved: ['DSGVO', 'ISO 27001'],
    },
    {
        name: 'StepStone-style Marketing JD (mixed-language pass-through)',
        jd: `Als Senior Marketing Manager (m/w/d) verantwortest du die Performance Marketing Strategie.
Du arbeitest mit HubSpot, Google Ads und LinkedIn Ads. SEO, SEA und Conversion Optimization.
Deine Tools: Google Analytics 4, Tableau, Salesforce Marketing Cloud.
Erfahrung im B2B SaaS Umfeld. CRM Lifecycle Marketing.`,
        mistralOutput: ['Performance Marketing', 'HubSpot', 'Google Ads', 'LinkedIn Ads', 'SEO', 'SEA', 'Conversion Optimization', 'Google Analytics 4', 'Tableau', 'Salesforce Marketing Cloud', 'B2B SaaS', 'CRM', 'Lifecycle Marketing', 'DSGVO'],
        mustSurvive: ['Performance Marketing', 'HubSpot', 'Google Ads', 'LinkedIn Ads', 'SEO', 'SEA', 'Conversion Optimization', 'Google Analytics 4', 'Tableau', 'Salesforce Marketing Cloud', 'B2B SaaS', 'CRM', 'Lifecycle Marketing'],
        mustBeRemoved: ['DSGVO'],
    },
    {
        name: 'Sonova Tinnitus (EN-JD, DE-locale) — cross-locale critical case',
        jd: `Senior Medical Engagement Manager – Digital Health & Tinnitus Solutions.
Plan and deliver trainings, webinars, clinical discussions. Collaborate with medical affairs.
Drive engagement for tinnitus-focused digital health services. Build relationships with
healthcare professionals. 5+ years of experience in healthcare marketing, medical engagement,
physician relations, medical affairs or digital health.`,
        // Note 2026-04-26: After Mistral → Haiku migration, "Tinnitus" / "Webinare"
        // are no longer expected to leak from the harvester (Haiku follows the
        // domain/format exclusion in the prompt). The dedicated stop-lists for
        // medical conditions and formats were removed. The simulation only checks
        // the code-filter layer; we keep these entries as input but no longer
        // assert they are removed.
        mistralOutput: ['Arztbeziehungen', 'Digitale Gesundheit', 'Klinische Inhalte', 'ROI-Analyse', 'Gesundheitsmarketing', 'Medical Affairs', 'Stakeholder Management', 'App-Adoption', 'Community Engagement', 'DSGVO', 'ISO 27001', 'PCI DSS'],
        mustSurvive: ['Arztbeziehungen', 'Digitale Gesundheit', 'Klinische Inhalte', 'ROI-Analyse', 'Gesundheitsmarketing', 'Medical Affairs', 'Stakeholder Management', 'App-Adoption', 'Community Engagement'],
        mustBeRemoved: ['DSGVO', 'ISO 27001', 'PCI DSS'],
    },
    {
        name: 'Airwallex SDR (EN-JD, DE-locale) — Yannik flagged 2026-04-26',
        jd: `Founding Business Development Manager (SDR) at Airwallex Germany.
Drive growth engine. Engage prospects, qualify needs, run outreach strategies.
Work with marketing on bespoke product-led initiatives. Manage early sales funnel.
Design demand generation and sales process. Hybrid environment, 3 days office Berlin.
Initiate contact via cold calls, emails, AI-assisted outbound sequences.
Design plays across customer journey through cold calls, emails, chat, social media.
CRM system: update activity and contact information. Lead scoring, sequencing co-pilots,
enrichment, personalization. Outbound strategy with playbooks, ICPs, sequencing, tooling
in new or early-stage market. SDR experience, 1+ year required. German + English.`,
        mistralOutput: ['CRM', 'Enrichment', 'Fintech', 'Hybridarbeit', 'ICP', 'KI-gestützte Sequenzierung', 'Lead-Generierung', 'Lead-Scoring', 'Outbound', 'Pipeline-Aufbau', 'Playbooks', 'Sales Development Representative', 'SDR', 'Vertriebsprozess', 'Cold Calling', 'Demand Generation'],
        mustSurvive: ['CRM', 'Fintech', 'KI-gestützte Sequenzierung', 'Lead-Generierung', 'Lead-Scoring', 'Outbound', 'Vertriebsprozess', 'Cold Calling', 'Demand Generation'],
        mustBeRemoved: ['Enrichment', 'Hybridarbeit', 'ICP', 'Pipeline-Aufbau', 'Playbooks', 'Sales Development Representative', 'SDR'],
    },
    {
        name: 'Bundesdruckerei Business Development (DE-JD, DE-locale) — Yannik 2026-04-26',
        jd: `Bundesdruckerei sucht Business Development Manager (m/w/d) Schwerpunkt Datenanalyse
und Künstliche Intelligenz im Public Sector. Analyse von Kundenbedürfnissen, Markttrends
sowie des regulatorischen Umfelds für den Einsatz von Datenanalyse und Künstlicher
Intelligenz im öffentlichen Sektor. Identifizierung von Use Cases und geeigneten
Verwaltungsprozessen zur Ableitung konkreter Geschäftspotenziale. Erstellung von
Lösungskonzepten in enger Zusammenarbeit mit unseren Kunden (insbesondere
Bundesministerien und nachgeordnete Behörden). Hohes Interesse an Digitalpolitik
sowie gute Kenntnis des öffentlichen Sektors. Fundiertes Wissen über Datenanalyse-
und KI-Anwendungen und -Technologien. Berufserfahrung in der IT-Beratung, Verwaltung
oder Geschäftsentwicklung. Aufbau von Kunden- und Stakeholderbeziehungen.`,
        mistralOutput: ['Bundesministerien', 'Datenanalyse', 'Datenanalyse-Anwendungen', 'Datenanalyse-Methoden', 'Digitalpolitik', 'IT-Beratung', 'KI', 'KI-Anwendungen', 'KI-Methoden', 'Lösungskonzepte', 'Öffentlicher Sektor', 'Regulatorische Rahmenbedingungen', 'Stakeholder-Management', 'Verwaltungsprozesse', 'Innovationen'],
        mustSurvive: ['Bundesministerien', 'Datenanalyse', 'Digitalpolitik', 'IT-Beratung', 'KI', 'KI-Anwendungen', 'Lösungskonzepte', 'Öffentlicher Sektor', 'Stakeholder-Management', 'Verwaltungsprozesse'],
        mustBeRemoved: ['Innovationen'], // generic noun, blocked
    },
];

console.log('═'.repeat(80));
console.log(`MULTI-SCENARIO FILTER VALIDATION — ${SCENARIOS.length} cases`);
console.log('═'.repeat(80));
console.log();

let totalPass = 0;
let totalFail = 0;

for (const sc of SCENARIOS) {
    console.log(`▸ ${sc.name}`);

    const stopFilter = filterAtsKeywords(sc.mistralOutput);
    const verbatim = filterByVerbatimJDPresence(stopFilter.kept, sc.jd);
    const finalKept = verbatim.kept;

    let scPass = true;
    for (const kw of sc.mustSurvive) {
        if (!finalKept.includes(kw)) {
            console.log(`    ❌ "${kw}" should have survived but was removed`);
            scPass = false;
            totalFail++;
        }
    }
    for (const kw of sc.mustBeRemoved) {
        if (finalKept.includes(kw)) {
            console.log(`    ❌ "${kw}" should have been removed but survived`);
            scPass = false;
            totalFail++;
        }
    }

    if (scPass) {
        const survivedCount = sc.mustSurvive.length;
        const removedCount = sc.mustBeRemoved.length;
        console.log(`    ✅ ${survivedCount} preserved, ${removedCount} removed — final: ${finalKept.length} keywords`);
        totalPass++;
    }
    console.log();
}

console.log('═'.repeat(80));
console.log(`SUMMARY: ${totalPass}/${SCENARIOS.length} scenarios pass · ${totalFail} assertion failures`);
console.log('═'.repeat(80));

process.exit(totalFail > 0 ? 1 : 0);
