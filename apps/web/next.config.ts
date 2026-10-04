import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nectar/sdk"],
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
