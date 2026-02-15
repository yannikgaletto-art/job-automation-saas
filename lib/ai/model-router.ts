/**
 * AI Model Router - Cost Optimization Layer
 *
 * Routes tasks to cost-effective models while preserving quality.
 * Expected savings: 84% on parsing, 0% on creative (intentional)
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

export const MODELS = {
    CLAUDE_SONNET: {
        id: 'claude-3-5-sonnet-latest',
        provider: 'anthropic' as const,
        cost_per_1m_tokens: 3.0,
        strengths: ['creative_writing', 'complex_reasoning'],
    },
    GPT_4O_MINI: {
        id: 'gpt-4o-mini',
        provider: 'openai' as const,
        cost_per_1m_tokens: 0.15,
        strengths: ['parsing', 'classification', 'summarization'],
    },
} as const;

// ============================================================================
// TASK TYPES
// ============================================================================

export type TaskType =
    // Cheap tier (GPT-4o-mini)
    | 'parse_html'
    | 'extract_job_fields'
    | 'detect_ats_system'
    | 'classify_job_board'
    | 'summarize_job_description'
    // Premium tier (Claude Sonnet)
    | 'write_cover_letter'
    | 'personalize_intro'
    | 'generate_motivation_text'
    | 'optimize_cv';

// ============================================================================
// ROUTING LOGIC
// ============================================================================

export function selectModel(taskType: TaskType) {
    const routingMap: Record<TaskType, keyof typeof MODELS> = {
        // Cheap tasks
        parse_html: 'GPT_4O_MINI',
        extract_job_fields: 'GPT_4O_MINI',
        detect_ats_system: 'GPT_4O_MINI',
        classify_job_board: 'GPT_4O_MINI',
        summarize_job_description: 'GPT_4O_MINI',
        // Premium tasks
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
let openaiClient: OpenAI | null = null;

function getAnthropicClient() {
    if (!anthropicClient) {
        anthropicClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY!,
        });
    }
    return anthropicClient;
}

function getOpenAIClient() {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY!,
        });
    }
    return openaiClient;
}

export async function complete(
    request: CompletionRequest
): Promise<CompletionResponse> {
    const startTime = Date.now();
    const model = selectModel(request.taskType);

    let result: { text: string; tokensUsed: number };

    if (model.provider === 'anthropic') {
        const client = getAnthropicClient();
        const response = await client.messages.create({
            model: model.id,
            max_tokens: request.maxTokens ?? 4096,
            temperature: request.temperature ?? 1.0,
            system: request.systemPrompt,
            messages: [{ role: 'user', content: request.prompt }],
        });

        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('\n');

        result = {
            text,
            tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        };
    } else {
        const client = getOpenAIClient();
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        if (request.systemPrompt) {
            messages.push({ role: 'system', content: request.systemPrompt });
        }
        messages.push({ role: 'user', content: request.prompt });

        const response = await client.chat.completions.create({
            model: model.id,
            messages,
            temperature: request.temperature ?? 0,
            max_tokens: request.maxTokens ?? 4096,
        });

        result = {
            text: response.choices[0]?.message?.content ?? '',
            tokensUsed: response.usage?.total_tokens ?? 0,
        };
    }

    const latencyMs = Date.now() - startTime;
    const costCents = Math.ceil(
        (result.tokensUsed / 1_000_000) * model.cost_per_1m_tokens * 100
    );

    // Track costs
    if (!costStats.taskBreakdown[request.taskType]) {
        costStats.taskBreakdown[request.taskType] = { count: 0, costCents: 0 };
    }
    costStats.taskBreakdown[request.taskType].count += 1;
    costStats.taskBreakdown[request.taskType].costCents += costCents;
    costStats.totalCostCents += costCents;

    console.log(
        `[Model Router] ${request.taskType} | ${model.id} | €${(costCents / 100).toFixed(4)} | ${latencyMs}ms`
    );

    return {
        text: result.text,
        model: model.id,
        tokensUsed: result.tokensUsed,
        costCents,
        latencyMs,
    };
}

// ============================================================================
// COST TRACKING
// ============================================================================

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
