// ============================================================
// JARUMY — Test de exportación PDF a escala (Node/Bun)
// Genera el PDF del plano base a 1:50 y 1:75 y lo escribe a
// disco para inspección visual (pdftoppm/pdfinfo/pdftotext).
// ============================================================

import { writeFileSync } from 'fs'
import { exportPlanPdf } from '../src/lib/pdf-export'
import { BASE_ELEMENTS, LAYERS } from '../src/lib/plan-data'

async function main() {
  const cases = [
    { scale: 50, paper: 'a3' as const, landscape: true },
    { scale: 75, paper: 'a3' as const, landscape: true },
    { scale: 100, paper: 'a4' as const, landscape: false },
  ]
  for (const c of cases) {
    const res = await exportPlanPdf(BASE_ELEMENTS, {}, LAYERS, {
      scale: c.scale,
      paper: c.paper,
      landscape: c.landscape,
      includeAutoDims: true,
      includeAreas: true,
      includeFurniture: true,
      title: 'VIVIENDA UNIFAMILIAR',
      returnData: true,
    })
    const out = `/home/z/my-project/download/${res.filename}`
    writeFileSync(out, Buffer.from(res.data!, 'base64'))
    console.log(`OK ${out} — ${res.pageW}x${res.pageH} mm · 1:${c.scale} · plano ${res.planW.toFixed(2)}x${res.planH.toFixed(2)} m · ${(res.bytes / 1024).toFixed(1)} KB`)
  }
}

main().catch((e) => { console.error('FALLO:', e); process.exit(1) })
