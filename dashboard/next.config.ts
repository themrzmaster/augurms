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
    // Default is 10mb; raise so /api/admin/wz/upload can accept full WZ files
    // (Character.wz ~200mb, Map.wz ~640mb) when admins drop them in to replace.
    // Middleware (auth/JWT verify) runs in front of the route, so any request
    // body bigger than this gets truncated before the handler sees it,
    // producing the "Body must be multipart/form-data" error.
    middlewareClientMaxBodySize: "1gb",
  },
};

export default nextConfig;
