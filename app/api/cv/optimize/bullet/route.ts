import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { getLanguageName, type SupportedLocale } from '@/lib/i18n/get-user-locale';
import { createRateLimiter, checkRateLimit } from '@/lib/api/rate-limit';

// Rate limit: 10 bullet requests per minute per user (lightweight calls)
const bulletLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

// Isolated Anthropic client — same pattern as Coaching & Video Script Studio.
// Does NOT use model-router.ts to avoid Forbidden File violation (FEATURE_COMPAT_MATRIX §0.1).
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

export async function POST(req: NextRequest) {
    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limit
        const rateLimited = checkRateLimit(bulletLimiter, user.id, 'cv/optimize/bullet');
        if (rateLimited) return rateLimited;

        const body = await req.json();
        const { keyword, user_input, station_company, station_role, locale: rawLocale } = body;

        // Input validation
        if (!keyword || typeof keyword !== 'string' || keyword.length > 50) {
            return NextResponse.json({ success: false, error: 'error_bullet_failed' }, { status: 400 });
        }
        if (!user_input || typeof user_input !== 'string' || user_input.length > 200) {
            return NextResponse.json({ success: false, error: 'error_bullet_failed' }, { status: 400 });
        }
        if (!station_company || !station_role) {
            return NextResponse.json({ success: false, error: 'error_bullet_failed' }, { status: 400 });
        }

        const locale: SupportedLocale = (['de', 'en', 'es'].includes(rawLocale) ? rawLocale : 'de') as SupportedLocale;
        const languageName = getLanguageName(locale);

        const prompt = `You are a professional CV writer. Write ONE single bullet point for a CV.

Rules:
- EXACTLY 1 bullet point, MAX 20 words
- Action-oriented: starts with a strong verb (no personal pronoun like "I" or "Ich")
- Language: ${languageName}
- ONLY use facts from the user's input below. NEVER invent experiences, tools, or metrics.
- The keyword "${keyword}" MUST appear naturally in the bullet
- Station context: ${station_role} at ${station_company}
- User's experience note: "${user_input}"

Return ONLY the bullet text. No formatting, no JSON, no explanation, no dash prefix.`;

        const response = await anthropic.messages.create({
            model: HAIKU_MODEL,
            max_tokens: 100,
            temperature: 0,
            messages: [{ role: 'user', content: prompt }],
        });

        // Extract text from response
        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            return NextResponse.json({ success: false, error: 'error_bullet_failed' }, { status: 502 });
        }

        // Clean: strip leading dashes/bullets, trim whitespace
        const bullet = textBlock.text
            .replace(/^[-–•]\s*/, '')
            .trim();

        if (!bullet || bullet.length < 5) {
            return NextResponse.json({ success: false, error: 'error_bullet_failed' }, { status: 502 });
        }

        return NextResponse.json({ success: true, bullet });
    } catch (error: any) {
        console.error('[CV Bullet] Error:', error?.message || error);
        return NextResponse.json(
            { success: false, error: 'error_bullet_failed' },
            { status: 500 }
        );
    }
}
