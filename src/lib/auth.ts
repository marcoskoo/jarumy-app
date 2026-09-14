import crypto from 'crypto'
import { db } from '@/lib/db'

// ============================================================
// JARUMY APP — Autenticación
// · scrypt para contraseñas (sin dependencias externas)
// · Sesiones firmadas HMAC-SHA256 con jti (revocables en BD),
//   epoch por usuario (invalida TODAS las sesiones al cambiar
//   clave) y rol incluido en el token.
// · El secreto de firma: AUTH_SECRET (env) → ajuste persistido
//   en BD (autogenerado una sola vez) → efímero por proceso
//   SOLO si la BD no está disponible (con advertencia).
//   NUNCA un fallback estático hardcodeado.
// ============================================================

// ---------- Password hashing (scrypt, sin dependencias externas) ----------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    const candidate = crypto.scryptSync(password, salt, 64).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'))
  } catch {
    return false
  }
}

// ---------- Secreto de firma (resuelto en orden seguro) ----------

let cachedSecret: string | null = null
let inflight: Promise<string> | null = null

async function resolveSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret
  if (inflight) return inflight
  inflight = (async () => {
    const env = process.env.AUTH_SECRET
    if (env && env.length >= 16) {
      cachedSecret = env
      return env
    }
    try {
      const row = await db.setting.findUnique({ where: { key: 'authSecret' } })
      if (row?.value && row.value.length >= 16) {
        cachedSecret = row.value
        return row.value
      }
      const generated = crypto.randomBytes(32).toString('hex')
      await db.setting.upsert({
        where: { key: 'authSecret' },
        update: {},
        create: { key: 'authSecret', value: generated },
      })
      cachedSecret = generated
      console.warn(
        '[jarumy] AUTH_SECRET no definida: se generó y persistió un secreto aleatorio en la BD. ' +
        'Defina AUTH_SECRET como variable de entorno en producción para control total.'
      )
      return generated
    } catch (err) {
      // BD caída: secreto efímero por proceso (NO se cachea para poder
      // recuperar el persistido cuando la BD vuelva).
      console.error('[jarumy] authSecret: BD no disponible; usando secreto efímero por proceso', err)
      return crypto.randomBytes(32).toString('hex')
    }
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

async function sign(payload: string): Promise<string> {
  return crypto.createHmac('sha256', await resolveSecret()).update(payload).digest('hex')
}

// ---------- Sesiones firmadas (HMAC) con jti + epoch + rol ----------

export interface SessionUser {
  id: string
  username: string
  role: string
}

export interface SessionInfo extends SessionUser {
  jti: string
  epoch: number
}

/**
 * Crea un token de sesión firmado.
 * Formato del payload: userId|username|role|epoch|jti|expires (base64url.firma)
 */
export async function createSessionToken(user: SessionUser, ttlMinutes: number): Promise<string> {
  const expires = Date.now() + ttlMinutes * 60 * 1000
  const epoch = await getUserEpoch(user.id)
  const jti = crypto.randomBytes(12).toString('hex')
  const payload = `${user.id}|${user.username}|${user.role}|${epoch}|${jti}|${expires}`
  return `${Buffer.from(payload).toString('base64url')}.${await sign(payload)}`
}

/** Epoch actual del usuario (para invalidar sesiones antiguas). */
async function getUserEpoch(userId: string): Promise<number> {
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { tokenEpoch: true } })
    return u?.tokenEpoch ?? 0
  } catch {
    return 0
  }
}

/**
 * Verifica un token: firma (timing-safe) → expiración → epoch del usuario
 * (contraseñas cambiadas invalidan sesiones) → denylist de sesiones
 * (logout / revocación puntual). Devuelve null si algo falla.
 */
export async function verifySessionToken(token: string): Promise<SessionInfo | null> {
  try {
    const [encoded, signature] = token.split('.')
    if (!encoded || !signature) return null
    const payload = Buffer.from(encoded, 'base64url').toString('utf-8')
    const expected = await sign(payload)
    if (signature.length !== expected.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    const parts = payload.split('|')
    if (parts.length !== 6) return null
    const [userId, username, role, epochStr, jti, expires] = parts
    if (Number(expires) < Date.now()) return null

    // epoch: ¿el usuario cambió su clave (o fue forzado) después de emitir?
    try {
      const u = await db.user.findUnique({ where: { id: userId }, select: { tokenEpoch: true, disabled: true } })
      if (!u) return null
      if (u.disabled) return null
      if ((u.tokenEpoch ?? 0) !== Number(epochStr)) return null
    } catch {
      // sin BD no podemos revocar: el token firmado sigue siendo válido
    }

    // denylist: logout puntual de esta sesión
    try {
      const denied = await db.sessionDenylist.findUnique({ where: { jti } })
      if (denied) return null
    } catch { /* sin BD: se tolera */ }

    return { userId, username, role, jti, epoch: Number(epochStr) }
  } catch {
    return null
  }
}

/** Marca una sesión (token) como revocada hasta su expiración natural. */
export async function denySession(token: string): Promise<void> {
  try {
    const [encoded] = token.split('.')
    if (!encoded) return
    const payload = Buffer.from(encoded, 'base64url').toString('utf-8')
    const parts = payload.split('|')
    if (parts.length !== 6) return
    const [, , , , jti, expires] = parts
    const until = new Date(Number(expires))
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return
    await db.sessionDenylist.upsert({
      where: { jti },
      update: {},
      create: { jti, expiresAt: until },
    })
    // limpieza oportunista de entradas vencidas (barata, índice PK)
    await db.sessionDenylist.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  } catch (err) {
    console.error('[jarumy] denySession:', err)
  }
}

/** Invalida TODAS las sesiones de un usuario (cambio de clave, bloqueo). */
export async function denyAllUserSessions(userId: string): Promise<void> {
  try {
    await db.user.update({ where: { id: userId }, data: { tokenEpoch: { increment: 1 } } })
  } catch (err) {
    console.error('[jarumy] denyAllUserSessions:', err)
  }
}

// ---------- Política de contraseñas ----------

export interface PasswordPolicy {
  minLength: number
  requireUpper: boolean
  requireDigit: boolean
  requireSymbol: boolean
}

export function validatePasswordPolicy(
  password: string,
  policy: PasswordPolicy
): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (password.length < policy.minLength)
    errors.push(`La contraseña debe tener al menos ${policy.minLength} caracteres`)
  if (policy.requireUpper && !/[A-ZÁÉÍÓÚÑ]/.test(password))
    errors.push('Debe incluir al menos una letra mayúscula')
  if (policy.requireDigit && !/[0-9]/.test(password))
    errors.push('Debe incluir al menos un número')
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password))
    errors.push('Debe incluir al menos un símbolo (!, @, #, ...)')
  return { ok: errors.length === 0, errors }
}

// ---------- Helpers de roles ----------

export type Role = 'admin' | 'editor' | 'visor'

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  visor: 'Visor (solo lectura)',
}

export function canEdit(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'editor'
}

export function isAdmin(role: string | undefined | null): boolean {
  return role === 'admin'
}

/** Rol válido para nuevos usuarios (defensivo ante valores corruptos). */
export function sanitizeRole(role: unknown): Role {
  return role === 'admin' || role === 'editor' || role === 'visor' ? role : 'visor'
}
