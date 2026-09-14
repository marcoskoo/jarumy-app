import { db } from '@/lib/db'

// ============================================================
// JARUMY APP — Rate limit y bloqueo de login persistidos en BD.
// Eficaces en serverless multi-instancia (Vercel/Neon) a diferencia
// de un Map en memoria. Ventanas fijas atómicas vía UPSERT.
// ============================================================

export interface RateResult {
  ok: boolean
  /** segundos hasta que la ventana se reinicia (0 si ok) */
  retryAfterS: number
}

/**
 * Limita `key` a `limit` eventos por ventana de `windowMs` ms.
 * Atómico: INSERT … ON CONFLICT reinicia la ventana si venció o
 * incrementa el contador dentro de la ventana activa.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  try {
    const now = new Date()
    const windowStart = new Date(now.getTime() - windowMs)
    const rows = await db.$queryRaw<Array<{ count: number; windowStart: Date }>>`
      INSERT INTO "RateLimit" ("key", "count", "windowStart")
      VALUES (${key}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" < ${windowStart} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimit"."windowStart" < ${windowStart} THEN ${now} ELSE "RateLimit"."windowStart" END
      RETURNING "count", "windowStart"`
    const row = rows[0]
    if (!row) return { ok: true, retryAfterS: 0 }
    if (row.count <= limit) return { ok: true, retryAfterS: 0 }
    const resetAt = new Date(row.windowStart).getTime() + windowMs
    const retryAfterS = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000))
    return { ok: false, retryAfterS }
  } catch (err) {
    // BD no disponible: permitir (fail-open) pero registrar
    console.error('[jarumy] rateLimit (fail-open):', err)
    return { ok: true, retryAfterS: 0 }
  }
}

// ---------- Bloqueo de login persistido ----------

export async function getLoginLock(username: string): Promise<{ lockedUntil: Date | null }> {
  try {
    const row = await db.loginAttempt.findUnique({ where: { username }, select: { lockedUntil: true } })
    return { lockedUntil: row?.lockedUntil ?? null }
  } catch {
    return { lockedUntil: null }
  }
}

/** Registra un intento fallido; devuelve el estado de bloqueo resultante. */
export async function recordLoginFailure(username: string, maxAttempts: number, lockMinutes: number): Promise<{ count: number; lockedUntil: Date | null }> {
  const now = new Date()
  try {
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "LoginAttempt" ("username", "count", "updatedAt")
      VALUES (${username}, 1, ${now})
      ON CONFLICT ("username") DO UPDATE SET
        "count" = CASE WHEN "LoginAttempt"."updatedAt" < ${new Date(now.getTime() - lockMinutes * 60_000)} THEN 1 ELSE "LoginAttempt"."count" + 1 END,
        "updatedAt" = ${now}
      RETURNING "count"`
    const count = rows[0]?.count ?? 1
    if (count >= maxAttempts) {
      const lockedUntil = new Date(now.getTime() + lockMinutes * 60_000)
      try {
        await db.loginAttempt.update({ where: { username }, data: { lockedUntil } })
      } catch { /* ya bloqueado */ }
      return { count, lockedUntil }
    }
    return { count, lockedUntil: null }
  } catch (err) {
    console.error('[jarumy] recordLoginFailure:', err)
    return { count: 0, lockedUntil: null }
  }
}

/** Limpia el contador de intentos tras un login exitoso. */
export async function clearLoginAttempts(username: string): Promise<void> {
  try {
    await db.loginAttempt.deleteMany({ where: { username } })
  } catch { /* no crítico */ }
}

/**
 * Purga oportunista de filas expiradas: LoginAttempt de usuarios que no
 * volvieron a entrar (cualquier bloqueo de hace >24 h ya venció) y ventanas
 * de RateLimit muertas (>1 h). Se llama con probabilidad desde /api/auth/login
 * para que la tabla no crezca indefinidamente sin necesitar un cron.
 */
export async function purgeStaleLoginAttempts(): Promise<void> {
  try {
    const now = Date.now()
    await db.loginAttempt.deleteMany({ where: { updatedAt: { lt: new Date(now - 24 * 3600_000) } } })
    await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - 3600_000) } } })
  } catch { /* no crítico */ }
}
