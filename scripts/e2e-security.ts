// Script de verificación E2E del flujo de seguridad + 2FA (contra el dev server)
// Uso: bun /home/z/my-project/scripts/e2e-security.ts
import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes } from 'node:crypto'

const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })

const BASE = 'http://localhost:3000'
const TEST_USER = 'tester2fa'
const TEST_PASS = 'Prueba#2FA2026'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init)
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? ''
  let body: unknown = null
  try { body = await res.json() } catch { /* texto */ }
  return { status: res.status, body, cookie }
}

function post(path: string, body: unknown, cookie = '') {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

async function main() {
  const checks: Array<[string, boolean, string]> = []

  // 0) usuario de prueba con contraseña hasheada (scrypt), rol editor
  await db.user.upsert({
    where: { username: TEST_USER },
    update: { passwordHash: hashPassword(TEST_PASS), role: 'editor', disabled: false, totpSecret: null, totpConfirmed: false },
    create: { username: TEST_USER, passwordHash: hashPassword(TEST_PASS), displayName: 'Tester 2FA', role: 'editor' },
  })
  const u = await db.user.findUnique({ where: { username: TEST_USER } })
  checks.push(['contraseña hasheada (scrypt sal:hash, no texto plano)', !!u && /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(u.passwordHash), u!.passwordHash.slice(0, 12) + '…'])

  // 1) login sin 2FA configurado → ok + cookie
  const login1 = await post('/api/auth/login', { username: TEST_USER, password: TEST_PASS })
  checks.push(['login con hash correcto → 200', login1.status === 200, `status ${login1.status}`])
  const cookie = login1.cookie

  // 2) cookie con atributos seguros (httpOnly + SameSite=Lax)
  const setCookieRaw = (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }) })).headers.get('set-cookie') ?? ''
  checks.push(['cookie httpOnly + SameSite=Lax', /httponly/i.test(setCookieRaw) && /samesite=lax/i.test(setCookieRaw), setCookieRaw.split(';').slice(1, 3).join('; ').trim()])

  // 3) login con contraseña errónea → 401
  const bad = await post('/api/auth/login', { username: TEST_USER, password: 'incorrecta' })
  checks.push(['login contraseña errónea → 401', bad.status === 401, `status ${bad.status}`])

  // 4) live TOTP sin 2FA → 400
  const live0 = await api('/api/auth/totp/live', { headers: { cookie } })
  checks.push(['/totp/live sin 2FA → 400', live0.status === 400, `status ${live0.status}`])

  // 5) setup TOTP → secreto + QR SVG (escaneable por Google Authenticator)
  const setup = await post('/api/auth/totp', { action: 'setup' }, cookie)
  const setupBody = setup.body as { secret?: string; uri?: string; qrSvg?: string }
  checks.push(['setup devuelve secreto base32', setup.status === 200 && /^[A-Z2-7]+$/.test(setupBody?.secret ?? ''), (setupBody?.secret ?? '').slice(0, 8) + '…'])
  checks.push(['setup devuelve QR SVG (otpauth)', (setupBody?.qrSvg ?? '').includes('<svg') && (setupBody?.qrSvg ?? '').length > 500, `${(setupBody?.qrSvg ?? '').length} bytes`])
  checks.push(['URI otpauth bien formada', (setupBody?.uri ?? '').startsWith('otpauth://totp/Jarumy:'), (setupBody?.uri ?? '').slice(0, 40) + '…'])

  // 6) el secreto queda PENDIENTE: login NO exige 2FA todavía
  const loginPending = await post('/api/auth/login', { username: TEST_USER, password: TEST_PASS })
  const lp = loginPending.body as { requires2FA?: boolean }
  checks.push(['secreto pendiente → login SIN código', loginPending.status === 200 && !lp?.requires2FA, `status ${loginPending.status}`])

  // 7) código en vivo: coincide con el cómputo local RFC 6238
  const live = await api('/api/auth/totp/live', { headers: { cookie } })
  const lb = live.body as { code?: string; secondsRemaining?: number }
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  function base32Decode(s: string): Buffer {
    const clean = s.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '')
    let bits = 0, value = 0
    const bytes: number[] = []
    for (const ch of clean) {
      value = (value << 5) | B32.indexOf(ch); bits += 5
      if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
    }
    return Buffer.from(bytes)
  }
  const { createHmac } = await import('node:crypto')
  const key = base32Decode(setupBody!.secret!)
  const counter = Math.floor(Date.now() / 1000 / 30)
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0); msg.writeUInt32BE(counter % 2 ** 32, 4)
  const digest = createHmac('sha1', key).update(msg).digest()
  const off = digest[digest.length - 1] & 0xf
  const localCode = ((digest.readUInt32BE(off) & 0x7fffffff) % 1e6).toString().padStart(6, '0')
  checks.push(['código en vivo = RFC 6238 (igual que Google Authenticator)', lb?.code === localCode, `api=${lb?.code} local=${localCode} (${lb?.secondsRemaining}s)`])

  // 8) código en vivo SIN sesión → 401
  const liveNoAuth = await api('/api/auth/totp/live')
  checks.push(['/totp/live sin sesión → 401', liveNoAuth.status === 401, `status ${liveNoAuth.status}`])

  // 9) verify con código incorrecto → 401
  const badVerify = await post('/api/auth/totp', { action: 'verify', code: '000000' }, cookie)
  checks.push(['verify código erróneo → 401', badVerify.status === 401, `status ${badVerify.status}`])

  // 10) verify con el código EN VIVO → 200 y queda confirmado
  const verify = await post('/api/auth/totp', { action: 'verify', code: localCode }, cookie)
  checks.push(['verify con código en vivo → 200', verify.status === 200, `status ${verify.status}`])
  const uConfirmed = await db.user.findUnique({ where: { username: TEST_USER } })
  checks.push(['BD: totpConfirmed = true', !!uConfirmed?.totpConfirmed, String(uConfirmed?.totpConfirmed)])

  // 11) login ahora SÍ exige el código 2FA
  const login2fa = await post('/api/auth/login', { username: TEST_USER, password: TEST_PASS })
  const l2 = login2fa.body as { requires2FA?: boolean }
  checks.push(['login exige 2FA tras confirmar', login2fa.status === 401 && l2?.requires2FA === true, `status ${login2fa.status}`])

  // 12) login con código en vivo correcto → 200
  const live2 = await api('/api/auth/totp/live', { headers: { cookie } })
  const code2 = (live2.body as { code?: string })?.code ?? localCode
  const loginOk = await post('/api/auth/login', { username: TEST_USER, password: TEST_PASS, otp: code2 })
  checks.push(['login con código TOTP válido → 200', loginOk.status === 200, `status ${loginOk.status}`])

  // 13) reset de 2FA como admin (válvula de escape): usar admin real
  //     → probamos con PATCH del propio tester vía admin J. Burga no disponible
  //     sin su clave; en su lugar: disable con código válido (desde sesión propia)
  const disable = await post('/api/auth/totp', { action: 'disable', code: code2 }, cookie)
  checks.push(['disable con código válido → 200', disable.status === 200, `status ${disable.status}`])
  const loginAfter = await post('/api/auth/login', { username: TEST_USER, password: TEST_PASS })
  checks.push(['tras desactivar, login sin código', loginAfter.status === 200, `status ${loginAfter.status}`])

  // 14) GET /api/auth/totp nunca expone el secreto
  const state = await api('/api/auth/totp', { headers: { cookie } })
  const sb = JSON.stringify(state.body)
  checks.push(['GET /totp no expone secreto', !sb.includes('secret'), sb.slice(0, 60)])

  // limpieza: deshabilitar el usuario de prueba (deja auditoría)
  await db.user.update({ where: { username: TEST_USER }, data: { disabled: true } })

  console.log('\n══ E2E Seguridad + 2FA — Jarumy ══')
  let pass = 0
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${name}  ${ok ? '' : '· ' + detail}${ok && detail ? '  · ' + detail : ''}`)
    if (ok) pass++
  }
  console.log(`\n${pass}/${checks.length} verificaciones correctas`)
  await db.$disconnect()
  process.exit(pass === checks.length ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
