/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained .next/standalone/ folder with only the files
  // actually used at runtime — smaller images, no need for full node_modules.
  output: 'standalone',
  serverExternalPackages: ['pixi.js'],
  async rewrites() {
    const apiHost = process.env.INTERNAL_API_URL ? 'http://api:8080' : 'http://localhost:8080';
    return [
      {
        source: '/api/:path*',
        destination: `${apiHost}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiHost}/uploads/:path*`,
      },
      // /feed is handled by app/feed/route.ts — direct fetch of
      // INTERNAL_API_URL + pass-through XML. The earlier external
      // URL rewrite (/feed -> http://api:8080/api/v1/feed) returned
      // 500 in prod for reasons that didn't reproduce locally, so
      // we moved back to an explicit route handler with clear error
      // surfacing.
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'utterlog.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
};

module.exports = nextConfig;
