/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Redirect @ledgerhq/errors to its CommonJS build to avoid ESM resolution
    // issues (the lib-es build uses extensionless imports incompatible with
    // Node's strict ESM resolver used during SSG).
    config.resolve.alias = {
      ...config.resolve.alias,
      '@ledgerhq/errors': require.resolve('@ledgerhq/errors'),
    };
    return config;
  },
};

module.exports = nextConfig;

