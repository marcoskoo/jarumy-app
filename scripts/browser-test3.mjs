const { chromium } = await import('playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2000)

// El input de la consola: buscar por placeholder exacto
const ph = await page.locator('input').all()
let consoleInput = null
for (const i of ph) {
  const p = await i.getAttribute('placeholder') || ''
  if (p.toLowerCase().includes('comando') || p.includes('AYUDA') || p.toLowerCase().includes('escribe')) { consoleInput = i; break }
}
if (!consoleInput) consoleInput = page.locator('input').last()
console.log('Input de consola encontrado:', !!consoleInput)

// GUARDAR → versión real
await consoleInput.fill('GUARDAR')
await consoleInput.press('Enter')
await page.waitForTimeout(600)
const versions = await page.evaluate(() => window.localStorage.getItem('jarumy_versions'))
console.log('Versión guardada (jarumy_versions):', versions ? `SÍ — ${JSON.parse(versions).length} versión(es)` : 'NO')

// LAYERSTATES → estado de capa real
await consoleInput.fill('LAYERSTATES')
await consoleInput.press('Enter')
await page.waitForTimeout(600)
const ls = await page.evaluate(() => window.localStorage.getItem('jarumy-layerstates'))
console.log('Layer state (jarumy-layerstates):', ls ? `SÍ — ${JSON.parse(ls).length} estado(s)` : 'NO')

// ESTIRA: armar la herramienta
await consoleInput.fill('ESTIRA')
await consoleInput.press('Enter')
await page.waitForTimeout(400)
const body = await page.textContent('body')
console.log('ESTIRA armado (consola):', body.includes('ESTIRA') || body.includes('estiramiento'))

// TEST del ribbon: clic en la pestaña BIM (los tabs tienen texto)
const tabs = page.locator('[role="tab"], button')
const count = await tabs.count()
let bimClicked = false
for (let i = 0; i < count; i++) {
  const t = tabs.nth(i)
  const txt = (await t.textContent()) || ''
  if (txt.trim() === 'BIM') { await t.click(); bimClicked = true; break }
}
await page.waitForTimeout(500)
const body2 = await page.textContent('body')
console.log('Tab BIM clicado:', bimClicked, '· Colaboración visible:', body2.includes('Colaboración'), '· Fases:', body2.includes('Fases'))

// clic en "Estado del central" del ribbon BIM
if (bimClicked) {
  const collabBtn = page.locator('button, div[role="button"]').filter({ hasText: 'Estado del central' }).first()
  if (await collabBtn.count()) {
    await collabBtn.click()
    await page.waitForTimeout(600)
    const body3 = await page.textContent('body')
    console.log('Diálogo colaboración desde ribbon:', body3.includes('Modelo central activo'))
  } else {
    console.log('Botón Estado del central no visible aún (necesita hover del menú)')
  }
}

console.log('Errores JS:', errors.length ? errors.slice(0, 3) : 'ninguno')
await browser.close()
