import { complete } from '@/lib/ai/model-router';

/**
 * Parse job listing HTML using GPT-4o-mini (cost-optimized).
 * Routes through Model Router for automatic cost tracking.
 */
export async function parseJobHTML(html: string) {
    const result = await complete({
        taskType: 'parse_html',
        prompt: `Extract job details from this HTML and return ONLY valid JSON:

HTML:
${html}

Required JSON structure:
{
  "title": "Job title",
  "company": "Company name",
  "location": "City, Country",
  "salary": "Salary range or null",
  "requirements": ["requirement1", "requirement2"]
}`,
        systemPrompt:
            'You are a precise HTML parser. Output ONLY valid JSON, no explanation.',
        temperature: 0, // Deterministic
    });

    console.log(`✅ Parsed job: €${(result.costCents / 100).toFixed(4)}`);

    try {
        return JSON.parse(result.text);
    } catch (error) {
        console.error('JSON parse error:', result.text);
        throw new Error('Failed to parse job HTML');
    }
}
