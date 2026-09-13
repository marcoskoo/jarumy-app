const { chromium } = await import('playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const bad = []
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`) })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2500)

// Test de las herramientas nuevas: abrir ribbon pestaña BIM → herramienta Colaboración
const bimTab = page.locator('button, [role="tab"]').filter({ hasText: 'BIM' }).first()
if (await bimTab.count()) { await bimTab.click(); await page.waitForTimeout(400) }
const body = await page.textContent('body')
console.log('Ribbon BIM visible:', body.includes('Colaboración'))
console.log('Ribbon Análisis tiene Estructural:', body.includes('Estructural'))

// Probar render ULTRA vía consola
const consoleInput = page.locator('input').last()
await consoleInput.fill('RENDER')
await consoleInput.press('Enter')
await page.waitForTimeout(600)
const body2 = await page.textContent('body')
console.log('Render activo (badge):', /RENDER/i.test(body2) && (body2.includes('V-Ray') || body2.includes('ULTRA')))

// Verificar estados de capa: LAYERSTATES guarda real en localStorage
await consoleInput.fill('LAYERSTATES')
await consoleInput.press('Enter')
await page.waitForTimeout(500)
const saved = await page.evaluate(() => window.localStorage.getItem('jarumy-layerstates'))
console.log('Layer state guardado en localStorage:', saved ? `SÍ (${JSON.parse(saved).length} estados)` : 'NO')

// Verificar GUARDAR versión real
await consoleInput.fill('GUARDAR')
await consoleInput.press('Enter')
await page.waitForTimeout(600)
const versions = await page.evaluate(() => window.localStorage.getItem('jarumy-plan-versions') || window.localStorage.getItem('jarumy-versions'))
console.log('Versión guardada en localStorage:', versions ? 'SÍ' : 'NO')

console.log('Recursos con error:', bad.length ? bad.slice(0, 5) : 'ninguno')
console.log('Errores JS de página:', errors.length ? errors.slice(0, 3) : 'ninguno')
await browser.close()
