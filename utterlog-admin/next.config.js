/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Only proxy in development — production uses Nginx
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8080/api/:path*',
        },
        {
          source: '/uploads/:path*',
          destination: 'http://localhost:8080/uploads/:path*',
        },
      ];
    }
    return [];
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
