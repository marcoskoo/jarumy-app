import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  schemaReady: boolean | undefined
}

// ---------- Resolución de URL de la BD ----------
// Entornos serverless (Vercel): el filesystem es de solo lectura salvo /tmp.
// Ahí vive la BD SQLite de la instancia; el esquema y el seed se crean en el
// primer arranque en frío (ver ensureSchema + ensureSeed).
// Entorno local/sandbox: se usa DATABASE_URL de .env (file:.../db/custom.db).

export function resolveDatabaseUrl(): string {
  if (process.env.VERCEL || process.env.SERVERLESS === '1') {
    return process.env.DATABASE_URL?.startsWith('file:') && !process.env.DATABASE_URL?.includes('db/custom.db')
      ? process.env.DATABASE_URL
      : 'file:/tmp/jarumy.db'
  }
  return process.env.DATABASE_URL || 'file:./db/custom.db'
}

// DDL idéntico al generado por `prisma db push` (SQLite)
const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Setting_key_key" ON "Setting"("key")`,
]

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: resolveDatabaseUrl() } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ---------- Bootstrap de esquema (serverless) ----------
// Idempotente: si las tablas ya existen (BD de sandbox o instancia caliente),
// no hace nada. En Vercel crea el esquema en /tmp en el primer arranque.

export async function ensureSchema(): Promise<void> {
  if (globalForPrisma.schemaReady) return
  try {
    for (const ddl of SCHEMA_DDL) {
      await db.$executeRawUnsafe(ddl)
    }
  } catch (err) {
    // En la BD del sandbox las tablas ya existen -> CREATE IF NOT EXISTS no falla;
    // cualquier error aquí se registra pero no bloquea el arranque.
    console.error('[jarumy] ensureSchema:', err)
  }
  globalForPrisma.schemaReady = true
}
