import { chromium } from 'playwright'
const html = `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Archivo:wght@600;800&display=swap" rel="stylesheet">
<style>body{font-family:'Archivo',sans-serif}</style></head>
<body><h1>Prueba Archivo</h1><p style="font-family:'Inter',sans-serif">Prueba Inter</p></body></html>`
const b = await chromium.launch()
const p = await b.newPage()
await p.goto('data:text/html,' + encodeURIComponent(html), { waitUntil: 'load' })
await p.waitForTimeout(6000)
const r = await p.evaluate(() => ({
  archivo: document.fonts.check('800 20px Archivo'),
  inter: document.fonts.check('400 16px Inter'),
  n: document.fonts.size,
}))
console.log(JSON.stringify(r))
await b.close()
