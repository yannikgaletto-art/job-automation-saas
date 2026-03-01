import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
    console.log("Fetching Anthropic Models...");
    const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01'
        }
    });
    
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
