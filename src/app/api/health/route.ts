import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'

// GET /api/health → estado del servicio (BD, latencia, versión, uptime)
// Público y SIN dependencias de sesión: pensado para monitoreo (uptime
// robots, balanceadores, revisión rápida del despliegue).

export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()
  let dbOk = false
  let dbLatencyMs: number | null = null
  let error: string | null = null

  try {
    await ensureSchema()
    await db.$queryRaw`SELECT 1`
    dbOk = true
    dbLatencyMs = Date.now() - started
  } catch (e) {
    error = e instanceof Error ? e.message : 'BD no disponible'
  }

  const body = {
    status: dbOk ? 'ok' : 'degraded',
    service: 'jarumy-app',
    version: process.env.npm_package_version ?? '1.0.0',
    env: process.env.NODE_ENV ?? 'development',
    database: {
      ok: dbOk,
      latencyMs: dbLatencyMs,
      error,
    },
    timestamp: new Date().toISOString(),
    uptimeS: Math.round(process.uptime()),
  }

  return NextResponse.json(body, { status: dbOk ? 200 : 503 })
}
