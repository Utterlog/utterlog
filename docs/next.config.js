/** @type {import('next').NextConfig} */
// Static export — builds a plain HTML/CSS/JS site in out/, no Node runtime
// needed in production. Served straight from OpenResty's static root.
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
