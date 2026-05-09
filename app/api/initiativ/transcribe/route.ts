import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED_LANGUAGES = new Set(['de', 'en', 'es']);

/**
 * POST /api/initiativ/transcribe
 *
 * Accepts multipart/form-data with a 'file' AudioBlob.
 * Transcribes via Whisper-1 and returns { text }.
 * Auth-gated, rate-limited (reuses transcribe limiter).
 *
 * Used by VoiceTextarea on the Initiativ tab — Pre-Launch is credit-free
 * (parallel pattern to /api/feedback/transcribe and coaching transcribe).
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const rateLimited = await checkUpstashLimit(rateLimiters.transcribe, user.id);
        if (rateLimited) return rateLimited;

        const formData = await request.formData();
        const file = formData.get('file');
        const rawLanguage = (formData.get('language') as string) || 'de';
        const language = ALLOWED_LANGUAGES.has(rawLanguage) ? rawLanguage : 'de';

        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
        }

        const audioFile = new File([file as Blob], 'audio.webm', { type: 'audio/webm' });

        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            language,
        });

        return NextResponse.json({ text: transcription.text });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[initiativ/transcribe] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
