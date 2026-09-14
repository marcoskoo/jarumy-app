// Inspección de la BD de producción de Jarumy (solo lectura).
//   PROD_DB='postgresql://...' node scripts/prod-db-inspect.mjs
// Verifica marcadores que solo existen en la BD real de producción
// (usuarios, bloqueos, auditoría) antes de aplicar cualquier cambio.
const { Client } = require('pg') // eslint-disable-line @typescript-eslint/no-require-imports

async function main() {
  if (!process.env.PROD_DB) { console.error('FALTA PROD_DB'); process.exit(1) }
  const c = new Client({
    connectionString: process.env.PROD_DB,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const users = await c.query('SELECT "username", "role", "disabled", ("totpSecret" IS NOT NULL) AS "hasSecret", "totpConfirmed" FROM "User" ORDER BY "createdAt"')
  console.log('== User ==')
  for (const u of users.rows) console.log(`  ${u.username} · role=${u.role} · disabled=${u.disabled} · totpSecret=${u.hasSecret ? 'SÍ' : 'no'} · confirmed=${u.totpConfirmed}`)

  const attempts = await c.query('SELECT "username", "count", "lockedUntil" FROM "LoginAttempt" ORDER BY "updatedAt" DESC LIMIT 10')
  console.log('== LoginAttempt (últimos 10) ==')
  for (const a of attempts.rows) console.log(`  ${a.username} · count=${a.count} · lockedUntil=${a.lockedUntil ?? '—'}`)

  const audit = await c.query('SELECT "username", "action", "createdAt" FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 6')
  console.log('== AuditLog (últimos 6) ==')
  for (const r of audit.rows) console.log(`  ${r.createdAt.toISOString()} · ${r.username} · ${r.action}`)

  await c.end()
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
