import { complete, getCostStats, resetCostStats } from '../lib/ai/model-router';
import fs from 'fs';
import path from 'path';

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach((line) => {
        if (line.trim() && !line.startsWith('#') && line.includes('=')) {
            const parts = line.split('=');
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            process.env[key] = value;
        }
    });
}

async function testCostComparison() {
    resetCostStats();

    console.log('═══════════════════════════════════════');
    console.log('    AI MODEL ROUTER - COST TEST');
    console.log('═══════════════════════════════════════\n');

    // Test 1: Parse HTML (should use GPT-4o-mini)
    console.log('Test 1: Parse HTML...');
    const parseResult = await complete({
        taskType: 'parse_html',
        prompt:
            'Extract job title from: <div class="title">Senior Engineer at Tesla</div>',
        temperature: 0,
    });
    console.log(`✅ Model: ${parseResult.model}`);
    console.log(`💰 Cost: €${(parseResult.costCents / 100).toFixed(4)}`);
    console.log(`📊 Tokens: ${parseResult.tokensUsed}\n`);

    // Test 2: Write cover letter (should use Claude Sonnet)
    console.log('Test 2: Write Cover Letter...');
    const writeResult = await complete({
        taskType: 'write_cover_letter',
        prompt: `Write a short cover letter for Senior Engineer at Tesla.

User style example:
"Sehr geehrte Damen und Herren,
durch meine Erfahrung in skalierbaren Systemen..."

Company intel:
- Recent news: "Gigafactory Berlin expansion"`,
    });
    console.log(`✅ Model: ${writeResult.model}`);
    console.log(`💰 Cost: €${(writeResult.costCents / 100).toFixed(4)}`);
    console.log(`📊 Tokens: ${writeResult.tokensUsed}\n`);

    // Summary
    const stats = getCostStats();
    console.log('═══════════════════════════════════════');
    console.log('              SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Total Cost: €${(stats.totalCostCents / 100).toFixed(4)}`);
    console.log(`Breakdown:`, JSON.stringify(stats.taskBreakdown, null, 2));

    // Expected savings calculation
    const allClaudeCost =
        ((parseResult.tokensUsed + writeResult.tokensUsed) / 1_000_000) * 3.0;
    const actualCost = stats.totalCostCents / 100;
    const savings = (
        ((allClaudeCost - actualCost) / allClaudeCost) *
        100
    ).toFixed(0);

    console.log(`\n📈 Expected if all-Claude: €${allClaudeCost.toFixed(4)}`);
    console.log(`💰 Actual with Router: €${actualCost.toFixed(4)}`);
    console.log(`🎉 Savings: ${savings}%\n`);
}

testCostComparison().catch(console.error);
