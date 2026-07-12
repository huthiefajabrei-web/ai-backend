import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "@xyflow/react"],
  },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.8.167",
    "192.168.8.167:3000",
    "192.168.1.100",
    "192.168.1.100:3000",
    "0.0.0.0",
    "harch-studio.local",
  ],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/static/**" },
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/static/**" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com", pathname: "/**" },
      { protocol: "https", hostname: "storage.googleapis.com", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
