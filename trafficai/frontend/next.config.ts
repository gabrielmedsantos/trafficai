import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    turbo: undefined,
  },
};

export default nextConfig;
