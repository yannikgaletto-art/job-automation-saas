import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
async function ping(model: string) {
    try {
        console.log(`pinging ${model}...`);
        const res = await client.messages.create({
            model: model,
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Say test' }]
        });
        console.log(`${model} OK:`, res.content[0]);
    } catch (e) {
        console.error(`${model} FAILED:`, e);
    }
}
async function main() {
    await ping('claude-sonnet-4-6');
    await ping('claude-haiku-4-5-20251001');
}
main();
