import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "maplestory.io" },
    ],
  },
};

export default nextConfig;
