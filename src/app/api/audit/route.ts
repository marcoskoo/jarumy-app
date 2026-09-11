import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { ensureSeed } from '@/lib/settings'

export async function GET(req: NextRequest) {
  try {
    await ensureSeed()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? verifySessionToken(token) : null
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const logs = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
    return NextResponse.json({ logs })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
