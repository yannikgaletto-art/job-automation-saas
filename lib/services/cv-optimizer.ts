import { complete } from '@/lib/ai/model-router';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface CVOptimizationRequest {
    userId: string;
    jobId?: string;
    cvText: string;
    jobTitle: string;
    jobRequirements: string[];
    jobDescription: string;
}

export interface CVOptimizationResult {
    optimizedCV: string;
    changesLog: {
        added_keywords: string[];
        reordered_bullets: number;
        quantifications_added: number;
    };
    atsScore: number; // 0-100
}

/**
 * Main optimization function with retry logic and error handling
 */
export async function optimizeCV(request: CVOptimizationRequest): Promise<CVOptimizationResult> {
    const startTime = Date.now();

    try {
        // Use retry wrapper
        const result = await optimizeCVWithRetry(request);
        return result;
    } catch (error: any) {
        console.error('❌ CV Optimization failed after retries:', error);

        // Log failure
        await supabase.from('generation_logs').insert({
            user_id: request.userId,
            job_id: request.jobId,
            generation_type: 'cv_optimization',
            success: false,
            error_message: error.message,
            latency_ms: Date.now() - startTime,
            model_name: 'claude-3-5-sonnet-latest' // Default or unknown
        });

        throw error;
    }
}

/**
 * Internal worker function with retry logic
 */
async function optimizeCVWithRetry(request: CVOptimizationRequest, retries = 2): Promise<CVOptimizationResult> {
    try {
        return await executeOptimization(request);
    } catch (error: any) {
        if (retries > 0 && isRetryableError(error)) {
            console.warn(`⚠️ Retry ${3 - retries}/2 for CV optimization`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (3 - retries))); // Exponential backoff
            return optimizeCVWithRetry(request, retries - 1);
        }
        throw error;
    }
}

function isRetryableError(error: any): boolean {
    return error.status === 429 || error.status === 503 || error.message?.includes('timeout');
}

/**
 * Execute the actual AI call
 */
async function executeOptimization(request: CVOptimizationRequest): Promise<CVOptimizationResult> {
    const startTime = Date.now();

    const prompt = `You are a professional CV optimizer. Analyze and optimize this CV for ATS systems and the target job.

**CRITICAL RULES:**
1. ✅ KEEP ALL FACTS TRUTHFUL - NO hallucinations or invented experience
2. ✅ Reorder bullet points (most job-relevant first)
3. ✅ Add ATS keywords from job description (only if truthfully applicable)
4. ✅ Quantify achievements where possible (if data exists in original)
5. ✅ Keep total length under 2 pages
6. ❌ NEVER invent experience, projects, or skills
7. ❌ NEVER change dates, company names, or titles
8. ❌ NEVER add achievements that didn't happen

**ORIGINAL CV:**
${request.cvText}

**TARGET JOB:**
Title: ${request.jobTitle}
Requirements: ${request.jobRequirements.join(', ')}
Description: ${request.jobDescription}

**YOUR TASK:**
1. Identify which sections are most relevant to this job
2. Reorder bullet points (most relevant first, keep others)
3. Bold matching keywords in Markdown (**keyword**)
4. Add section headers if missing (Experience, Skills, Education)
5. Ensure ATS-friendly format (simple Markdown, no tables/graphics)

**OUTPUT FORMAT (STRICT):**
First, output the optimized CV in clean Markdown format.

Then, on NEW LINES at the very end, output these metrics:
---METRICS---
ADDED_KEYWORDS: keyword1, keyword2, keyword3
REORDERED_BULLETS: <number>
QUANTIFICATIONS: <number>
ATS_SCORE: <0-100>
---END---`;

    // Add timeout race
    const result = await Promise.race([
        complete({
            taskType: 'optimize_cv',
            prompt,
            temperature: 0.2, // Low temperature for factual accuracy
            maxTokens: 4000,
        }),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Optimization timed out after 45s')), 45000)
        )
    ]) as any; // Type casting because Promise.race returns unknown

    // Log success
    const latencyMs = Date.now() - startTime;

    // Fire and forget logging
    supabase.from('generation_logs').insert({
        user_id: request.userId,
        job_id: request.jobId,
        generation_type: 'cv_optimization',
        model_name: result.model || 'claude-3-5-sonnet-latest',
        prompt_tokens: 0, // Model router doesn't always return this cleanly yet, improvement for later
        completion_tokens: result.tokensUsed || 0,
        total_tokens: result.tokensUsed || 0, // Approx
        cost_usd: (result.costCents || 0) / 100,
        latency_ms: latencyMs,
        success: true,
    }).then(({ error }) => {
        if (error) console.error('Failed to log generation:', error);
    });

    // Parse response
    const content = result.text;
    const metricsDelimiter = '---METRICS---';
    const endDelimiter = '---END---';

    let cvMarkdown = content;
    let addedKeywords = '';
    let reorderedBullets = 0;
    let quantifications = 0;
    let atsScore = 0;

    if (content.includes(metricsDelimiter)) {
        const parts = content.split(metricsDelimiter);
        cvMarkdown = parts[0].trim();
        const metricsPart = parts[1].split(endDelimiter)[0];
        const lines = metricsPart.split('\n');

        addedKeywords = extractMetadata(lines, 'ADDED_KEYWORDS');
        reorderedBullets = parseInt(extractMetadata(lines, 'REORDERED_BULLETS')) || 0;
        quantifications = parseInt(extractMetadata(lines, 'QUANTIFICATIONS')) || 0;
        atsScore = parseInt(extractMetadata(lines, 'ATS_SCORE')) || 0;
    }

    return {
        optimizedCV: cvMarkdown,
        changesLog: {
            added_keywords: addedKeywords ? addedKeywords.split(',').map(s => s.trim()).filter(Boolean) : [],
            reordered_bullets: reorderedBullets,
            quantifications_added: quantifications,
        },
        atsScore,
    };
}

function extractMetadata(lines: string[], key: string): string {
    const line = lines.find((l) => l.startsWith(key + ':'));
    return line ? line.split(':')[1].trim() : '';
}
