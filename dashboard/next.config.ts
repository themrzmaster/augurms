import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["canvas", "gl", "three"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/canvas/build/Release/**", "./node_modules/gl/build/Release/**"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "maplestory.io" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
