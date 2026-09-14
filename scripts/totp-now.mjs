// Calcula el TOTP actual para un usuario de la BD (uso interno de pruebas)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
const u = await db.user.findFirst({ where: { username: process.argv[2] || 'qa-browser' }, select: { totpSecret: true } })
if (!u?.totpSecret) { console.error('sin secreto'); process.exit(1) }
const secret = u.totpSecret
await db.$disconnect()

// RFC 6238 (SHA-1 · 30 s · 6 dígitos) — misma implementación que lib/totp
import { createHmac } from 'node:crypto'
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function b32decode(s) {
  let bits = ''
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(ch)
    if (i < 0) continue
    bits += i.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
const key = b32decode(secret)
const counter = Math.floor(Date.now() / 30000)
const buf = Buffer.alloc(8)
buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
buf.writeUInt32BE(counter % 2 ** 32, 4)
const hmac = createHmac('sha1', key).update(buf).digest()
const off = hmac[hmac.length - 1] & 0xf
const num = ((hmac[off] & 0x7f) << 24) | (hmac[off+1] << 16) | (hmac[off+2] << 8) | hmac[off+3]
console.log(String(num % 1_000_000).padStart(6, '0'))
