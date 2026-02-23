
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables BEFORE importing services that use them
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { suggestRelevantQuotes } from '../lib/services/quote-matcher';

async function testQuoteMatcher() {
    console.log("🧪 Testing Quote Matcher...");

    if (!process.env.PERPLEXITY_API_KEY) {
        console.error("❌ PERPLEXITY_API_KEY is missing in .env.local");
        return;
    }

    if (!process.env.OPENAI_API_KEY) {
        console.error("❌ OPENAI_API_KEY is missing in .env.local");
        return;
    }

    // Test Case 1: English Tech Company
    console.log("\n--- Test Case 1: Tech Company (English) ---");
    const techValues = ["Innovation", "Customer Obsession", "Move Fast"];
    const techQuotes = await suggestRelevantQuotes("Tesla", techValues);

    console.log(`Received ${techQuotes.length} quotes.`);
    if (techQuotes.length > 0) {
        console.log("Sample Quote:", JSON.stringify(techQuotes[0], null, 2));

        // Verification assertions
        const hasRelevance = techQuotes.every(q => q.relevance_score >= 0 && q.relevance_score <= 1);
        const hasMatch = techQuotes.every(q => q.matched_value && techValues.includes(q.matched_value) || q.matched_value === 'Custom'); // Custom shouldn't happen here but good to be safe
        const hasLanguage = techQuotes.every(q => q.language === 'en' || q.language === 'de');

        if (hasRelevance && hasMatch && hasLanguage) {
            console.log("✅ Structure Verification Passed");
        } else {
            console.error("❌ Structure Verification Failed");
            console.log("Relevance:", hasRelevance);
            console.log("Match:", hasMatch);
            console.log("Language:", hasLanguage);
        }
    } else {
        console.warn("⚠️ No quotes returned for Tech Company.");
    }

    // Test Case 2: German Traditional Company
    console.log("\n--- Test Case 2: Traditional Company (German Values) ---");
    const germanValues = ["Zuverlässigkeit", "Qualität", "Nachhaltigkeit"];
    const germanQuotes = await suggestRelevantQuotes("Siemens", germanValues);

    console.log(`Received ${germanQuotes.length} quotes.`);
    if (germanQuotes.length > 0) {
        console.log("Sample Quote:", JSON.stringify(germanQuotes[0], null, 2));
        const isGerman = germanQuotes.some(q => q.language === 'de');
        if (isGerman) {
            console.log("✅ German language detected");
        } else {
            console.warn("⚠️ Expected German quotes, but might have got English (acceptable fallback)");
        }
    }
}

testQuoteMatcher().catch(console.error);
