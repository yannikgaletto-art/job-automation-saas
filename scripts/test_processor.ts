import { processDocument } from '../lib/services/document-processor';
import { decrypt } from '../lib/utils/encryption';

async function test() {
    console.log('Testing Document Processor...');

    const sampleText = `
        CURRICULUM VITAE
        Name: John Doe
        Email: john.doe@example.com
        Phone: +1-555-0123
        Address: 123 Main St, Anytown, USA

        Experience:
        - Senior Developer at TechCorp (5 years)
        - Worked with TypeScript, React, Node.js, and AWS.
        
        Education:
        - Bachelor of Science in Computer Science
    `;

    const buffer = Buffer.from(sampleText, 'utf-8');

    // Test with text/plain to avoid PDF parsing issues in this script
    // (Our extractor supports text/plain)
    const result = await processDocument(buffer, 'text/plain');

    console.log('\n--- Result ---');
    console.log('Raw Text (snippet):', result.rawText.slice(0, 100).replace(/\n/g, ' '));
    console.log('Sanitized Text (snapshot):', result.sanitizedText);

    console.log('\n--- Metadata ---');
    console.log(JSON.stringify(result.metadata, null, 2));

    console.log('\n--- Encrypted PII ---');
    console.log(result.encryptedPii);

    console.log('\n--- Decryption Check ---');
    for (const [key, value] of Object.entries(result.encryptedPii)) {
        try {
            const decrypted = decrypt(value);
            console.log(`${key}: ${decrypted} (✅ Decrypted successfully)`);

            // Verify masking
            if (!result.sanitizedText.includes(`[${key.toUpperCase()}]`)) {
                // Note: Masking might fail if regex escaping isn't perfect or case differs, 
                // but for this simple test it should work if logic is correct.
                // Also "Name: John Doe" -> "Name: [NAME]"
                // Our mock extractor returns "Unknown Candidate" for name usually, or regexes.
                console.warn(`⚠️ Placeholder [${key.toUpperCase()}] not found in sanitized text.`);
            } else {
                console.log(`  -> Placeholder [${key.toUpperCase()}] found in text.`);
            }

        } catch (e) {
            console.error(`${key}: Decryption failed!`, e);
        }
    }
}

test().catch(console.error);
