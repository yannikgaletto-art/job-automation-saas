/**
 * AI Model Router - Cost Optimization Layer
 *
 * Routes tasks to cost-effective models while preserving quality.
 *
 * Provider hierarchy:
 *   - Claude Sonnet 4.5: Creative writing (Cover Letter, CV Optimizer)
 *   - Claude Haiku 4.5: Semantic analysis (CV Match, Language Judge, Coaching)
 *   - Mistral Small 4: Classification & extraction (Parse HTML, Detect ATS, etc.)
 *
 * COST OPTIMIZATION HISTORY:
 *   2026-03-30: GPT_4O_MINI removed (dead code)
 *   2026-03-30: Language Judge downgraded Sonnet → Haiku
 *   2026-03-30 Phase 2: Mistral Small 4 added for Stufe 1 tasks (~5× cheaper than Haiku)
 */

import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

export const MODELS = {
    CLAUDE_SONNET: {
        id: 'claude-sonnet-4-6-20260220',
        provider: 'anthropic' as const,
        cost_input_per_1m: 3.0,
        cost_output_per_1m: 15.0,
        strengths: ['creative_writing', 'complex_reasoning'],
    },
    CLAUDE_HAIKU: {
        id: 'claude-haiku-4-5-20251001',
        provider: 'anthropic' as const,
        cost_input_per_1m: 1.0,
        cost_output_per_1m: 5.0,
        strengths: ['parsing', 'classification', 'fast_execution'],
    },
    // Mistral Small 4 — EU-native (Paris), DSGVO-compliant by default
    // OpenAI-compatible API: https://api.mistral.ai/v1/chat/completions
    // Input: $0.15/1M | Output: $0.60/1M (~5× cheaper than Haiku)
    MISTRAL_SMALL: {
        id: 'mistral-small-2503',
        provider: 'mistral' as const,
        cost_input_per_1m: 0.15,
        cost_output_per_1m: 0.60,
        strengths: ['classification', 'extraction', 'fast_execution', 'eu_native'],
    },
} as const;

// ============================================================================
// TASK TYPES
// ============================================================================

export type TaskType =
    // Mistral Small tier (cheapest — pure classification/extraction)
    | 'parse_html'
    | 'extract_job_fields'
    | 'detect_ats_system'
    | 'classify_job_board'
    | 'summarize_job_description'
    | 'classify_station_relevance'
    // Haiku tier (semantic understanding, structured analysis)
    | 'briefing_generate'
    | 'cv_match'
    | 'cv_parse'
    | 'translate_cv'
    | 'language_judge'
    | 'kill_fluff'
    | 'analyze_skill_gaps'
    | 'synthesize_certificates'
    // Premium tier (Claude Sonnet — creative writing only)
    | 'write_cover_letter'
    | 'personalize_intro'
    | 'generate_motivation_text'
    | 'optimize_cv';

// ============================================================================
// ROUTING LOGIC
// ============================================================================

export function selectModel(taskType: TaskType) {
    const routingMap: Record<TaskType, keyof typeof MODELS> = {
        // Mistral Small 4: Classification & extraction (Stufe 1 — 2026-03-30 Phase 2)
        // Pure data extraction, no creative writing, no complex JSON schemas
        parse_html: 'MISTRAL_SMALL',
        extract_job_fields: 'MISTRAL_SMALL',
        detect_ats_system: 'MISTRAL_SMALL',
        classify_job_board: 'MISTRAL_SMALL',
        summarize_job_description: 'MISTRAL_SMALL',
        classify_station_relevance: 'MISTRAL_SMALL',
        // Claude Haiku: Semantic analysis (needs deep understanding + reliable JSON)
        briefing_generate: 'CLAUDE_HAIKU',
        language_judge: 'CLAUDE_HAIKU',
        kill_fluff: 'CLAUDE_HAIKU',
        cv_match: 'CLAUDE_HAIKU',
        cv_parse: 'CLAUDE_HAIKU',
        translate_cv: 'CLAUDE_HAIKU',
        analyze_skill_gaps: 'CLAUDE_HAIKU',
        synthesize_certificates: 'CLAUDE_HAIKU',
        // Claude Sonnet: Creative writing (quality-critical)
        write_cover_letter: 'CLAUDE_SONNET',
        personalize_intro: 'CLAUDE_SONNET',
        generate_motivation_text: 'CLAUDE_SONNET',
        optimize_cv: 'CLAUDE_SONNET',
    };

    return MODELS[routingMap[taskType]];
}

// ============================================================================
// UNIFIED API
// ============================================================================

export interface CompletionRequest {
    taskType: TaskType;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface CompletionResponse {
    text: string;
    model: string;
    tokensUsed: number;
    costCents: number;
    latencyMs: number;
}

let anthropicClient: Anthropic | null = null;

function getAnthropicClient() {
    if (!anthropicClient) {
        const heliconeKey = process.env.HELICONE_API_KEY?.trim();

        anthropicClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY!,
            // Helicone proxy: transparent cost tracking, prompt history, latency monitoring.
            // When HELICONE_API_KEY is absent (e.g. local dev), falls back to direct Anthropic.
            ...(heliconeKey ? {
                baseURL: 'https://anthropic.helicone.ai',
                defaultHeaders: {
                    'Helicone-Auth': `Bearer ${heliconeKey}`,
                    'Helicone-Property-App': 'pathly-v2',
                },
            } : {}),
        });
    }
    return anthropicClient;
}

/**
 * Mistral API call — OpenAI-compatible REST endpoint
 * No SDK needed, uses standard fetch.
 * Endpoint: https://api.mistral.ai/v1/chat/completions
 */
async function completeMistral(
    request: CompletionRequest,
    modelId: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
        throw new Error('MISTRAL_API_KEY is not set. Required for Mistral Small tasks.');
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.prompt });

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: modelId,
            messages,
            max_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        throw new Error(`Mistral API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;

    return { text, inputTokens, outputTokens };
}

export async function complete(
    request: CompletionRequest
): Promise<CompletionResponse> {
    const startTime = Date.now();
    const model = selectModel(request.taskType);

    let result: { text: string; inputTokens: number; outputTokens: number };

    if (model.provider === 'anthropic') {
        const client = getAnthropicClient();
        const response = await client.messages.create({
            model: model.id,
            max_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 0,
            system: request.systemPrompt,
            messages: [{ role: 'user', content: request.prompt }],
        });

        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('\n');

        result = {
            text,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
        };
    } else if (model.provider === 'mistral') {
        // Resilience: If MISTRAL_API_KEY is missing, fall back to Haiku.
        // This prevents silent extraction failures in misconfigured environments.
        const mistralKey = process.env.MISTRAL_API_KEY;
        if (!mistralKey) {
            console.warn(`⚠️ [ModelRouter] MISTRAL_API_KEY missing — falling back to Haiku for task="${request.taskType}". Configure MISTRAL_API_KEY for cost-optimal routing.`);
            // Re-route to Haiku via anthropic path
            const haiku = MODELS.CLAUDE_HAIKU;
            const client = getAnthropicClient();
            const fallbackResponse = await client.messages.create({
                model: haiku.id,
                max_tokens: request.maxTokens ?? 4096,
                temperature: request.temperature ?? 0,
                system: request.systemPrompt,
                messages: [{ role: 'user', content: request.prompt }],
            });
            const fallbackText = fallbackResponse.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map((block) => block.text)
                .join('\n');
            result = {
                text: fallbackText,
                inputTokens: fallbackResponse.usage.input_tokens,
                outputTokens: fallbackResponse.usage.output_tokens,
            };
        } else {
            result = await completeMistral(request, model.id);
        }
    } else {
        throw new Error(`Unsupported provider: ${(model as any).provider}. Supported: anthropic, mistral.`);
    }

    const latencyMs = Date.now() - startTime;
    const tokensUsed = result.inputTokens + result.outputTokens;
    const costCents = Math.ceil(
        ((result.inputTokens / 1_000_000) * model.cost_input_per_1m +
            (result.outputTokens / 1_000_000) * model.cost_output_per_1m) * 100
    );

    // Track costs in memory (dev convenience — resets on serverless cold starts!)
    if (!costStats.taskBreakdown[request.taskType]) {
        costStats.taskBreakdown[request.taskType] = { count: 0, costCents: 0 };
    }
    costStats.taskBreakdown[request.taskType].count += 1;
    costStats.taskBreakdown[request.taskType].costCents += costCents;
    costStats.totalCostCents += costCents;

    // Structured cost log — this is the primary cost tracking mechanism for production.
    // Vercel log drains (Datadog, Axiom) can parse this JSON and aggregate costs.
    // Format: parseable by standard log aggregation tools.
    console.log(JSON.stringify({
        type: 'ai_cost',
        timestamp: new Date().toISOString(),
        task: request.taskType,
        model: model.id,
        provider: model.provider,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tokens: tokensUsed,
        costCents,
        costEur: +(costCents / 100).toFixed(4),
        latencyMs,
    }));

    return {
        text: result.text,
        model: model.id,
        tokensUsed,
        costCents,
        latencyMs,
    };
}

// ============================================================================
// COST TRACKING (IN-MEMORY — DEV ONLY)
// ============================================================================
//
// ⚠️ SERVERLESS WARNING: On Vercel/serverless, in-memory state resets on
// every cold start. For production cost tracking, use the structured JSON
// logs emitted by `complete()` above — pipe them into a log drain
// (Datadog, Axiom) or aggregate via Vercel's built-in log viewer.
//
// To add DB-based tracking: create an `ai_cost_tracking` table and
// INSERT from the `complete()` function above (add ~5ms latency per call).
//

interface CostStats {
    totalCostCents: number;
    taskBreakdown: Record<string, { count: number; costCents: number }>;
}

let costStats: CostStats = {
    totalCostCents: 0,
    taskBreakdown: {},
};

export function getCostStats(): CostStats {
    return { ...costStats };
}

export function resetCostStats() {
    costStats = { totalCostCents: 0, taskBreakdown: {} };
}
