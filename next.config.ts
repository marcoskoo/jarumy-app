import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" solo para auto-alojamiento (sandbox/bun server.js);
  // en Vercel (VERCEL=1) se usa el output estándar de la plataforma.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
