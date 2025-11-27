const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: { disableDevLogs: true },
});

const withNextIntl = require('next-intl/plugin')(
  './src/i18n/request.js'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
};

module.exports = withPWA(withNextIntl(nextConfig));
