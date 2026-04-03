/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig = {
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
  images: {
    domains: ['logo.clearbit.com'],
  },
  experimental: {
    serverActions: {
      allowedOrigins: (() => {
        const origins = ['localhost:3000'];
        // Safely derive host from NEXT_PUBLIC_APP_URL — avoid crashing on empty/malformed env
        try {
          if (process.env.NEXT_PUBLIC_APP_URL) {
            origins.push(new URL(process.env.NEXT_PUBLIC_APP_URL).host);
          }
        } catch {
          console.warn('[next.config] NEXT_PUBLIC_APP_URL is not a valid URL, skipping allowedOrigins entry');
        }
        return origins;
      })(),
    },
    turbo: {
      resolveAlias: {
        canvas: './empty-module.js',
        encoding: './empty-module.js'
      }
    }
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://tally.so",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://logo.clearbit.com https://*.supabase.co",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.anthropic.com https://api.openai.com https://api.mistral.ai https://api.perplexity.ai https://serpapi.com https://r.jina.ai https://api.firecrawl.dev https://*.sentry.io https://*.ingest.sentry.io https://*.inngest.com",
              "frame-src 'self' https://js.stripe.com https://tally.so",
              "worker-src 'self' blob:",
              "media-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};


module.exports = withSentryConfig(withNextIntl(nextConfig), {
  org: 'pathly',               // ← Sentry Org Name (bitte prüfen)
  project: 'pathly-v2',        // ← Sentry Project Name (bitte prüfen)
  silent: true,                // Kein Sentry-Output im Build-Log
  widenClientFileUpload: true,
  hideSourceMaps: true,        // Source Maps nicht im Browser sichtbar
  disableLogger: true,
  automaticVercelMonitors: false,
});
