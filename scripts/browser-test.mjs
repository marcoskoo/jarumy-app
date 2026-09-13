// Test de humo: cargar la página y verificar interacciones clave
const { chromium } = await import('playwright')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2000)

// 1) La página carga con el canvas
const hasCanvas = await page.locator('svg').count()
console.log('SVG en página:', hasCanvas > 0)

// 2) Abrir consola de comandos y ejecutar AYUDA
const consoleInput = page.locator('input[placeholder*="Comando"], input[placeholder*="comando"], input[placeholder*="AYUDA"]').first()
if (await consoleInput.count()) {
  await consoleInput.fill('AYUDA')
  await consoleInput.press('Enter')
  await page.waitForTimeout(500)
}
const body = await page.textContent('body')
console.log('AYUDA responde:', body.includes('ESTIRA') && body.includes('TRAYECTO'))
console.log('Comandos nuevos en ayuda:', body.includes('ESTRUCTURAL'), body.includes('GUARDAR'))

// 3) Ejecutar comando ESTRUCTURAL → diálogo con datos reales
await consoleInput.fill('ESTRUCTURAL')
await consoleInput.press('Enter')
await page.waitForTimeout(700)
const structDlg = await page.textContent('body')
console.log('Diálogo estructural:', structDlg.includes('Cortante basal') && structDlg.includes('Peso sísmico'))

// 4) Cerrar y ejecutar COLABORACION
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await consoleInput.fill('COLABORACION')
await consoleInput.press('Enter')
await page.waitForTimeout(700)
const collab = await page.textContent('body')
console.log('Diálogo colaboración:', collab.includes('Modelo central activo') && collab.includes('Elementos por disciplina'))

// 5) Cerrar y probar UNIDADES ft
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await consoleInput.fill('UNIDADES')
await consoleInput.press('Enter')
await page.waitForTimeout(300)
// el prompt de ventana usa window.prompt — interceptarlo
page.on('dialog', async (d) => { await d.accept('ft') })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

console.log('Errores de página:', errors.length === 0 ? 'NINGUNO' : errors.slice(0, 5))
await browser.close()
