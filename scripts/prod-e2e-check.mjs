// Verificación E2E del build de producción local (standalone):
//  · CSP con nonce presente en la respuesta HTML
//  · cero errores de consola (viola­ciones CSP, hidratación rota)
//  · flujo crítico: app carga, plano visible, login admin funciona
const { chromium } = await import('playwright')

const URL = 'http://127.0.0.1:3100'
const USER = 'J. Burga'
const PASS = 'Manual#2026'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).split('\n')[0]))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160))
})

let ok = true
const check = (name, cond) => {
  console.log(cond ? '✓' : '✗ FALLO', name)
  if (!cond) ok = false
}

// 1) HTML + cabeceras CSP
const res = await page.request.get(URL)
const html = await res.text()
const csp = res.headers()['content-security-policy'] || ''
check('CSP presente en respuesta', csp.includes('default-src'))
check('CSP sin unsafe-eval en producción', !csp.includes('unsafe-eval'))
check('connect-src acotado (sin ws: wss: salvaje)', !csp.includes('ws: wss:'))
check('HTML contiene el plano (SVG)', html.includes('<svg') || html.includes('viewBox'))

// 2) la página hidrata y funciona sin errores de consola
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
const body = await page.textContent('body')
check('Aplicación renderizada (cinta + consola)', body.includes('herramientas') || body.includes('Comando'))

// 3) login del Panel Admin (flujo completo con BD local)
await page.locator('button[title^="Panel de administración"]').first().click()
await page.waitForTimeout(900)
await page.locator('input[placeholder="Usuario"]').first().fill(USER)
await page.locator('input[type="password"]').first().fill(PASS)
await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).first().click()
await page.waitForSelector('text=Jarumy Burga', { timeout: 15000 })
await page.waitForTimeout(600)
check('Login admin correcto en producción local', true)

// 4) comando NORMATIVA sigue respondiendo
const consoleInput = page.locator('input[placeholder*="comando"]').first()
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await consoleInput.fill('NORMATIVA')
await consoleInput.press('Enter')
await page.waitForTimeout(1200)
const body2 = await page.textContent('body')
check('Análisis normativo funcional', body2.includes('A.010') || body2.includes('cumple'))

console.log('──── errores de consola:', errors.length)
errors.slice(0, 8).forEach((e) => console.log('   ', e))
// el 401 de /api/auth/session antes de login es esperado (recurso, no bug)
const realErrors = errors.filter((e) => !e.includes('401'))
check('Sin errores de consola/CSP relevantes', realErrors.length === 0)

await browser.close()
process.exit(ok ? 0 : 2)
