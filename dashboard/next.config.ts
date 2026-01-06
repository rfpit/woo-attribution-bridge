import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone build for Docker
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
