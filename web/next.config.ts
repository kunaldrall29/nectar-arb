import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const target = process.env.API_PROXY ?? "http://127.0.0.1:8787";
    return [{ source: "/nectar-api/:path*", destination: `${target}/:path*` }];
  },
};

export default nextConfig;
