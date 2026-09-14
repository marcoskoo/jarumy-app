// Copia estáticos al output standalone (equivalente portable de
// `cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/`).
// En Vercel no existe .next/standalone (output estándar) → termina sin error.
import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const standalone = join(root, '.next', 'standalone')

if (!existsSync(standalone)) {
  console.log('[build-standalone] sin .next/standalone (output Vercel estándar) — nada que copiar')
  process.exit(0)
}

cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true })
cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true })
console.log('[build-standalone] estáticos copiados a .next/standalone')
