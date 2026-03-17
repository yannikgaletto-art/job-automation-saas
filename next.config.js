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
      allowedOrigins: ['localhost:3000'],
    },
    turbo: {
      resolveAlias: {
        canvas: './empty-module.js',
        encoding: './empty-module.js'
      }
    }
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
