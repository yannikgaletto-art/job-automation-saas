/**
 * Seed Script: Import curated quotes from CSV files into Supabase.
 *
 * Usage: npx tsx database/scripts/seed-quotes.ts
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - CSV files in database/quotes/
 *
 * Idempotent: YES — uses ON CONFLICT DO NOTHING on the dedup index.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { config } from 'dotenv';

// Load env from .env.local (Next.js convention)
config({ path: join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── CSV Parsing (no external dependency — these CSVs are simple) ─────────
function parseCSV(content: string): Record<string, string>[] {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    // Parse header
    const headers = parseCSVLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length !== headers.length) continue; // Skip malformed rows

        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
            row[h.trim()] = values[idx]?.trim() || '';
        });
        rows.push(row);
    }

    return rows;
}

/**
 * Parse a single CSV line respecting quoted fields with embedded commas and quotes.
 * Handles: "field with ""escaped"" quotes", "field with, comma"
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
        const char = line[i];

        if (inQuotes) {
            if (char === '"') {
                // Check for escaped quote ""
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i += 2;
                    continue;
                }
                // End of quoted field
                inQuotes = false;
                i++;
                continue;
            }
            current += char;
            i++;
        } else {
            if (char === '"') {
                inQuotes = true;
                i++;
                continue;
            }
            if (char === ',') {
                result.push(current);
                current = '';
                i++;
                continue;
            }
            current += char;
            i++;
        }
    }

    result.push(current);
    return result;
}

// ─── Column name mapping (CSV German headers → DB columns) ────────────────
function mapRow(row: Record<string, string>, category: string) {
    return {
        category,
        theme: row['Thema'] || '',
        person: row['Person'] || '',
        quote_en: row['Zitat (Original/EN)'] || '',
        quote_de: row['Zitat (DE)'] || null,
        source: row['Kontext / Quelle'] || null,
        use_case: row['Einsatz im Anschreiben (Cover Letter)'] || null,
        approved: true,
    };
}

/**
 * Extract category from filename.
 * "Quotes_IT_Tech_Software_SaaS.csv" → "IT_Tech_Software_SaaS"
 */
function extractCategory(filename: string): string {
    return basename(filename, '.csv').replace(/^Quotes_/, '');
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
    const quotesDir = join(process.cwd(), 'database', 'quotes');
    const files = readdirSync(quotesDir).filter(f => f.endsWith('.csv'));

    if (files.length === 0) {
        console.error('❌ No CSV files found in database/quotes/');
        process.exit(1);
    }

    console.log(`📂 Found ${files.length} CSV files`);

    let totalInserted = 0;
    let totalSkipped = 0;

    for (const file of files) {
        const category = extractCategory(file);
        const content = readFileSync(join(quotesDir, file), 'utf-8');
        const rows = parseCSV(content);

        console.log(`  📄 ${file}: ${rows.length} quotes (category: ${category})`);

        for (const row of rows) {
            const mapped = mapRow(row, category);

            // Validation: skip rows without essential data
            if (!mapped.person || !mapped.quote_en || !mapped.theme) {
                console.warn(`    ⚠️ Skipping incomplete row: ${JSON.stringify(row).substring(0, 80)}...`);
                totalSkipped++;
                continue;
            }

            const { error } = await supabase
                .from('quotes')
                .insert(mapped);

            if (error) {
                // Dedup conflict (unique_violation) → expected, just skip
                if (error.code === '23505') {
                    totalSkipped++;
                } else {
                    console.error(`    ❌ Insert error for "${mapped.person}": ${error.message}`);
                    totalSkipped++;
                }
            } else {
                totalInserted++;
            }
        }
    }

    console.log(`\n✅ Seed complete: ${totalInserted} inserted, ${totalSkipped} skipped`);

    // Verify count
    const { count } = await supabase
        .from('quotes')
        .select('*', { count: 'exact', head: true });

    console.log(`📊 Total quotes in database: ${count}`);
}

main().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
