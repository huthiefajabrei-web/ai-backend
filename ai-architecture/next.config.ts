import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // @ts-ignore
  serverExternalPackages: [],
  // @ts-ignore
  experimental: {},
  // @ts-ignore
  allowedDevOrigins: ["localhost", "192.168.8.167", "192.168.8.167:3000", "192.168.1.100", "192.168.1.100:3000", "0.0.0.0", "127.0.0.1", "harch-studio.local"],

  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/static/**" },
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/static/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "*.onrender.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
