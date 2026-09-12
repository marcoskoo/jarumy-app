// Verifica conexión + bootstrap + seed + CRUD contra DATABASE_URL (PostgreSQL)
async function main() {
  const { db, ensureSchema } = await import('../src/lib/db')
  const { ensureSeed } = await import('../src/lib/settings')

  const masked = (process.env.DATABASE_URL || '').replace(/:[^:@/]+@/, ':***@')
  console.log('BD:', masked)

  await ensureSchema()
  await ensureSeed()

  const users = await db.user.findMany()
  console.log('Usuarios:', users.map((u) => `${u.username} (${u.role})`))
  const settings = await db.setting.findMany()
  console.log('Settings:', settings.map((s) => s.key))

  const before = await db.auditLog.count()
  await db.auditLog.create({ data: { username: 'test', action: 'db-migration-test' } })
  const after = await db.auditLog.count()
  console.log(`AuditLog: ${before} → ${after} (escritura OK)`)
  await db.auditLog.deleteMany({ where: { username: 'test', action: 'db-migration-test' } })
  console.log('Limpieza OK')

  // verificación de persistencia: releer tras escribir
  const settingsCheck = await db.setting.findUnique({ where: { key: 'design' } })
  console.log('Design settings persistido:', Boolean(settingsCheck))

  console.log('✅ PostgreSQL OK')
  await db.$disconnect()
}

main().catch((e) => {
  console.error('❌ FALLO:', e)
  process.exit(1)
})
