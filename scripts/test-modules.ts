// ============================================================
// JARUMY APP — Pruebas Node de los módulos nuevos:
// DXF, elevaciones, iso3d, normativa RNE, metrados S10,
// plan-files (parse/validación) y PDF con nuevos elementos.
// ============================================================
import { BASE_ELEMENTS, LAYERS, BLOCK_LIBRARY } from '../src/lib/plan-data'
import { exportPlanDxf } from '../src/lib/dxf-export'
import { buildElevation } from '../src/lib/elevation'
import { buildIsoScene } from '../src/lib/iso3d'
import { checkNormativa } from '../src/lib/normativa'
import { computeMetrados, buildS10Workbook } from '../src/lib/metrados'
import { parsePlanFile } from '../src/lib/plan-files'
import { exportPlanPdf } from '../src/lib/pdf-export'
import { insertStairFixture, insertRoofFixture, insertInstFixture, insertTerrainFixture, insertPinFixture, insertSymFixture } from './fixtures-extra'

async function main() {
  // plano base + todos los elementos nuevos
  let elements = [...BASE_ELEMENTS]
  elements = insertRoofFixture(elements)
  elements = insertInstFixture(elements)
  elements = insertTerrainFixture(elements)
  elements = insertPinFixture(elements)
  elements = insertSymFixture(elements)
  const { elements: withStair, mods } = insertStairFixture(elements)
  elements = withStair
  const modsAll = mods as Record<string, never>

  // ---------- 1) DXF ----------
  const dxf = exportPlanDxf(elements, modsAll, LAYERS)
  const content = dxf.content
  const checks = {
    'SECTION HEADER': null,
    'ENTITIES': null,
    'EOF': null,
    'LAYER MUROS': null,
    'LAYER INSTALACIONES': null,
    'LINE entities': (content.match(/\r\n0\r\nLINE\r\n/g) || []).length,
    'TEXT entities': (content.match(/\r\n0\r\nTEXT\r\n/g) || []).length,
    'CIRCLE entities': (content.match(/\r\n0\r\nCIRCLE\r\n/g) || []).length,
  } as Record<string, unknown>
  checks['SECTION HEADER'] = content.includes('0\r\nSECTION\r\n2\r\nHEADER\r\n')
  checks['ENTITIES'] = content.includes('2\r\nENTITIES\r\n')
  checks['EOF'] = content.trim().endsWith('EOF')
  checks['LAYER MUROS'] = content.includes('2\r\nMUROS\r\n')
  checks['LAYER INSTALACIONES'] = content.includes('2\r\nINSTALACIONES\r\n')
  console.log('— DXF:', dxf.filename, `${(dxf.bytes / 1024).toFixed(1)} KB`, checks)
  if (!checks['SECTION HEADER'] || !checks['ENTITIES'] || !checks['EOF'] || !checks['LAYER MUROS'] || !checks['LAYER INSTALACIONES']) throw new Error('DXF incompleto')
  if ((checks['LINE entities'] as number) < 100) throw new Error('DXF con muy pocas líneas')

  // ---------- 2) Elevaciones ----------
  for (const dir of ['sur', 'norte', 'este', 'oeste', 'seccion'] as const) {
    const e = buildElevation(elements, modsAll, dir, { wallH: 2.5, cutX: 600 })
    if (e.lines.length < 10) throw new Error(`Elevación ${dir} muy vacía (${e.lines.length} líneas)`)
    if (e.width < 5) throw new Error(`Elevación ${dir} ancho incorrecto`)
    console.log(`— Elevación ${dir}: ${e.lines.length} líneas · ${e.opens.length} vanos · ancho ${e.width.toFixed(1)} m`)
  }

  // ---------- 3) Iso3D ----------
  for (const yaw of [0, 35, 90, 200]) {
    const sc = buildIsoScene(elements, modsAll, { yaw, pitch: 30 })
    if (sc.quads.length < 100) throw new Error(`Iso3D yaw ${yaw} muy vacío (${sc.quads.length} quads)`)
  }
  const sc = buildIsoScene(elements, modsAll, { yaw: 35, pitch: 30 }, { includeFurniture: true })
  console.log('— Iso3D:', sc.quads.length, 'quads · mobiliario incluido · span', sc.spanW.toFixed(1), 'm')

  // ---------- 4) Normativa ----------
  const rep = checkNormativa(elements, modsAll)
  const fail = rep.checks.filter((c) => c.status === 'fail')
  console.log('— Normativa:', rep.summary, '· checks:', rep.checks.length, '· fallos:', fail.map((f) => f.code).join(',') || 'ninguno')
  if (rep.checks.length < 5) throw new Error('Normativa con muy pocos checks')

  // ---------- 5) Metrados S10 ----------
  const met = computeMetrados(elements, modsAll)
  const xls = buildS10Workbook(met, 'TEST')
  if (met.partidas.length < 8) throw new Error('Metrados con muy pocas partidas')
  if (!xls.includes('mso-application') || !xls.includes('=SUM(F4:')) throw new Error('S10 malformado')
  console.log('— Metrados:', met.partidas.length, 'partidas · xls', (xls.length / 1024).toFixed(1), 'KB · resumen', met.resumen)

  // ---------- 6) plan-files ----------
  const snapshot = { elements, mods: modsAll, layers: LAYERS, gridSpacing: 60, savedAt: new Date().toISOString() }
  const parsed = parsePlanFile(JSON.parse(JSON.stringify(snapshot)))
  if (!parsed || parsed.elements.length !== elements.length) throw new Error('parsePlanFile incorrecto')
  const bad = parsePlanFile({ hola: 1 })
  if (bad !== null) throw new Error('parsePlanFile aceptó basura')
  console.log('— plan-files: snapshot de', parsed.elements.length, 'elementos parseado OK · basura rechazada')

  // ---------- 7) PDF con nuevos elementos + cartela ----------
  const pdf = await exportPlanPdf(elements, modsAll, LAYERS, {
    scale: 75, paper: 'a3', landscape: true,
    includeAutoDims: true, includeAreas: true, includeFurniture: true,
    includeInstalaciones: true,
    title: 'TEST CON NUEVOS ELEMENTOS',
    cartela: {
      proyecto: 'CASA TEST', propietario: 'J. BURGA', ubicacion: 'LIMA - SURCO',
      autor: 'ARQ. JARUMY', consultor: 'JARUMY', lamina: 'A-99', escala: '', includeLogo: false,
    },
    returnData: true,
  })
  if (!pdf.data || pdf.bytes < 5000) throw new Error('PDF sospechosamente pequeño')
  console.log('— PDF:', pdf.filename, `${(pdf.bytes / 1024).toFixed(1)} KB · plano ${pdf.planW.toFixed(1)}×${pdf.planH.toFixed(1)} m`)

  // ---------- 8) bloques detalles ----------
  const detalles = BLOCK_LIBRARY.filter((b) => b.cat === 'detalles')
  console.log('— Bloques detalles:', detalles.length, '· total biblioteca:', BLOCK_LIBRARY.length)
  if (detalles.length < 8) throw new Error('faltan bloques de detalles')

  console.log('\nTODOS LOS MÓDULOS OK')
}

main().catch((e) => { console.error('FALLO:', e); process.exit(1) })
