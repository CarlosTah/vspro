/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@vspro/shared'],
};

module.exports = nextConfig;
