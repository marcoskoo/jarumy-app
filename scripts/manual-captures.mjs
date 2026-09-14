// Captura las 12 pantallas reales de Jarumy para el Manual de Usuario (PDF).
// Requisitos: dev server en localhost:3000 y cuenta local J. Burga / Manual#2026
// (scripts/manual-shot-user.mjs). Salida: download/manual-jarumy/images/*.png
const { chromium } = await import('playwright')
const { mkdirSync } = await import('node:fs')

const OUT = '/home/z/my-project/download/manual-jarumy/images'
mkdirSync(OUT, { recursive: true })

const URL = 'http://127.0.0.1:3000'
const USER = 'J. Burga'
const PASS = 'Manual#2026'

const log = (...a) => console.log('[captura]', ...a)
const ok = new Set()
const fail = new Set()

async function shot(name, locator, opts = {}) {
  try {
    if (locator) await locator.screenshot({ path: `${OUT}/${name}.png`, ...opts })
    else await page.screenshot({ path: `${OUT}/${name}.png`, ...opts })
    ok.add(name)
    log('OK', name)
  } catch (e) {
    fail.add(name)
    log('FALLO', name, String(e).split('\n')[0])
  }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
page.setDefaultTimeout(25000)

// ---------- 1) Cargar la app con el plano de demostración ----------
log('cargando', URL)
await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForTimeout(3500)

const consoleInput = page.locator('input[placeholder*="comando"]').first()

// ---------- 2) Interfaz completa ----------
await shot('cap-interfaz')

// ---------- 3) Pestaña Dibujo de la cinta ----------
try {
  const ribbon = page.locator('div.jy-bg2.border-b').first()
  const tabDibujo = page.locator('div.jy-bg2.border-b button', { hasText: 'Dibujo' }).first()
  await tabDibujo.click()
  await page.waitForTimeout(700)
  await shot('cap-ribbon-dibujo', ribbon)
} catch (e) { fail.add('cap-ribbon-dibujo'); log('FALLO ribbon', String(e).split('\n')[0]) }

// volver a Inicio para las capturas siguientes
try {
  await page.locator('div.jy-bg2.border-b button', { hasText: 'Inicio' }).first().click()
  await page.waitForTimeout(500)
} catch { /* opcional */ }

// ---------- 4) Menú radial sobre un muro ----------
try {
  const walls = page.locator('g.jy-wall-face')
  const n = await walls.count()
  log('muros visibles:', n)
  // elige el muro con mayor superficie y clic al 18% de su recorrido (zona maciza)
  let best = null, bestArea = 0
  for (let i = 0; i < Math.min(n, 24); i++) {
    const bb = await walls.nth(i).boundingBox()
    if (!bb) continue
    const area = bb.width * bb.height
    if (area > bestArea) { bestArea = area; best = bb }
  }
  if (best) {
    const horizontal = best.width >= best.height
    const x = horizontal ? best.x + best.width * 0.18 : best.x + best.width / 2
    const y = horizontal ? best.y + best.height / 2 : best.y + best.height * 0.18
    await page.mouse.click(x, y)
    await page.waitForTimeout(900)
    await shot('cap-radial')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  } else { fail.add('cap-radial'); log('sin muros para el radial') }
} catch (e) { fail.add('cap-radial'); log('FALLO radial', String(e).split('\n')[0]) }

// ---------- 5) Vista 3D ----------
try {
  await consoleInput.fill('3D')
  await consoleInput.press('Enter')
  await page.waitForTimeout(1600)
  const dlg = page.locator('[role="dialog"]').first()
  await shot('cap-3d', dlg)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
} catch (e) { fail.add('cap-3d'); log('FALLO 3d', String(e).split('\n')[0]) }

// ---------- 6) Análisis normativo ----------
try {
  await consoleInput.fill('NORMATIVA')
  await consoleInput.press('Enter')
  await page.waitForTimeout(1800)
  const dlg = page.locator('[role="dialog"]').first()
  await shot('cap-normativa', dlg)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
} catch (e) { fail.add('cap-normativa'); log('FALLO normativa', String(e).split('\n')[0]) }

// ---------- 7) Exportar PDF a escala ----------
try {
  await consoleInput.fill('PDF')
  await consoleInput.press('Enter')
  await page.waitForTimeout(1500)
  const dlg = page.locator('[role="dialog"]').first()
  await shot('cap-exportar-pdf', dlg)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
} catch (e) { fail.add('cap-exportar-pdf'); log('FALLO pdf', String(e).split('\n')[0]) }

// ---------- 8) Panel Admin: ventana de acceso ----------
const panel = page.locator('.max-w-5xl').first()
try {
  await page.locator('button[title^="Panel de administración"]').first().click()
  await page.waitForTimeout(1200)
  await shot('cap-admin-login', panel)
} catch (e) { fail.add('cap-admin-login'); log('FALLO login-shot', String(e).split('\n')[0]) }

// ---------- 9) Iniciar sesión ----------
try {
  await page.locator('input[placeholder="Usuario"]').first().fill(USER)
  await page.locator('input[type="password"]').first().fill(PASS)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).first().click()
  await page.waitForSelector('text=Jarumy Burga', { timeout: 20000 })
  await page.waitForTimeout(1200)
} catch (e) { log('FALLO inicio de sesión', String(e).split('\n')[0]) }

// ---------- 10) Resumen ----------
try {
  await page.locator('nav button', { hasText: 'Resumen' }).first().click()
  await page.waitForTimeout(900)
  await shot('cap-admin-resumen', panel)
} catch (e) { fail.add('cap-admin-resumen'); log('FALLO resumen', String(e).split('\n')[0]) }

// ---------- 11) Usuarios ----------
try {
  await page.locator('nav button', { hasText: 'Usuarios' }).first().click()
  await page.waitForSelector('text=J. Burga', { timeout: 15000 })
  await page.waitForTimeout(700)
  await shot('cap-admin-usuarios', panel)
} catch (e) { fail.add('cap-admin-usuarios'); log('FALLO usuarios', String(e).split('\n')[0]) }

// ---------- 12) Seguridad ----------
try {
  await page.locator('nav button', { hasText: 'Seguridad' }).first().click()
  await page.waitForSelector('text=Autenticación en dos factores', { timeout: 15000 })
  await page.waitForTimeout(700)
  await shot('cap-admin-seguridad', panel)
} catch (e) { fail.add('cap-admin-seguridad'); log('FALLO seguridad', String(e).split('\n')[0]) }

// ---------- 13) Activación 2FA: QR + código en vivo ----------
try {
  await page.locator('button[role="switch"]').first().click()
  await page.waitForSelector('[aria-label*="Código QR"]', { timeout: 15000 })
  await page.waitForTimeout(1200)
  await shot('cap-2fa-qr', panel)
} catch (e) { fail.add('cap-2fa-qr'); log('FALLO 2fa', String(e).split('\n')[0]) }

// ---------- 14) Cerrar panel y capturar la nube ----------
try {
  await page.locator('button[title="Volver a la app"]').first().click()
  await page.waitForTimeout(900)
  await consoleInput.fill('PLANOS')
  await consoleInput.press('Enter')
  await page.waitForTimeout(1800)
  const dlg = page.locator('[role="dialog"]').first()
  await shot('cap-nube', dlg)
  await page.keyboard.press('Escape')
} catch (e) { fail.add('cap-nube'); log('FALLO nube', String(e).split('\n')[0]) }

await browser.close()
log('──────────────────────────────')
log('OK  :', [...ok].join(', '))
log('FALLO:', [...fail].join(', ') || '(ninguna)')
process.exit(fail.size ? 2 : 0)
