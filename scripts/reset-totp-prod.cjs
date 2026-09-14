// Reset del TOTP + bloqueo para J. Burga en la BD de PRODUCCIÓN de Jarumy.
//   PROD_DB='postgresql://...' node scripts/reset-totp-prod.cjs
// Efectos: totpSecret=NULL y totpConfirmed=false (el login deja de exigir
// código hasta re-emparejar con un QR nuevo), bloqueo/contador de intentos
// limpios, security.twoFactor coherente y auditoría del reset.
const { Client } = require('pg') // eslint-disable-line @typescript-eslint/no-require-imports
const crypto = require('node:crypto')

async function main() {
  if (!process.env.PROD_DB) { console.error('FALTA PROD_DB'); process.exit(1) }
  const c = new Client({ connectionString: process.env.PROD_DB, ssl: { rejectUnauthorized: false } })
  await c.connect()

  // 1) User: quitar el secreto TOTP (2FA desactivado hasta re-emparejar)
  const u = await c.query(
    'UPDATE "User" SET "totpSecret" = NULL, "totpConfirmed" = false WHERE lower("username") = $1 RETURNING "username"',
    ['j. burga']
  )
  if (u.rowCount === 0) throw new Error('usuario no encontrado')
  console.log('User:', u.rows[0].username, '→ totpSecret=NULL · totpConfirmed=false')

  // 2) LoginAttempt: bloqueo/contador del usuario (con y sin espacio) + filas de prueba
  const d = await c.query(
    'DELETE FROM "LoginAttempt" WHERE lower("username") IN ($1, $2) OR "username" LIKE \'zz-%\'',
    ['j. burga', 'j.burga']
  )
  console.log('LoginAttempt:', d.rowCount, 'filas eliminadas (bloqueo limpio)')

  // 3) Setting.security: twoFactor=false (coherencia de la API mientras se re-empareja)
  const s = await c.query('SELECT "value" FROM "Setting" WHERE "key" = $1', ['security'])
  if (s.rows[0]) {
    const sec = JSON.parse(s.rows[0].value)
    sec.twoFactor = false
    await c.query('UPDATE "Setting" SET "value" = $1 WHERE "key" = $2', [JSON.stringify(sec), 'security'])
    console.log('Setting.security.twoFactor → false')
  }

  // 4) Auditoría del reset externo
  await c.query(
    'INSERT INTO "AuditLog" ("id","username","action","detail","ip","createdAt") VALUES ($1,$2,$3,$4,$5,now())',
    ['reset-' + crypto.randomBytes(10).toString('hex'), 'J. Burga', '2fa_reset',
      'Reset externo del secreto TOTP y del bloqueo de login (solicitud del propietario) · re-emparejamiento pendiente con QR nuevo', null]
  )
  console.log('AuditLog: 2fa_reset registrado')

  // 5) verificación final en BD
  const v = await c.query(
    'SELECT "username", ("totpSecret" IS NOT NULL) AS "hasSecret", "totpConfirmed" FROM "User" WHERE lower("username") = $1',
    ['j. burga']
  )
  console.log('VERIFICACIÓN BD:', JSON.stringify(v.rows[0]))
  await c.end()
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
