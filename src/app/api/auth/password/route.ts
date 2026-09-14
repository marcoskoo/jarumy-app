import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, hashPassword, verifySessionToken, denyAllUserSessions, validatePasswordPolicy } from '@/lib/auth'
import { getSettings, logAudit } from '@/lib/settings'

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { currentPassword, newPassword, confirmPassword } = await req.json()
    const user = await db.user.findUnique({ where: { id: session.userId } })
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Complete todos los campos' }, { status: 400 })
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'La nueva contraseña y su confirmación no coinciden' }, { status: 400 })
    }
    if (!verifyPassword(String(currentPassword), user.passwordHash)) {
      await logAudit(user.username, 'cambio_clave_fallido', 'Contraseña actual incorrecta')
      return NextResponse.json({ error: 'La contraseña actual es incorrecta' }, { status: 401 })
    }

    const { security } = await getSettings()
    const check = validatePasswordPolicy(String(newPassword), {
      minLength: security.minPasswordLength,
      requireUpper: security.requireUpper,
      requireDigit: security.requireDigit,
      requireSymbol: security.requireSymbol,
    })
    if (!check.ok) {
      return NextResponse.json({ error: check.errors.join(' · ') }, { status: 400 })
    }
    if (String(newPassword) === String(currentPassword)) {
      return NextResponse.json({ error: 'La nueva contraseña debe ser distinta a la actual' }, { status: 400 })
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(String(newPassword)), mustChangePassword: false },
    })
    // invalida TODAS las sesiones activas de este usuario (tokenEpoch + 1)
    await denyAllUserSessions(user.id)
    await logAudit(user.username, 'cambio_clave_exitoso', 'Contraseña actualizada — sesiones previas revocadas')
    return NextResponse.json({ ok: true, message: 'Contraseña actualizada — inicie sesión nuevamente' })
  } catch (e) {
    console.error('password error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
