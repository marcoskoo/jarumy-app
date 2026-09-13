const { chromium } = await import('playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2500)
const consoleInput = page.locator('input').last()

// AUDIT real
await consoleInput.fill('AUDIT')
await consoleInput.press('Enter')
await page.waitForTimeout(600)
let body = await page.textContent('body')
console.log('AUDIT real (cuenta objetos):', body.includes('AUDIT:'))

// BORRAR un muro y PURGAR
await consoleInput.fill('E')
await consoleInput.press('Enter')
await page.waitForTimeout(400)
await page.mouse.click(620, 400)
await page.waitForTimeout(500)
await consoleInput.fill('PURGA')
await consoleInput.press('Enter')
await page.waitForTimeout(600)
body = await page.textContent('body')
console.log('PURGA real (elimina borrados):', body.includes('PURGA:'))

// RENDER ultra + calidad
await consoleInput.fill('RENDER')
await consoleInput.press('Enter')
await page.waitForTimeout(600)
body = await page.textContent('body')
console.log('Badge render:', body.includes('Render'))

console.log('Errores JS:', errors.length ? errors.slice(0, 3) : 'ninguno')
await browser.close()
