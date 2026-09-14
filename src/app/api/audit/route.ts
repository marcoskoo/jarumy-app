import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySessionToken, isAdmin } from '@/lib/auth'
import { ensureSeed } from '@/lib/settings'

// GET /api/audit?limit=30&offset=0&username=…
// Auditoría: solo administradores, con paginación y filtro opcionales.

export async function GET(req: NextRequest) {
  try {
    await ensureSeed()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (!isAdmin(session.role)) {
      return NextResponse.json({ error: 'Requiere rol de administrador' }, { status: 403 })
    }

    const limitRaw = Number(req.nextUrl.searchParams.get('limit'))
    const offsetRaw = Number(req.nextUrl.searchParams.get('offset'))
    const usernameFilter = req.nextUrl.searchParams.get('username')?.trim()
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 30
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0

    const where = usernameFilter ? { username: usernameFilter } : undefined
    const [logs, total] = await Promise.all([
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit, skip: offset, where }),
      db.auditLog.count({ where }),
    ])
    return NextResponse.json({ logs, total, limit, offset })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
