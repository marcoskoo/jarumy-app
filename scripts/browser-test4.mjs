const { chromium } = await import('playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2000)

// Ir a la pestaña BIM
const tabs = page.locator('[role="tab"], button')
const count = await tabs.count()
for (let i = 0; i < count; i++) {
  const t = tabs.nth(i)
  if (((await t.textContent()) || '').trim() === 'BIM') { await t.click(); break }
}
await page.waitForTimeout(500)

// Buscar el botón de herramienta "Colaboración" y hacer hover + clic
const toolBtn = page.locator('button, div').filter({ hasText: /^Colaboración$/ }).first()
const found = await toolBtn.count()
console.log('Botón herramienta Colaboración:', found > 0)
if (found) {
  await toolBtn.hover()
  await page.waitForTimeout(700)
  // el menú de opciones aparece al hover — buscar "Estado del central"
  const opt = page.locator('button, div[role="menuitem"], li').filter({ hasText: 'Estado del central' }).first()
  const optVisible = await opt.count()
  console.log('Opción "Estado del central" visible:', optVisible > 0)
  if (optVisible) {
    await opt.click()
    await page.waitForTimeout(800)
    const body = await page.textContent('body')
    console.log('→ Diálogo COLABORACIÓN abierto:', body.includes('Modelo central activo'))
    console.log('→ Datos reales (disciplinas):', body.includes('Arquitectura (J. Burga)'))
    // cerrar
    await page.keyboard.press('Escape')
  }
}

// Probar ESTRUCTURAL desde la pestaña Análisis
for (let i = 0; i < count; i++) {
  const t = tabs.nth(i)
  if (((await t.textContent()) || '').trim() === 'Análisis') { await t.click(); break }
}
await page.waitForTimeout(500)
const body2 = await page.textContent('body')
console.log('Análisis muestra Estructural:', body2.includes('Estructural'))

// Verificar menú radial de un muro: clic en un muro del plano
const consoleInput = page.locator('input').last()
await consoleInput.fill('MUROS')
await consoleInput.press('Enter')
await page.waitForTimeout(700)
const body3 = await page.textContent('body')
console.log('Cuadro de muros (datos reales):', body3.includes('Long.') && body3.includes('Volumen'))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// Cambio de unidades a pies: probar el render de cotas
await consoleInput.fill('UNIDADES')
await page.on('dialog', async (d) => { await d.accept('ft') })
await consoleInput.press('Enter')
await page.waitForTimeout(700)
const dimsText = await page.textContent('body')
console.log('Cotas en pies-pulgadas:', /\d+'-\d+"/.test(dimsText))

console.log('Errores JS:', errors.length ? errors.slice(0, 3) : 'ninguno')
await browser.close()
