import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { verifyPassword, createSessionToken } from '@/lib/auth'
import { verifyTotp } from '@/lib/totp'
import { ensureSeed, getSettings, logAudit } from '@/lib/settings'
import { getLoginLock, recordLoginFailure, clearLoginAttempts, rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    await ensureSeed()
    await ensureSchema()
    const { username, password, otp } = await req.json()
    const { security } = await getSettings()

    const raw = String(username || '').trim()
    const key = raw.toLowerCase()
    if (!raw || !password) {
      return NextResponse.json({ error: 'Usuario y contraseña requeridos' }, { status: 400 })
    }

    // rate-limit por IP + usuario (protege contra fuerza bruta distribuida)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    const rl = await rateLimit(`login:${ip}`, 30, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Demasiados intentos desde esta conexión. Espere ${rl.retryAfterS} s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterS) } }
      )
    }

    // bloqueo persistido en BD (visible para TODAS las instancias)
    const lock = await getLoginLock(key)
    if (lock.lockedUntil && lock.lockedUntil.getTime() > Date.now()) {
      const secs = Math.ceil((lock.lockedUntil.getTime() - Date.now()) / 1000)
      return NextResponse.json(
        { error: `Cuenta bloqueada temporalmente. Intente en ${secs} segundos.` },
        { status: 429 }
      )
    }

    // usuario tolerante a mayúsculas (los seed históricos usan "J. Burga").
    // Deshabilitado = credenciales inválidas (no revela estado de la cuenta).
    const user = await db.user.findFirst({
      where: { OR: [{ username: key }, { username: raw }] },
    })
    const ok = user && !user.disabled ? verifyPassword(String(password), user.passwordHash) : false

    if (!ok || !user) {
      const { count } = await recordLoginFailure(key, security.maxAttempts, security.lockMinutes)
      const lockNow = count >= security.maxAttempts
      if (security.auditEnabled) {
        await logAudit(key, 'login_fallido', `Intento ${count}/${security.maxAttempts}${lockNow ? ' — bloqueado' : ''}${user?.disabled ? ' · usuario deshabilitado' : ''}`)
      }
      return NextResponse.json(
        {
          error: lockNow
            ? `Demasiados intentos. Cuenta bloqueada ${security.lockMinutes} minutos.`
            : 'Credenciales incorrectas',
        },
        { status: 401 }
      )
    }

    // ---------- 2FA REAL (TOTP RFC 6238 — app autenticadora) ----------
    // Activo cuando el usuario configuró Y CONFIRMÓ su secreto TOTP desde
    // el Panel Admin (cuenta › Seguridad). Tolerancia ±30 s (1 ventana).
    if (user.totpSecret && user.totpConfirmed) {
      if (!otp) {
        if (security.auditEnabled) await logAudit(key, '2fa_codigo_requerido', 'TOTP')
        return NextResponse.json({ requires2FA: true, method: 'totp' }, { status: 401 })
      }
      if (!verifyTotp(user.totpSecret, String(otp))) {
        const { count } = await recordLoginFailure(key, security.maxAttempts, security.lockMinutes)
        if (security.auditEnabled) await logAudit(key, '2fa_fallido', `Código TOTP incorrecto (intento ${count})`)
        return NextResponse.json(
          { error: 'Código de autenticador incorrecto (6 dígitos, vence cada 30 s)', requires2FA: true, method: 'totp' },
          { status: 401 }
        )
      }
    }

    await clearLoginAttempts(key)
    const token = await createSessionToken(
      { id: user.id, username: user.username, role: user.role },
      security.sessionTimeout
    )
    if (security.auditEnabled) {
      await logAudit(user.username, 'login_exitoso', user.totpConfirmed ? 'Panel de administración · 2FA TOTP' : 'Panel de administración')
    }

    // cookie de sesión endurecida: httpOnly + SameSite=Lax + Secure en HTTPS
    const isHttps =
      req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https' ||
      req.nextUrl.protocol === 'https:'
    const res = NextResponse.json({
      ok: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        twoFactor: !!(user.totpSecret && user.totpConfirmed),
        mustChangePassword: user.mustChangePassword,
      },
    })
    res.cookies.set('jarumy_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps,
      path: '/',
      maxAge: security.sessionTimeout * 60,
    })
    return res
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
