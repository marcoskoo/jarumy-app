// Simula arranque en frío en Vercel: VERCEL=1 fuerza BD en /tmp/jarumy.db
// (env SETEA ANTES del import dinámico para evitar el hoisting ESM)
process.env.VERCEL = '1'
delete process.env.DATABASE_URL

async function main() {
  const { db, ensureSchema, resolveDatabaseUrl } = await import('../src/lib/db')
  const { ensureSeed } = await import('../src/lib/settings')
  console.log('URL BD:', resolveDatabaseUrl())
  await ensureSchema()
  await ensureSeed()
  const users = await db.user.findMany()
  console.log('Usuarios:', users.map((u) => `${u.username} (${u.role})`))
  const settings = await db.setting.findMany()
  console.log('Settings:', settings.map((s) => s.key))
  // prueba de escritura (audit)
  await db.auditLog.create({ data: { username: 'test', action: 'cold-start-test' } })
  const count = await db.auditLog.count()
  console.log('AuditLog registros:', count)
  console.log('✅ Bootstrap serverless OK')
  await db.$disconnect()
}

main().catch((e) => {
  console.error('❌ FALLO:', e)
  process.exit(1)
})
