const { chromium } = await import('playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2500)

const consoleInput = page.locator('input').last()

// 1) CUADRO DE MUROS con datos reales (tras fix del tab)
await consoleInput.fill('MUROS')
await consoleInput.press('Enter')
await page.waitForTimeout(800)
let body = await page.textContent('body')
console.log('Cuadro de muros real:', body.includes('Volumen') && (body.includes('Muro') || body.includes('TOTAL')))

// 2) Tabs del cuadro: clic en Puertas
const tabBtn = page.locator('button').filter({ hasText: /^Puertas$/ }).first()
if (await tabBtn.count()) {
  await tabBtn.click()
  await page.waitForTimeout(400)
  body = await page.textContent('body')
  console.log('Tab Puertas:', body.includes('Tipo') && body.includes('Ancho'))
}
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// 3) Ribbon completo: pestaña BIM → clic (no hover) en Colaboración
const tabs = page.locator('[role="tab"], button')
const count = await tabs.count()
for (let i = 0; i < count; i++) {
  const t = tabs.nth(i)
  if (((await t.textContent()) || '').trim() === 'BIM') { await t.click(); break }
}
await page.waitForTimeout(600)
const toolBtn = page.getByText('Colaboración', { exact: true }).first()
await toolBtn.click()
await page.waitForTimeout(700)
const opt = page.getByText('Estado del central').first()
const optFound = await opt.count()
console.log('Opción "Estado del central" en popover:', optFound > 0)
if (optFound) {
  await opt.click()
  await page.waitForTimeout(800)
  body = await page.textContent('body')
  console.log('→ Diálogo colaboración:', body.includes('Modelo central activo'))
  console.log('→ Disciplinas reales:', body.includes('Arquitectura (J. Burga)') && body.includes('MEP'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// 4) Menú radial: clic sobre un muro del plano (busca paths/rects del svg principal)
await page.mouse.click(700, 450)
await page.waitForTimeout(700)
body = await page.textContent('body')
console.log('Menú radial/lámina al clic:', body.includes('Editar') || body.includes('Lámina') || body.includes('Unidades'))

// 5) UNIDADES de vuelta a métrico
await consoleInput.fill('UNIDADES')
page.once('dialog', async (d) => { await d.accept('m') })
await consoleInput.press('Enter')
await page.waitForTimeout(600)
body = await page.textContent('body')
console.log('Vuelta a métrico:', !/\d+'-\d+"/.test(body) || body.includes('UNIDADES'))

console.log('Errores JS:', errors.length ? errors.slice(0, 3) : 'ninguno')
await browser.close()
