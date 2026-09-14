import { NextResponse } from 'next/server'

// GET /api → descriptor de la API (el health check real vive en /api/health)

export async function GET() {
  return NextResponse.json({
    service: 'jarumy-app',
    name: 'Jarumy — Suite de diseño arquitectónico CAD web',
    health: '/api/health',
    docs: 'Consulte el README del repositorio',
    endpoints: {
      auth: ['/api/auth/login', '/api/auth/logout', '/api/auth/session', '/api/auth/password', '/api/auth/totp', '/api/auth/totp/live'],
      plans: ['/api/plans', '/api/plans/:id', '/api/plans/:id/versions', '/api/plans/:id/share', '/api/share/:token'],
      users: ['/api/users', '/api/users/:id'],
      ai: ['/api/ai/plan', '/api/ai/normativa'],
      system: ['/api/health', '/api/settings', '/api/audit'],
    },
  })
}
