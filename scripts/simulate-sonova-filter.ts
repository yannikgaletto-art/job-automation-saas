/**
 * Simulate the new surgical hallucination filter against the real Sonova JD
 * (English JD, German-locale user — the cross-locale case).
 *
 * Reproduces what would happen if Mistral emits BOTH legitimate German translations
 * AND compliance halluzinations on this English JD.
 *
 * Usage: npx tsx scripts/simulate-sonova-filter.ts
 */

import { filterAtsKeywords, filterByVerbatimJDPresence } from '../lib/services/ats-keyword-filter';

const SONOVA_EN_JD = `As Senior Medical Engagement Manager (f/m/d) – Digital Health & Tinnitus Solutions, you will drive growth and engagement for Sonova's tinnitus-focused digital health services, with a strong focus on the SilentCloud Tinnitus Therapy app. You will build trusted relationships with healthcare professionals while shaping clinically relevant content and engagement programs that increase adoption and sustained use among clinicians and their patients. This role combines medical engagement, content strategy and hands-on community interaction to deliver meaningful impact at national, regional and local levels.

More About The Role

Develop and execute medical engagement strategies targeting ENTs, GPs, audiology clinics and tinnitus specialists
Build and maintain long-term relationships with healthcare professionals influencing tinnitus management and digital health adoption
Plan and deliver trainings, webinars, clinical discussions, site visits and community engagement events
Define and execute clinically relevant content strategies to support app adoption, education and engagement
Collaborate with product, medical affairs and marketing teams to integrate content into digital health solutions and clinician workflows
Monitor engagement metrics, app adoption and ROI; report results and continuously optimize activities
Work cross-functionally with marketing, product and field teams to scale best practices and successful engagement models

More About You

Bachelor's degree in a relevant field; Master's or MBA preferred
5+ years of experience in healthcare marketing, medical engagement, physician relations, medical affairs or digital health
Proven track record in driving clinician engagement and adoption through compliant programs, content and events
Strong communication, presentation and relationship-building skills with clinical and community partners
Comfortable working independently in the field, managing multiple priorities and traveling as required
Very good German and English skills (both written and spoken)`;

// Plausible Mistral output for de-locale on this EN-JD (mix of legitimate translations,
// theme/format terms, and compliance halluzinations).
const HYPOTHETICAL_MISTRAL_OUTPUT = [
    // Legitimate translations of EN JD terms (must SURVIVE)
    'Arztbeziehungen',
    'Digitale Gesundheit',
    'Klinische Inhalte',
    'Hybrides Arbeiten',
    'ROI-Analyse',
    'Gesundheitsmarketing',
    'Medical Affairs',
    'Stakeholder Management',
    'App-Adoption',
    'Community Engagement',
    'Content Strategy',

    // Theme/format terms (should be caught by Harvester EXCLUDE; if leaked, will pass through filter)
    'Tinnitus',     // medical condition — should not appear after Harvester-prompt-tightening
    'Webinare',     // delivery format
    'Schulungen',   // covered by stop-list

    // Compliance halluzinations (must be REMOVED by allowlist filter)
    'DSGVO',
    'ISO 27001',
    'PCI DSS',
    'Cloud Computing',
];

console.log('═'.repeat(80));
console.log('SONOVA EN-JD × German-locale Mistral Output Simulation');
console.log('═'.repeat(80));
console.log();

// Step 1: filterAtsKeywords (stop-list)
const stopFilter = filterAtsKeywords(HYPOTHETICAL_MISTRAL_OUTPUT);
console.log(`Step 1 (filterAtsKeywords / stop-list):`);
console.log(`  kept: ${stopFilter.kept.length} / ${HYPOTHETICAL_MISTRAL_OUTPUT.length}`);
console.log(`  removed by stop-list: ${stopFilter.removed.join(', ') || '(none)'}`);
console.log();

// Step 2: filterByVerbatimJDPresence (surgical hallucination filter)
const verbatimFilter = filterByVerbatimJDPresence(stopFilter.kept, SONOVA_EN_JD);
console.log(`Step 2 (filterByVerbatimJDPresence / surgical hallucination filter):`);
console.log(`  kept: ${verbatimFilter.kept.length} / ${stopFilter.kept.length}`);
console.log(`  removed by allowlist: ${verbatimFilter.removed.join(', ') || '(none)'}`);
console.log();

// Final
console.log('═'.repeat(80));
console.log('FINAL OUTPUT:');
console.log('═'.repeat(80));
verbatimFilter.kept.forEach(kw => console.log(`  ✅ ${kw}`));
console.log();

console.log('VERIFICATION:');
const expectedKept = ['Arztbeziehungen', 'Digitale Gesundheit', 'Klinische Inhalte', 'Hybrides Arbeiten', 'ROI-Analyse', 'Gesundheitsmarketing', 'Medical Affairs'];
const expectedRemoved = ['DSGVO', 'ISO 27001', 'PCI DSS', 'Cloud Computing'];

let pass = true;
for (const kw of expectedKept) {
    if (!verbatimFilter.kept.includes(kw)) {
        console.log(`  ❌ FAIL: expected "${kw}" to be kept (cross-locale translation)`);
        pass = false;
    }
}
for (const kw of expectedRemoved) {
    if (verbatimFilter.kept.includes(kw)) {
        console.log(`  ❌ FAIL: expected "${kw}" to be removed (compliance hallucination)`);
        pass = false;
    }
}
if (pass) {
    console.log('  ✅ All cross-locale translations preserved');
    console.log('  ✅ All compliance halluzinations removed');
}

process.exit(pass ? 0 : 1);
