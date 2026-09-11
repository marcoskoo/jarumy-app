import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'
import { logAudit } from '@/lib/settings'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('jarumy_session')?.value
  const session = token ? verifySessionToken(token) : null
  if (session && session.username) {
    await logAudit(session.username, 'logout', 'Sesión cerrada desde el panel')
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('jarumy_session')
  return res
}
