import type { NextConfig } from "next";

// ============================================================
// Cabeceras de seguridad estáticas (OWASP Secure Headers):
// · X-Frame-Options DENY + frame-ancestors 'none'  → anti clickjacking
// · nosniff                                          → anti MIME-sniffing
// · Referrer-Policy                                  → no filtra URLs internas
// · Permissions-Policy                               → APIs del navegador off
// · HSTS                                             → HTTPS obligatorio (navegador)
//
// La CSP ya NO se declara aquí: al usar nonce + strict-dynamic debe
// generarse POR PETICIÓN en src/middleware.ts (patrón oficial Next.js).
// ============================================================

const nextConfig: NextConfig = {
  // "standalone" solo para auto-alojamiento (sandbox/bun server.js);
  // en Vercel (VERCEL=1) se usa el output estándar de la plataforma.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  // sin ignoreBuildErrors: el build verificación de tipos SIEMPRE corre
  // (npm run typecheck la replica en local/CI sin generar artefactos)
  typescript: {
    ignoreBuildErrors: false,
  },
  // React 19 + StrictMode: detecta efectos duplicados y APIs inseguras
  // en desarrollo — el estándar de la industria, ya activo en producción.
  reactStrictMode: true,
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
        ],
      },
    ];
  },
};

export default nextConfig;
