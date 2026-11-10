import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old demo address (from before the rename) sends visitors to the current one
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "ai-document-chat-snowy.vercel.app" }],
        destination: "https://pageproof-app.vercel.app/:path*",
        permanent: true,
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
