const path = require('path');
const withNextIntl = require('next-intl/plugin')('./src/i18n/request.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A stray lockfile in a parent directory otherwise makes Next guess the wrong workspace root.
  turbopack: { root: path.join(__dirname) },
};

module.exports = withNextIntl(nextConfig);
