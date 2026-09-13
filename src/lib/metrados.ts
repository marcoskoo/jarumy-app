// ============================================================
// JARUMY APP — Metrados y presupuesto formato S10 (Perú).
// Calcula partidas desde el modelo y exporta a Excel
// (SpreadsheetML 2003, nativo en Excel/LibreOffice/Sheets
// sin dependencias externas).
// ============================================================

import type { PlanElement } from './plan-data'
import type { RoomGeo, WallGeo, DoorGeo, WindowGeo, RoofGeo } from './plan-data'
import { PX_PER_M, roomAreaM2 } from './plan-data'
import type { Mod } from './store'

export interface Partida {
  n: string
  desc: string
  und: string
  metrado: number
  note?: string
}

export interface MetradosReport {
  partidas: Partida[]
  resumen: {
    techadoM2: number
    murosM2: number
    pisosM2: number
    zocalosM: number
    ventanasM2: number
    puertasUnd: number
  }
}

export function computeMetrados(
  elements: PlanElement[],
  mods: Record<string, Mod>,
  wallH = 2.5,
): MetradosReport {
  const drawable = elements.filter((el) => !mods[el.id]?.deleted)
  const rooms = drawable.filter((e) => e.type === 'espacio').map((e) => e.geo as RoomGeo)
  const walls = drawable.filter((e) => e.type === 'muro').map((e) => ({
    g: e.geo as WallGeo, t: (mods[e.id]?.thickness ?? (e.geo as WallGeo).t) / PX_PER_M,
    tx: (mods[e.id]?.translate?.[0] ?? 0) / PX_PER_M,
    ty: (mods[e.id]?.translate?.[1] ?? 0) / PX_PER_M,
  }))
  const doors = drawable.filter((e) => e.type === 'puerta').map((e) => e.geo as DoorGeo)
  const wins = drawable.filter((e) => e.type === 'ventana').map((e) => e.geo as WindowGeo)
  const roofs = drawable.filter((e) => e.type === 'techo').map((e) => e.geo as RoofGeo)

  // --- muros por espesor (m² de muro levantado = largo × alto) ---
  const bucket = (t: number) => t < 0.16 ? 'Tabique ≤ 0.15 m' : t < 0.21 ? 'Muro 0.15 – 0.20 m' : 'Muro ≥ 0.23 m'
  const byBucket = new Map<string, number>()
  let murosM2 = 0
  for (const w of walls) {
    const len = (Math.hypot(w.g.x2 - w.g.x1, w.g.y2 - w.g.y1)) / PX_PER_M
    const m2 = len * wallH
    murosM2 += m2
    const k = bucket(w.t)
    byBucket.set(k, (byBucket.get(k) || 0) + m2)
  }

  const partidas: Partida[] = []
  let i = 1
  for (const [k, m2] of byBucket) {
    partidas.push({ n: String(i++).padStart(2, '0'), desc: `Muro de ladrillo con mortero P1:1:5 — ${k}`, und: 'm²', metrado: Math.round(m2 * 100) / 100 })
  }
  if (murosM2 > 0) {
    partidas.push({ n: String(i++).padStart(2, '0'), desc: 'Tarrajeo primario y acabado frotado en muros (2 caras)', und: 'm²', metrado: Math.round(murosM2 * 2 * 100) / 100, note: 'Incluye derrames y aristas' })
  }

  // --- pisos / contrapisos / zócalos por ambiente ---
  let pisosM2 = 0, zocalosM = 0, techadoM2 = 0
  const wetRooms = rooms.filter((r) => /ba[ñn]o|cocina|lavander|sshh/i.test(r.name || ''))
  const dryRooms = rooms.filter((r) => !wetRooms.includes(r))
  const sumArea = (rs: RoomGeo[]) => rs.reduce((n, r) => n + roomAreaM2(r), 0)
  pisosM2 = sumArea(rooms)
  techadoM2 = roofs.length
    ? roofs.reduce((n, g) => n + (g.w / PX_PER_M) * (g.h / PX_PER_M) / Math.cos(Math.atan(g.slope / 100)), 0)
    : sumArea(rooms)
  for (const r of rooms) zocalosM += 2 * (r.w + r.h) / PX_PER_M

  if (wetRooms.length) {
    partidas.push({ n: String(i++).padStart(2, '0'), desc: 'Piso cerámico antibrillante 30×30 en baños/cocina incl. junta 2 mm', und: 'm²', metrado: Math.round(sumArea(wetRooms) * 100) / 100 })
  }
  if (dryRooms.length) {
    partidas.push({ n: String(i++).padStart(2, '0'), desc: 'Piso porcelanato 60×60 pulido escojido, junta mínima', und: 'm²', metrado: Math.round(sumArea(dryRooms) * 100) / 100 })
  }
  partidas.push({ n: String(i++).padStart(2, '0'), desc: 'Contrapiso e=40 mm mezcla 1:5 acabado frotachado', und: 'm²', metrado: Math.round(pisosM2 * 100) / 100 })
  partidas.push({ n: String(i++).padStart(2, '0'), desc: 'Zócalo cerámico h=10 cm ranurado interior', und: 'm', metrado: Math.round(zocalosM * 100) / 100 })
  partidas.push({ n: String(i++).padStart(2, '0'), desc: 'Losa aligerada e=0.20 con viguetas cada 0.40 (techo propio)', und: 'm²', metrado: Math.round(techadoM2 * 100) / 100 })

  // --- carpinterías ---
  const doorsByW = new Map<string, number>()
  for (const d of doors) {
    const w = (d.r / PX_PER_M).toFixed(2)
    doorsByW.set(w, (doorsByW.get(w) || 0) + 1)
  }
  for (const [w, n] of doorsByW) {
    partidas.push({ n: String(i++).padStart(2, '0'), desc: `Puerta contraplacada de ${w} m incl. marco, bisagras y chapa`, und: 'und', metrado: n })
  }
  const ventanasM2 = wins.reduce((n, g) => n + (g.len / PX_PER_M) * 1.20, 0)
  if (ventanasM2 > 0) {
    partidas.push({ n: String(i++).padStart(2, '0'), desc: 'Ventana de aluminio con vidrio laminado 6+6 mm incl. installación', und: 'm²', metrado: Math.round(ventanasM2 * 100) / 100, note: 'Alto nominal 1.20 m' })
  }

  return {
    partidas,
    resumen: {
      techadoM2: Math.round(techadoM2 * 100) / 100,
      murosM2: Math.round(murosM2 * 100) / 100,
      pisosM2: Math.round(pisosM2 * 100) / 100,
      zocalosM: Math.round(zocalosM * 100) / 100,
      ventanasM2: Math.round(ventanasM2 * 100) / 100,
      puertasUnd: doors.length,
    },
  }
}

// ---------------- exportación Excel (SpreadsheetML 2003) ----------------

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function buildS10Workbook(r: MetradosReport, project: string): string {
  const rows: string[] = []

  const cell = (v: string | number, type: 'String' | 'Number', style?: string) => {
    const s = style ? ` ss:StyleID="${style}"` : ''
    return `<Cell${s}><Data ss:Type="${type}">${typeof v === 'number' ? v : esc(String(v))}</Data></Cell>`
  }
  const row = (cells: string[], h = 18) => `<Row ss:Height="${h}">${cells.join('')}</Row>`

  rows.push(row([`<Cell ss:StyleID="title"><Data ss:Type="String">PRESUPUESTO DE OBRA — FORMATO S10</Data></Cell>`, `<Cell ss:StyleID="sub"><Data ss:Type="String">${esc(project)}</Data></Cell>`], 26))
  rows.push(row([
    `<Cell ss:StyleID="sub"><Data ss:Type="String">${new Date().toLocaleDateString('es-PE')}</Data></Cell>`,
    `<Cell ss:StyleID="sub"><Data ss:Type="String">Jarumy app · Arq. Jarumy</Data></Cell>`,
  ]))
  rows.push(row([
    cell('N°', 'String', 'head'),
    cell('PARTIDA', 'String', 'head'),
    cell('UND', 'String', 'head'),
    cell('METRADO', 'String', 'head'),
    cell('P.U. (S/)', 'String', 'head'),
    cell('PARCIAL (S/)', 'String', 'head'),
  ], 22))

  // las filas de datos empiezan tras: título (1) + fecha (2) + cabecera (3)
  const first = 4
  r.partidas.forEach((p) => {
    rows.push(row([
      cell(p.n, 'String', 'c'),
      cell(p.desc + (p.note ? ` (${p.note})` : ''), 'String', 'wrap'),
      cell(p.und, 'String', 'c'),
      cell(p.metrado, 'Number', 'num'),
      cell('', 'Number', 'pu'),
      `<Cell ss:StyleID="num" ss:Formula="=RC[-2]*RC[-1]"/>`,
    ]))
  })
  const last = first + r.partidas.length - 1
  rows.push(row([
    `<Cell ss:StyleID="total" ss:MergeAcross="3"><Data ss:Type="String">COSTO DIRECTO</Data></Cell>`,
    `<Cell ss:StyleID="total" ss:MergeAcross="1" ss:Formula="=SUM(F${first}:F${last})"/>`,
  ], 24))

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style>
  <Style ss:ID="sub"><Font ss:Size="10" ss:Color="#555555"/></Style>
  <Style ss:ID="head"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#FDE68A" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="wrap"><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style>
  <Style ss:ID="c"><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="num"><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="0.00"/></Style>
  <Style ss:ID="pu"><Alignment ss:Horizontal="Right"/><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/><NumberFormat ss:Format="0.00"/></Style>
  <Style ss:ID="total"><Font ss:Bold="1" ss:Size="12"/><Alignment ss:Horizontal="Right"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="Presupuesto S10">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="38"/><Column ss:Width="430"/><Column ss:Width="42"/>
   <Column ss:Width="70"/><Column ss:Width="70"/><Column ss:Width="80"/>
   ${rows.join('\n   ')}
  </Table>
 </Worksheet>
</Workbook>`
}

export function downloadS10Workbook(r: MetradosReport, project: string): { filename: string; bytes: number } {
  const xml = buildS10Workbook(r, project)
  const filename = `jarumy-presupuesto-s10-${new Date().toISOString().slice(0, 10)}.xls`
  if (typeof document !== 'undefined') {
    const blob = new Blob(['\ufeff' + xml], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  return { filename, bytes: xml.length }
}
