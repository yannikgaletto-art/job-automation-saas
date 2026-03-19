/**
 * Coaching Service
 * Feature-Silo: coaching
 * 
 * Handles the conversation flow for coaching sessions.
 * Uses isolated Anthropic client — does NOT touch model-router.ts.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { buildCoachingSystemPrompt, COACHING_PROMPT_VERSION, type InterviewRound } from '@/lib/prompts/coaching-system-prompt';
import {
    type CoachingLocale,
    getMaxTurnMessage,
    getFarewellSystemPrompt,
    getFarewellUserMessage,
    getFarewellFallback,
    getHintSystemPrompt,
    getHintUserMessage,
    getKickoffPrompt,
} from '@/lib/prompts/coaching-prompt-i18n';
import type { CoachingDossier, ChatMessage } from '@/types/coaching';
import { sanitizeForAI, buildContentHash } from '@/lib/services/pii-sanitizer';

// Isolated clients — NOT from model-router (Forbidden File)
let coachingClient: Anthropic | null = null;

function getClient(): Anthropic {
    if (!coachingClient) {
        coachingClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY!,
        });
    }
    return coachingClient;
}

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Conversation: Sonnet 4.5 (quality critical — CLAUDE.md: Sonnet = Generation, Haiku = Judge)
const COACHING_MODEL = 'claude-sonnet-4-5-20250929';
// Hints: Haiku 3 (cheap, quality uncritical)
const HINT_MODEL = 'claude-haiku-4-5-20251001';
interface SendMessageResult {
    aiMessage: string;
    hint: string;
    turnNumber: number;
    isComplete: boolean;
    tokensUsed: number;
    costCents: number;
}

/**
 * Sends a user message in a coaching session and gets the AI response.
 */
export async function sendCoachingMessage(
    sessionId: string,
    userId: string,
    userMessage: string
): Promise<SendMessageResult> {
    // 1. Load session
    const { data: session, error: sessionError } = await supabaseAdmin
        .from('coaching_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

    if (sessionError || !session) {
        throw new Error('SESSION_NOT_FOUND: Coaching-Session nicht gefunden.');
    }

    if (session.session_status !== 'active') {
        throw new Error('SESSION_ENDED: Diese Session ist bereits beendet.');
    }

    const conversationHistory: ChatMessage[] = session.conversation_history || [];
    const currentTurn = (session.turn_count || 0) + 1;
    const maxQuestions = session.max_questions || 5;
    const locale: CoachingLocale = session.language || 'de';

    // 2. Check max turns
    if (currentTurn > maxQuestions * 2) {
        return {
            aiMessage: getMaxTurnMessage(locale),
            hint: '',
            turnNumber: currentTurn,
            isComplete: true,
            tokensUsed: 0,
            costCents: 0,
        };
    }

    // 3. DSGVO Phase 3: Sanitize current user message BEFORE push
    // warningFlags captured here for quality_summary audit trail (Art. 15)
    const { warningFlags } = sanitizeForAI(userMessage);

    // Add ORIGINAL user message to history (user's own data, Art. 6.1b)
    const userMsg: ChatMessage = {
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
        turnNumber: currentTurn,
    };
    conversationHistory.push(userMsg);

    // 4. Load job data for prompt context
    const { data: job } = await supabaseAdmin
        .from('job_queue')
        .select('job_title, company_name, description')
        .eq('id', session.job_id)
        .single();

    const dossier = session.coaching_dossier as CoachingDossier;

    // 5. Build system prompt
    const round = (session.interview_round as InterviewRound) || 'kennenlernen';
    const systemPrompt = buildCoachingSystemPrompt({
        userName: 'Kandidat/in',
        jobTitle: job?.job_title || 'Unbekannte Stelle',
        companyName: job?.company_name || 'Unbekanntes Unternehmen',
        dossier,
        round,
        maxQuestions,
        locale,
    });

    // 6. Build messages for Claude (convert to Anthropic format)
    // DSGVO Phase 2: Sanitize user messages before sending to Claude (Art. 28)
    // conversation_history keeps ORIGINAL messages (user's data, Art. 6.1b)
    const anthropicMessages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
        role: msg.role === 'coach' ? 'assistant' as const : 'user' as const,
        content: msg.role === 'user' ? sanitizeForAI(msg.content).sanitized : msg.content,
    }));

    // 6b. HARD STOP: If this is the last answer, generate farewell via Haiku.
    if (currentTurn >= maxQuestions) {
        // BUG#1 FIX: userAnswers was computed but never used in farewell call — removed
        let farewell = getFarewellFallback(locale);
        try {
            const client = getClient();
            const farewellResponse = await client.messages.create({
                model: HINT_MODEL,
                max_tokens: 100,
                temperature: 0.5,
                system: getFarewellSystemPrompt(locale),
                messages: [
                    { role: 'user', content: getFarewellUserMessage(locale, maxQuestions) },
                ],
            });

            const generated = farewellResponse.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map(block => block.text)
                .join('\n')
                .trim();
            if (generated.length > 10) farewell = generated;
        } catch {
            console.warn('[Coaching] Farewell generation failed, using fallback');
        }

        // Persist farewell in conversation_history (reload-safe)
        const farewellMsg: ChatMessage = {
            role: 'coach',
            content: farewell,
            timestamp: new Date().toISOString(),
            turnNumber: currentTurn,
        };
        conversationHistory.push(farewellMsg);

        await supabaseAdmin
            .from('coaching_sessions')
            .update({
                conversation_history: conversationHistory,
                turn_count: currentTurn,
                session_status: 'completed',
                completed_at: new Date().toISOString(),
            })
            .eq('id', sessionId);

        return {
            aiMessage: farewell,
            hint: '',
            turnNumber: currentTurn,
            isComplete: true,
            tokensUsed: 0,
            costCents: 0,
        };
    }

    const client = getClient();
    const response = await client.messages.create({
        model: COACHING_MODEL,
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages: anthropicMessages,
    });

    const aiText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    const costCents = Math.ceil((tokensUsed / 1_000_000) * 3.0 * 100);

    // 8. Add AI response to history
    const aiMsg: ChatMessage = {
        role: 'coach',
        content: aiText,
        timestamp: new Date().toISOString(),
        turnNumber: currentTurn,
    };
    conversationHistory.push(aiMsg);

    // 9. Generate hint (model answer in 3 bullet points) — separate mini-call
    let hint = '';
    try {
        const hintResponse = await client.messages.create({
            model: HINT_MODEL,
            max_tokens: 300,
            temperature: 0.3,
            system: getHintSystemPrompt(locale),
            messages: [
                { role: 'user', content: getHintUserMessage(locale, conversationHistory.filter(m => m.role === 'coach').slice(-1)[0]?.content?.substring(0, 300) || (locale === 'en' ? 'General question' : locale === 'es' ? 'Pregunta general' : 'Allgemeine Frage')) },
            ],
        });
        hint = hintResponse.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('\n');
    } catch {
        console.warn('[Coaching] Hint generation failed, proceeding without');
    }

    const isComplete = false; // maxQuestions case is handled above with early return

    // 11. Update session in DB
    const { error: updateError } = await supabaseAdmin
        .from('coaching_sessions')
        .update({
            conversation_history: conversationHistory,
            turn_count: currentTurn,
            tokens_used: (session.tokens_used || 0) + tokensUsed,
            cost_cents: (session.cost_cents || 0) + costCents,
        })
        .eq('id', sessionId);

    if (updateError) {
        console.error('❌ [Coaching] Failed to update session:', updateError.message);
    }

    // 12. Log to generation_logs (DSGVO Phase 2: no plaintext, hash only)
    await supabaseAdmin.from('generation_logs').insert({
        job_id: session.job_id,
        user_id: userId,
        model_name: COACHING_MODEL,
        model_version: COACHING_PROMPT_VERSION,
        iteration: currentTurn,
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        generated_text: null,
        content_hash: buildContentHash(aiText),
        quality_summary: { pii_flags: warningFlags, sanitized: warningFlags.length > 0 },
        created_at: new Date().toISOString(),
    });

    console.log(`✅ [Coaching] Turn ${currentTurn} complete | ${tokensUsed} tokens | €${(costCents / 100).toFixed(4)}`);

    return {
        aiMessage: aiText,
        hint,
        turnNumber: currentTurn,
        isComplete,
        tokensUsed,
        costCents,
    };
}

/**
 * Initializes a coaching session with the first AI message.
 */
export async function getInitialCoachingMessage(
    sessionId: string,
    userId: string
): Promise<{ aiMessage: string; tokensUsed: number; costCents: number }> {
    // Load session
    const { data: session } = await supabaseAdmin
        .from('coaching_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

    if (!session) {
        throw new Error('SESSION_NOT_FOUND');
    }

    const dossier = session.coaching_dossier as CoachingDossier;

    // Load job data
    const { data: job } = await supabaseAdmin
        .from('job_queue')
        .select('job_title, company_name, description')
        .eq('id', session.job_id)
        .single();

    // Build system prompt
    const round = (session.interview_round as InterviewRound) || 'kennenlernen';
    const locale: CoachingLocale = session.language || 'de';
    const systemPrompt = buildCoachingSystemPrompt({
        userName: 'Kandidat/in',
        jobTitle: job?.job_title || 'Unbekannte Stelle',
        companyName: job?.company_name || 'Unbekanntes Unternehmen',
        dossier,
        round,
        maxQuestions: session.max_questions || 5,
        locale,
    });

    // Get the first message from Claude (round-aware kickoff)
    const client = getClient();
    const kickoffPrompt = getKickoffPrompt(locale, round);

    const response = await client.messages.create({
        model: COACHING_MODEL,
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
            { role: 'user', content: kickoffPrompt },
        ],
    });

    const aiText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    const costCents = Math.ceil((tokensUsed / 1_000_000) * 3.0 * 100);

    // Save initial message to conversation history
    const initialHistory: ChatMessage[] = [
        {
            role: 'coach',
            content: aiText,
            timestamp: new Date().toISOString(),
            turnNumber: 0,
        },
    ];

    await supabaseAdmin
        .from('coaching_sessions')
        .update({
            conversation_history: initialHistory,
            tokens_used: tokensUsed,
            cost_cents: costCents,
        })
        .eq('id', sessionId);

    // Log (DSGVO Phase 2: no plaintext, hash only)
    // getInitialCoachingMessage has no user input → quality_summary null
    await supabaseAdmin.from('generation_logs').insert({
        job_id: session.job_id,
        user_id: userId,
        model_name: COACHING_MODEL,
        model_version: COACHING_PROMPT_VERSION,
        iteration: 0,
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        generated_text: null,
        content_hash: buildContentHash(aiText),
        quality_summary: null,
        created_at: new Date().toISOString(),
    });

    return { aiMessage: aiText, tokensUsed, costCents };
}
