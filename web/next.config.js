/** @type {import('next').NextConfig} */
const nextConfig = {
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
