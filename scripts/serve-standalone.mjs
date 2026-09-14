// Arranca el servidor standalone en modo producción (equivalente portable
// de `NODE_ENV=production bun .next/standalone/server.js`): fija NODE_ENV sin
// depender de la sintaxis VAR=valor del shell y usa bun si está disponible.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const server = join(root, '.next', 'standalone', 'server.js')

if (!existsSync(server)) {
  console.error('[serve-standalone] falta .next/standalone/server.js — ejecute `npm run build` primero')
  process.exit(1)
}

// bun (más rápido) si existe; si no, node
const hasBun = spawnSync('bun', ['--version'], { shell: process.platform === 'win32' }).status === 0
const runtime = hasBun ? 'bun' : process.execPath

const res = spawnSync(runtime, [server], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', PORT: process.env.PORT || '3000' },
})
process.exit(res.status ?? 1)
