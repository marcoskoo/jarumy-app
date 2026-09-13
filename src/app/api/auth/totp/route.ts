import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { generateTotpSecret, otpauthUri, verifyTotp } from '@/lib/totp'
import { logAudit } from '@/lib/settings'

// ============================================================
// Bonus — 2FA REAL (TOTP RFC 6238) gestionado por el usuario:
//   POST { action: 'setup' }   → genera secreto + URI otpauth://
//   POST { action: 'verify', code } → valida y confirma el secreto
//   POST { action: 'disable', code } → desactiva tras validar el código
// Requiere sesión iniciada (cookie jarumy_session).
// ============================================================

async function currentUser(req: NextRequest) {
  const token = req.cookies.get('jarumy_session')?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function POST(req: NextRequest) {
  try {
    const session = await currentUser(req)
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    const user = await db.user.findFirst({ where: { username: session.username } })
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const { action, code } = await req.json()

    if (action === 'setup') {
      const secret = generateTotpSecret()
      const uri = otpauthUri(secret, user.username || user.displayName || 'jarumy', 'Jarumy')
      await db.user.update({ where: { id: user.id }, data: { totpSecret: secret } })
      if (await auditOn()) await logAudit(user.username, '2fa_setup', 'Secreto TOTP generado')
      return NextResponse.json({ secret, uri, note: 'Añada la cuenta en Google Authenticator / Authy / 1Password con esta clave y confirme con un código' })
    }

    if (action === 'verify') {
      if (!user.totpSecret) return NextResponse.json({ error: 'Sin secreto configurado' }, { status: 400 })
      if (!code || !verifyTotp(user.totpSecret, String(code))) {
        return NextResponse.json({ error: 'Código incorrecto — revise el reloj de su app autenticadora' }, { status: 401 })
      }
      if (await auditOn()) await logAudit(user.username, '2fa_activado', 'TOTP verificado')
      return NextResponse.json({ ok: true, active: true })
    }

    if (action === 'disable') {
      if (user.totpSecret && (!code || !verifyTotp(user.totpSecret, String(code)))) {
        return NextResponse.json({ error: 'Confirme con un código válido para desactivar' }, { status: 401 })
      }
      await db.user.update({ where: { id: user.id }, data: { totpSecret: null } })
      if (await auditOn()) await logAudit(user.username, '2fa_desactivado', 'TOTP eliminado')
      return NextResponse.json({ ok: true, active: false })
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  } catch (e) {
    console.error('totp route error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await currentUser(req)
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const user = await db.user.findFirst({ where: { username: session.username } })
    return NextResponse.json({ active: !!user?.totpSecret, secret: user?.totpSecret ? `${user.totpSecret.slice(0, 4)}…${user.totpSecret.slice(-4)}` : null })
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// auditoría opcional (respeta el ajuste auditEnabled sin acoplar rutas)
async function auditOn(): Promise<boolean> {
  try {
    const { getSettings } = await import('@/lib/settings')
    const { security } = await getSettings()
    return security.auditEnabled
  } catch {
    return false
  }
}
