// ============================================================
// JARUMY APP — Exportación PDF a escala (vectorial)
// Genera una lámina arquitectónica en papel real (A4/A3/A2,
// horizontal o vertical) a escala exacta (1:50, 1:75, 1:100…):
// 1 m de plano = 1000/escala mm de papel. Incluye cartela con
// datos del proyecto, barra de escala gráfica, rosa de los
// vientos, cotas manuales y (opcional) acotación automática.
// Todos los textos (rótulos de ambiente, áreas, cotas) se pintan
// en una CAPA FINAL sobre el dibujo y con halo blanco, para que
// nunca queden tapados por muros, mobiliario ni otras líneas.
// ============================================================

import type { jsPDF } from 'jspdf'
import type { PlanElement, LayerDef, LevelDef } from './plan-data'
import type {
  WallGeo, DoorGeo, WindowGeo, RoomGeo, FurnGeo, DimGeo, ColGeo, OpenGeo, DrawGeo,
  StairGeo, RoofGeo, InstGeo, SymGeo, TerrainGeo, PinGeo,
} from './plan-data'
import { PX_PER_M, roomAreaM2, polygonAreaM2, sampleArc3, sampleCatmullRom, scallopPts } from './plan-data'
import type { Mod } from './store'
import { autoDimensions } from './auto-dims'
import { buildElevation, ELEV_LABELS, type Elevation, type ElevDir } from './elevation'

// ---------------- tipos y constantes ----------------

export type PaperId = 'a4' | 'a3' | 'a2'

export interface PdfCartela {
  proyecto: string
  propietario: string
  ubicacion: string
  autor: string
  consultor: string
  lamina: string
  escala: string
  includeLogo: boolean
}

export const DEFAULT_CARTELA: PdfCartela = {
  proyecto: 'VIVIENDA UNIFAMILIAR',
  propietario: '',
  ubicacion: '',
  autor: 'Arq. Jarumy',
  consultor: 'JARUMY APP · SUITE CAD WEB',
  lamina: 'A-01',
  escala: '',
  includeLogo: true,
}

export interface PdfExportOptions {
  scale: number            // denominador: 75 → 1:75
  paper: PaperId
  landscape: boolean
  includeAutoDims: boolean
  includeAreas: boolean
  includeFurniture: boolean
  includeInstalaciones?: boolean
  title: string
  cartela?: PdfCartela
  /** pruebas/Node: devolver el PDF como base64 en el resultado (no descargar) */
  returnData?: boolean
  /** lote (batch plot): añade la lámina a un doc compartido en vez de crear/descargar */
  docAppend?: jsPDF
  /** lote: número de lámina que pisa el de la cartela (A-01, A-02…) */
  lamina?: string
}

export interface PdfExportResult {
  filename: string
  bytes: number
  pageW: number
  pageH: number
  planW: number   // metros
  planH: number
  data?: string   // base64 (solo con returnData)
}

export const PAPERS: Record<PaperId, { label: string; w: number; h: number }> = {
  a4: { label: 'A4', w: 210, h: 297 },
  a3: { label: 'A3', w: 297, h: 420 },
  a2: { label: 'A2', w: 420, h: 594 },
}

export const PDF_SCALES = [25, 50, 75, 100, 150, 200, 250]

const FRAME = 7      // marco exterior (mm desde el borde)
const MARGIN = 12    // margen interior
const CART_H = 24    // altura de la cartela (mm)
const SB = 12        // banda reservada sobre la cartela para la barra de escala (mm)
const PAD = 2        // aire mínimo entre el plano y el marco interior (mm)

const C = {
  wall: [38, 38, 44] as const,
  col: [70, 70, 78] as const,
  roomFill: [244, 243, 240] as const,
  roomStroke: [186, 186, 192] as const,
  furn: [98, 98, 108] as const,
  furnFill: [240, 239, 238] as const,
  glass: [120, 126, 136] as const,
  dim: [180, 83, 9] as const,     // cotas manuales (ámbar oscuro)
  autoDim: [3, 105, 161] as const, // acotación automática (azul)
  ink: [24, 24, 28] as const,
  muted: [124, 124, 132] as const,
}

// ---------------- geometría auxiliar ----------------

interface Bbox { minX: number; minY: number; maxX: number; maxY: number }

function wallRect(g: WallGeo, mod?: Mod): [number, number, number, number] {
  const t = mod?.thickness ?? g.t
  const tx = mod?.translate?.[0] ?? 0
  const ty = mod?.translate?.[1] ?? 0
  if (g.x1 === g.x2) {
    return [g.x1 - t / 2 + tx, Math.min(g.y1, g.y2) + ty, g.x1 + t / 2 + tx, Math.max(g.y1, g.y2) + ty]
  }
  return [Math.min(g.x1, g.x2) + tx, g.y1 - t / 2 + ty, Math.max(g.x1, g.x2) + tx, g.y1 + t / 2 + ty]
}

/** Envoltura de un elemento en px del plano (null = no dibujar/no cuenta). */
function elBounds(el: PlanElement, mod: Mod | undefined, includeFurniture: boolean): Bbox | null {
  if (mod?.deleted) return null
  const tx = mod?.translate?.[0] ?? 0
  const ty = mod?.translate?.[1] ?? 0
  switch (el.type) {
    case 'espacio': {
      const g = el.geo as RoomGeo
      return { minX: g.x + tx, minY: g.y + ty, maxX: g.x + g.w + tx, maxY: g.y + g.h + ty }
    }
    case 'muro': {
      const [x1, y1, x2, y2] = wallRect(el.geo as WallGeo, mod)
      return { minX: x1, minY: y1, maxX: x2, maxY: y2 }
    }
    case 'columna': {
      const g = el.geo as ColGeo
      const s = mod?.size ?? g.size
      return { minX: g.x - s / 2 + tx, minY: g.y - s / 2 + ty, maxX: g.x + s / 2 + tx, maxY: g.y + s / 2 + ty }
    }
    case 'puerta': {
      const g = el.geo as DoorGeo
      return { minX: g.cx - g.r + tx, minY: g.cy - g.r + ty, maxX: g.cx + g.r + tx, maxY: g.cy + g.r + ty }
    }
    case 'ventana': {
      const g = el.geo as WindowGeo
      const h = g.orient === 'h'
      return h
        ? { minX: g.x + tx, minY: g.y - 7 + ty, maxX: g.x + g.len + tx, maxY: g.y + 7 + ty }
        : { minX: g.x - 7 + tx, minY: g.y + ty, maxX: g.x + 7 + tx, maxY: g.y + g.len + ty }
    }
    case 'apertura': {
      const g = el.geo as OpenGeo
      return g.orient === 'h'
        ? { minX: g.x + tx, minY: g.y - 8 + ty, maxX: g.x + g.len + tx, maxY: g.y + 8 + ty }
        : { minX: g.x - 8 + tx, minY: g.y + ty, maxX: g.x + 8 + tx, maxY: g.y + g.len + ty }
    }
    case 'mobiliario':
    case 'sanitario': {
      if (!includeFurniture) return null
      const g = el.geo as FurnGeo
      const rot = Math.abs((mod?.rotation ?? 0) % 180)
      const [hw, hh] = rot === 90 ? [g.h / 2, g.w / 2] : [g.w / 2, g.h / 2]
      const cx = g.x + g.w / 2 + tx, cy = g.y + g.h / 2 + ty
      return { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh }
    }
    case 'cota': {
      const g = el.geo as DimGeo
      const horizontal = Math.abs(g.x2 - g.x1) >= Math.abs(g.y2 - g.y1)
      const pts: number[][] = horizontal
        ? [[g.x1, g.y1], [g.x2, g.y2], [g.x1, g.y1 + g.offset], [g.x2, g.y2 + g.offset]]
        : [[g.x1, g.y1], [g.x2, g.y2], [g.x1 + g.offset, g.y1], [g.x1 + g.offset, g.y2]]
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
    }
    case 'dibujo': {
      const g = el.geo as DrawGeo
      if (!g.pts?.length) return null
      const xs = g.pts.map((p) => p[0]), ys = g.pts.map((p) => p[1])
      const r = g.r || Math.max(g.rx || 0, g.ry || 0)
      return {
        minX: Math.min(...xs) - r, minY: Math.min(...ys) - r,
        maxX: Math.max(...xs) + r, maxY: Math.max(...ys) + r,
      }
    }
    case 'escalera': {
      const g = el.geo as StairGeo
      const rot = Math.abs((mod?.rotation ?? 0) % 180)
      const [hw, hh] = rot === 90 ? [g.h / 2, g.w / 2] : [g.w / 2, g.h / 2]
      const cx = g.x + g.w / 2 + tx, cy = g.y + g.h / 2 + ty
      return { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh }
    }
    case 'techo': {
      const g = el.geo as RoofGeo
      return { minX: g.x + tx, minY: g.y + ty, maxX: g.x + g.w + tx, maxY: g.y + g.h + ty }
    }
    case 'instalacion': {
      const g = el.geo as InstGeo
      const xs = g.pts.map((p) => p[0] + tx), ys = g.pts.map((p) => p[1] + ty)
      return { minX: Math.min(...xs) - 10, minY: Math.min(...ys) - 10, maxX: Math.max(...xs) + 10, maxY: Math.max(...ys) + 10 }
    }
    case 'simbolo': {
      const g = el.geo as SymGeo
      return { minX: g.x - 10, minY: g.y - 10, maxX: g.x + 10, maxY: g.y + 10 }
    }
    case 'terreno': {
      const g = el.geo as TerrainGeo
      const xs = g.pts.map((p) => p[0]), ys = g.pts.map((p) => p[1])
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
    }
    case 'pin': {
      const g = el.geo as PinGeo
      return { minX: g.x - 12, minY: g.y - 34, maxX: g.x + 60, maxY: g.y + 16 }
    }
    default:
      return null // textos de lámina: la cartela los reemplaza
  }
}

/** Bbox del plano (px) con todos los elementos que se van a dibujar. */
export function planBboxPx(
  elements: PlanElement[], mods: Record<string, Mod>,
  layers: LayerDef[], includeFurniture: boolean,
): Bbox | null {
  const visible = new Set(layers.filter((l) => l.visible).map((l) => l.id))
  let b: Bbox | null = null
  for (const el of elements) {
    if (!visible.has(el.layer)) continue
    const e = elBounds(el, mods[el.id], includeFurniture)
    if (!e) continue
    b = b
      ? { minX: Math.min(b.minX, e.minX), minY: Math.min(b.minY, e.minY), maxX: Math.max(b.maxX, e.maxX), maxY: Math.max(b.maxY, e.maxY) }
      : e
  }
  return b
}

/** Área útil de dibujo (mm) del papel elegido. */
export function drawArea(paper: PaperId, landscape: boolean) {
  const p = PAPERS[paper]
  const W = landscape ? p.h : p.w
  const H = landscape ? p.w : p.h
  return {
    W, H,
    x1: MARGIN, y1: MARGIN,
    x2: W - MARGIN, y2: H - MARGIN - CART_H,
    w: W - 2 * MARGIN,
    h: H - 2 * MARGIN - CART_H,
  }
}

/** Área real disponible para el plano: descuenta la banda de la
 *  barra de escala (sobre la cartela) y deja aire con el marco. */
export function planDrawArea(paper: PaperId, landscape: boolean) {
  const a = drawArea(paper, landscape)
  const x1 = a.x1 + PAD, y1 = a.y1 + PAD
  const x2 = a.x2 - PAD, y2 = a.y2 - SB
  return { ...a, x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 }
}

export interface PdfFitInfo {
  planW: number   // metros
  planH: number
  drawW: number   // mm útiles
  drawH: number
  autoScale: number | null  // mayor escala estándar que cabe
  fitAt: Record<number, boolean>
}

/** Info de encaje para el diálogo (sin generar el PDF). */
export function fitInfo(
  elements: PlanElement[], mods: Record<string, Mod>, layers: LayerDef[],
  paper: PaperId, landscape: boolean, includeFurniture: boolean,
): PdfFitInfo {
  const b = planBboxPx(elements, mods, layers, includeFurniture) ?? { minX: 0, minY: 0, maxX: 900, maxY: 600 }
  const area = drawArea(paper, landscape)
  const planW = (b.maxX - b.minX) / PX_PER_M
  const planH = (b.maxY - b.minY) / PX_PER_M
  const maxMmPerM = Math.min(area.w / Math.max(planW, 0.01), area.h / Math.max(planH, 0.01))
  const scaleNeeded = 1000 / maxMmPerM
  const autoScale = PDF_SCALES.find((sc) => sc >= scaleNeeded) ?? null
  const fitAt: Record<number, boolean> = {}
  for (const sc of PDF_SCALES) {
    const mmPerM = 1000 / sc
    fitAt[sc] = planW * mmPerM <= area.w + 0.01 && planH * mmPerM <= area.h + 0.01
  }
  return { planW, planH, drawW: area.w, drawH: area.h, autoScale, fitAt }
}

// ---------------- generación del PDF ----------------

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

export async function exportPlanPdf(
  elements: PlanElement[],
  mods: Record<string, Mod>,
  layers: LayerDef[],
  opts: PdfExportOptions,
): Promise<PdfExportResult> {
  const { jsPDF } = await import('jspdf')
  const area = drawArea(opts.paper, opts.landscape)
  const parea = planDrawArea(opts.paper, opts.landscape) // zona real del plano (reserva barra de escala)
  // lote: añade una página al doc compartido; suelto: crea el propio
  const doc = opts.docAppend ?? new jsPDF({
    unit: 'mm',
    format: [area.W, area.H],
    orientation: area.W >= area.H ? 'landscape' : 'portrait',
  })
  if (opts.docAppend) {
    doc.addPage([area.W, area.H], area.W >= area.H ? 'landscape' : 'portrait')
  }

  const visible = new Set(layers.filter((l) => l.visible).map((l) => l.id))
  const b = planBboxPx(elements, mods, layers, opts.includeFurniture)
    ?? { minX: 0, minY: 0, maxX: VIEW_FALLBACK_W, maxY: VIEW_FALLBACK_H }

  const mmPerM = 1000 / opts.scale
  const k = mmPerM / PX_PER_M // px → mm
  const planWmm = (b.maxX - b.minX) * k
  const planHmm = (b.maxY - b.minY) * k
  // zona de centrado del plano: reserva la banda de la barra de escala
  // SOLO si el plano cabe; si no, usa toda el área útil (la barra de
  // escala lleva franja blanca de respaldo y no pierde legibilidad)
  const fitsBand = planWmm <= parea.w + 0.01 && planHmm <= parea.h + 0.01
  const zx1 = area.x1 + PAD, zy1 = area.y1 + PAD
  const zx2 = area.x2 - PAD, zy2 = fitsBand ? parea.y2 : area.y2 - PAD
  const zw = zx2 - zx1, zh = zy2 - zy1
  const ox = zx1 + (zw - planWmm) / 2 - b.minX * k
  const oy = zy1 + (zh - planHmm) / 2 - b.minY * k
  const X = (x: number) => ox + x * k
  const Y = (y: number) => oy + y * k
  const L = (px: number) => px * k

  const setDraw = (c: readonly number[], lw: number) => { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(lw) }
  const setFill = (c: readonly number[]) => doc.setFillColor(c[0], c[1], c[2])
  const setText = (c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2])
  const line = (x1: number, y1: number, x2: number, y2: number) => doc.line(X(x1), Y(y1), X(x2), Y(y2))

  // ---------- capa de texto final (encima de los objetos) ----------
  // Los rótulos y textos de cota se encolan y se pintan al final
  // con un halo blanco: nunca quedan tapados por muros/mobiliario
  // y las líneas quedan "cortadas" al pasar por el texto (estilo CAD).
  interface TextJob {
    val: string
    x: number            // mm de página (baseline / ancla)
    y: number
    angle?: number       // 0 | 90
    size: number
    bold?: boolean
    color: readonly number[]
    align?: 'center' | 'left' | 'right'
    mask?: boolean       // halo blanco detrás del texto
  }
  const textJobs: TextJob[] = []
  const flushText = () => {
    for (const j of textJobs) {
      doc.setFont('helvetica', j.bold ? 'bold' : 'normal')
      doc.setFontSize(j.size)
      const w = doc.getTextWidth(j.val)
      const asc = j.size * 0.75   // ascendentes (mm)
      const desc = j.size * 0.25  // descendentes (mm)
      const pad = 0.45
      if (j.mask) {
        doc.setFillColor(255, 255, 255)
        if (j.angle === 90) {
          // texto vertical (lee de abajo hacia arriba): baseline vertical en x
          const yA = j.align === 'left' ? j.y : j.align === 'right' ? j.y - w : j.y - w / 2
          doc.rect(j.x - asc - pad, yA - pad, asc + desc + 2 * pad, w + 2 * pad, 'F')
        } else {
          const xA = j.align === 'left' ? j.x : j.align === 'right' ? j.x - w : j.x - w / 2
          doc.rect(xA - pad, j.y - asc - pad, w + 2 * pad, asc + desc + 2 * pad, 'F')
        }
      }
      setText(j.color)
      doc.text(j.val, j.x, j.y, { align: j.align ?? 'center', angle: j.angle ?? 0 })
    }
  }

  // ---------- lámina: marco + fondo ----------
  setFill([255, 255, 255])
  doc.rect(0, 0, area.W, area.H, 'F')
  setDraw(C.ink, 0.5)
  doc.rect(FRAME, FRAME, area.W - 2 * FRAME, area.H - 2 * FRAME)
  setDraw(C.ink, 0.2)
  doc.rect(MARGIN, MARGIN, area.W - 2 * MARGIN, area.H - 2 * MARGIN)

  // ---------- plan: elementos por tipo (mismo orden z que el lienzo) ----------
  const drawable = elements.filter((el) => visible.has(el.layer) && !mods[el.id]?.deleted)
  const byType = (t: string) => drawable.filter((el) => el.type === t)

  // espacios (solo el rectángulo: el rótulo se pinta al final,
  // encima del mobiliario, para que nunca quede tapado)
  const roomLabels: Array<{ g: RoomGeo; m: Mod | undefined }> = []
  for (const el of byType('espacio')) {
    const g = el.geo as RoomGeo
    const m = mods[el.id]
    const x = X(g.x + (m?.translate?.[0] ?? 0)), y = Y(g.y + (m?.translate?.[1] ?? 0))
    setFill(C.roomFill); setDraw(C.roomStroke, 0.12)
    doc.rect(x, y, L(g.w), L(g.h), 'FD')
    if (opts.includeAreas) roomLabels.push({ g, m })
  }

  // muros
  setFill(C.wall)
  for (const el of byType('muro')) {
    const [x1, y1, x2, y2] = wallRect(el.geo as WallGeo, mods[el.id])
    doc.rect(X(x1), Y(y1), X(x2) - X(x1), Y(y2) - Y(y1), 'F')
  }

  // columnas
  setFill(C.col)
  for (const el of byType('columna')) {
    const g = el.geo as ColGeo
    const m = mods[el.id]
    const s = m?.size ?? g.size
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    doc.rect(X(g.x - s / 2 + tx), Y(g.y - s / 2 + ty), L(s), L(s), 'F')
  }

  // vanos / aperturas
  setDraw(C.muted, 0.1)
  doc.setLineDashPattern([0.8, 0.8], 0)
  for (const el of byType('apertura')) {
    const g = el.geo as OpenGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    if (g.orient === 'h') { line(g.x + tx, g.y - 6 + ty, g.x + g.len + tx, g.y - 6 + ty); line(g.x + tx, g.y + 6 + ty, g.x + g.len + tx, g.y + 6 + ty) }
    else { line(g.x - 6 + tx, g.y + ty, g.x - 6 + tx, g.y + g.len + ty); line(g.x + 6 + tx, g.y + ty, g.x + 6 + tx, g.y + g.len + ty) }
  }
  doc.setLineDashPattern([], 0)

  // ventanas
  for (const el of byType('ventana')) {
    const g = el.geo as WindowGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const h = g.orient === 'h'
    const t = 14
    const rx = (h ? g.x : g.x - t / 2) + tx
    const ry = (h ? g.y - t / 2 : g.y) + ty
    const w = h ? g.len : t
    const hh = h ? t : g.len
    setDraw(C.glass, 0.14)
    setFill([252, 252, 252])
    doc.rect(X(rx), Y(ry), L(w), L(hh), 'FD')
    if (h) { line(g.x + tx, g.y - 3 + ty, g.x + g.len + tx, g.y - 3 + ty); line(g.x + tx, g.y + 3 + ty, g.x + g.len + tx, g.y + 3 + ty) }
    else { line(g.x - 3 + tx, g.y + ty, g.x - 3 + tx, g.y + g.len + ty); line(g.x + 3 + tx, g.y + ty, g.x + 3 + tx, g.y + g.len + ty) }
  }

  // puertas: hoja + arco de giro (aprox. con segmentos)
  setDraw(C.ink, 0.16)
  for (const el of byType('puerta')) {
    const g = el.geo as DoorGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const cx = g.cx + tx
    const cy = g.cy + ty
    const P0 = polar(cx, cy, g.r, g.a0)
    const P1 = polar(cx, cy, g.r, g.a1)
    const swingFlip = !!m?.swingFlip
    const leafEnd = swingFlip ? P0 : P1
    line(cx, cy, leafEnd[0], leafEnd[1])
    const from = swingFlip ? P1 : P0
    const to = swingFlip ? P0 : P1
    const steps = 8
    doc.setLineDashPattern([0.6, 0.5], 0)
    for (let i = 0; i < steps; i++) {
      const a0 = Math.atan2(from[1] - cy, from[0] - cx)
      const a1 = Math.atan2(to[1] - cy, to[0] - cx)
      let d = a1 - a0
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      const t0 = a0 + (d * i) / steps
      const t1 = a0 + (d * (i + 1)) / steps
      line(cx + g.r * Math.cos(t0), cy + g.r * Math.sin(t0),
        cx + g.r * Math.cos(t1), cy + g.r * Math.sin(t1))
    }
    doc.setLineDashPattern([], 0)
  }

  // mobiliario / sanitarios
  if (opts.includeFurniture) {
    const rotPt = (px: number, py: number, cx: number, cy: number, deg: number): [number, number] => {
      const a = (deg * Math.PI) / 180
      const dx = px - cx, dy = py - cy
      return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]
    }
    const poly = (pts: number[][], style: 'S' | 'FD') => {
      const v: number[][] = []
      for (let i = 1; i < pts.length; i++) v.push([X(pts[i][0]) - X(pts[i - 1][0]), Y(pts[i][1]) - Y(pts[i - 1][1])])
      doc.lines(v, X(pts[0][0]), Y(pts[0][1]), [1, 1], style, true)
    }
    for (const el of [...byType('mobiliario'), ...byType('sanitario')]) {
      const g = el.geo as FurnGeo
      const m = mods[el.id]
      const rot = m?.rotation ?? 0
      const tx = m?.translate?.[0] ?? 0
      const ty = m?.translate?.[1] ?? 0
      const cx = g.x + g.w / 2 + tx, cy = g.y + g.h / 2 + ty
      const corner = (dx: number, dy: number) => rotPt(cx + dx, cy + dy, cx, cy, rot)
      setDraw(C.furn, 0.1)
      setFill(C.furnFill)
      poly([corner(-g.w / 2, -g.h / 2), corner(g.w / 2, -g.h / 2), corner(g.w / 2, g.h / 2), corner(-g.w / 2, g.h / 2)], 'FD')
      // detalle mínimo según tipo
      const seg = (dx1: number, dy1: number, dx2: number, dy2: number) => {
        const p1 = rotPt(cx + dx1, cy + dy1, cx, cy, rot)
        const p2 = rotPt(cx + dx2, cy + dy2, cx, cy, rot)
        line(p1[0], p1[1], p2[0], p2[1])
      }
      setDraw(C.furn, 0.08)
      switch (g.kind) {
        case 'cama': seg(-g.w / 2, -g.h / 2 + g.h * 0.22, g.w / 2, -g.h / 2 + g.h * 0.22); break
        case 'sofa': case 'sillon': seg(-g.w / 2, -g.h / 2 + g.h * 0.2, g.w / 2, -g.h / 2 + g.h * 0.2); break
        case 'counter': case 'ropero': case 'estante':
          seg(0, -g.h / 2, 0, g.h / 2)
          if (g.w > 80) seg(g.w / 4, -g.h / 2, g.w / 4, g.h / 2)
          break
        case 'stove': {
          const rr = L(Math.min(g.w, g.h)) * 0.12
          setDraw(C.furn, 0.08)
          doc.circle(X(cx - g.w * 0.22), Y(cy - g.h * 0.22), rr, 'S')
          doc.circle(X(cx + g.w * 0.22), Y(cy - g.h * 0.22), rr, 'S')
          doc.circle(X(cx - g.w * 0.22), Y(cy + g.h * 0.22), rr, 'S')
          doc.circle(X(cx + g.w * 0.22), Y(cy + g.h * 0.22), rr, 'S')
          break
        }
        case 'sinkk': case 'lavatorio': case 'islav': case 'fregadero1':
          doc.circle(X(cx), Y(cy), L(Math.min(g.w, g.h)) * 0.22, 'S'); break
        case 'lavadora': case 'secadora': case 'lavavajillas': case 'campana': case 'jacuzzi':
          doc.circle(X(cx), Y(cy), L(Math.min(g.w, g.h)) * 0.3, 'S'); break
        case 'lavatoriodoble':
          doc.circle(X(cx - g.w * 0.22), Y(cy), L(g.h) * 0.2, 'S')
          doc.circle(X(cx + g.w * 0.22), Y(cy), L(g.h) * 0.2, 'S'); break
        case 'refri2':
          seg(0, -g.h / 2, 0, g.h / 2); break
        case 'sofal':
          seg(g.w * 0.36 - g.w / 2, -g.h / 2, g.w * 0.36 - g.w / 2, g.h / 2)
          seg(-g.w / 2, -g.h / 2 + g.h * 0.42, g.w / 2, -g.h / 2 + g.h * 0.42); break
        case 'banera':
          seg(-g.w / 2 + g.w * 0.14, -g.h / 2, -g.w / 2 + g.w * 0.14, g.h / 2)
          doc.circle(X(cx - g.w * 0.32), Y(cy), L(g.h) * 0.06, 'S'); break
        case 'piscina':
          seg(-g.w / 2 + g.w * 0.1, -g.h / 2, -g.w / 2 + g.w * 0.1, g.h / 2)
          seg(-g.w / 2 + g.w * 0.1 + L(0.1), -g.h / 2, -g.w / 2 + g.w * 0.1 + L(0.1), g.h / 2); break
        case 'palmera': {
          const rr2 = L(g.w) * 0.42
          setDraw(C.furn, 0.1)
          doc.circle(X(cx), Y(cy), rr2, 'S')
          line(cx - rr2, cy, cx + rr2, cy)
          line(cx, cy - rr2, cx, cy + rr2); break
        }
        case 'camioneta':
          seg(-g.w * 0.3, -g.h / 2, -g.w * 0.3, g.h / 2)
          seg(g.w * 0.3, -g.h / 2, g.w * 0.3, g.h / 2)
          seg(0, -g.h / 2, 0, g.h / 2); break
        case 'escalera': {
          const n = 7
          for (let i = 1; i <= n; i++) {
            const yy = -g.h / 2 + (g.h / n) * i
            seg(-g.w / 2, yy, g.w / 2, yy)
          }
          seg(0, g.h / 2, 0, -g.h / 2 + g.h * 0.12); break
        }
        case 'ascensor':
          seg(-g.w / 2, -g.h / 2, g.w / 2, g.h / 2)
          seg(g.w / 2, -g.h / 2, -g.w / 2, g.h / 2); break
        case 'rampa':
          seg(0, g.h / 2, 0, -g.h / 2 + g.h * 0.1)
          seg(-g.w * 0.3, g.h * 0.1, g.w * 0.3, g.h * 0.1); break
        case 'ducha':
          doc.circle(X(cx), Y(cy), L(Math.min(g.w, g.h)) * 0.18, 'S')
          seg(-g.w / 2, -g.h / 2, g.w / 2, g.h / 2)
          break
        case 'arbol': case 'arbusto': {
          const rr = L(g.w) * 0.42
          setDraw(C.furn, 0.1)
          doc.circle(X(cx), Y(cy), rr, 'S')
          if (g.kind === 'arbol') { setDraw(C.furn, 0.14); line(cx, cy - g.h * 0.42, cx, cy + g.h * 0.42) }
          break
        }
        case 'auto':
          seg(-g.w * 0.3, -g.h / 2, -g.w * 0.3, g.h / 2)
          seg(g.w * 0.3, -g.h / 2, g.w * 0.3, g.h / 2)
          break
        default: break
      }
    }
  }

  // ---------- elementos paramétricos: escalera, techo ----------
  for (const el of [...byType('escalera'), ...byType('techo')]) {
    const m = mods[el.id]
    const rot = m?.rotation ?? 0
    const txm = m?.translate?.[0] ?? 0
    const tym = m?.translate?.[1] ?? 0
    const rotPt = (px: number, py: number, cx: number, cy: number): [number, number] => {
      const a = (rot * Math.PI) / 180
      const dx = px - cx, dy = py - cy
      return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]
    }
    if (el.type === 'escalera') {
      const g = el.geo as StairGeo
      const cx = g.x + g.w / 2 + txm, cy = g.y + g.h / 2 + tym
      const corner = (dx: number, dy: number) => rotPt(cx + dx, cy + dy, cx, cy)
      const seg = (p1: number[], p2: number[]) => {
        const a = rotPt(p1[0], p1[1], cx, cy)
        const b = rotPt(p2[0], p2[1], cx, cy)
        line(a[0], a[1], b[0], b[1])
      }
      setDraw(C.ink, 0.16)
      const c0 = corner(-g.w / 2, -g.h / 2), c1 = corner(g.w / 2, -g.h / 2), c2 = corner(g.w / 2, g.h / 2), c3 = corner(-g.w / 2, g.h / 2)
      const v: number[][] = []
      for (const [p, q] of [[c0, c1], [c1, c2], [c2, c3], [c3, c0]] as Array<[[number, number], [number, number]]>) {
        v.push([X(q[0]) - X(p[0]), Y(q[1]) - Y(p[1])])
      }
      doc.lines(v, X(c0[0]), Y(c0[1]), [1, 1], 'S', true)
      setDraw(C.muted, 0.09)
      for (let i = 1; i < g.steps; i++) {
        const yy = -g.h / 2 + (g.h / g.steps) * i
        seg([cx - g.w / 2, cy + yy], [cx + g.w / 2, cy + yy])
      }
      textJobs.push({ val: `SUBE ${g.steps}P`, x: X(cx), y: Y(cy) + 1.6, size: 5.5, bold: true, color: C.ink, align: 'center', mask: true })
    } else {
      const g = el.geo as RoofGeo
      const x = g.x + txm, y = g.y + tym
      setDraw([101, 133, 58], 0.14)
      doc.setLineDashPattern([2, 1.2], 0)
      doc.rect(X(x), Y(y), L(g.w), L(g.h), 'S')
      if (g.kind === 'dos-aguas') {
        if (g.ridge === 'h') line(x, y + g.h / 2, x + g.w, y + g.h / 2)
        else line(x + g.w / 2, y, x + g.w / 2, y + g.h)
      } else if (g.kind === 'cuatro-aguas') {
        line(x, y, x + g.w / 2, y + g.h / 2); line(x + g.w, y, x + g.w / 2, y + g.h / 2)
        line(x, y + g.h, x + g.w / 2, y + g.h / 2); line(x + g.w, y + g.h, x + g.w / 2, y + g.h / 2)
      }
      doc.setLineDashPattern([], 0)
      textJobs.push({ val: `PEND. ${g.slope}%`, x: X(x + g.w / 2), y: Y(y - 4), size: 5, bold: true, color: [101, 133, 58], align: 'center', mask: true })
    }
  }

  // ---------- instalaciones MEP ----------
  if (opts.includeInstalaciones !== false) {
    for (const el of byType('instalacion')) {
      const g = el.geo as InstGeo
      const m = mods[el.id]
      const txm = m?.translate?.[0] ?? 0, tym = m?.translate?.[1] ?? 0
      const col = g.kind === 'agua' ? [56, 189, 248] : g.kind === 'desague' ? [180, 83, 9] : [239, 68, 68]
      setDraw(col, g.kind === 'desague' ? 0.34 : 0.26)
      if (g.kind === 'desague') doc.setLineDashPattern([1.6, 1], 0)
      for (let i = 1; i < g.pts.length; i++) {
        line(g.pts[i - 1][0] + txm, g.pts[i - 1][1] + tym, g.pts[i][0] + txm, g.pts[i][1] + tym)
      }
      doc.setLineDashPattern([], 0)
      const dmm = Math.round(g.diameter / PX_PER_M * 100)
      textJobs.push({
        val: `${g.kind === 'agua' ? 'AGUA' : g.kind === 'desague' ? 'DESAGÜE' : 'ELECT.'} Ø${dmm}`,
        x: X(g.pts[0][0] + txm), y: Y(g.pts[0][1] + tym) - 1, size: 4.6, bold: true, color: col, align: 'center', mask: true,
      })
    }
    // símbolos
    setDraw([56, 189, 248], 0.16)
    for (const el of byType('simbolo')) {
      const g = el.geo as SymGeo
      doc.circle(X(g.x), Y(g.y), 0.9, 'S')
      if (g.kind === 'tablero') {
        doc.rect(X(g.x) - 1.2, Y(g.y) - 0.9, 2.4, 1.8, 'S')
        textJobs.push({ val: 'TB', x: X(g.x), y: Y(g.y) + 2.6, size: 4, bold: true, color: [56, 189, 248], align: 'center', mask: true })
      }
    }
  }

  // ---------- terreno ----------
  for (const el of byType('terreno')) {
    const g = el.geo as TerrainGeo
    if (g.kind === 'lote') {
      setDraw([101, 133, 58], 0.22)
      doc.setLineDashPattern([2.4, 1.4], 0)
      const v: number[][] = []
      for (let i = 1; i <= g.pts.length; i++) {
        const a = g.pts[i - 1], b = g.pts[i % g.pts.length]
        v.push([X(b[0]) - X(a[0]), Y(b[1]) - Y(a[1])])
      }
      doc.lines(v, X(g.pts[0][0]), Y(g.pts[0][1]), [1, 1], 'S', true)
      doc.setLineDashPattern([], 0)
      let sx = 0, sy = 0
      g.pts.forEach((p) => { sx += p[0]; sy += p[1] })
      textJobs.push({
        val: `${g.name || 'LOTE'} · ${polygonAreaM2(g.pts).toLocaleString('es-PE')} m²`,
        x: X(sx / g.pts.length), y: Y(sy / g.pts.length), size: 8, bold: true, color: [101, 133, 58], align: 'center', mask: true,
      })
    } else {
      setDraw([101, 133, 58], 0.18)
      doc.setLineDashPattern([2.4, 1], 0)
      for (let i = 1; i < g.pts.length; i++) line(g.pts[i - 1][0], g.pts[i - 1][1], g.pts[i][0], g.pts[i][1])
      doc.setLineDashPattern([], 0)
      textJobs.push({
        val: (g.elev ?? 0).toFixed(2),
        x: X(g.pts[Math.floor(g.pts.length / 2)][0]), y: Y(g.pts[Math.floor(g.pts.length / 2)][1]) - 1.2,
        size: 5.5, bold: true, color: [101, 133, 58], align: 'center', mask: true,
      })
    }
  }

  // ---------- pines de comentario ----------
  for (const el of byType('pin')) {
    const g = el.geo as PinGeo
    const col: readonly number[] = g.resolved ? [16, 185, 129] : [251, 113, 133]
    setDraw(col, 0.22)
    setFill(col)
    doc.circle(X(g.x), Y(g.y), 1.1, 'FD')
    textJobs.push({
      val: `${g.resolved ? 'OK ' : ''}${g.text.slice(0, 34)}`,
      x: X(g.x) + 1.8, y: Y(g.y) - 0.4, size: 4.6, bold: true, color: col, align: 'left', mask: true,
    })
  }

  // ---------- cotas manuales ----------
  // el texto de las cotas se encola en la capa final, con halo blanco
  const dimText = (val: string, x: number, y: number, angle = 0) => {
    textJobs.push({ val, x, y, angle, size: 6, bold: true, color: C.dim, align: 'center', mask: true })
  }
  const tick = (x: number, y: number) => {
    const s = 1.1 // mm
    doc.line(X(x) - s, Y(y) - s, X(x) + s, Y(y) + s)
  }
  for (const el of byType('cota')) {
    const g = el.geo as DimGeo
    const m = mods[el.id]
    const prec = m?.precision ?? 2
    const val = m?.dimOverride && m.dimOverride !== '' ? m.dimOverride
      : `${(Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / PX_PER_M).toFixed(prec)}`
    setDraw(C.dim, 0.1)
    const horizontal = Math.abs(g.x2 - g.x1) >= Math.abs(g.y2 - g.y1)
    if (horizontal) {
      const dy = g.y1 + g.offset
      const ext = g.offset < 0 ? -1 : 1
      line(g.x1, g.y1 + ext * 3, g.x1, dy - ext * 3)
      line(g.x2, g.y2 + ext * 3, g.x2, dy - ext * 3)
      line(g.x1, dy, g.x2, dy)
      tick(g.x1, dy); tick(g.x2, dy)
      dimText(`${val} m`, X((g.x1 + g.x2) / 2), Y(dy) - (g.offset < 0 ? 1.4 : -1.4) + (g.offset < 0 ? 0 : 0))
    } else {
      const dx = g.x1 + g.offset
      const ext = g.offset < 0 ? -1 : 1
      line(g.x1 + ext * 3, g.y1, dx - ext * 3, g.y1)
      line(g.x2 + ext * 3, g.y2, dx - ext * 3, g.y2)
      line(dx, g.y1, dx, g.y2)
      tick(dx, g.y1); tick(dx, g.y2)
      const mx = X(dx) + (g.offset < 0 ? -1.2 : 2.6)
      dimText(`${val} m`, mx, Y((g.y1 + g.y2) / 2), 90)
    }
  }

  // ---------- acotación automática (misma geometría que el lienzo) ----------
  if (opts.includeAutoDims) {
    setDraw(C.autoDim, 0.09)
    const aTick = (x: number, y: number) => {
      const s = 0.9
      doc.line(X(x) - s, Y(y) - s, X(x) + s, Y(y) + s)
    }
    for (const d of autoDimensions(elements, mods)) {
      const val = `${(Math.hypot(d.x2 - d.x1, d.y2 - d.y1) / PX_PER_M).toFixed(2)}`
      if (!d.vert) {
        const dy = d.y1 + d.off
        line(d.x1, d.y1 + 3, d.x1, dy - 3)
        line(d.x2, d.y2 + 3, d.x2, dy - 3)
        line(d.x1, dy, d.x2, dy)
        aTick(d.x1, dy); aTick(d.x2, dy)
        textJobs.push({ val: `${val} m`, x: X((d.x1 + d.x2) / 2), y: Y(dy) + 2.2, size: 5.5, bold: true, color: C.autoDim, align: 'center', mask: true })
      } else {
        const dx = d.x1 + d.off
        line(d.x1 + 3, d.y1, dx - 3, d.y1)
        line(d.x2 + 3, d.y2, dx - 3, d.y2)
        line(dx, d.y1, dx, d.y2)
        aTick(dx, d.y1); aTick(dx, d.y2)
        textJobs.push({ val: `${val} m`, x: X(dx) + 2.2, y: Y((d.y1 + d.y2) / 2), angle: 90, size: 5.5, bold: true, color: C.autoDim, align: 'center', mask: true })
      }
    }
  }

  // ---------- dibujos del usuario ----------
  for (const el of byType('dibujo')) {
    const g = el.geo as DrawGeo
    const m = mods[el.id]
    const ph = (m?.phase as string) || g.phase
    // fase BIM: demolición → rojo punteado · existente → gris tenue
    const col = ph === 'demolicion' ? [239, 68, 68] as unknown as readonly number[]
      : ph === 'existente' ? [140, 140, 145] as unknown as readonly number[]
      : m?.colorLine ? hexToRgb(m.colorLine) : C.dim
    setDraw(col, Math.max(0.1, (m?.weight || 2) * 0.06))
    if (ph === 'demolicion') doc.setLineDashPattern([1.8, 1.1], 0)
    if (ph === 'existente') doc.setLineDashPattern([0.8, 0.8], 0)
    const poly = (pts: number[][]) => { for (let i = 1; i < pts.length; i++) line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) }
    switch (g.kind) {
      case 'linea':
        line(g.pts[0][0], g.pts[0][1], g.pts[1][0], g.pts[1][1]); break
      case 'polilinea':
        poly(g.pts)
        break
      case 'rectangulo': {
        const [xa, ya] = g.pts[0], [xb, yb] = g.pts[1]
        doc.rect(X(Math.min(xa, xb)), Y(Math.min(ya, yb)), L(Math.abs(xb - xa)), L(Math.abs(yb - ya)), 'S')
        break
      }
      case 'circulo':
        doc.circle(X(g.pts[0][0]), Y(g.pts[0][1]), L(g.r || 40), 'S'); break
      case 'punto':
        line(g.pts[0][0] - 5, g.pts[0][1], g.pts[0][0] + 5, g.pts[0][1])
        line(g.pts[0][0], g.pts[0][1] - 5, g.pts[0][0], g.pts[0][1] + 5)
        break
      case 'arco':
        poly(sampleArc3(g.pts[0], g.pts[1], g.pts[2])); break
      case 'elipse':
        doc.ellipse(X(g.pts[0][0]), Y(g.pts[0][1]), L(g.rx || 40), L(g.ry || g.rx || 40), 'S'); break
      case 'spline':
        poly(sampleCatmullRom(g.pts, 10)); break
      case 'directriz': {
        const [ax, ay] = g.pts[0], [ex, ey] = g.pts[1]
        line(ax, ay, ex, ey)
        line(ex, ey, ex + (ex >= ax ? 8 : -8), ey)
        // punta de flecha
        const ang = Math.atan2(ay - ey, ax - ex)
        line(ax, ay, ax - 7 * Math.cos(ang - 0.35), ay - 7 * Math.sin(ang - 0.35))
        line(ax, ay, ax - 7 * Math.cos(ang + 0.35), ay - 7 * Math.sin(ang + 0.35))
        textJobs.push({ val: g.text || 'nota', x: X(ex + (ex >= ax ? 9 : -9)), y: Y(ey) - 1, size: 7.5, bold: true, color: col, align: ex >= ax ? 'left' : 'right' })
        break
      }
      case 'nube':
        poly(scallopPts(g.pts, false, 26))
        line(g.pts[g.pts.length - 1][0], g.pts[g.pts.length - 1][1], g.pts[0][0], g.pts[0][1])
        break
      case 'hatch': {
        // contorno + patrón recortado al polígono (clip de estado gráfico)
        const bxp = g.pts.map((p) => p[0]), byp = g.pts.map((p) => p[1])
        const hx0 = Math.min(...bxp), hx1 = Math.max(...bxp), hy0 = Math.min(...byp), hy1 = Math.max(...byp)
        doc.saveGraphicsState()
        const segs = g.pts.slice(1).map((p, i) => [X(p[0]) - X(g.pts[i][0]), Y(p[1]) - Y(g.pts[i][1])])
        doc.lines(segs, X(g.pts[0][0]), Y(g.pts[0][1]), [1, 1], null, true)
        doc.clip('evenodd')
        setDraw([150, 150, 155], 0.12)
        if (g.pattern === 'ansi31' || g.pattern === 'ar-b816') {
          // diagonales 45° (concreto) o aparejo (ladrillo → líneas horizontales + verticales cortas)
          const step = g.pattern === 'ansi31' ? 8 : 15
          if (g.pattern === 'ansi31') {
            for (let d = -(hy1 - hy0); d < hx1 - hx0 + (hy1 - hy0); d += step) {
              line(hx0 + d, hy0, hx0 + d + (hy1 - hy0), hy1)
            }
          } else {
            for (let yy = hy0; yy <= hy1; yy += step / 1.6) line(hx0, yy, hx1, yy)
            for (let xx = hx0 + step; xx <= hx1; xx += step) line(xx, hy0, xx, hy0 + step / 1.6)
          }
        } else if (g.pattern === 'gravel') {
          for (let yy = hy0 + 4; yy < hy1; yy += 12) for (let xx = hx0 + 4; xx < hx1; xx += 12) {
            doc.circle(X(xx), Y(yy), 0.25, 'S')
          }
        } else {
          for (let yy = hy0; yy <= hy1; yy += 18) line(hx0, yy, hx1, yy)
          for (let xx = hx0; xx <= hx1; xx += 18) line(xx, hy0, xx, hy1)
        }
        doc.restoreGraphicsState()
        // contorno encima del patrón
        setDraw(col, Math.max(0.1, (m?.weight || 2) * 0.06))
        poly(g.pts)
        break
      }
      case 'cota-rad': {
        const [cx, cy] = g.pts[0], [ex, ey] = g.pts[1]
        const r = g.r || Math.hypot(ex - cx, ey - cy)
        setDraw(col, 0.09)
        doc.circle(X(cx), Y(cy), L(r), 'S')
        setDraw(col, 0.16)
        line(cx, cy, ex, ey)
        const ang = Math.atan2(cy - ey, cx - ex)
        line(ex, ey, ex - 6 * Math.cos(ang - 0.3), ey - 6 * Math.sin(ang - 0.3))
        line(ex, ey, ex - 6 * Math.cos(ang + 0.3), ey - 6 * Math.sin(ang + 0.3))
        const val = (m?.dimOverride && m.dimOverride !== '') ? m.dimOverride : (r / PX_PER_M).toFixed(2)
        textJobs.push({ val: `R ${val} m`, x: X((cx + ex) / 2) + 2, y: Y((cy + ey) / 2) - 1, size: 7.5, bold: true, color: col, align: 'left' })
        break
      }
      case 'cota-ang': {
        const [vx, vy] = g.pts[0], p1 = g.pts[1], p2 = g.pts[2]
        const a1 = Math.atan2(p1[1] - vy, p1[0] - vx), a2 = Math.atan2(p2[1] - vy, p2[0] - vx)
        let sweep = (a2 - a1) % (Math.PI * 2); if (sweep < 0) sweep += Math.PI * 2
        const deg = sweep * 180 / Math.PI
        const r0 = 46
        setDraw(col, 0.09)
        line(vx, vy, vx + r0 * Math.cos(a1), vy + r0 * Math.sin(a1))
        line(vx, vy, vx + r0 * Math.cos(a2), vy + r0 * Math.sin(a2))
        setDraw(col, 0.16)
        const arc: number[][] = []
        for (let i = 0; i <= 14; i++) { const a = a1 + sweep * (i / 14); arc.push([vx + r0 * Math.cos(a), vy + r0 * Math.sin(a)]) }
        poly(arc)
        const mid = a1 + sweep / 2
        const val = (m?.dimOverride && m.dimOverride !== '') ? m.dimOverride : `${deg.toFixed(1)}°`
        textJobs.push({ val, x: X(vx + (r0 + 12) * Math.cos(mid)), y: Y(vy + (r0 + 12) * Math.sin(mid)) - 1, size: 7.5, bold: true, color: col, align: 'center' })
        break
      }
      case 'texto':
        textJobs.push({ val: g.text || '', x: X(g.pts[0][0]), y: Y(g.pts[0][1]), size: 8, bold: true, color: col, align: 'left' })
        break
      case 'cota': {
        const [xa, ya] = g.pts[0], [xb, yb] = g.pts[1]
        const horizontal = Math.abs(xb - xa) >= Math.abs(yb - ya)
        const val = m?.dimOverride && m.dimOverride !== '' ? m.dimOverride
          : `${(Math.hypot(xb - xa, yb - ya) / PX_PER_M).toFixed(m?.precision ?? 2)}`
        if (horizontal) {
          const dy = Math.min(ya, yb) - 26
          line(xa, ya - 3, xa, dy + 3); line(xb, yb - 3, xb, dy + 3)
          line(xa, dy, xb, dy)
          tick(xa, dy); tick(xb, dy)
          dimText(`${val} m`, X((xa + xb) / 2), Y(dy) - 1.4)
        } else {
          const dx = Math.min(xa, xb) - 26
          line(xa - 3, ya, dx + 3, ya); line(xb - 3, yb, dx + 3, yb)
          line(dx, ya, dx, yb)
          tick(dx, ya); tick(dx, yb)
          dimText(`${val} m`, X(dx) - 1.2, Y((ya + yb) / 2), 90)
        }
        break
      }
      default: break
    }
    if (ph === 'demolicion' || ph === 'existente') doc.setLineDashPattern([], 0)
  }

  // ---------- fases BIM: recuadros de demolición sobre elementos no-dibujo ----------
  {
    const phased = drawable.filter((el) => {
      if (el.type === 'dibujo' || el.type === 'pin' || el.type === 'texto') return false
      const ph = (mods[el.id]?.phase as string) || (el.geo as DrawGeo).phase
      return ph === 'demolicion' || ph === 'existente'
    })
    for (const el of phased) {
      const bb = elBounds(el, mods[el.id], true)
      if (!bb) continue
      const isDemo = ((mods[el.id]?.phase as string) || (el.geo as DrawGeo).phase) === 'demolicion'
      const c = isDemo ? [239, 68, 68] : [140, 140, 145]
      setDraw(c as unknown as readonly number[], 0.14)
      doc.setLineDashPattern([1.8, 1.1], 0)
      doc.rect(X(bb.minX), Y(bb.maxY), L(bb.maxX - bb.minX), L(bb.maxY - bb.minY), 'S')
      if (isDemo) {
        line(bb.minX, bb.minY, bb.maxX, bb.maxY)
        line(bb.maxX, bb.minY, bb.minX, bb.maxY)
      }
      doc.setLineDashPattern([], 0)
    }
    if (phased.length > 0) {
      // leyenda de fases junto a la barra de escala (cuenta TODOS los elementos con fase)
      const phaseOf2 = (el: PlanElement) => ((mods[el.id]?.phase as string) || (el.geo as DrawGeo).phase) as string
      const allPhased = drawable.filter((el) => phaseOf2(el) === 'demolicion' || phaseOf2(el) === 'existente')
      const nDemo = allPhased.filter((el) => phaseOf2(el) === 'demolicion').length
      textJobs.push({
        val: `FASES — rojo punteado: demolición (${nDemo}) · gris: existente (${allPhased.length - nDemo})`,
        x: X(940) - 2, y: Y(762), size: 6, bold: true, color: [120, 120, 125], align: 'left',
      })
    }
  }

  // ---------- rótulos de ambientes: capa final con colocación inteligente ----------
  // Busca el hueco más libre del ambiente (evitando mobiliario, sanitarios
  // y giro de puertas); si no lo hay, se apoya sobre los objetos con halo
  // blanco, siempre legible. Dibuja el nombre + área en mm de página.
  const drawRoomLabels = () => {
    if (!roomLabels.length) return
    // obstáculos en px del plano (con 6 px de margen)
    const obstacles: Bbox[] = []
    for (const el of drawable) {
      if (el.type !== 'mobiliario' && el.type !== 'sanitario' && el.type !== 'puerta') continue
      const bb = elBounds(el, mods[el.id], opts.includeFurniture)
      if (!bb) continue
      obstacles.push({ minX: bb.minX - 6, minY: bb.minY - 6, maxX: bb.maxX + 6, maxY: bb.maxY + 6 })
    }
    const hits = (r: Bbox) => obstacles.some((o) => r.minX < o.maxX && r.maxX > o.minX && r.minY < o.maxY && r.maxY > o.minY)
    const overlapPx = (r: Bbox) => obstacles.reduce((acc, o) =>
      acc + Math.max(0, Math.min(r.maxX, o.maxX) - Math.max(r.minX, o.minX))
        * Math.max(0, Math.min(r.maxY, o.maxY) - Math.max(r.minY, o.minY)), 0)
    interface Place { x: number; y: number; fs: number; fsA: number; areaStr: string }
    for (const { g, m } of roomLabels) {
      const tx = m?.translate?.[0] ?? 0
      const ty = m?.translate?.[1] ?? 0
      const rx = g.x + tx, ry = g.y + ty
      const cx0 = rx + g.w / 2, cy0 = ry + g.h / 2
      const small = Math.min(g.w, g.h) < 150
      const areaStr = `${roomAreaM2(g).toFixed(2)} m² · ${g.num}`
      const attempts: Array<[number, number]> = small ? [[5.8, 5]] : [[7.5, 6], [6.2, 5.2]]
      let place: Place | null = null
      let fallback: Place | null = null
      for (const [fs, fsA] of attempts) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(fs)
        const wName = Math.max(doc.getTextWidth(g.name), 3)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(fsA)
        const wArea = Math.max(doc.getTextWidth(areaStr), 3)
        const blockW = Math.max(wName, wArea) + 1.4
        const topOff = -0.6 - fs * 0.78 - 0.4
        const botOff = 2.2 + fsA * 0.3 + 0.4
        const bw = blockW / k, bh = (botOff - topOff) / k
        const mx = Math.max(14, bw / 2 + 6)
        const my = Math.max(16, bh / 2 + 8)
        const iw = g.w - 2 * mx, ih = g.h - 2 * my
        const cand: Array<[number, number]> = []
        if (iw > 0 && ih > 0) {
          for (let iy = 0; iy < 5; iy++) for (let ix = 0; ix < 7; ix++) {
            cand.push([rx + mx + (iw * ix) / 6, ry + my + (ih * iy) / 4])
          }
        }
        cand.push([cx0, cy0])
        let best: [number, number] | null = null
        let bestScore = Infinity
        for (const [cxx, cyy] of cand) {
          const r: Bbox = { minX: cxx - bw / 2, minY: cyy - bh / 2, maxX: cxx + bw / 2, maxY: cyy + bh / 2 }
          if (r.minX < rx + 4 || r.maxX > rx + g.w - 4 || r.minY < ry + 4 || r.maxY > ry + g.h - 4) continue
          if (hits(r)) continue
          const score = (cxx - cx0) ** 2 + (cyy - cy0) ** 2
          if (score < bestScore) { best = [cxx, cyy]; bestScore = score }
        }
        if (best) { place = { x: best[0], y: best[1], fs, fsA, areaStr }; break }
        if (!fallback) {
          // ambiente lleno: mínimo solape y, a igualdad, lo más centrado
          let bestScore = Infinity
          let bestPos: [number, number] = [cx0, cy0]
          for (const [cxx, cyy] of cand) {
            const r: Bbox = { minX: cxx - bw / 2, minY: cyy - bh / 2, maxX: cxx + bw / 2, maxY: cyy + bh / 2 }
            if (r.minX < rx + 4 || r.maxX > rx + g.w - 4 || r.minY < ry + 4 || r.maxY > ry + g.h - 4) continue
            const score = overlapPx(r) * 4 + (cxx - cx0) ** 2 + (cyy - cy0) ** 2
            if (score < bestScore) { bestScore = score; bestPos = [cxx, cyy] }
          }
          fallback = { x: bestPos[0], y: bestPos[1], fs, fsA, areaStr }
        }
      }
      const P: Place = place ?? fallback ?? { x: cx0, y: cy0, fs: 7.5, fsA: 6, areaStr }
      const cxM = X(P.x), cyM = Y(P.y)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(P.fs)
      const wName = Math.max(doc.getTextWidth(g.name), 3)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(P.fsA)
      const wArea = Math.max(doc.getTextWidth(P.areaStr), 3)
      const blockW = Math.max(wName, wArea) + 1.4
      const topOff = -0.6 - P.fs * 0.78 - 0.4
      const botOff = 2.2 + P.fsA * 0.3 + 0.4
      // halo blanco del bloque completo (nombre + área)
      doc.setFillColor(255, 255, 255)
      doc.rect(cxM - blockW / 2 - 0.5, cyM + topOff, blockW + 1, botOff - topOff, 'F')
      setText(C.ink)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(P.fs)
      doc.text(g.name, cxM, cyM - 0.6, { align: 'center' })
      setText(C.muted)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(P.fsA)
      doc.text(P.areaStr, cxM, cyM + 2.2, { align: 'center' })
    }
  }

  // ---------- capa de texto final (encima de todo el dibujo) ----------
  flushText()
  drawRoomLabels()

  // ---------- anotaciones de lámina ----------
  const logoData = opts.cartela?.includeLogo ? await fetchLogoDataUrl() : null
  drawCartela(doc, area, opts, logoData)
  drawNorth(doc, area)
  drawScaleBar(doc, area, mmPerM, opts.scale)

  // ---------- guardar ----------
  const filename = `jarumy-A01-esc-1-${opts.scale}-${PAPERS[opts.paper].label}${opts.landscape ? 'h' : 'v'}.pdf`
  const buf = doc.output('arraybuffer') as ArrayBuffer
  const bytes = buf.byteLength
  if (opts.returnData) {
    // entorno de prueba: devolver base64 sin disparar descarga
    const u8 = new Uint8Array(buf)
    let s = ''
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
    const data = typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(u8).toString('base64')
    return {
      filename, bytes, data,
      pageW: area.W, pageH: area.H,
      planW: (b.maxX - b.minX) / PX_PER_M,
      planH: (b.maxY - b.minY) / PX_PER_M,
    }
  }
  // en lote, el doc compartido lo guarda el orquestador al final
  if (!opts.docAppend && typeof document !== 'undefined') doc.save(filename)
  return {
    filename,
    bytes,
    pageW: area.W,
    pageH: area.H,
    planW: (b.maxX - b.minX) / PX_PER_M,
    planH: (b.maxY - b.minY) / PX_PER_M,
  }
}

// ---------- cartela / rosa / barra de escala ----------

/** descarga el logo oficial como dataURL (null en Node o si falla) */
let logoCache: string | null | undefined
async function fetchLogoDataUrl(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache
  try {
    const res = await fetch('/logo-jarumy.png')
    if (!res.ok) throw new Error('sin logo')
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('fread'))
      r.readAsDataURL(blob)
    })
    logoCache = dataUrl
    return dataUrl
  } catch {
    logoCache = null
    return null
  }
}

function drawCartela(doc: jsPDF, area: ReturnType<typeof drawArea>, opts: PdfExportOptions, logoData: string | null) {
  const c = { ...DEFAULT_CARTELA, ...(opts.cartela || {}), ...(opts.lamina ? { lamina: opts.lamina } : {}) }
  const y0 = area.H - MARGIN - CART_H
  const x1 = MARGIN, x2 = area.W - MARGIN
  const h = CART_H

  doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
  doc.setLineWidth(0.35)
  doc.rect(x1, y0, x2 - x1, h)
  doc.setLineWidth(0.15)

  // columnas: logo | proyecto | datos | lámina
  const c1 = x1 + 46, c2 = x1 + 128, c3 = x1 + 172
  doc.line(c1, y0, c1, y0 + h)
  doc.line(c2, y0, c2, y0 + h)
  doc.line(c3, y0, c3, y0 + h)

  const label = (t: string, x: number, y: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(4.6)
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2])
    doc.text(t, x, y)
  }
  const value = (t: string, x: number, y: number, size = 7, bold = true) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size)
    doc.setTextColor(C.ink[0], C.ink[1], C.ink[2])
    doc.text(t, x, y)
  }

  // logo oficial (imagen) o texto de respaldo
  if (logoData) {
    try {
      const lw = 34, lh = lw * (246 / 560) // proporción del logo 560×246
      doc.addImage(logoData, 'PNG', x1 + 4, y0 + (h - lh) / 2, lw, lh)
    } catch { /* texto de respaldo */
      value('JARUMY APP', x1 + 4, y0 + 9, 9)
    }
  } else {
    value('JARUMY APP', x1 + 4, y0 + 9, 9)
    label('SUITE ARQUITECTÓNICA CAD WEB', x1 + 4, y0 + 13.5)
  }
  value(c.escala || `ESC. 1:${opts.scale}`, x1 + 4, y0 + 21.5, 6.5)

  // proyecto
  label('PROYECTO', c1 + 4, y0 + 5)
  value((c.proyecto || opts.title || 'SIN NOMBRE').slice(0, 34), c1 + 4, y0 + 9.5, 7.5)
  if (c.propietario) { label('PROPIETARIO', c1 + 4, y0 + 12.5); value(c.propietario.slice(0, 34), c1 + 4, y0 + 16.5, 6, false) }
  label('DIBUJÓ', c1 + 4, y0 + 20)
  value((c.autor || 'ARQ. JARUMY').slice(0, 34), c1 + 4, y0 + 23.2, 5.6, false)

  // escala + fecha + ubicación
  if (c.ubicacion) { label('UBICACIÓN', c2 + 4, y0 + 5); value(c.ubicacion.slice(0, 30), c2 + 4, y0 + 9.5, 6, false) }
  label('FECHA', c2 + 4, y0 + 12.5)
  value(new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }), c2 + 4, y0 + 16.5, 6.5)
  label('UNIDADES', c2 + 4, y0 + 20)
  value('MÉTRICO · m', c2 + 4, y0 + 23.2, 5.6, false)

  label('LÁMINA', c3 + 4, y0 + 6)
  value((c.lamina || 'A-01').slice(0, 8), c3 + 4, y0 + 15, 12)
  label((c.escala ? c.escala : `ESC. 1:${opts.scale}`).slice(0, 20), c3 + 4, y0 + 20.5)
}

function drawNorth(doc: jsPDF, area: ReturnType<typeof drawArea>) {
  const cx = area.x2 - 12, cy = area.y1 + 12, r = 6
  // panel blanco: la rosa de los vientos nunca pierde legibilidad
  // aunque el plano llegue hasta la esquina superior derecha
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
  doc.setLineWidth(0.2)
  doc.rect(cx - 9.5, cy - 12.5, 19, 22, 'FD')
  doc.setLineWidth(0.25)
  doc.circle(cx, cy, r)
  doc.setFillColor(C.ink[0], C.ink[1], C.ink[2])
  // aguja norte (triángulo)
  const v: number[][] = [[0, 1.9], [1.2, 1.9], [0, -4.2], [-1.2, 1.9]]
  doc.lines(v.slice(1).map((p, i) => [p[0] - v[i][0], p[1] - v[i][1]]), cx + v[0][0], cy + v[0][1], [1, 1], 'F', true)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6)
  doc.text('N', cx, cy - r - 1.2, { align: 'center' })
}

function drawScaleBar(doc: jsPDF, area: ReturnType<typeof drawArea>, mmPerM: number, scale: number) {
  const nSeg = Math.max(1, Math.min(5, Math.floor(46 / mmPerM)))
  const barW = nSeg * mmPerM
  const x0 = area.x1 + 2
  const y0 = area.H - MARGIN - CART_H - 9
  const h = 1.6
  // franja blanca de respaldo: la barra sigue legible aunque el plano
  // llegue a esta zona (cuando no cupo en el área con banda reservada)
  doc.setFillColor(255, 255, 255)
  doc.rect(x0 - 2, y0 - 5.2, barW + 10, h + 10.8, 'F')
  doc.setLineWidth(0.18)
  for (let i = 0; i < nSeg; i++) {
    if (i % 2 === 0) { doc.setFillColor(C.ink[0], C.ink[1], C.ink[2]); doc.rect(x0 + i * mmPerM, y0, mmPerM, h, 'FD') }
    else { doc.setFillColor(255, 255, 255); doc.rect(x0 + i * mmPerM, y0, mmPerM, h, 'FD') }
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4.6)
  doc.setTextColor(C.muted[0], C.muted[1], C.muted[2])
  doc.text('0', x0, y0 - 1.2)
  doc.text(`${nSeg} m`, x0 + barW, y0 - 1.2, { align: 'right' })
  doc.setTextColor(C.ink[0], C.ink[1], C.ink[2])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.4)
  doc.text(`ESCALA GRÁFICA 1:${scale}`, x0, y0 + h + 3.4)
}

function hexToRgb(hex: string): readonly number[] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : C.dim
}

const VIEW_FALLBACK_W = 900
const VIEW_FALLBACK_H = 600

// ---------------- trazado por lotes REAL (multi-lámina) ----------------
// Un solo PDF con: índice (A-00) + una lámina de planta por nivel +
// las 4 elevaciones cardinales + la sección transversal, cada una con
// cartela, marco y barra de escala, numeradas correlativamente.

export interface BatchSheet {
  lamina: string
  title: string
}

export interface BatchPlotResult {
  filename: string
  bytes: number
  sheets: BatchSheet[]
  pageW: number
  pageH: number
}

/** Área techada de un nivel (m²) a partir de sus espacios. */
function levelAreaM2(elements: PlanElement[], mods: Record<string, Mod>, levelId: number): number {
  return elements
    .filter((el) => (el.level ?? 0) === levelId && !mods[el.id]?.deleted && el.type === 'espacio')
    .reduce((n, el) => n + roomAreaM2(el.geo as RoomGeo), 0)
}

function drawBatchIndex(
  doc: jsPDF,
  area: ReturnType<typeof drawArea>,
  opts: PdfExportOptions,
  sheets: BatchSheet[],
  levels: LevelDef[],
  elements: PlanElement[],
  mods: Record<string, Mod>,
) {
  // fondo + marco (mismo estilo que las láminas de planta)
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, area.W, area.H, 'F')
  doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
  doc.setLineWidth(0.5)
  doc.rect(FRAME, FRAME, area.W - 2 * FRAME, area.H - 2 * FRAME)
  doc.setLineWidth(0.2)
  doc.rect(MARGIN, MARGIN, area.W - 2 * MARGIN, area.H - 2 * MARGIN)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(C.ink[0], C.ink[1], C.ink[2])
  doc.setFontSize(16)
  const proj = (opts.cartela?.proyecto || opts.title || 'PROYECTO SIN NOMBRE').toUpperCase()
  doc.text(proj.slice(0, 48), area.W / 2, 34, { align: 'center' })
  doc.setFontSize(9)
  doc.setTextColor(C.muted[0], C.muted[1], C.muted[2])
  doc.text('ÍNDICE DE LÁMINAS · TRAZADO POR LOTES', area.W / 2, 41, { align: 'center' })

  // tabla de láminas
  const y0 = 56
  const rowH = 9
  const x1 = MARGIN + 6, x2 = area.W - MARGIN - 6
  doc.setFontSize(6.5)
  doc.setTextColor(C.muted[0], C.muted[1], C.muted[2])
  doc.text('LÁMINA', x1 + 2, y0 - 2)
  doc.text('CONTENIDO', x1 + 26, y0 - 2)
  doc.text('ESCALA', x2 - 20, y0 - 2)
  doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
  doc.setLineWidth(0.18)
  doc.line(x1, y0, x2, y0)

  let i = 0
  for (const sh of sheets) {
    const y = y0 + 6 + i * rowH
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(C.ink[0], C.ink[1], C.ink[2])
    doc.text(sh.lamina, x1 + 2, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.6)
    doc.text(sh.title.slice(0, 60), x1 + 26, y)
    doc.text(`1:${opts.scale}`, x2 - 20, y)
    doc.setDrawColor(210, 210, 214)
    doc.setLineWidth(0.1)
    doc.line(x1, y + 2.4, x2, y + 2.4)
    i++
  }

  // resumen de niveles
  const ySum = y0 + 10 + sheets.length * rowH + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(C.ink[0], C.ink[1], C.ink[2])
  doc.text(`NIVELES (${levels.length})`, x1 + 2, ySum)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(C.muted[0], C.muted[1], C.muted[2])
  let j = 0
  for (const lv of levels) {
    const areaM2 = levelAreaM2(elements, mods, lv.id)
    doc.text(
      `${lv.name} · NPT +${lv.elev.toFixed(2)} m · altura ${lv.height.toFixed(2)} m · área techada ${areaM2.toFixed(1)} m2`,
      x1 + 2, ySum + 5 + j * 4.6,
    )
    j++
  }
}

function drawElevationSheet(
  doc: jsPDF,
  area: ReturnType<typeof drawArea>,
  elev: Elevation,
  opts: PdfExportOptions,
  sheet: BatchSheet,
  logoData: string | null,
) {
  doc.addPage([area.W, area.H], area.W >= area.H ? 'landscape' : 'portrait')

  // fondo + marco
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, area.W, area.H, 'F')
  doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
  doc.setLineWidth(0.5)
  doc.rect(FRAME, FRAME, area.W - 2 * FRAME, area.H - 2 * FRAME)
  doc.setLineWidth(0.2)
  doc.rect(MARGIN, MARGIN, area.W - 2 * MARGIN, area.H - 2 * MARGIN)

  // encaje: la elevación (m) se centra en el área útil respetando la escala
  const mmPerM = 1000 / opts.scale
  const zx1 = MARGIN + PAD, zy1 = MARGIN + PAD
  const zx2 = area.x2 - PAD, zy2 = area.y2 - SB // reserva banda de escala
  const zw = zx2 - zx1, zh = zy2 - zy1
  const wMm = elev.width * mmPerM
  const hMm = elev.height * mmPerM
  // si no cabe a la escala pedida, se reduce el factor (siempre a escala máxima posible ≤ pedida)
  const kFit = Math.min(1, zw / Math.max(wMm, 1), zh / Math.max(hMm, 1))
  const k = mmPerM * kFit
  const ox = zx1 + (zw - elev.width * k) / 2
  const oy = zy1 + (zh - elev.height * k) / 2 + (elev.height - 0) * k * 0.18 // baja la vista (suelo cerca de 2/3)
  const X = (x: number) => ox + x * k
  const Y = (y: number) => oy + (elev.height - y) * k // Y-arriba → Y-página

  // líneas (grosor en m → mm, mínimo 0.12 mm)
  doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
  for (const ln of elev.lines) {
    doc.setLineWidth(Math.max(0.12, ln.w * k))
    if (ln.dash) doc.setLineDashPattern([1.2, 0.9], 0)
    else doc.setLineDashPattern([], 0)
    doc.line(X(ln.x1), Y(ln.y1), X(ln.x2), Y(ln.y2))
  }
  doc.setLineDashPattern([], 0)

  // vanos: puertas (marco + hoja diagonal) y ventanas (marco + vidrio)
  for (const op of elev.opens) {
    const x = X(op.x), y = Y(op.y0 + op.h)
    const w = op.w * k, h = op.h * k
    doc.setLineWidth(0.22)
    doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
    doc.rect(x, y, w, h)
    if (op.kind === 'door') {
      // hoja girando: arco insinuado + diagonal
      doc.setLineWidth(0.14)
      doc.line(x, y + h, x + w, y)          // diagonal de hoja abierta
      doc.setDrawColor(C.dim[0], C.dim[1], C.dim[2])
      doc.setLineDashPattern([0.8, 0.8], 0)
      doc.line(x, y, x, y + h)              // bisagra
      doc.setLineDashPattern([], 0)
    } else {
      // ventana: vidrio = doble línea interior + trama horizontal
      doc.setLineWidth(0.1)
      doc.setDrawColor(C.glass[0], C.glass[1], C.glass[2])
      const midY = y + h / 2
      doc.line(x + 0.4, midY, x + w - 0.4, midY)
      doc.setFillColor(245, 247, 249)
      doc.rect(x + 0.3, y + 0.3, w - 0.6, h - 0.6, 'FD')
      doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
      doc.setLineWidth(0.22)
      doc.rect(x, y, w, h)
    }
  }

  // título de la vista
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(C.ink[0], C.ink[1], C.ink[2])
  doc.text(`${ELEV_LABELS[elev.dir]} · ESC 1:${opts.scale}${kFit < 1 ? ' (reducida al encaje)' : ''}`, area.W / 2, MARGIN + 8, { align: 'center' })

  // cartela + barra de escala con la lámina del lote
  drawCartela(doc, area, { ...opts, lamina: sheet.lamina }, logoData)
  drawScaleBar(doc, area, mmPerM * kFit, opts.scale)
}

/**
 * Trazado por lotes REAL: un único PDF con índice + planta por nivel +
 * 4 elevaciones + sección. `cutX` (px del plano) posiciona el corte.
 */
export async function exportBatchPdf(
  elements: PlanElement[],
  mods: Record<string, Mod>,
  layers: LayerDef[],
  levels: LevelDef[],
  opts: PdfExportOptions,
  cutXPx = 600,
): Promise<BatchPlotResult> {
  const { jsPDF } = await import('jspdf')
  const area = drawArea(opts.paper, opts.landscape)
  const doc = new jsPDF({
    unit: 'mm',
    format: [area.W, area.H],
    orientation: area.W >= area.H ? 'landscape' : 'portrait',
  })

  // ---- lista de láminas ----
  const sheets: BatchSheet[] = []
  levels.forEach((lv, i) => {
    sheets.push({ lamina: `A-${String(i + 1).padStart(2, '0')}`, title: `PLANTA ${lv.name} — NPT +${lv.elev.toFixed(2)} m · altura ${lv.height.toFixed(2)} m` })
  })
  const dirs: ElevDir[] = ['norte', 'sur', 'este', 'oeste']
  dirs.forEach((d, i) => {
    sheets.push({ lamina: `A-${String(levels.length + i + 1).padStart(2, '0')}`, title: ELEV_LABELS[d] })
  })
  sheets.push({ lamina: `A-${String(levels.length + dirs.length + 1).padStart(2, '0')}`, title: 'SECCIÓN TRANSVERSAL' })

  // ---- lámina A-00: índice ----
  drawBatchIndex(doc, area, opts, sheets, levels, elements, mods)
  const logoData = opts.cartela?.includeLogo ? await fetchLogoDataUrl() : null
  drawCartela(doc, area, { ...opts, lamina: 'A-00' }, logoData)

  // ---- láminas de planta (una por nivel, sobre el doc compartido) ----
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i]
    const els = elements.filter((el) => (el.level ?? 0) === lv.id)
    await exportPlanPdf(els, mods, layers, {
      ...opts,
      docAppend: doc,
      lamina: sheets[i].lamina,
      title: sheets[i].title,
    })
  }

  // ---- elevaciones + sección ----
  for (let j = 0; j < dirs.length + 1; j++) {
    const dir: ElevDir = j < dirs.length ? dirs[j] : 'seccion'
    const elev = buildElevation(elements, mods, dir, {
      wallH: levels[levels.length - 1]?.height ?? 2.5,
      cutX: cutXPx,
    })
    drawElevationSheet(doc, area, elev, opts, sheets[levels.length + j], logoData)
  }

  const filename = `jarumy-lote-${levels.length}-niveles-esc-1-${opts.scale}-${PAPERS[opts.paper].label}${opts.landscape ? 'h' : 'v'}.pdf`
  const buf = doc.output('arraybuffer') as ArrayBuffer
  if (typeof document !== 'undefined') doc.save(filename)
  return { filename, bytes: buf.byteLength, sheets, pageW: area.W, pageH: area.H }
}
