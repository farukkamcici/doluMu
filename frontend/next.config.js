const path = require('path');
const withNextIntl = require('next-intl/plugin')('./src/i18n/request.js');

// Live İBB data is served by the live server on the Hetzner server (../live), not by Vercel functions.
const LIVE_API = 'https://ibb-transport.onthewifi.com/live';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A stray lockfile in a parent directory otherwise makes Next guess the wrong workspace root.
  turbopack: { root: path.join(__dirname) },
  async rewrites() {
    return [{ source: '/api/live/:path*', destination: `${LIVE_API}/:path*` }];
  },
};

module.exports = withNextIntl(nextConfig);
