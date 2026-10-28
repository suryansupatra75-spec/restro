import type { NextConfig } from "next";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
const buildStandalone = process.env.BUILD_STANDALONE === "true";

const nextConfig: NextConfig = {
  // Support standalone output for optimized Docker containers when enabled
  output: buildStandalone ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname),
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 100,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      const existingIgnored = Array.isArray(config.watchOptions?.ignored)
        ? config.watchOptions.ignored
        : [];
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          ...existingIgnored.filter((x: unknown) => typeof x === "string" && x.length > 0),
          "**/prisma/*.db",
          "**/prisma/*.db-*",
          "**/prisma/*.sqlite*",
        ],
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
