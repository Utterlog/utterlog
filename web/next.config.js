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
      // Feed goes straight to Go — no Next.js route handler wrapper.
      // Keeps the public URL /feed stable, avoids the server-side fetch
      // dance that turned transient upstream hiccups into "Feed Error"
      // placeholder XML. Cache-Control set by the Go handler passes
      // through unchanged.
      {
        source: '/feed',
        destination: `${apiHost}/api/v1/feed`,
      },
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
