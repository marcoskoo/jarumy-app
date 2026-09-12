// ============================================================
// JARUMY APP — Exportación PDF a escala (vectorial)
// Genera una lámina arquitectónica en papel real (A4/A3/A2,
// horizontal o vertical) a escala exacta (1:50, 1:75, 1:100…):
// 1 m de plano = 1000/escala mm de papel. Incluye cartela con
// datos del proyecto, barra de escala gráfica, rosa de los
// vientos, cotas manuales y (opcional) acotación automática.
// ============================================================

import type { jsPDF } from 'jspdf'
import type { PlanElement, LayerDef } from './plan-data'
import type {
  WallGeo, DoorGeo, WindowGeo, RoomGeo, FurnGeo, DimGeo, ColGeo, OpenGeo, DrawGeo,
} from './plan-data'
import { PX_PER_M, roomAreaM2 } from './plan-data'
import type { Mod } from './store'
import { autoDimensions } from './auto-dims'

// ---------------- tipos y constantes ----------------

export type PaperId = 'a4' | 'a3' | 'a2'

export interface PdfExportOptions {
  scale: number            // denominador: 75 → 1:75
  paper: PaperId
  landscape: boolean
  includeAutoDims: boolean
  includeAreas: boolean
  includeFurniture: boolean
  title: string
  /** pruebas/Node: devolver el PDF como base64 en el resultado (no descargar) */
  returnData?: boolean
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
      return { minX: g.x - s / 2, minY: g.y - s / 2, maxX: g.x + s / 2, maxY: g.y + s / 2 }
    }
    case 'puerta': {
      const g = el.geo as DoorGeo
      return { minX: g.cx - g.r, minY: g.cy - g.r, maxX: g.cx + g.r, maxY: g.cy + g.r }
    }
    case 'ventana': {
      const g = el.geo as WindowGeo
      const h = g.orient === 'h'
      return h
        ? { minX: g.x, minY: g.y - 7, maxX: g.x + g.len, maxY: g.y + 7 }
        : { minX: g.x - 7, minY: g.y, maxX: g.x + 7, maxY: g.y + g.len }
    }
    case 'apertura': {
      const g = el.geo as OpenGeo
      return g.orient === 'h'
        ? { minX: g.x, minY: g.y - 8, maxX: g.x + g.len, maxY: g.y + 8 }
        : { minX: g.x - 8, minY: g.y, maxX: g.x + 8, maxY: g.y + g.len }
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
      const r = g.r || 0
      return {
        minX: Math.min(...xs) - r, minY: Math.min(...ys) - r,
        maxX: Math.max(...xs) + r, maxY: Math.max(...ys) + r,
      }
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
  const doc = new jsPDF({
    unit: 'mm',
    format: [area.W, area.H],
    orientation: area.W >= area.H ? 'landscape' : 'portrait',
  })

  const visible = new Set(layers.filter((l) => l.visible).map((l) => l.id))
  const b = planBboxPx(elements, mods, layers, opts.includeFurniture)
    ?? { minX: 0, minY: 0, maxX: VIEW_FALLBACK_W, maxY: VIEW_FALLBACK_H }

  const mmPerM = 1000 / opts.scale
  const k = mmPerM / PX_PER_M // px → mm
  const planWmm = (b.maxX - b.minX) * k
  const planHmm = (b.maxY - b.minY) * k
  const ox = area.x1 + (area.w - planWmm) / 2 - b.minX * k
  const oy = area.y1 + (area.h - planHmm) / 2 - b.minY * k
  const X = (x: number) => ox + x * k
  const Y = (y: number) => oy + y * k
  const L = (px: number) => px * k

  const setDraw = (c: readonly number[], lw: number) => { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(lw) }
  const setFill = (c: readonly number[]) => doc.setFillColor(c[0], c[1], c[2])
  const setText = (c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2])
  const line = (x1: number, y1: number, x2: number, y2: number) => doc.line(X(x1), Y(y1), X(x2), Y(y2))

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

  // espacios
  for (const el of byType('espacio')) {
    const g = el.geo as RoomGeo
    const m = mods[el.id]
    const x = X(g.x + (m?.translate?.[0] ?? 0)), y = Y(g.y + (m?.translate?.[1] ?? 0))
    setFill(C.roomFill); setDraw(C.roomStroke, 0.12)
    doc.rect(x, y, L(g.w), L(g.h), 'FD')
    if (opts.includeAreas) {
      setText(C.ink)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      const fs = Math.min(g.w, g.h) < 150 ? 5.8 : 7.5
      doc.setFontSize(fs)
      doc.text(g.name, x + L(g.w) / 2, y + L(g.h) / 2 - 0.6, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(fs === 7.5 ? 6 : 4.8)
      setText(C.muted)
      doc.text(`${roomAreaM2(g).toFixed(2)} m² · ${g.num}`, x + L(g.w) / 2, y + L(g.h) / 2 + 2.2, { align: 'center' })
    }
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
    const s = mods[el.id]?.size ?? g.size
    doc.rect(X(g.x - s / 2), Y(g.y - s / 2), L(s), L(s), 'F')
  }

  // vanos / aperturas
  setDraw(C.muted, 0.1)
  doc.setLineDashPattern([0.8, 0.8], 0)
  for (const el of byType('apertura')) {
    const g = el.geo as OpenGeo
    if (g.orient === 'h') { line(g.x, g.y - 6, g.x + g.len, g.y - 6); line(g.x, g.y + 6, g.x + g.len, g.y + 6) }
    else { line(g.x - 6, g.y, g.x - 6, g.y + g.len); line(g.x + 6, g.y, g.x + 6, g.y + g.len) }
  }
  doc.setLineDashPattern([], 0)

  // ventanas
  for (const el of byType('ventana')) {
    const g = el.geo as WindowGeo
    const h = g.orient === 'h'
    const t = 14
    const rx = h ? g.x : g.x - t / 2
    const ry = h ? g.y - t / 2 : g.y
    const w = h ? g.len : t
    const hh = h ? t : g.len
    setDraw(C.glass, 0.14)
    setFill([252, 252, 252])
    doc.rect(X(rx), Y(ry), L(w), L(hh), 'FD')
    if (h) { line(g.x, g.y - 3, g.x + g.len, g.y - 3); line(g.x, g.y + 3, g.x + g.len, g.y + 3) }
    else { line(g.x - 3, g.y, g.x - 3, g.y + g.len); line(g.x + 3, g.y, g.x + 3, g.y + g.len) }
  }

  // puertas: hoja + arco de giro (aprox. con segmentos)
  setDraw(C.ink, 0.16)
  for (const el of byType('puerta')) {
    const g = el.geo as DoorGeo
    const m = mods[el.id]
    const P0 = polar(g.cx, g.cy, g.r, g.a0)
    const P1 = polar(g.cx, g.cy, g.r, g.a1)
    const swingFlip = !!m?.swingFlip
    const leafEnd = swingFlip ? P0 : P1
    line(g.cx, g.cy, leafEnd[0], leafEnd[1])
    const from = swingFlip ? P1 : P0
    const to = swingFlip ? P0 : P1
    const steps = 8
    doc.setLineDashPattern([0.6, 0.5], 0)
    for (let i = 0; i < steps; i++) {
      const a0 = Math.atan2(from[1] - g.cy, from[0] - g.cx)
      const a1 = Math.atan2(to[1] - g.cy, to[0] - g.cx)
      let d = a1 - a0
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      const t0 = a0 + (d * i) / steps
      const t1 = a0 + (d * (i + 1)) / steps
      line(g.cx + g.r * Math.cos(t0), g.cy + g.r * Math.sin(t0),
        g.cx + g.r * Math.cos(t1), g.cy + g.r * Math.sin(t1))
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

  // ---------- cotas manuales ----------
  const dimText = (val: string, x: number, y: number, angle = 0) => {
    setText(C.dim)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.text(val, x, y, { align: 'center', angle })
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
        setText(C.autoDim)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.5)
        doc.text(`${val} m`, X((d.x1 + d.x2) / 2), Y(dy) + 2.2, { align: 'center' })
      } else {
        const dx = d.x1 + d.off
        line(d.x1 + 3, d.y1, dx - 3, d.y1)
        line(d.x2 + 3, d.y2, dx - 3, d.y2)
        line(dx, d.y1, dx, d.y2)
        aTick(dx, d.y1); aTick(dx, d.y2)
        setText(C.autoDim)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(5.5)
        doc.text(`${val} m`, X(dx) + 2.2, Y((d.y1 + d.y2) / 2), { align: 'center', angle: 90 })
      }
    }
  }

  // ---------- dibujos del usuario ----------
  for (const el of byType('dibujo')) {
    const g = el.geo as DrawGeo
    const m = mods[el.id]
    const col = m?.colorLine ? hexToRgb(m.colorLine) : C.dim
    setDraw(col, Math.max(0.1, (m?.weight || 2) * 0.06))
    switch (g.kind) {
      case 'linea':
        line(g.pts[0][0], g.pts[0][1], g.pts[1][0], g.pts[1][1]); break
      case 'polilinea':
        for (let i = 1; i < g.pts.length; i++) line(g.pts[i - 1][0], g.pts[i - 1][1], g.pts[i][0], g.pts[i][1])
        break
      case 'rectangulo': {
        const [xa, ya] = g.pts[0], [xb, yb] = g.pts[1]
        doc.rect(X(Math.min(xa, xb)), Y(Math.min(ya, yb)), L(Math.abs(xb - xa)), L(Math.abs(yb - ya)), 'S')
        break
      }
      case 'circulo':
        doc.circle(X(g.pts[0][0]), Y(g.pts[0][1]), L(g.r || 40), 'S'); break
      case 'texto':
        setText(col)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.text(g.text || '', X(g.pts[0][0]), Y(g.pts[0][1]))
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
  }

  // ---------- anotaciones de lámina ----------
  drawCartela(doc, area, opts)
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
  if (typeof document !== 'undefined') doc.save(filename)
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

function drawCartela(doc: jsPDF, area: ReturnType<typeof drawArea>, opts: PdfExportOptions) {
  const y0 = area.H - MARGIN - CART_H
  const x1 = MARGIN, x2 = area.W - MARGIN
  const h = CART_H
  const mid = y0 + h / 2

  doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
  doc.setLineWidth(0.35)
  doc.rect(x1, y0, x2 - x1, h)
  doc.setLineWidth(0.15)

  // columnas: logo | proyecto | escala/fecha | lámina
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

  // logo
  value('JARUMY APP', x1 + 4, y0 + 9, 9)
  label('SUITE ARQUITECTÓNICA CAD WEB', x1 + 4, y0 + 13.5)
  value('ESC. 1:' + opts.scale, x1 + 4, y0 + 19.5, 7)

  // proyecto
  label('PROYECTO', c1 + 4, y0 + 6)
  value((opts.title || 'VIVIENDA UNIFAMILIAR').slice(0, 34), c1 + 4, y0 + 11, 7.5)
  label('DIBUJÓ', c1 + 4, y0 + 16)
  value('J. BURGA · ARQ.', c1 + 4, y0 + 20.5, 6, false)
  // escala + fecha + área
  label('FECHA', c2 + 4, y0 + 6)
  value(new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }), c2 + 4, y0 + 11, 7)
  label('UNIDADES', c2 + 4, y0 + 16)
  value('MÉTRICO · m', c2 + 4, y0 + 20.5, 6, false)

  label('LÁMINA', c3 + 4, y0 + 6)
  value('A-01', c3 + 4, y0 + 15, 12)
  label('PLANTA ARQUITECTÓNICA', c3 + 4, y0 + 20.5)
}

function drawNorth(doc: jsPDF, area: ReturnType<typeof drawArea>) {
  const cx = area.x2 - 12, cy = area.y1 + 12, r = 6
  doc.setDrawColor(C.ink[0], C.ink[1], C.ink[2])
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
