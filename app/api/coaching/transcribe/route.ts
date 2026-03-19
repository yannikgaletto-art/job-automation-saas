/**
 * Voice Note Transcription API Route
 * Feature-Silo: coaching
 * 
 * POST: Receives audio blob, transcribes via OpenAI Whisper, returns text.
 * Audio is NOT stored — transcribed and discarded (DSGVO-konform).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

// Max file size: 10 MB (Whisper limit is 25 MB, but we keep it tighter)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Known Whisper hallucination patterns (German + English)
const HALLUCINATION_PATTERNS = [
    'vielen dank fürs zuschauen',
    'vielen dank für das zuschauen',
    'untertitelung',
    'untertitel',
    'thank you for watching',
    'thanks for watching',
    'please subscribe',
    'bitte abonnieren',
    'copyright',
    'music playing',
    'musik spielt',
];

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
    if (!openaiClient) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not configured');
        }
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiClient;
}

/**
 * Checks if the transcription is likely a Whisper hallucination.
 */
function isHallucination(text: string): boolean {
    const lower = text.toLowerCase().trim();

    // Too short to be meaningful (< 3 chars)
    if (lower.length < 3) return true;

    // Check against known hallucination patterns
    for (const pattern of HALLUCINATION_PATTERNS) {
        if (lower.includes(pattern)) return true;
    }

    // Repeated characters or nonsense (e.g. "ahhhhh" or "...")
    if (/^(.)\1{4,}$/.test(lower)) return true;

    return false;
}

export async function POST(request: Request) {
    try {
        // Auth check (Contract 8)
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse multipart form data
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File | null;
        const localeRaw = (formData.get('locale') as string) || 'de';

        // Map locale to Whisper-compatible language code
        const WHISPER_LANG: Record<string, string> = { de: 'de', en: 'en', es: 'es' };
        const whisperLang = WHISPER_LANG[localeRaw] || 'de';

        if (!audioFile) {
            const msg = localeRaw === 'en' ? 'No audio file found' : localeRaw === 'es' ? 'No se encontró archivo de audio' : 'Keine Audio-Datei gefunden';
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        // Validate file type
        const validTypes = ['audio/webm', 'audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/m4a'];
        if (!validTypes.some((t) => audioFile.type.startsWith(t.split('/')[0]))) {
            const msg = localeRaw === 'en' ? 'Invalid audio format' : localeRaw === 'es' ? 'Formato de audio no válido' : 'Ungültiges Audio-Format';
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        // Validate file size
        if (audioFile.size > MAX_FILE_SIZE) {
            const msg = localeRaw === 'en' ? 'Audio file too large (max. 10 MB)' : localeRaw === 'es' ? 'Archivo de audio demasiado grande (máx. 10 MB)' : 'Audio-Datei zu groß (max. 10 MB)';
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        // Validate minimum size (< 1KB is likely empty/too short)
        if (audioFile.size < 1000) {
            const msg = localeRaw === 'en' ? 'Recording too short. Please speak for at least 1 second.' : localeRaw === 'es' ? 'Grabación demasiado corta. Por favor habla al menos 1 segundo.' : 'Aufnahme zu kurz. Bitte sprich mindestens 1 Sekunde.';
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        // Transcribe via OpenAI Whisper
        const client = getOpenAI();
        const transcription = await client.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            language: whisperLang,
            response_format: 'json',
        });

        const text = transcription.text?.trim() || '';

        // Check for hallucinations
        if (!text || isHallucination(text)) {
            const msg = localeRaw === 'en' ? 'We could not understand you. Please try again.' : localeRaw === 'es' ? 'No pudimos entenderte. Por favor inténtalo de nuevo.' : 'Wir konnten dich leider nicht verstehen. Bitte versuche es erneut.';
            return NextResponse.json({ error: msg }, { status: 422 });
        }

        console.log(`✅ [Voice] Transcribed ${audioFile.size} bytes → ${text.length} chars for user ${user.id}`);

        return NextResponse.json({
            text,
            durationSeconds: Math.ceil(audioFile.size / 16000), // Rough estimate
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ [Voice] Transcription error:', message);

        if (message.includes('OPENAI_API_KEY')) {
            return NextResponse.json(
                { error: 'Spracherkennung ist nicht konfiguriert' },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { error: 'Transkription fehlgeschlagen. Bitte tippe deine Antwort.' },
            { status: 500 }
        );
    }
}
