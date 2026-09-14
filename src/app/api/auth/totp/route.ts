import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { generateTotpSecret, otpauthUri, verifyTotp } from '@/lib/totp'
import { logAudit } from '@/lib/settings'

// ============================================================
// 2FA REAL (TOTP RFC 6238) gestionado por el usuario:
//   POST { action: 'setup' }         → genera secreto PENDIENTE +
//                                     QR SVG (otpauth://) escaneable
//                                     por Google Authenticator / Authy
//   POST { action: 'verify', code }  → valida y CONFIRMA (recién aquí
//                                     el login exige el 2FA; evita
//                                     bloqueos si se abandona el setup)
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
      const account = user.username || user.displayName || 'jarumy'
      const uri = otpauthUri(secret, account, 'Jarumy')
      // QR escaneable: SVG generado en servidor (sin llamadas externas,
      // el secreto nunca sale de la app por red de terceros)
      const qrSvg = await QRCode.toString(uri, {
        type: 'svg',
        margin: 1,
        width: 232,
        errorCorrectionLevel: 'M',
        color: { dark: '#111827', light: '#ffffff' },
      })
      // secreto PENDIENTE: el 2FA NO se exige en el login hasta que el
      // usuario confirme con un código de su app autenticadora
      await db.user.update({
        where: { id: user.id },
        data: { totpSecret: secret, totpConfirmed: false },
      })
      if (await auditOn()) await logAudit(user.username, '2fa_setup', 'Secreto TOTP pendiente generado (QR)')
      return NextResponse.json({
        secret,
        uri,
        qrSvg,
        note: 'Escanee el QR con Google Authenticator / Authy / 1Password y confirme con el código de 6 dígitos',
      })
    }

    if (action === 'verify') {
      if (!user.totpSecret) return NextResponse.json({ error: 'Sin secreto configurado' }, { status: 400 })
      if (!code || !verifyTotp(user.totpSecret, String(code))) {
        return NextResponse.json({ error: 'Código incorrecto — revise el reloj de su app autenticadora' }, { status: 401 })
      }
      await db.user.update({ where: { id: user.id }, data: { totpConfirmed: true } })
      if (await auditOn()) await logAudit(user.username, '2fa_activado', 'TOTP verificado y confirmado')
      return NextResponse.json({ ok: true, active: true })
    }

    if (action === 'disable') {
      if (user.totpSecret && user.totpConfirmed && (!code || !verifyTotp(user.totpSecret, String(code)))) {
        return NextResponse.json({ error: 'Confirme con un código válido para desactivar' }, { status: 401 })
      }
      await db.user.update({
        where: { id: user.id },
        data: { totpSecret: null, totpConfirmed: false },
      })
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
    // sin leak del secreto: solo estado (la URI otpauth:// del setup ya
    // transporta el secreto una única vez, como un QR real)
    return NextResponse.json({
      active: !!(user?.totpSecret && user.totpConfirmed),
      pending: !!(user?.totpSecret && !user.totpConfirmed),
    })
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
