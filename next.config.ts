import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow tunneled hosts (e.g. ngrok) to access Next.js dev resources such as
  // HMR and RSC payloads. Without this, Next.js 16 blocks cross-origin dev
  // requests, which breaks client-side navigation and login over the tunnel.
  allowedDevOrigins: [
    "cadillac-banknote-twice.ngrok-free.dev",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qgmpiaxddyshkureyanw.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
