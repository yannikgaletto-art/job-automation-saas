import { suggestRelevantQuotes } from '../lib/services/quote-matcher';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    const company = "FUNKE Mediengruppe";
    const values = [
        "Vielfalt ist nicht nur ein Schlagwort für uns, sondern der Kern unserer Unternehmenskultur.",
        "Guter Journalismus ist wichtiger denn je!"
    ];
    console.log("Running new quote pipeline for:", company);
    const quotes = await suggestRelevantQuotes(company, values, "", "Business Development Manager", "Medien");
    console.log("Result:", JSON.stringify(quotes, null, 2));
}

main().catch(console.error);
