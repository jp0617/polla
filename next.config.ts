import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // Baileys importa jimp y sharp opcionalmente para media — no los necesitamos
      jimp: "./src/lib/empty-module.ts",
      sharp: "./src/lib/empty-module.ts",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "crests.football-data.org",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
    ],
  },
};

export default nextConfig;
