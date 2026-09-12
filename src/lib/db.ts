import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  schemaReady: boolean | undefined
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
  if (url && url.includes('-pooler') && !url.includes('pgbouncer=')) {
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

export async function ensureSchema(): Promise<void> {
  if (globalForPrisma.schemaReady) return
  try {
    const res = (await db.$queryRawUnsafe(
      `SELECT to_regclass('public."User"')::text AS t`
    )) as Array<{ t: string | null }>
    const exists = res.length > 0 && res[0].t !== null
    if (!exists) {
      for (const ddl of SCHEMA_DDL) await db.$executeRawUnsafe(ddl)
      console.log('[jarumy] ensureSchema: esquema creado')
    }
  } catch (err) {
    console.error('[jarumy] ensureSchema:', err)
  }
  globalForPrisma.schemaReady = true
}
