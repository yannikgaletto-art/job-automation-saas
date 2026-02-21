const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    try {
        await client.connect();
        await client.query('ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS buzzwords text[];');
        console.log("Migration successful: added buzzwords column.");
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        await client.end();
    }
}
run();
