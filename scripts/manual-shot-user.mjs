// Fija contraseña temporal al admin local SOLO para las capturas del manual.
// La BD local de desarrollo no contiene datos reales del usuario.
import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'node:crypto'

const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
const salt = randomBytes(16).toString('hex')
const hash = `${salt}:${scryptSync('Manual#2026', salt, 64).toString('hex')}`
const u = await db.user.update({
  where: { username: 'J. Burga' },
  data: { passwordHash: hash, totpSecret: null, totpConfirmed: false, displayName: 'Jarumy Burga' },
})
await db.loginAttempt.deleteMany({ where: { username: { contains: 'burga' } } })
console.log('listo:', u.username, u.displayName)
await db.$disconnect()
