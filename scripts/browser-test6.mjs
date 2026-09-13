const { chromium } = await import('playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2500)

// clic en una zona donde hay un ambiente (centro del plano)
await page.mouse.click(750, 480)
await page.waitForTimeout(800)
let body = await page.textContent('body')
console.log('Radial tras clic (espacio/lámina):',
  body.includes('Etiquetas') || body.includes('Acabados') || body.includes('Lámina') || body.includes('Propiedades'))

// ESTIRA completo: armar, clic 1, clic 2 → verificar consola
const consoleInput = page.locator('input').last()
await consoleInput.fill('ESTIRA')
await consoleInput.press('Enter')
await page.waitForTimeout(400)
await page.mouse.click(640, 430)   // centro de ventana de cruces
await page.waitForTimeout(400)
await page.mouse.click(700, 430)   // destino del estiramiento (0.60 m a la derecha)
await page.waitForTimeout(800)
body = await page.textContent('body')
console.log('ESTIRA ejecutado con desplazamiento real:', body.includes('ESTIRA:'))

// DESHACER el estiramiento
await consoleInput.fill('U')
await consoleInput.press('Enter')
await page.waitForTimeout(500)
console.log('Errores JS:', errors.length ? errors.slice(0, 3) : 'ninguno')
await browser.close()
