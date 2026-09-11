import crypto from 'crypto'

const SECRET_KEY = process.env.AUTH_SECRET || 'jarumy-app-secret-key-2026-fixed'

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

// ---------- Sesiones firmadas (HMAC) ----------

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex')
}

export function createSessionToken(userId: string, username: string, ttlMinutes: number): string {
  const expires = Date.now() + ttlMinutes * 60 * 1000
  const payload = `${userId}|${username}|${expires}`
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`
}

export function verifySessionToken(token: string): { userId: string; username: string } | null {
  try {
    const [encoded, signature] = token.split('.')
    if (!encoded || !signature) return null
    const payload = Buffer.from(encoded, 'base64url').toString('utf-8')
    const expected = sign(payload)
    if (signature.length !== expected.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    const [userId, username, expires] = payload.split('|')
    if (Number(expires) < Date.now()) return null
    return { userId, username }
  } catch {
    return null
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
