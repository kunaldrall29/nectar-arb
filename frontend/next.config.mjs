/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@stellar/stellar-sdk"],
  },
};

export default nextConfig;
