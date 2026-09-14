import type { NextConfig } from "next";

// ============================================================
// Cabeceras de seguridad (OWASP Secure Headers / google strict):
// · X-Frame-Options DENY + frame-ancestors 'none'  → anti clickjacking
// · nosniff                                          → anti MIME-sniffing
// · Referrer-Policy                                  → no filtra URLs internas
// · Permissions-Policy                               → APIs del navegador off
// · HSTS                                             → HTTPS obligatorio (navegador)
// · CSP restrictiva                                  → anti XSS / inyección de
//   scripts remotos. Next.js requiere 'unsafe-inline' para su runtime
//   (hidratación) y 'unsafe-eval' solo en desarrollo (HMR).
// ============================================================

const CSP = [
  "default-src 'self'",
  process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // socket.io de colaboración (ws:// o wss:// según esquema de la página)
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ')

const nextConfig: NextConfig = {
  // "standalone" solo para auto-alojamiento (sandbox/bun server.js);
  // en Vercel (VERCEL=1) se usa el output estándar de la plataforma.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
