// Crea usuario efímero para verificación en navegador (se borra al final)
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'

const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
const hash = (pw) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`
}
const u = await db.user.upsert({
  where: { username: 'qa-browser' },
  update: { passwordHash: hash('Qa#Browser2026'), role: 'admin', disabled: false, totpSecret: null, totpConfirmed: false },
  create: { username: 'qa-browser', passwordHash: hash('Qa#Browser2026'), displayName: 'QA Browser', role: 'admin' },
})
console.log('listo:', u.username, u.role)
await db.$disconnect()
