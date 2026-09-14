import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, denySession } from '@/lib/auth'
import { logAudit } from '@/lib/settings'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('jarumy_session')?.value
  const session = token ? await verifySessionToken(token) : null
  if (session && session.username) {
    // revocación server-side: el token deja de ser válido de inmediato
    if (token) await denySession(token)
    await logAudit(session.username, 'logout', 'Sesión cerrada y revocada en servidor')
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('jarumy_session')
  return res
}
