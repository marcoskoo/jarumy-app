// ============================================================
// JARUMY APP — Cuadros de cantidades BIM (Revit Schedules).
// Calcula los 5 cuadros por categoría desde el modelo en vivo
// y los exporta a un Excel multi-hoja (SpreadsheetML 2003,
// nativo en Excel / LibreOffice / Google Sheets, sin
// dependencias externas). Misma técnica validada del S10.
// ============================================================

import type { PlanElement } from './plan-data'
import type { RoomGeo, WallGeo, DoorGeo, WindowGeo, FurnGeo } from './plan-data'
import { PX_PER_M, roomAreaM2 } from './plan-data'
import type { Mod } from './store'
import { USAGE_LABELS } from './store'

// ---------------- datos calculados (espejo del diálogo) ----------------

export interface BimRowEspacio { num: string; name: string; uso: string; area: number; ocup: number }
export interface BimRowMuro { name: string; largo: number; espesor: number; alto: number; area: number; vol: number }
export interface BimRowPuerta { name: string; tipo: string; ancho: number; alto: number; area: number }
export interface BimRowVentana { name: string; ancho: number; alto: number; antepecho: number; area: number; vidrio: number }
export interface BimRowSanitario { name: string; ancho: number; alto: number }

export interface BimSchedules {
  generatedAt: string
  counts: { total: number; espacios: number; muros: number; puertas: number; ventanas: number; sanitarios: number }
  espacios: BimRowEspacio[]
  espaciosTotal: number
  muros: BimRowMuro[]
  murosTotal: { largo: number; area: number; vol: number }
  puertas: BimRowPuerta[]
  puertasTotal: { n: number; area: number }
  ventanas: BimRowVentana[]
  ventanasTotal: { n: number; area: number; vidrio: number }
  sanitarios: BimRowSanitario[]
}

const r2 = (x: number) => Math.round(x * 100) / 100

export function computeBimSchedules(elements: PlanElement[], mods: Record<string, Mod>): BimSchedules {
  const alive = elements.filter((e) => !mods[e.id]?.deleted)
  const mod = (id: string): Mod => mods[id] || {}

  const espacios = alive.filter((e) => e.type === 'espacio').map((e) => {
    const g = e.geo as RoomGeo
    const area = roomAreaM2(g)
    return {
      num: String(g.num ?? ''),
      name: g.name || 'Espacio',
      uso: USAGE_LABELS[mod(e.id).usage || ''] || '—',
      area: r2(area),
      ocup: Math.max(1, Math.round(area / 4.5)),
    }
  })
  const espaciosTotal = r2(espacios.reduce((n, r) => n + r.area, 0))

  const muros = alive.filter((e) => e.type === 'muro').map((e) => {
    const g = e.geo as WallGeo
    const m = mod(e.id)
    const th = (m.thickness ?? g.t) / PX_PER_M
    const H = m.wallHeight || 2.5
    const L = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / PX_PER_M
    return { name: e.name, largo: r2(L), espesor: Math.round(th * 100), alto: r2(H), area: r2(L * H), vol: r2(L * H * th) }
  })
  const murosTotal = {
    largo: r2(muros.reduce((n, r) => n + r.largo, 0)),
    area: r2(muros.reduce((n, r) => n + r.area, 0)),
    vol: r2(muros.reduce((n, r) => n + r.vol, 0)),
  }

  const puertas = alive.filter((e) => e.type === 'puerta').map((e) => {
    const g = e.geo as DoorGeo
    const m = mod(e.id)
    const w = g.r / PX_PER_M
    const h = m.doorHeight || 2.1
    return { name: e.name, tipo: m.doorKind || 'simple', ancho: r2(w), alto: r2(h), area: r2(w * h) }
  })
  const puertasTotal = { n: puertas.length, area: r2(puertas.reduce((n, r) => n + r.area, 0)) }

  const ventanas = alive.filter((e) => e.type === 'ventana').map((e) => {
    const g = e.geo as WindowGeo
    const m = mod(e.id)
    const w = g.len / PX_PER_M
    const h = 1.2
    const area = w * h
    return { name: e.name, ancho: r2(w), alto: r2(h), antepecho: r2(m.sill ?? 0.9), area: r2(area), vidrio: r2(area * 0.85) }
  })
  const ventanasTotal = {
    n: ventanas.length,
    area: r2(ventanas.reduce((n, r) => n + r.area, 0)),
    vidrio: r2(ventanas.reduce((n, r) => n + r.vidrio, 0)),
  }

  const sanitarios = alive.filter((e) => e.type === 'sanitario').map((e) => {
    const g = e.geo as FurnGeo
    return { name: e.name, ancho: r2(g.w / PX_PER_M), alto: r2(g.h / PX_PER_M) }
  })

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      total: alive.length,
      espacios: espacios.length,
      muros: muros.length,
      puertas: puertas.length,
      ventanas: ventanas.length,
      sanitarios: sanitarios.length,
    },
    espacios, espaciosTotal, muros, murosTotal, puertas, puertasTotal, ventanas, ventanasTotal, sanitarios,
  }
}

// ---------------- construcción del libro SpreadsheetML ----------------

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

interface XCell { v?: string | number; t?: 'String' | 'Number'; st?: string; f?: string; merge?: number }
interface XRow { cells: XCell[]; h?: number }

const STYLES = ` <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style>
  <Style ss:ID="sub"><Font ss:Size="10" ss:Color="#555555"/></Style>
  <Style ss:ID="head"><Font ss:Bold="1" ss:Size="11" ss:Color="#7C2D12"/><Interior ss:Color="#FDE68A" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="c"><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="wrap"><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style>
  <Style ss:ID="num"><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="0.00"/></Style>
  <Style ss:ID="int"><Alignment ss:Horizontal="Right"/><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="tot"><Font ss:Bold="1" ss:Size="12"/><Alignment ss:Horizontal="Right"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/></Borders><NumberFormat ss:Format="0.00"/></Style>
  <Style ss:ID="totint"><Font ss:Bold="1" ss:Size="12"/><Alignment ss:Horizontal="Right"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/></Borders><NumberFormat ss:Format="0"/></Style>
 </Styles>`

const cellXml = (c: XCell): string => {
  const st = c.st ? ` ss:StyleID="${c.st}"` : ''
  const mg = c.merge ? ` ss:MergeAcross="${c.merge}"` : ''
  const f = c.f ? ` ss:Formula="${esc(c.f)}"` : ''
  if (c.v === undefined) return `<Cell${st}${mg}${f}/>`
  const t = c.t || 'String'
  const v = typeof c.v === 'number' ? String(c.v) : esc(String(c.v))
  return `<Cell${st}${mg}${f}><Data ss:Type="${t}">${v}</Data></Cell>`
}

const rowXml = (r: XRow) => `<Row${r.h ? ` ss:Height="${r.h}"` : ''}>${r.cells.map(cellXml).join('')}</Row>`

function worksheetXml(name: string, widths: number[], rows: XRow[]): string {
  const cols = widths.map((w) => `<Column ss:Width="${w}"/>`).join('')
  return ` <Worksheet ss:Name="${esc(name)}">
  <Table ss:DefaultRowHeight="18">
   ${cols}
   ${rows.map(rowXml).join('\n   ')}
  </Table>
 </Worksheet>`
}

/** fila de cabecera de cada hoja: título + proyecto + fecha */
const headRows = (title: string, project: string, span: number): XRow[] => [
  { h: 26, cells: [{ v: title, st: 'title', merge: span }, { v: project, st: 'sub' }] },
  { cells: [{ v: `${new Date().toLocaleDateString('es-PE')} · Jarumy app · Arq. Jarumy · generado desde el modelo en vivo`, st: 'sub', merge: span }] },
]

// fila de total con fórmula SUM (y valor calculado como respaldo)
const totCell = (val: number, col: string, n: number, int = false): XCell => ({
  v: n > 0 ? r2(val) : 0,
  t: 'Number',
  st: int ? 'totint' : 'tot',
  f: n > 0 ? `=SUM(${col}4:${col}${3 + n})` : undefined,
})

export function buildBimWorkbook(d: BimSchedules, project: string): string {
  // ---- hoja Resumen ----
  const resumen: XRow[] = [
    ...headRows('CUADROS DE CANTIDADES BIM — RESUMEN', project || 'PLANO JARUMY', 2),
    { h: 20, cells: [{ v: 'INDICADOR', st: 'head' }, { v: 'VALOR', st: 'head' }, { v: 'UND', st: 'head' }] },
    ...[
      ['Elementos del modelo', d.counts.total, 'und', 'int'],
      ['Área techada total', d.espaciosTotal, 'm²'],
      ['Espacios / ambientes', d.counts.espacios, 'und', 'int'],
      ['Muros — longitud total', d.murosTotal.largo, 'm'],
      ['Muros — área de albañilería', d.murosTotal.area, 'm²'],
      ['Muros — volumen de albañilería', d.murosTotal.vol, 'm³'],
      ['Puertas', d.puertasTotal.n, 'und', 'int'],
      ['Puertas — área de carpintería', d.puertasTotal.area, 'm²'],
      ['Ventanas', d.ventanasTotal.n, 'und', 'int'],
      ['Ventanas — área', d.ventanasTotal.area, 'm²'],
      ['Ventanas — vidrio (85%)', d.ventanasTotal.vidrio, 'm²'],
      ['Aparatos sanitarios', d.counts.sanitarios, 'und', 'int'],
    ].map((r): XRow => ({
      cells: [
        { v: r[0] as string, st: 'wrap' },
        { v: r[1] as number, t: 'Number', st: r[3] === 'int' ? 'int' : 'num' },
        { v: r[2] as string, st: 'c' },
      ],
    })),
    { cells: [{ v: 'Los cuadros por categoría están en las hojas: Espacios · Muros · Puertas · Ventanas · Sanitarios. Se recalculan al editar el plano.', st: 'sub', merge: 2 }] },
  ]

  // ---- hoja Espacios ----
  const esp: XRow[] = [
    ...headRows('CUADRO DE ESPACIOS', project || 'PLANO JARUMY', 4),
    { h: 20, cells: [{ v: 'N°', st: 'head' }, { v: 'ESPACIO', st: 'head' }, { v: 'USO', st: 'head' }, { v: 'ÁREA (m²)', st: 'head' }, { v: 'OCUP.', st: 'head' }] },
    ...d.espacios.map((r): XRow => ({ cells: [
      { v: r.num, st: 'c' }, { v: r.name }, { v: r.uso },
      { v: r.area, t: 'Number', st: 'num' }, { v: r.ocup, t: 'Number', st: 'int' },
    ] })),
    { h: 22, cells: [
      { v: 'TOTAL TECHADO', st: 'tot', merge: 2 },
      totCell(d.espaciosTotal, 'D', d.espacios.length),
      { st: 'tot' },
    ] },
  ]

  // ---- hoja Muros ----
  const mur: XRow[] = [
    ...headRows('CUADRO DE MUROS', project || 'PLANO JARUMY', 5),
    { h: 20, cells: [{ v: 'MURO', st: 'head' }, { v: 'LONG. (m)', st: 'head' }, { v: 'ESPESOR (cm)', st: 'head' }, { v: 'ALTURA (m)', st: 'head' }, { v: 'ÁREA (m²)', st: 'head' }, { v: 'VOL. (m³)', st: 'head' }] },
    ...d.muros.map((r): XRow => ({ cells: [
      { v: r.name }, { v: r.largo, t: 'Number', st: 'num' }, { v: r.espesor, t: 'Number', st: 'int' },
      { v: r.alto, t: 'Number', st: 'num' }, { v: r.area, t: 'Number', st: 'num' }, { v: r.vol, t: 'Number', st: 'num' },
    ] })),
    { h: 22, cells: [
      { v: `TOTAL · ${d.muros.length} muros`, st: 'tot' },
      totCell(d.murosTotal.largo, 'B', d.muros.length),
      { st: 'tot' },
      { st: 'tot' },
      totCell(d.murosTotal.area, 'E', d.muros.length),
      totCell(d.murosTotal.vol, 'F', d.muros.length),
    ] },
  ]

  // ---- hoja Puertas ----
  const pue: XRow[] = [
    ...headRows('CUADRO DE PUERTAS', project || 'PLANO JARUMY', 4),
    { h: 20, cells: [{ v: 'PUERTA', st: 'head' }, { v: 'TIPO', st: 'head' }, { v: 'ANCHO (m)', st: 'head' }, { v: 'ALTO (m)', st: 'head' }, { v: 'ÁREA (m²)', st: 'head' }] },
    ...d.puertas.map((r): XRow => ({ cells: [
      { v: r.name }, { v: r.tipo, st: 'c' }, { v: r.ancho, t: 'Number', st: 'num' },
      { v: r.alto, t: 'Number', st: 'num' }, { v: r.area, t: 'Number', st: 'num' },
    ] })),
    { h: 22, cells: [
      { v: `TOTAL · ${d.puertasTotal.n} unidades`, st: 'tot', merge: 3 },
      totCell(d.puertasTotal.area, 'E', d.puertas.length),
    ] },
  ]

  // ---- hoja Ventanas ----
  const ven: XRow[] = [
    ...headRows('CUADRO DE VENTANAS', project || 'PLANO JARUMY', 5),
    { h: 20, cells: [{ v: 'VENTANA', st: 'head' }, { v: 'ANCHO (m)', st: 'head' }, { v: 'ALTO (m)', st: 'head' }, { v: 'ANTEPECHO (m)', st: 'head' }, { v: 'ÁREA (m²)', st: 'head' }, { v: 'VIDRIO (m²)', st: 'head' }] },
    ...d.ventanas.map((r): XRow => ({ cells: [
      { v: r.name }, { v: r.ancho, t: 'Number', st: 'num' }, { v: r.alto, t: 'Number', st: 'num' },
      { v: r.antepecho, t: 'Number', st: 'num' }, { v: r.area, t: 'Number', st: 'num' }, { v: r.vidrio, t: 'Number', st: 'num' },
    ] })),
    { h: 22, cells: [
      { v: `TOTAL · ${d.ventanasTotal.n} unidades`, st: 'tot', merge: 3 },
      { st: 'tot' },
      totCell(d.ventanasTotal.area, 'E', d.ventanas.length),
      totCell(d.ventanasTotal.vidrio, 'F', d.ventanas.length),
    ] },
  ]

  // ---- hoja Sanitarios ----
  const san: XRow[] = [
    ...headRows('CUADRO DE APARATOS SANITARIOS', project || 'PLANO JARUMY', 3),
    { h: 20, cells: [{ v: 'APARATO', st: 'head' }, { v: 'ANCHO (m)', st: 'head' }, { v: 'ALTO (m)', st: 'head' }, { v: 'UNID.', st: 'head' }] },
    ...d.sanitarios.map((r): XRow => ({ cells: [
      { v: r.name }, { v: r.ancho, t: 'Number', st: 'num' }, { v: r.alto, t: 'Number', st: 'num' },
      { v: 1, t: 'Number', st: 'int' },
    ] })),
    { h: 22, cells: [
      { v: 'TOTAL', st: 'tot', merge: 2 },
      totCell(d.sanitarios.length, 'D', d.sanitarios.length, true),
    ] },
  ]

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${STYLES}
${worksheetXml('Resumen', [280, 90, 46], resumen)}
${worksheetXml('Espacios', [40, 220, 190, 90, 56], esp)}
${worksheetXml('Muros', [200, 80, 90, 80, 90, 90], mur)}
${worksheetXml('Puertas', [200, 90, 90, 90, 90], pue)}
${worksheetXml('Ventanas', [200, 90, 90, 100, 90, 90], ven)}
${worksheetXml('Sanitarios', [240, 90, 90, 60], san)}
</Workbook>`
}

/** Descarga el libro de cuadros BIM; devuelve filename + tamaño. */
export function downloadBimWorkbook(d: BimSchedules, project: string): { filename: string; bytes: number } {
  const xml = buildBimWorkbook(d, project)
  const filename = `jarumy-cuadros-bim-${new Date().toISOString().slice(0, 10)}.xls`
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
