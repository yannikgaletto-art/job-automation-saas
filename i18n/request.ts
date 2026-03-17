import { getRequestConfig } from 'next-intl/server';

// ⚠️ Do NOT import from './routing' or any other project files here.
// next-intl plugin loads this file in isolation at startup and relative
// imports cause "Couldn't find next-intl config file" errors.
const LOCALES = ['de', 'en', 'es'] as const;
const DEFAULT_LOCALE = 'de' as const;
type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = (LOCALES as readonly string[]).includes(requested as string)
    ? (requested as Locale)
    : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../locales/${locale}.json`)).default,

    // ── Missing-Key Handling ──────────────────────────────────────
    onError(error) {
      if (error.code === 'MISSING_MESSAGE') {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`⚠️ [i18n] Missing translation: ${error.message}`);
        }
        return;
      }
      console.error(`🔴 [i18n] Error: ${error.message}`);
    },

    getMessageFallback({ namespace, key }) {
      const fallbackKey = [namespace, key].filter(Boolean).join('.');
      if (process.env.NODE_ENV === 'development') {
        return `[${fallbackKey}]`;
      }
      return key;
    },
  };
});
