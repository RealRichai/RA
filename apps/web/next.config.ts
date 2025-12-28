import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@realriches/shared', '@realriches/core', '@realriches/sdk'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.realriches.com' },
      { protocol: 'https', hostname: '*.cloudinary.com' },
      { protocol: 'https', hostname: '*.unsplash.com' }
    ]
  },
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
