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
import type { CoachingDossier, ChatMessage } from '@/types/coaching';

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

    // 2. Check max turns
    if (currentTurn > maxQuestions * 2) {
        return {
            aiMessage: 'Das Interview ist nun abgeschlossen. Bitte klicke auf "Interview beenden", um deinen Feedback-Report zu erhalten.',
            hint: '',
            turnNumber: currentTurn,
            isComplete: true,
            tokensUsed: 0,
            costCents: 0,
        };
    }

    // 3. Add user message to history
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
    });

    // 6. Build messages for Claude (convert to Anthropic format)
    const anthropicMessages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
        role: msg.role === 'coach' ? 'assistant' as const : 'user' as const,
        content: msg.content,
    }));

    // 6b. HARD STOP: If this is the last answer, generate farewell via Haiku.
    if (currentTurn >= maxQuestions) {
        // Generate situationally-aware farewell using HINT_MODEL (cheap, already initialized)
        const userAnswers = conversationHistory
            .filter(m => m.role === 'user')
            .map(m => m.content)
            .join('\n---\n');

        const farewellExamples = `
Orientierung für den Ton (je nach maxQuestions):
1 Frage:  "Hey, schade, dass wir so wenig Zeit hatten! Ich hoffe, du konntest trotzdem eine Kleinigkeit für dich mitnehmen, und ich freue mich auf alle weiteren Gespräche mit dir."
2 Fragen: "Hey, danke für den kurzen, aber spannenden Austausch! Auch wenn die Zeit etwas knapp war, fand ich deine ersten Einblicke super spannend. Ich hoffe, du nimmst auch etwas für dich mit."
3 Fragen: "Hey, vielen Dank für das gute und aufschlussreiche Gespräch! Wir konnten ja doch einige interessante Punkte anschneiden, und es hat mir echt Spaß gemacht, deine Perspektive kennenzulernen."
4 Fragen: "Hey, das war ein richtig intensives und inspirierendes Gespräch, vielen Dank dafür! Deine ausführlichen Antworten haben mir sehr geholfen, und ich habe einige wertvolle Impulse von dir mitgenommen."
5 Fragen: "Hey, vielen Dank für das wirklich tolle und ausführliche Gespräch! Ich habe extrem viel von dir gelernt und richtig viel mitgenommen. Ich hoffe sehr, dass wir uns in Zukunft noch mal austauschen können, und wünsche dir bis dahin alles Gute."`;

        let farewell = 'Hey, danke für das Gespräch! Ich hoffe, du konntest etwas für dich mitnehmen.';
        try {
            const client = getClient();
            const farewellResponse = await client.messages.create({
                model: HINT_MODEL,
                max_tokens: 150,
                temperature: 0.5,
                system: `Du bist ein Recruiter, der gerade ein Vorstellungsgespräch beendet hat. Schreibe einen kurzen, authentischen Abschiedssatz (1-3 Sätze).

WICHTIG:
- Der Ton skaliert nach Anzahl der gestellten Fragen (${maxQuestions} von 5 möglichen).
- Bewerte die tatsächliche Gesprächsqualität anhand der User-Antworten. War der Austausch substantiell oder eher dünn? Reagiere ehrlich und wohlwollend, aber NICHT überschwänglich bei dünnen Antworten.
- Schreibe KEINEN Verweis auf eine Analyse oder einen Link. Kein Markdown, keine Emojis.
- Natürliches Deutsch, duze den Kandidaten.

${farewellExamples}`,
                messages: [
                    { role: 'user', content: `Das Interview hatte ${maxQuestions} Frage(n). Hier sind die Antworten des Kandidaten:\n\n${userAnswers}\n\nSchreibe jetzt den Abschiedssatz.` },
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
            system: 'Du bist ein Karriere-Coach. Generiere 3 kurze Stichpunkte als Muster-Antwort auf die Interview-Frage, die der Kandidat gerade beantwortet hat. Beziehe dich auf die Frage, nicht auf die Antwort. Schreibe NUR 3 Stichpunkte, jeder beginnt mit einem Spiegelstrich. Kein Fließtext, kein Markdown.',
            messages: [
                { role: 'user', content: `Die Interview-Frage war zum Thema: ${conversationHistory.filter(m => m.role === 'coach').slice(-1)[0]?.content?.substring(0, 300) || 'Allgemeine Frage'}\n\nGib 3 kurze Muster-Antwort-Stichpunkte.` },
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

    // 12. Log to generation_logs
    await supabaseAdmin.from('generation_logs').insert({
        job_id: session.job_id,
        user_id: userId,
        model_name: COACHING_MODEL,
        model_version: COACHING_PROMPT_VERSION,
        iteration: currentTurn,
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        generated_text: aiText.substring(0, 500),
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
    const systemPrompt = buildCoachingSystemPrompt({
        userName: 'Kandidat/in',
        jobTitle: job?.job_title || 'Unbekannte Stelle',
        companyName: job?.company_name || 'Unbekanntes Unternehmen',
        dossier,
        round,
        maxQuestions: session.max_questions || 5,
    });

    // Get the first message from Claude (round-aware kickoff)
    const client = getClient();
    const kickoffPrompt = round === 'case_study'
        ? 'Bitte begrüße mich kurz und präsentiere dann sofort das vollständige Case-Study-Szenario zur Bearbeitung.'
        : round === 'deep_dive'
            ? 'Bitte begrüße mich kurz, erkläre dass wir heute in fachliche Tiefe gehen, und stelle die erste Hauptfrage.'
            : 'Bitte starte das Interview.';

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

    // Log
    await supabaseAdmin.from('generation_logs').insert({
        job_id: session.job_id,
        user_id: userId,
        model_name: COACHING_MODEL,
        model_version: COACHING_PROMPT_VERSION,
        iteration: 0,
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        generated_text: aiText.substring(0, 500),
        created_at: new Date().toISOString(),
    });

    return { aiMessage: aiText, tokensUsed, costCents };
}
