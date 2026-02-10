/**
 * AI Model Router - Cost Optimization Layer
 * 
 * This module routes AI tasks to the most cost-effective model based on task complexity.
 * 
 * Cost Philosophy:
 * - Intelligence is expensive (Claude Sonnet: €3/1M tokens)
 * - Formatting is cheap (Llama 3 70B: €0.60/1M tokens)
 * - Summarization is medium (GPT-4o-mini: €0.15/1M tokens)
 * 
 * Expected Savings: ~40% cost reduction at scale (€500/mo → €300/mo for 1000 users)
 * 
 * @reference Jack Roberts - Open Code Router concept
 * @reference Nick Saraev - Task-based model selection
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// ============================================================================
// MODEL DEFINITIONS
// ============================================================================

export const MODELS = {
  // Tier 1: Premium (Creative Writing, Complex Reasoning)
  CLAUDE_SONNET: {
    id: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    cost_per_1m_tokens: 3.0,
    strengths: ['creative_writing', 'complex_reasoning', 'nuanced_tone'],
    max_tokens: 200_000,
  },
  
  // Tier 2: Balanced (Summarization, Classification)
  GPT_4O_MINI: {
    id: 'gpt-4o-mini',
    provider: 'openai',
    cost_per_1m_tokens: 0.15,
    strengths: ['summarization', 'classification', 'json_formatting'],
    max_tokens: 128_000,
  },
  
  // Tier 3: Budget (Parsing, Extraction, Simple Tasks)
  GPT_4O_MINI_FAST: {
    id: 'gpt-4o-mini',
    provider: 'openai',
    cost_per_1m_tokens: 0.15,
    strengths: ['parsing', 'extraction', 'keyword_matching'],
    max_tokens: 128_000,
    temperature: 0, // Deterministic for parsing
  },
} as const;

// ============================================================================
// TASK TYPE DEFINITIONS
// ============================================================================

export type TaskType =
  // HTML/Data Processing (Use cheapest model)
  | 'parse_html'
  | 'extract_job_fields'
  | 'detect_ats_system'
  | 'classify_job_board'
  
  // Text Analysis (Use medium model)
  | 'summarize_job_description'
  | 'extract_key_requirements'
  | 'analyze_company_culture'
  | 'match_cv_to_job'
  
  // Creative Writing (Use premium model)
  | 'write_cover_letter'
  | 'personalize_intro'
  | 'generate_motivation_text'
  | 'write_cv_summary';

// ============================================================================
// ROUTING LOGIC
// ============================================================================

/**
 * Select the optimal model for a given task type.
 * 
 * Decision Tree:
 * 1. Creative Writing → Claude Sonnet (best quality)
 * 2. Analysis/Summary → GPT-4o-mini (balanced)
 * 3. Parsing/Extraction → GPT-4o-mini (fast, deterministic)
 */
export function selectModel(taskType: TaskType) {
  const routingMap: Record<TaskType, keyof typeof MODELS> = {
    // Tier 3: Budget (Parsing/Extraction)
    parse_html: 'GPT_4O_MINI_FAST',
    extract_job_fields: 'GPT_4O_MINI_FAST',
    detect_ats_system: 'GPT_4O_MINI_FAST',
    classify_job_board: 'GPT_4O_MINI_FAST',
    
    // Tier 2: Balanced (Analysis)
    summarize_job_description: 'GPT_4O_MINI',
    extract_key_requirements: 'GPT_4O_MINI',
    analyze_company_culture: 'GPT_4O_MINI',
    match_cv_to_job: 'GPT_4O_MINI',
    
    // Tier 1: Premium (Creative Writing)
    write_cover_letter: 'CLAUDE_SONNET',
    personalize_intro: 'CLAUDE_SONNET',
    generate_motivation_text: 'CLAUDE_SONNET',
    write_cv_summary: 'CLAUDE_SONNET',
  };
  
  return MODELS[routingMap[taskType]];
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required for Claude models');
    }
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

function getOpenAIClient() {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for GPT models');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// ============================================================================
// UNIFIED COMPLETION API
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

/**
 * Execute an AI task with automatic model routing and cost tracking.
 * 
 * Example:
 * ```typescript
 * const result = await complete({
 *   taskType: 'write_cover_letter',
 *   prompt: 'Write a cover letter for...',
 *   systemPrompt: 'You are a professional career coach',
 * });
 * 
 * console.log(`Cost: €${result.costCents / 100}`);
 * ```
 */
export async function complete(
  request: CompletionRequest
): Promise<CompletionResponse> {
  const startTime = Date.now();
  const model = selectModel(request.taskType);
  
  let result: { text: string; tokensUsed: number };
  
  // Route to appropriate provider
  if (model.provider === 'anthropic') {
    result = await callAnthropicAPI(request, model);
  } else if (model.provider === 'openai') {
    result = await callOpenAIAPI(request, model);
  } else {
    throw new Error(`Unknown provider: ${model.provider}`);
  }
  
  const latencyMs = Date.now() - startTime;
  const costCents = calculateCost(result.tokensUsed, model.cost_per_1m_tokens);
  
  // Log for monitoring
  console.log(`[Model Router] Task: ${request.taskType}, Model: ${model.id}, Cost: €${costCents / 100}, Latency: ${latencyMs}ms`);
  
  return {
    text: result.text,
    model: model.id,
    tokensUsed: result.tokensUsed,
    costCents,
    latencyMs,
  };
}

// ============================================================================
// PROVIDER-SPECIFIC IMPLEMENTATIONS
// ============================================================================

async function callAnthropicAPI(
  request: CompletionRequest,
  model: typeof MODELS[keyof typeof MODELS]
) {
  const client = getAnthropicClient();
  
  const response = await client.messages.create({
    model: model.id,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature ?? 1.0,
    system: request.systemPrompt,
    messages: [
      {
        role: 'user',
        content: request.prompt,
      },
    ],
  });
  
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('\n');
  
  return {
    text,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}

async function callOpenAIAPI(
  request: CompletionRequest,
  model: typeof MODELS[keyof typeof MODELS]
) {
  const client = getOpenAIClient();
  
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  
  if (request.systemPrompt) {
    messages.push({
      role: 'system',
      content: request.systemPrompt,
    });
  }
  
  messages.push({
    role: 'user',
    content: request.prompt,
  });
  
  const response = await client.chat.completions.create({
    model: model.id,
    messages,
    temperature: request.temperature ?? model.temperature ?? 1.0,
    max_tokens: request.maxTokens ?? 4096,
  });
  
  return {
    text: response.choices[0]?.message?.content ?? '',
    tokensUsed: response.usage?.total_tokens ?? 0,
  };
}

// ============================================================================
// COST CALCULATION
// ============================================================================

/**
 * Calculate cost in cents based on token usage and model pricing.
 * 
 * Example:
 * - 10,000 tokens on Claude Sonnet (€3/1M) = €0.03 = 3 cents
 * - 10,000 tokens on GPT-4o-mini (€0.15/1M) = €0.0015 = 0.15 cents
 */
function calculateCost(tokens: number, costPer1MTokens: number): number {
  const costEur = (tokens / 1_000_000) * costPer1MTokens;
  return Math.ceil(costEur * 100); // Convert to cents
}

// ============================================================================
// BATCH PROCESSING (Advanced)
// ============================================================================

/**
 * Process multiple tasks of the same type in parallel.
 * 
 * Benefits:
 * - Reduces context switching between models
 * - Better rate limit utilization
 * - Lower latency for batch operations
 * 
 * Example:
 * ```typescript
 * const jobs = await getJobsToProcess(limit: 10);
 * 
 * const parsed = await batchComplete({
 *   taskType: 'parse_html',
 *   prompts: jobs.map(j => j.html),
 * });
 * ```
 */
export async function batchComplete(
  requests: CompletionRequest[]
): Promise<CompletionResponse[]> {
  // Group by task type to use same model
  const groupedByTask = requests.reduce((acc, req) => {
    const taskType = req.taskType;
    if (!acc[taskType]) acc[taskType] = [];
    acc[taskType].push(req);
    return acc;
  }, {} as Record<TaskType, CompletionRequest[]>);
  
  // Process each group in parallel
  const results = await Promise.all(
    Object.values(groupedByTask).map((group) =>
      Promise.all(group.map((req) => complete(req)))
    )
  );
  
  return results.flat();
}

// ============================================================================
// COST MONITORING
// ============================================================================

interface CostStats {
  totalCostCents: number;
  taskBreakdown: Record<TaskType, { count: number; costCents: number }>;
  modelBreakdown: Record<string, { count: number; costCents: number }>;
}

let costStats: CostStats = {
  totalCostCents: 0,
  taskBreakdown: {} as any,
  modelBreakdown: {},
};

/**
 * Track cost metrics for monitoring and alerting.
 * 
 * Usage:
 * ```typescript
 * const stats = getCostStats();
 * console.log(`Total spent: €${stats.totalCostCents / 100}`);
 * console.log(`Cover letters: ${stats.taskBreakdown.write_cover_letter.count}`);
 * ```
 */
export function getCostStats(): CostStats {
  return { ...costStats };
}

/**
 * Reset cost stats (e.g., at start of new billing period).
 */
export function resetCostStats() {
  costStats = {
    totalCostCents: 0,
    taskBreakdown: {} as any,
    modelBreakdown: {},
  };
}

// Internal: Track costs
function trackCost(taskType: TaskType, model: string, costCents: number) {
  costStats.totalCostCents += costCents;
  
  // Task breakdown
  if (!costStats.taskBreakdown[taskType]) {
    costStats.taskBreakdown[taskType] = { count: 0, costCents: 0 };
  }
  costStats.taskBreakdown[taskType].count++;
  costStats.taskBreakdown[taskType].costCents += costCents;
  
  // Model breakdown
  if (!costStats.modelBreakdown[model]) {
    costStats.modelBreakdown[model] = { count: 0, costCents: 0 };
  }
  costStats.modelBreakdown[model].count++;
  costStats.modelBreakdown[model].costCents += costCents;
}

// ============================================================================
// EXAMPLES & TESTING
// ============================================================================

/**
 * Example: Parse job HTML (cheap model)
 */
export async function exampleParseJob(html: string) {
  return complete({
    taskType: 'parse_html',
    prompt: `Extract job details from this HTML:\n${html}`,
    systemPrompt: 'You are a precise HTML parser. Output JSON only.',
    temperature: 0,
  });
}

/**
 * Example: Write cover letter (premium model)
 */
export async function exampleWriteCoverLetter(jobTitle: string, company: string) {
  return complete({
    taskType: 'write_cover_letter',
    prompt: `Write a cover letter for ${jobTitle} at ${company}`,
    systemPrompt: 'You are a professional career coach.',
  });
}

/**
 * Example: Cost comparison test
 */
export async function testCostComparison() {
  console.log('=== Cost Comparison Test ===\n');
  
  // Test 1: Parse HTML (should use cheap model)
  const parseResult = await exampleParseJob('<div>Senior Engineer at Tesla</div>');
  console.log(`Parse HTML: €${parseResult.costCents / 100} (${parseResult.model})`);
  
  // Test 2: Write cover letter (should use premium model)
  const writeResult = await exampleWriteCoverLetter('Senior Engineer', 'Tesla');
  console.log(`Cover Letter: €${writeResult.costCents / 100} (${writeResult.model})`);
  
  console.log(`\nTotal: €${(parseResult.costCents + writeResult.costCents) / 100}`);
  console.log(`\nExpected savings vs. all-Claude: ~40%`);
}
