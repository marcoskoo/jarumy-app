import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { totpNow } from '@/lib/totp'
import { rateLimit } from '@/lib/rate-limit'

// ============================================================
// "Autenticador Jarumy" — código TOTP EN VIVO para la sesión actual.
// Devuelve el mismo código de 6 dígitos que muestra Google
// Authenticator (idéntico algoritmo RFC 6238, SHA-1, 30 s).
//
// · Requiere sesión iniciada + secreto TOTP (pendiente o confirmado:
//   durante el setup permite comparar con Google Authenticator y
//   verificar que el QR se escaneó bien, ANTES de confirmar).
// · Rate-limit en BD (anti-abuso / scraping del código).
// · El código nunca se expone sin sesión válida.
// ============================================================

export async function GET(req: NextRequest) {
  try {
    await ensureSchema()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // el cliente consulta ~1 vez por ventana de 30 s; 20/min de sobra
    const rl = await rateLimit(`totp-live:${session.userId}`, 20, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Espere ${rl.retryAfterS} s` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterS) } }
      )
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { totpSecret: true },
    })
    if (!user?.totpSecret) {
      return NextResponse.json({ error: '2FA no configurado' }, { status: 400 })
    }

    const { code, secondsRemaining } = totpNow(user.totpSecret)
    return NextResponse.json({ code, secondsRemaining, period: 30 })
  } catch (e) {
    console.error('totp live error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
