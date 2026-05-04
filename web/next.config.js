/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained .next/standalone/ folder with only the files
  // actually used at runtime — smaller images, no need for full node_modules.
  output: 'standalone',
  serverExternalPackages: ['pixi.js'],
  allowedDevOrigins: ['localhost', '127.0.0.1'],

  // Disable Next.js client Router Cache for dynamic routes.
  //
  // Default behaviour: when a visitor navigates from /  →  /archives/X,
  // Next caches the home-page RSC payload in client memory; pressing
  // the browser back button (or hitting <Link href="/"> again) replays
  // that cached payload without hitting the server. Result: 阅读数 /
  // 评论数 read from cached HTML even after the post page bumped them
  // via /track. Shift+R bypasses and shows the new number, but normal
  // navigation looks frozen — exactly the symptom users hit on home
  // page after viewing a post.
  //
  // staleTimes.dynamic = 0 makes dynamic-route segments revalidate on
  // every navigation. The home page (server-side fetchAPI is already
  // cache:'no-store') becomes source of truth on each visit. Slight
  // loss of "instant back" UX, but counters now match across pages.
  // staleTimes.static stays at 5 min for prerendered pages where data
  // doesn't change inside a navigation.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 300,
    },
  },

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
