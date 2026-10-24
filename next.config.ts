import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output produces a minimal server bundle for the Docker image.
  output: "standalone",
  poweredByHeader: false,
  // Allow the Cloudflare quick-tunnel host to reach dev resources (HMR, etc.)
  // when demoing `next dev` through a public tunnel. Harmless in production.
  allowedDevOrigins: ["*.trycloudflare.com"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
