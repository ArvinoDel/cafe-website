/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config) => {
    config.module = {
      ...config.module,
      exprContextCritical: false,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/menus',
        destination: '/menu',
      },
    ];
  },
};

module.exports = nextConfig;
