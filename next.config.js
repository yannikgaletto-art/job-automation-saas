/** @type {import('next').NextConfig} */
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
    // Enable Server Actions (for future)
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

module.exports = nextConfig;
