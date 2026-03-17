import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // All supported locales
  locales: ['de', 'en', 'es'],

  // Default locale (DACH primary market)
  defaultLocale: 'de',

  // Always show locale prefix in URL: /de/dashboard, /en/dashboard, /es/dashboard
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
