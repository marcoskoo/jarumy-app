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
// 2) Cabeceras de seguridad también para respuestas de API (las de
//    páginas las aplica next.config.ts headers()): evita que un
//    despliegue con proxy pierda la protección.
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
  return NextResponse.next()
}

export const config = {
  // solo rutas de API (las páginas reciben cabeceras desde next.config.ts)
  matcher: ['/api/:path*'],
}
