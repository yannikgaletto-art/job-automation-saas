import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRateLimiter, checkRateLimit } from '@/lib/api/rate-limit';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 20 transcriptions per 10 minutes per user (generous — each is short)
const transcribeLimiter = createRateLimiter({ maxRequests: 20, windowMs: 600_000 });

/**
 * POST /api/feedback/transcribe
 *
 * Accepts multipart/form-data with an 'file' AudioBlob.
 * Transcribes via Whisper-1 and returns { text }.
 * Auth-gated, rate limited.
 */
export async function POST(request: NextRequest) {
    try {
        // Auth guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limit
        const rateLimited = checkRateLimit(transcribeLimiter, user.id, 'feedback/transcribe');
        if (rateLimited) return rateLimited;

        // Parse the audio blob from FormData
        const formData = await request.formData();
        const file = formData.get('file');
        const language = (formData.get('language') as string) || 'de';

        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
        }

        // Whisper needs a File object with a name + correct mime
        const audioFile = new File([file as Blob], 'audio.webm', { type: 'audio/webm' });

        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            language,
        });

        return NextResponse.json({ text: transcription.text });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[feedback/transcribe] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
