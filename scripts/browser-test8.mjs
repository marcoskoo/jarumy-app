// Prueba de humo: persistencia total (auto-guardado) + exportación de cuadros BIM a Excel
const { chromium } = await import('playwright')
const fs = await import('fs')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2500)
const consoleInput = page.locator('input').last()

let body = await page.textContent('body')
console.log('1. Chip AUTO-GUARDADO en barra de estado:', body.includes('AUTO-GUARDADO'))

// --- mutar el plano: borrar un muro y purgarlo ---
await consoleInput.fill('E')
await consoleInput.press('Enter')
await page.waitForTimeout(400)
await page.mouse.click(620, 400)
await page.waitForTimeout(500)
await consoleInput.fill('PURGA')
await consoleInput.press('Enter')
await page.waitForTimeout(700)
body = await page.textContent('body')
console.log('2. PURGA aplicada (mutación del plano):', body.includes('PURGA:'))

// --- esperar el debounce (900 ms) y verificar escritura en localStorage ---
await page.waitForTimeout(1600)
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem('jarumy_autosave')
  if (!raw) return null
  const d = JSON.parse(raw)
  return { n: d.elements?.length, layers: d.layers?.length, savedAt: d.savedAt, v: d.v }
})
console.log('3. Auto-guardado escrito en localStorage:', JSON.stringify(saved))

// --- recargar y verificar restauración total ---
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2800)
body = await page.textContent('body')
console.log('4. Mensaje PLANO RESTAURADO tras recarga:', body.includes('PLANO RESTAURADO'))
const after = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('jarumy_autosave') || 'null')
  return { n: d?.elements?.length ?? null }
})
console.log('5. Elementos restaurados =', after.n, '· coincide con lo guardado:', after.n === saved?.n)
console.log('   (consola):', (body.match(/PLANO RESTAURADO[^\n]*/) || [''])[0].slice(0, 110))

// --- cuadros BIM: abrir diálogo y exportar Excel ---
await consoleInput.fill('CUADRO')
await consoleInput.press('Enter')
await page.waitForTimeout(800)
const dlPromise = page.waitForEvent('download', { timeout: 10000 })
await page.getByRole('button', { name: /Excel \(\.xls\)/ }).click()
const dl = await dlPromise
const path = '/home/z/my-project/scripts/t12-cuadros-bim.xls'
await dl.saveAs(path)
const stat = fs.statSync(path)
const content = fs.readFileSync(path, 'utf8')
console.log('6. Descarga Excel desde el diálogo:', dl.suggestedFilename(), '·', (stat.size / 1024).toFixed(1), 'KB')
console.log('   Formato SpreadsheetML válido:', content.includes('mso-application') && content.includes('<Worksheet'))
console.log('   6 hojas presentes:', ['Resumen', 'Espacios', 'Muros', 'Puertas', 'Ventanas', 'Sanitarios']
  .every((n) => content.includes(`ss:Name="${n}"`)))
console.log('   Fórmulas de totales:', content.includes('=SUM('))
console.log('   Título cuadro:', content.includes('CUADROS DE CANTIDADES BIM'))
// cerrar el diálogo con ESC
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// --- comando de consola EXCELBIM (exportación directa) ---
const dl2Promise = page.waitForEvent('download', { timeout: 10000 })
await consoleInput.fill('EXCELBIM')
await consoleInput.press('Enter')
const dl2 = await dl2Promise
await page.waitForTimeout(600)
body = await page.textContent('body')
console.log('7. Comando EXCELBIM descarga:', dl2.suggestedFilename(), '· consola:', body.includes('CUADROS BIM EXPORTADOS'))

// --- toggle del auto-guardado desde la barra de estado ---
await page.getByTitle(/Auto-guardado activo/).click()
await page.waitForTimeout(500)
const prefOff = await page.evaluate(() => ({
  pref: localStorage.getItem('jarumy_autosave_on'),
  data: localStorage.getItem('jarumy_autosave'),
}))
console.log('8. Toggle OFF → pref:', prefOff.pref, '· copia local eliminada:', prefOff.data === null)

await page.getByTitle(/Auto-guardado desactivado/).click()
await page.waitForTimeout(900)
const prefOn = await page.evaluate(() => ({
  pref: localStorage.getItem('jarumy_autosave_on'),
  data: localStorage.getItem('jarumy_autosave') !== null,
}))
console.log('9. Toggle ON → pref:', prefOn.pref, '· snapshot inmediato re-escrito:', prefOn.data)

console.log('10. Errores JS:', errors.length ? errors.slice(0, 3) : 'ninguno')
await browser.close()
