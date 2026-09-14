import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  schemaReady: boolean | undefined
  plansSchemaReady: boolean | undefined
  authSchemaReady: boolean | undefined
}

// ---------- Base de datos (PostgreSQL) ----------
// DATABASE_URL debe apuntar a PostgreSQL (p. ej. Neon):
//   postgresql://usuario:clave@host/bd?sslmode=require
// En Vercel se configura como variable de entorno del proyecto (persistente).
// La integración Vercel-Neon inyecta la URL pooled (host "-pooler") sin
// parámetros pgbouncer; Prisma los necesita en serverless para evitar
// errores de prepared statements → se añaden automáticamente si faltan.

export function resolveRuntimeUrl(): string | undefined {
  let url = process.env.DATABASE_URL
  if (!url) return undefined
  // SQLite local (sandbox/desarrollo): se usa tal cual
  if (url.startsWith('file:')) return url
  if (url.includes('-pooler') && !url.includes('pgbouncer=')) {
    url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=1'
  }
  return url
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: resolveRuntimeUrl() } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ---------- Bootstrap de esquema (idempotente, red de seguridad) ----------
// El camino canónico es `prisma db push`. Esto auto-repara una BD vacía
// en un arranque en frío (CREATE TABLE IF NOT EXISTS + verificación previa).

const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
]

// ---------- Planos en la nube (Ola 3) + enlaces compartidos (Ola 4) ----------
// DDL idempotente (IF NOT EXISTS en cada sentencia): se ejecuta una vez por
// proceso y auto-repara tanto una BD en frío como una BD existente a la que
// falten las tablas/columnas nuevas (equivalente a `prisma db push` parcial).

const PLANS_DDL = [
  `CREATE TABLE IF NOT EXISTS "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "name" TEXT NOT NULL,
    "projectName" TEXT NOT NULL DEFAULT 'Proyecto sin nombre',
    "data" TEXT NOT NULL,
    "thumbnail" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3)
  )`,
  `CREATE TABLE IF NOT EXISTS "PlanVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "SharedLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL UNIQUE,
    "planId" TEXT NOT NULL REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "permission" TEXT NOT NULL DEFAULT 'view',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false
  )`,
  // Evolución de columnas (BD pre-existentes)
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT`,
  `ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "projectName" TEXT NOT NULL DEFAULT 'Proyecto sin nombre'`,
  `ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "thumbnail" TEXT`,
  `ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3)`,
  `ALTER TABLE "PlanVersion" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "SharedLink" ADD COLUMN IF NOT EXISTS "lastAccessAt" TIMESTAMP(3)`,
  `ALTER TABLE "SharedLink" ADD COLUMN IF NOT EXISTS "revoked" BOOLEAN NOT NULL DEFAULT false`,
  // Índices (mismos nombres que genera Prisma)
  `CREATE INDEX IF NOT EXISTS "Plan_ownerId_idx" ON "Plan"("ownerId")`,
  `CREATE INDEX IF NOT EXISTS "Plan_ownerId_deletedAt_idx" ON "Plan"("ownerId", "deletedAt")`,
  `CREATE INDEX IF NOT EXISTS "PlanVersion_planId_idx" ON "PlanVersion"("planId")`,
  `CREATE INDEX IF NOT EXISTS "SharedLink_planId_idx" ON "SharedLink"("planId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SharedLink_token_key" ON "SharedLink"("token")`,
]

// ---------- Seguridad (Ola 8) ----------
// DDL idempotente para: revocación de sesiones (denylist por jti),
// bloqueo de login persistido en BD (multi-instancia), rate-limit en BD
// (rutas de IA), expiry de enlaces compartidos, roles y deshabilitado de
// usuarios, y epoch de tokens (invalida sesiones al cambiar la clave).

const AUTH_DDL = [
  `CREATE TABLE IF NOT EXISTS "SessionDenylist" (
    "jti" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" TIMESTAMP(3) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "LoginAttempt" (
    "username" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // Evolución de columnas (BD pre-existentes)
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenEpoch" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpConfirmed" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "SharedLink" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3)`,
]

export async function ensureSchema(): Promise<void> {
  if (globalForPrisma.schemaReady) return
  const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:')
  try {
    if (!isSqlite) {
      const res = (await db.$queryRawUnsafe(
        `SELECT to_regclass('public."User"')::text AS t`
      )) as Array<{ t: string | null }>
      const exists = res.length > 0 && res[0].t !== null
      if (!exists) {
        for (const ddl of SCHEMA_DDL) await db.$executeRawUnsafe(ddl)
        console.log('[jarumy] ensureSchema: esquema creado')
      }
    }
    // cada sentencia es best-effort: en SQLite los ALTER IF NOT EXISTS no
    // existen (y no hacen falta: db:push ya creó las columnas)
    if (!globalForPrisma.plansSchemaReady) {
      for (const ddl of PLANS_DDL) {
        try { await db.$executeRawUnsafe(ddl) } catch { /* ya existe o no aplica */ }
      }
      globalForPrisma.plansSchemaReady = true
      console.log('[jarumy] ensureSchema: esquema de planos verificado (Plan/PlanVersion/SharedLink)')
    }
    if (!globalForPrisma.authSchemaReady) {
      for (const ddl of AUTH_DDL) {
        try { await db.$executeRawUnsafe(ddl) } catch { /* ya existe o no aplica */ }
      }
      globalForPrisma.authSchemaReady = true
      console.log('[jarumy] ensureSchema: esquema de seguridad verificado (SessionDenylist/LoginAttempt/RateLimit)')
    }
  } catch (err) {
    console.error('[jarumy] ensureSchema:', err)
  }
  globalForPrisma.schemaReady = true
}
