import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { ensureSeed } from '@/lib/settings'

export async function GET(req: NextRequest) {
  try {
    await ensureSeed()
    const token = req.cookies.get('jarumy_session')?.value
    if (!token) return NextResponse.json({ authenticated: false })
    const session = await verifySessionToken(token)
    if (!session) return NextResponse.json({ authenticated: false })
    const user = await db.user.findUnique({ where: { id: session.userId } })
    if (!user || user.disabled) return NextResponse.json({ authenticated: false })
    return NextResponse.json({
      authenticated: true,
      user: { username: user.username, displayName: user.displayName, role: user.role },
    })
  } catch {
    return NextResponse.json({ authenticated: false })
  }
}
