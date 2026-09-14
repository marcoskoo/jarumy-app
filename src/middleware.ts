import { NextRequest, NextResponse } from 'next/server'

// ============================================================
// JARUMY APP — Middleware de seguridad
//
// 1) Protección CSRF: toda petición MUTANTE (POST/PUT/PATCH/DELETE)
//    a /api/* que llegue con cabecera Origin (es decir, desde un
//    navegador) debe ser del MISMO host que el destino. Un atacante
//    externo puede incrustar formularios/fetch en su web apuntando a
//    la API, pero el navegador enviará Origin: web-atacante → 403.
//    Peticiones sin Origin (curl, apps servidor) no se ven afectadas.
//
// 2) Cabeceras de seguridad para respuestas de API (las de páginas
//    las aplica este mismo middleware más abajo).
//
// 3) CSP por petición para páginas HTML (dueño único de la política):
//    · connect-src ACOTADO: 'self' en producción (+ localhost:3003 solo en
//      desarrollo para el servicio de colaboración) — antes permitía
//      ws:// wss:// a CUALQUIER host
//    · 'unsafe-eval' solo en desarrollo (HMR/Turbopack dev)
//    · nonce generado por petición y propagado en las cabeceras de request
//      para cuando Turbopack estampe nonces en sus scripts (ver NOTA abajo)
//    · las demás directivas heredan el refuerzo OWASP del estado anterior
// ============================================================

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const API_SECURITY_HEADERS: Array<[string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Cache-Control', 'no-store'],
]

function hostOf(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (fwd) return fwd
  return req.headers.get('host') ?? ''
}

/** CSP por petición (duelo único de la política; el nonce solo viaja en x-nonce). */
function buildCsp(): string {
  const isProd = process.env.NODE_ENV === 'production'
  // NOTA Turbopack (Next 16): el bundler por defecto NO propaga el nonce del
  // request a sus <script> de bootstrap (sí lo hace el pipeline webpack, cuyo
  // build tarda >10 min — descartado). Además, por CSP3 incluir un nonce en
  // la directiva DESACTIVA 'unsafe-inline', así que el nonce NO va en la
  // política: los chunks cargan de 'self' y los inline de arranque usan la
  // excepción. El nonce viaja solo en la cabecera de request x-nonce
  // (inofensivo, listo para cuando Turbopack lo estampe) y 'unsafe-eval'
  // queda FUERA de producción (no se necesita en runtime).
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  // colaboración: WebSocket solo al mismo origen (prod) o al mini-servidor
  // local :3003 en desarrollo — nunca a un host arbitrario
  const connectSrc = isProd
    ? "connect-src 'self'"
    : "connect-src 'self' ws://localhost:3003 ws://127.0.0.1:3003"
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    connectSrc,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ')
}

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    // ---- CSRF: verificar Origin en escrituras ----
    if (MUTATING.has(req.method)) {
      const origin = req.headers.get('origin')
      if (origin && origin !== 'null') {
        try {
          const originHost = new URL(origin).host
          const target = hostOf(req)
          if (originHost !== target) {
            return NextResponse.json(
              { error: 'Solicitud cross-site rechazada (protección CSRF)' },
              { status: 403 }
            )
          }
        } catch {
          return NextResponse.json(
            { error: 'Cabecera Origin inválida' },
            { status: 403 }
          )
        }
      }
    }

    // ---- cabeceras de seguridad para respuestas de API ----
    const res = NextResponse.next()
    for (const [k, v] of API_SECURITY_HEADERS) res.headers.set(k, v)
    return res
  }

  // ---- páginas HTML: CSP con nonce por petición ----
  // el nonce viaja en las cabeceras de PETICIÓN para que el runtime de
  // Next lo estampe en sus propios <script> de hidratación
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const csp = buildCsp()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  // páginas y API (sin _next/* estáticos, que no llevan CSP)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon|logo|images|favicon).*)',
  ],
}
