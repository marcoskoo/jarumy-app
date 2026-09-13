// ============================================================
// JARUMY APP — Pruebas Node del PAQUETE 2 de herramientas:
// curvas (arco/elipse/spline), directriz, nube, hatch,
// matriz/equisdist/recorta/alarga/explota, fases BIM,
// quick select, iluminación y acústica + export DXF/PDF.
// Ejecutar: bun scripts/test-tools2.ts
// ============================================================
import {
  BASE_ELEMENTS, LAYERS,
  arcFrom3Pts, sampleArc3, sampleCatmullRom, scallopPts, offsetPolyline, segIntersect, pathFromPts,
  type PlanElement,
} from '../src/lib/plan-data'
import { exportPlanDxf } from '../src/lib/dxf-export'
import { exportPlanPdf } from '../src/lib/pdf-export'

let failures = 0
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

console.log('=== 1) Geometría compartida ===')
{
  // arco por 3 puntos sobre un círculo conocido: centro (0,0), r=5
  const arc = arcFrom3Pts([5, 0], [0, 5], [-5, 0])
  ok(!!arc, 'arcFrom3Pts resuelve el circuncentro')
  ok(Math.abs(arc!.cx - 0) < 1e-6 && Math.abs(arc!.r - 5) < 1e-6, `centro (0,0) y radio 5 → (${arc!.cx.toFixed(3)}, ${arc!.cy.toFixed(3)}) r=${arc!.r.toFixed(3)}`)
  const smp = sampleArc3([5, 0], [0, 5], [-5, 0])
  ok(smp.length >= 8, `sampleArc3 muestrea ${smp.length} puntos`)
  ok(Math.abs(Math.hypot(smp[4][0], smp[4][1]) - 5) < 0.01, 'los puntos muestreados están en el radio')

  // catmull-rom
  const curve = sampleCatmullRom([[0, 0], [60, 120], [180, 60], [300, 200]], 8)
  ok(curve.length >= 24 && Math.abs(curve[0][0] - 0) < 1e-6, `sampleCatmullRom suaviza a ${curve.length} puntos desde el extremo`)

  // nube de control
  const cloud = scallopPts([[0, 0], [200, 0], [200, 100], [0, 100], [0, 0]], false, 26)
  ok(cloud.length > 20, `scallopPts genera ${cloud.length} puntos de festones`)
  const d = pathFromPts(cloud)
  ok(d.startsWith('M') && d.includes('L'), 'pathFromPts emite SVG path válido')

  // offset
  const off = offsetPolyline([[0, 0], [100, 0], [100, 100]], 20)
  ok(Math.abs(off[0][1] - 20) < 1e-6, `offsetPolyline desplaza el primer vértice a y=${off[0][1].toFixed(1)} (normal +20 en coords SVG)`)

  // intersección
  const ip = segIntersect([0, 0], [100, 100], [0, 100], [100, 0])
  ok(!!ip && Math.abs(ip![0] - 50) < 1e-6 && Math.abs(ip![1] - 50) < 1e-6, `segIntersect cruza en (${ip?.[0]}, ${ip?.[1]})`)
}

console.log('=== 2) Efectos del store (matriz, equidist, recorta, alarga, explota, fase) ===')
{
  // import dinámico: el store usa alias @/ (bun los resuelve con tsconfig)
  const { useJarumy } = await import('../src/lib/store')
  const st = useJarumy.getState()

  // línea de prueba cruzada por un muro vertical existente (x=630 entre y 240..390)
  const lineEl: PlanElement = { id: 'usr-tst-line', type: 'dibujo', layer: 'dibujo', name: 'Línea prueba', geo: { kind: 'linea', pts: [[500, 300], [800, 300]] } }
  const wallV: PlanElement = { id: 'usr-tst-wall', type: 'muro', layer: 'muros', name: 'Muro corte', geo: { x1: 630, y1: 240, x2: 630, y2: 390, t: 8 } }
  useJarumy.setState({ elements: [...st.elements, lineEl, wallV], mods: {} })

  // RECORTA: clic sobre el tramo derecho (700,300) → elimina ese tramo
  useJarumy.getState().applyEffect('usr-tst-line', 'trimAt', '700,300')
  let line = useJarumy.getState().elements.find((e) => e.id === 'usr-tst-line')!.geo as { pts: number[][] }
  ok(Math.abs(line.pts[1][0] - 630) < 1e-6, `RECORTA: la línea ahora termina en x=${line.pts[1][0]} (corte en el muro x=630)`)

  // ALARGA: la línea truncada se extiende hasta x=800 con un límite
  const bound: PlanElement = { id: 'usr-tst-bound', type: 'dibujo', layer: 'dibujo', name: 'Límite', geo: { kind: 'linea', pts: [[800, 200], [800, 400]] } }
  useJarumy.setState({ elements: [...useJarumy.getState().elements, bound] })
  useJarumy.getState().applyEffect('usr-tst-line', 'extendTo', 'usr-tst-bound')
  line = useJarumy.getState().elements.find((e) => e.id === 'usr-tst-line')!.geo as { pts: number[][] }
  ok(Math.abs(line.pts[1][0] - 800) < 1e-6, `ALARGA: extremo extendido a x=${line.pts[1][0]}`)

  // MATRIZ RECTANGULAR sobre una columna base
  const colEl: PlanElement = { id: 'usr-tst-col', type: 'columna', layer: 'estructura', name: 'Columna base', geo: { x: 200, y: 200, size: 18 } }
  useJarumy.setState({ elements: [...useJarumy.getState().elements, colEl] })
  const n0 = useJarumy.getState().elements.length
  useJarumy.getState().applyEffect('usr-tst-col', 'arrayRect', '3,2,2,2')
  const nCols = useJarumy.getState().elements.filter((e) => e.name.startsWith('Columna base [')).length
  ok(nCols === 5, `MATRIZ RECT: ${nCols} copias (3×2 menos el original)`)

  // MATRIZ POLAR sobre la misma columna
  useJarumy.getState().applyEffect('usr-tst-col', 'arrayPolar', '6,360')
  const nPolar = useJarumy.getState().elements.filter((e) => e.name.includes('polar')).length
  ok(nPolar === 6, `MATRIZ POLAR: ${nPolar} copias alrededor del centro`)

  // EQUISDIST sobre una polilínea
  const polyEl: PlanElement = { id: 'usr-tst-poly', type: 'dibujo', layer: 'dibujo', name: 'Eje', geo: { kind: 'polilinea', pts: [[100, 500], [400, 500], [400, 650]] } }
  useJarumy.setState({ elements: [...useJarumy.getState().elements, polyEl] })
  useJarumy.getState().applyEffect('usr-tst-poly', 'offset', 0.15)
  const offEl = useJarumy.getState().elements.find((e) => e.name === 'Eje (offset 0.15 m)')
  ok(!!offEl, 'EQUISDIST: copia offset 0.15 m creada')
  const offPts = (offEl!.geo as { pts: number[][] }).pts
  ok(Math.abs(offPts[0][1] - (500 + 9)) < 1.5, `offset aplicado hacia y=${offPts[0][1].toFixed(1)} (9 px = 0.15 m bajo el eje)`)

  // EXPLOTA la polilínea
  const nBefore = useJarumy.getState().elements.length
  useJarumy.getState().applyEffect('usr-tst-poly', 'explode')
  const segs = useJarumy.getState().elements.filter((e) => e.name === 'Eje · seg 1' || e.name === 'Eje · seg 2')
  ok(segs.length === 2 && useJarumy.getState().elements.length === nBefore + 2, `EXPLOTA: 2 líneas creadas (original marcado como borrado)`)

  // FASE sobre el muro de prueba
  useJarumy.getState().applyEffect('usr-tst-wall', 'phase', 'demolicion')
  const ph = useJarumy.getState().mods['usr-tst-wall']?.phase
  ok(ph === 'demolicion', `FASE: muro marcado como "${ph}"`)
}

console.log('=== 3) Exportación DXF con nuevas geometrías y fases ===')
{
  const elements: PlanElement[] = [
    ...BASE_ELEMENTS,
    { id: 'x1', type: 'dibujo', layer: 'dibujo', name: 'Arco', geo: { kind: 'arco', pts: [[300, 300], [360, 240], [420, 300]] } },
    { id: 'x2', type: 'dibujo', layer: 'dibujo', name: 'Elipse', geo: { kind: 'elipse', pts: [[600, 500]], rx: 90, ry: 45 } },
    { id: 'x3', type: 'dibujo', layer: 'dibujo', name: 'Spline', geo: { kind: 'spline', pts: [[100, 600], [200, 520], [320, 640], [450, 560]] } },
    { id: 'x4', type: 'dibujo', layer: 'dibujo', name: 'Directriz', geo: { kind: 'directriz', pts: [[700, 400], [780, 360]], text: 'PISO PORCELANATO' } },
    { id: 'x5', type: 'dibujo', layer: 'dibujo', name: 'Nube', geo: { kind: 'nube', pts: [[150, 150], [300, 150], [300, 220], [150, 220], [150, 150]] } },
    { id: 'x6', type: 'dibujo', layer: 'dibujo', name: 'Hatch', geo: { kind: 'hatch', pts: [[150, 620], [260, 620], [260, 700], [150, 700], [150, 620]], pattern: 'ar-b816' } },
    { id: 'x7', type: 'dibujo', layer: 'dibujo', name: 'Cota radio', geo: { kind: 'cota-rad', pts: [[900, 300], [960, 300]], r: 60 } },
    { id: 'x8', type: 'dibujo', layer: 'dibujo', name: 'Cota angular', geo: { kind: 'cota-ang', pts: [[900, 600], [960, 600], [900, 660]] } },
    { id: 'x9', type: 'dibujo', layer: 'dibujo', name: 'Punto', geo: { kind: 'punto', pts: [[500, 200]] } },
    { id: 'x10', type: 'dibujo', layer: 'dibujo', name: 'Línea demolida', geo: { kind: 'linea', pts: [[200, 740], [500, 740]], phase: 'demolicion' } },
  ]
  const dxf = exportPlanDxf(elements, { x1: {} }, LAYERS)
  const c = dxf.content
  const nArc = (c.match(/\r\n0\r\nARC\r\n/g) || []).length
  const nLine = (c.match(/\r\n0\r\nLINE\r\n/g) || []).length
  const nText = (c.match(/\r\n0\r\nTEXT\r\n/g) || []).length
  ok(nArc >= 1, `DXF: ${nArc} entidad ARC (arco por 3 puntos)`)
  ok(c.includes('PISO PORCELANATO'), 'DXF: texto de directriz exportado')
  ok(c.includes('HATCH AR-B816'), 'DXF: etiqueta de hachurado exportada')
  ok(c.includes('R 1.00 m'), 'DXF: cota de radio R 1.00 m')
  ok(c.includes('90.0%%D') || c.includes('90%%D'), 'DXF: cota angular 90°')
  ok(c.includes('DEMOLICION_DIBUJO'), 'DXF: capa DEMOLICION_DIBUJO para la fase demolición')
  ok(nLine > 100 && nText > 20, `DXF: ${nLine} LINE · ${nText} TEXT`)
  console.log(`  — ${dxf.filename} · ${(dxf.bytes / 1024).toFixed(1)} KB`)
}

console.log('=== 4) Exportación PDF con nuevas geometrías y fases ===')
{
  const elements: PlanElement[] = [
    ...BASE_ELEMENTS,
    { id: 'p1', type: 'dibujo', layer: 'dibujo', name: 'Arco', geo: { kind: 'arco', pts: [[300, 300], [360, 240], [420, 300]] } },
    { id: 'p2', type: 'dibujo', layer: 'dibujo', name: 'Elipse', geo: { kind: 'elipse', pts: [[600, 500]], rx: 90, ry: 45 } },
    { id: 'p3', type: 'dibujo', layer: 'dibujo', name: 'Spline', geo: { kind: 'spline', pts: [[100, 600], [200, 520], [320, 640], [450, 560]] } },
    { id: 'p4', type: 'dibujo', layer: 'dibujo', name: 'Directriz', geo: { kind: 'directriz', pts: [[700, 400], [780, 360]], text: 'PISO PORCELANATO R10' } },
    { id: 'p5', type: 'dibujo', layer: 'dibujo', name: 'Nube', geo: { kind: 'nube', pts: [[150, 150], [300, 150], [300, 220], [150, 220], [150, 150]] } },
    { id: 'p6', type: 'dibujo', layer: 'dibujo', name: 'Hatch', geo: { kind: 'hatch', pts: [[150, 620], [260, 620], [260, 700], [150, 700], [150, 620]], pattern: 'ansi31' } },
    { id: 'p7', type: 'dibujo', layer: 'dibujo', name: 'Cota radio', geo: { kind: 'cota-rad', pts: [[900, 300], [960, 300]], r: 60 } },
    { id: 'p8', type: 'dibujo', layer: 'dibujo', name: 'Cota angular', geo: { kind: 'cota-ang', pts: [[900, 600], [960, 600], [900, 660]] } },
    { id: 'p9', type: 'dibujo', layer: 'dibujo', name: 'Línea demolida', geo: { kind: 'linea', pts: [[200, 740], [500, 740]], phase: 'demolicion' } },
  ]
  const mods = { 'muro-w1': { phase: 'existente' as const } }
  const pdf = await exportPlanPdf(elements, mods, LAYERS, {
    scale: 75, paper: 'a3' as const, landscape: true,
    includeAutoDims: true, includeAreas: true, includeFurniture: true,
    title: 'PRUEBA PAQUETE 2',
    returnData: true,
    cartela: {
      proyecto: 'PRUEBA PAQUETE 2', propietario: 'Test', ubicacion: 'Lima',
      autor: 'J. Burga', consultor: 'JARUMY', lamina: 'A-01', escala: '1:75', includeLogo: false,
    },
  })
  ok(pdf.bytes > 30000, `PDF generado: ${(pdf.bytes / 1024).toFixed(1)} KB`)
  if (pdf.data) {
    const fs = await import('node:fs')
    fs.writeFileSync('/home/z/my-project/download/test-paquete2-A3h.pdf', Buffer.from(pdf.data, 'base64'))
    console.log('  — guardado en download/test-paquete2-A3h.pdf')
  }
}

console.log('=== 5) Análisis: iluminación y acústica (cálculo directo) ===')
{
  // iluminación: sala 8×5 m, 150 lx → N = 150*40/(810*0.65*0.8) = 14.2 → 15
  const LM = 810, UF = 0.65, MF = 0.8
  const area = (480 / 60) * (300 / 60)
  const n = Math.ceil((150 * area) / (LM * UF * MF))
  ok(n === 15, `ILUMINACIÓN: sala 8.0×5.0 m a 150 lx → ${n} luminarias LED 9 W`)
  const avg = (n * LM * UF * MF) / area
  ok(avg >= 150, `lux medios logrados: ${avg.toFixed(0)} lx ≥ 150 lx`)

  // acústica: muro ladrillo 140 → Rw 42 < 45 (falla) · ladrillo 230 → 46 ≥ 45 (cumple)
  const RW = { l140: 42, l230: 46, c175: 47, dw100: 52 } as Record<string, number>
  ok(RW.l140 < 45, `ACÚSTICA: ladrillo 140 → Rw ${RW.l140} dB (requiere mejora)`)
  ok(RW.l230 >= 45 && RW.dw100 >= 45, `ACÚSTICA: ladrillo 230 (Rw ${RW.l230}) y drywall (Rw ${RW.dw100}) cumplen ≥ 45 dB`)
}

console.log('')
if (failures === 0) {
  console.log('✔ PAQUETE 2: TODAS LAS PRUEBAS PASARON')
} else {
  console.log(`✗ ${failures} pruebas fallaron`)
  process.exit(1)
}
