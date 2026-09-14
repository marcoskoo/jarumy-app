// Usuario efímero para verificar la cuenta regresiva del bloqueo de login.
//   node scripts/qa-lock-user.mjs create  → crea qa-lock (admin, sin 2FA)
//   node scripts/qa-lock-user.mjs clean   → borra usuario + intentos/bloqueo
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'

const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
const hash = (pw) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`
}
const mode = process.argv[2] || 'create'

if (mode === 'create') {
  await db.user.upsert({
    where: { username: 'qa-lock' },
    update: { passwordHash: hash('Qa#Lock2026'), role: 'admin', disabled: false, totpSecret: null, totpConfirmed: false },
    create: { username: 'qa-lock', passwordHash: hash('Qa#Lock2026'), displayName: 'QA Lock', role: 'admin' },
  })
  await db.loginAttempt.deleteMany({ where: { username: 'qa-lock' } })
  console.log('listo: qa-lock creado (sin intentos previos)')
} else if (mode === 'clean') {
  await db.loginAttempt.deleteMany({ where: { username: 'qa-lock' } })
  await db.user.deleteMany({ where: { username: 'qa-lock' } })
  console.log('limpio: qa-lock y sus intentos eliminados')
} else {
  console.log('uso: node scripts/qa-lock-user.mjs create|clean')
}
await db.$disconnect()
