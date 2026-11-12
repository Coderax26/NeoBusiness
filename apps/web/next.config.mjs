/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@neo/shared', '@neo/api-client', '@neo/ui', '@neo/i18n'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.API_ORIGIN || 'http://localhost:3000'}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;

