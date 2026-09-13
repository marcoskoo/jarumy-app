import crypto from 'crypto'
import { db, ensureSchema } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

// ---------- Valores por defecto de la aplicación ----------

export interface SecuritySettings {
  twoFactor: boolean
  sessionTimeout: number // minutos
  maxAttempts: number
  lockMinutes: number
  minPasswordLength: number
  requireUpper: boolean
  requireDigit: boolean
  requireSymbol: boolean
  auditEnabled: boolean
}

export interface DesignSettings {
  brand: string
  logoInitial: string
  theme: 'dark' | 'light'
  primaryColor: string // clave de preset
  accentColor: string
  radius: number
  density: 'compact' | 'comfortable' | 'spacious'
}

export const DEFAULT_SECURITY: SecuritySettings = {
  twoFactor: false,
  sessionTimeout: 30,
  maxAttempts: 5,
  lockMinutes: 5,
  minPasswordLength: 8,
  requireUpper: true,
  requireDigit: true,
  requireSymbol: false,
  auditEnabled: true,
}

export const DEFAULT_DESIGN: DesignSettings = {
  brand: 'Jarumy app',
  logoInitial: 'J',
  theme: 'dark',
  primaryColor: 'amber',
  accentColor: 'orange',
  radius: 12,
  density: 'comfortable',
}

export async function getSettings() {
  const rows = await db.setting.findMany()
  const map: Record<string, string> = {}
  rows.forEach((r) => (map[r.key] = r.value))
  let security = { ...DEFAULT_SECURITY }
  let design = { ...DEFAULT_DESIGN }
  try {
    if (map['security']) security = { ...security, ...JSON.parse(map['security']) }
  } catch { /* usa valores por defecto */ }
  try {
    if (map['design']) design = { ...design, ...JSON.parse(map['design']) }
  } catch { /* usa valores por defecto */ }
  return { security, design }
}

export async function saveSettings(section: 'security' | 'design', value: object) {
  const data = JSON.stringify(value)
  await db.setting.upsert({
    where: { key: section },
    update: { value: data },
    create: { key: section, value: data },
  })
}

// ---------- Auditoría ----------

export async function logAudit(username: string, action: string, detail?: string, ip?: string) {
  await db.auditLog.create({ data: { username, action, detail: detail ?? null, ip: ip ?? null } })
}

// ---------- Seed idempotente ----------
// SIN credenciales fijas: la contraseña inicial se toma de la variable de
// entorno JARUMY_ADMIN_PASSWORD y, si no existe, se genera aleatoria y se
// imprime UNA sola vez en el registro del servidor para el primer acceso.

let seeded = false

function initialAdminPassword(): string {
  const fromEnv = process.env.JARUMY_ADMIN_PASSWORD
  if (fromEnv && fromEnv.length >= 8) return fromEnv
  const rnd = crypto.randomBytes(9).toString('base64url')
  console.info(
    '\n[Jarumy] ── PRIMER ARRANQUE ────────────────────────────────\n' +
    `[Jarumy] Usuario admin:  J. Burga\n` +
    `[Jarumy] Contraseña:     ${rnd}\n` +
    '[Jarumy] (defina JARUMY_ADMIN_PASSWORD para fijarla; cámbiela luego\n' +
    '[Jarumy]  desde Panel Admin › Cuenta y clave · active 2FA TOTP)\n' +
    '[Jarumy] ────────────────────────────────────────────────────\n'
  )
  return rnd
}

export async function ensureSeed() {
  if (seeded) return
  await ensureSchema()
  const existing = await db.user.findFirst({ where: { username: 'J. Burga' } })
  if (!existing) {
    await db.user.create({
      data: {
        username: 'J. Burga',
        passwordHash: hashPassword(initialAdminPassword()),
        displayName: 'Jhon Burga',
        role: 'admin',
      },
    })
  }
  const settingsCount = await db.setting.count()
  if (settingsCount === 0) {
    await db.setting.createMany({
      data: [
        { key: 'security', value: JSON.stringify(DEFAULT_SECURITY) },
        { key: 'design', value: JSON.stringify(DEFAULT_DESIGN) },
      ],
    })
  }
  seeded = true
}
