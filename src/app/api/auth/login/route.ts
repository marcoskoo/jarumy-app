import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSessionToken } from '@/lib/auth'
import { ensureSeed, getSettings, logAudit } from '@/lib/settings'

// Control de intentos fallidos (en memoria por proceso)
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

export async function POST(req: NextRequest) {
  try {
    await ensureSeed()
    const { username, password, otp } = await req.json()
    const { security } = await getSettings()

    const key = String(username || '').trim()
    if (!key || !password) {
      return NextResponse.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 })
    }

    const attempt = failedAttempts.get(key)
    if (attempt && attempt.lockedUntil > Date.now()) {
      const secs = Math.ceil((attempt.lockedUntil - Date.now()) / 1000)
      return NextResponse.json(
        { error: `Cuenta bloqueada temporalmente. Intente en ${secs} segundos.` },
        { status: 429 }
      )
    }

    const user = await db.user.findFirst({ where: { username: key } })
    const ok = user ? verifyPassword(String(password), user.passwordHash) : false

    if (!ok) {
      const prev = failedAttempts.get(key)?.count ?? 0
      const count = prev + 1
      const lockedUntil = count >= security.maxAttempts ? Date.now() + security.lockMinutes * 60_000 : 0
      failedAttempts.set(key, { count, lockedUntil })
      if (security.auditEnabled) {
        await logAudit(key, 'login_fallido', `Intento ${count}/${security.maxAttempts}`)
      }
      return NextResponse.json(
        { error: lockedUntil ? 'Demasiados intentos. Cuenta bloqueada.' : 'Credenciales incorrectas' },
        { status: 401 }
      )
    }

    // Autenticación en dos factores simulada
    if (security.twoFactor) {
      if (!otp) {
        const code = String(Math.floor(100000 + Math.random() * 900000))
        ;(globalThis as Record<string, unknown>).__jarumy_otp = code
        if (security.auditEnabled) await logAudit(key, '2fa_codigo_generado', 'App autenticadora Jarumy')
        return NextResponse.json({ requires2FA: true, hint: code })
      }
      const expected = (globalThis as Record<string, unknown>).__jarumy_otp
      if (String(otp) !== String(expected)) {
        if (security.auditEnabled) await logAudit(key, '2fa_fallido', 'Código incorrecto')
        return NextResponse.json({ error: 'Código 2FA incorrecto', requires2FA: true }, { status: 401 })
      }
    }

    failedAttempts.delete(key)
    const token = createSessionToken(user.id, user.username, security.sessionTimeout)
    if (security.auditEnabled) {
      await logAudit(user.username, 'login_exitoso', 'Panel de administración')
    }

    const res = NextResponse.json({
      ok: true,
      user: { username: user.username, displayName: user.displayName, role: user.role },
    })
    res.cookies.set('jarumy_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: security.sessionTimeout * 60,
    })
    return res
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
