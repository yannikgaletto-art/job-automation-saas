/**
 * i18n Utility — User Locale Retrieval
 * 
 * Reads user's language preference from user_settings.
 * Used by API routes to inject locale into Inngest event payloads.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export type SupportedLocale = 'de' | 'en' | 'es';

/**
 * Gets the user's preferred language from user_settings.
 * Returns 'de' as default if no setting exists.
 */
export async function getUserLocale(userId: string): Promise<SupportedLocale> {
    try {
        const { data } = await supabaseAdmin
            .from('user_settings')
            .select('language')
            .eq('user_id', userId)
            .maybeSingle();

        const lang = data?.language;
        if (lang === 'en' || lang === 'es') return lang;
        return 'de'; // Default fallback
    } catch {
        return 'de';
    }
}

/**
 * Maps locale code to full language name for AI prompts.
 */
export function getLanguageName(locale: SupportedLocale): string {
    const map: Record<SupportedLocale, string> = {
        de: 'Deutsch',
        en: 'English',
        es: 'Español',
    };
    return map[locale];
}

/**
 * Returns the formal address form for the locale (for AI prompts).
 */
export function getFormalAddress(locale: SupportedLocale): string {
    const map: Record<SupportedLocale, string> = {
        de: 'Sie',
        en: 'you',
        es: 'usted',
    };
    return map[locale];
}
