// ============================================================
// JARUMY APP — Elevaciones y sección transversal automáticas.
// Proyecta muros/vanos/columnas sobre 4 vistas cardinales y un
// corte vertical deslizable. Devuelve geometría en METROS con
// Y hacia arriba (listo para SVG o jsPDF).
// ============================================================

import type { PlanElement } from './plan-data'
import type { WallGeo, DoorGeo, WindowGeo, RoomGeo, ColGeo, StairGeo } from './plan-data'
import { PX_PER_M } from './plan-data'
import type { Mod } from './store'

export type ElevDir = 'norte' | 'sur' | 'este' | 'oeste' | 'seccion'

export interface ElevLine { x1: number; y1: number; x2: number; y2: number; w: number; dash?: boolean }
export interface ElevOpen { x: number; y0: number; w: number; h: number; kind: 'door' | 'window'; label?: string }
export interface Elevation {
  dir: ElevDir
  lines: ElevLine[]
  opens: ElevOpen[]
  width: number   // ancho total (m)
  height: number  // altura dibujada (m)
  cutX?: number
}

const DOOR_H = 2.10
const WIN_SILL = 0.90
const WIN_H = 1.20
const FLOOR_T = 0.15 // thickness de losa de piso dibujada

export function buildElevation(
  elements: PlanElement[],
  mods: Record<string, Mod>,
  dir: ElevDir,
  opts: { wallH?: number; cutX?: number } = {},
): Elevation {
  const wallH = opts.wallH ?? 2.5
  const lines: ElevLine[] = []
  const opens: ElevOpen[] = []
  const drawable = elements.filter((el) => !mods[el.id]?.deleted)

  // vistas norte/sur: coordenada horizontal = x del plano
  // vistas este/oeste: coordenada horizontal = y del plano
  const horizontal = dir === 'norte' || dir === 'sur' || dir === 'seccion'
  let width = 0

  // ---------- muros ----------
  for (const el of drawable) {
    if (el.type !== 'muro') continue
    const g = el.geo as WallGeo
    const m = mods[el.id]
    const t = ((m?.thickness ?? g.t) / PX_PER_M)
    const tx = (m?.translate?.[0] ?? 0) / PX_PER_M
    const ty = (m?.translate?.[1] ?? 0) / PX_PER_M
    const vert = g.x1 === g.x2 // muro vertical en planta

    if (dir === 'seccion') {
      const cutX = (opts.cutX ?? 600) / PX_PER_M
      const wx1 = Math.min(g.x1, g.x2) / PX_PER_M + tx
      const wx2 = Math.max(g.x1, g.x2) / PX_PER_M + tx
      // muro cortado: cruza la línea de corte
      if (vert && wx1 <= cutX && cutX <= wx2 + 0.001) {
        const x0 = cutX - t / 2
        // rectángulo sólido (muro cortado) — dos caras + relleno implícito
        lines.push({ x1: x0, y1: 0, x2: x0, y2: wallH, w: 0.05 })
        lines.push({ x1: x0 + t, y1: 0, x2: x0 + t, y2: wallH, w: 0.05 })
        lines.push({ x1: x0, y1: wallH, x2: x0 + t, y2: wallH, w: 0.04 })
        // hatch del corte (diagonales)
        const n = Math.max(2, Math.floor(t / 0.06))
        for (let i = 0; i < n; i++) {
          const xA = x0 + (t * i) / n
          const xB = x0 + (t * (i + 1)) / n
          lines.push({ x1: xA, y1: 0, x2: xB, y2: wallH * 0.12, w: 0.025 })
        }
        width = Math.max(width, x0 + t)
      } else if (!vert) {
        // muro horizontal visto de frente (línea de fondo)
        const x0 = wx1
        const x1 = wx2
        lines.push({ x1: x0, y1: 0, x2: x1, y2: 0, w: 0.03 })
        lines.push({ x1: x0, y1: wallH, x2: x1, y2: wallH, w: 0.03 })
        lines.push({ x1: x0, y1: 0, x2: x0, y2: wallH, w: 0.03, dash: true })
        lines.push({ x1: x1, y1: 0, x2: x1, y2: wallH, w: 0.03, dash: true })
        width = Math.max(width, x1)
      } else {
        // muro vertical detrás del corte: proyecta como línea fina
        const cx = wx1 + tx
        lines.push({ x1: cx, y1: 0, x2: cx, y2: wallH, w: 0.02, dash: true })
        width = Math.max(width, cx)
      }
      continue
    }

    if (horizontal) {
      if (vert) {
        // muro vertical visto de canto → línea vertical
        const x = g.x1 / PX_PER_M + tx
        lines.push({ x1: x, y1: 0, x2: x, y2: wallH, w: 0.035 })
        width = Math.max(width, x)
      } else {
        // muro horizontal de frente → rectángulo
        const x0 = Math.min(g.x1, g.x2) / PX_PER_M + tx
        const x1 = Math.max(g.x1, g.x2) / PX_PER_M + tx
        const yy = (g.y1 / PX_PER_M) + ty
        // en vista SUR se ven los muros del frente (y mayor); en NORTE los del fondo.
        // Se dibujan todos superpuestos (dibujo de líneas estilo CAD).
        lines.push({ x1: x0, y1: 0, x2: x1, y2: 0, w: 0.04 })
        lines.push({ x1: x0, y1: wallH, x2: x1, y2: wallH, w: 0.04 })
        lines.push({ x1: x0, y1: 0, x2: x0, y2: wallH, w: 0.04 })
        lines.push({ x1: x1, y1: 0, x2: x1, y2: wallH, w: 0.04 })
        // derrame: línea intermedia del muro (arista superior vista)
        lines.push({ x1: x0, y1: wallH - 0.05, x2: x1, y2: wallH - 0.05, w: 0.02 })
        width = Math.max(width, x1)
        void yy
      }
    } else {
      if (!vert) {
        const y = g.y1 / PX_PER_M + ty
        lines.push({ x1: y, y1: 0, x2: y, y2: wallH, w: 0.035 })
        width = Math.max(width, y)
      } else {
        const y0 = Math.min(g.y1, g.y2) / PX_PER_M + ty
        const y1 = Math.max(g.y1, g.y2) / PX_PER_M + ty
        lines.push({ x1: y0, y1: 0, x2: y1, y2: 0, w: 0.04 })
        lines.push({ x1: y0, y1: wallH, x2: y1, y2: wallH, w: 0.04 })
        lines.push({ x1: y0, y1: 0, x2: y0, y2: wallH, w: 0.04 })
        lines.push({ x1: y1, y1: 0, x2: y1, y2: wallH, w: 0.04 })
        lines.push({ x1: y0, y1: wallH - 0.05, x2: y1, y2: wallH - 0.05, w: 0.02 })
        width = Math.max(width, y1)
      }
    }
  }

  // ---------- vanos ----------
  for (const el of drawable) {
    const m = mods[el.id]
    const tx = (m?.translate?.[0] ?? 0) / PX_PER_M
    const ty = (m?.translate?.[1] ?? 0) / PX_PER_M
    if (el.type === 'puerta') {
      const g = el.geo as DoorGeo
      const w = (g.r / PX_PER_M)
      let cx: number
      if (dir === 'seccion') {
        const cutX = (opts.cutX ?? 600) / PX_PER_M
        cx = cutX // en el corte solo se ven las puertas que están en el plano de corte: simplificado
      } else if (horizontal) {
        if (g.axis === 'v') cx = g.cx / PX_PER_M + tx
        else continue // puerta en muro perpendicular: no se ve de frente
      } else {
        if (g.axis === 'h') cx = g.cy / PX_PER_M + ty
        else continue
      }
      opens.push({ x: cx - w / 2, y0: 0, w, h: DOOR_H, kind: 'door', label: el.name })
      width = Math.max(width, cx + w / 2)
    } else if (el.type === 'ventana') {
      const g = el.geo as WindowGeo
      let x0: number, w: number
      if (dir === 'seccion') {
        const cutX = (opts.cutX ?? 600) / PX_PER_M
        x0 = cutX - 0.1; w = 0.2
      } else if (horizontal) {
        if (g.orient !== 'h') continue
        x0 = g.x / PX_PER_M + tx; w = g.len / PX_PER_M
      } else {
        if (g.orient !== 'v') continue
        x0 = g.y / PX_PER_M + ty; w = g.len / PX_PER_M
      }
      opens.push({ x: x0, y0: WIN_SILL, w, h: WIN_H, kind: 'window', label: el.name })
      width = Math.max(width, x0 + w)
    }
  }

  // ---------- columnas ----------
  for (const el of drawable) {
    if (el.type !== 'columna') continue
    const g = el.geo as ColGeo
    const m = mods[el.id]
    const s = ((m?.size ?? g.size) / PX_PER_M)
    const pos = dir === 'este' || dir === 'oeste' ? g.y / PX_PER_M : g.x / PX_PER_M
    const x0 = pos - s / 2
    lines.push({ x1: x0, y1: 0, x2: x0, y2: wallH, w: 0.05 })
    lines.push({ x1: x0 + s, y1: 0, x2: x0 + s, y2: wallH, w: 0.05 })
    width = Math.max(width, x0 + s)
  }

  // ---------- escaleras (en sección se ven completas) ----------
  for (const el of drawable) {
    if (el.type !== 'escalera') continue
    const g = el.geo as StairGeo
    if (dir !== 'seccion') {
      // en elevaciones solo se insinúa la roza de la escalera
      continue
    }
    const cutX = (opts.cutX ?? 600) / PX_PER_M
    const x0 = cutX
    let y = 0
    for (let i = 0; i < g.steps; i++) {
      const xA = x0 + i * g.tread
      const xB = xA + g.tread
      const yTop = y + g.riser
      lines.push({ x1: xA, y1: y, x2: xB, y2: y, w: 0.045 })
      lines.push({ x1: xB, y1: y, x2: xB, y2: yTop, w: 0.045 })
      y = yTop
      width = Math.max(width, xB)
    }
  }

  // ---------- piso (línea de suelo + losa) ----------
  lines.push({ x1: 0, y1: -FLOOR_T, x2: Math.max(width, 6), y2: -FLOOR_T, w: 0.05 })
  lines.push({ x1: 0, y1: -FLOOR_T, x2: 0, y2: 0, w: 0.03 })
  lines.push({ x1: Math.max(width, 6), y1: -FLOOR_T, x2: Math.max(width, 6), y2: 0, w: 0.03 })

  // nivel de piso terminado (línea de tierra gruesa bajo el piso)
  lines.push({ x1: -0.4, y1: -FLOOR_T - 0.06, x2: Math.max(width, 6) + 0.4, y2: -FLOOR_T - 0.06, w: 0.09 })

  const height = wallH + 0.5
  return { dir, lines, opens, width: Math.max(width, 6), height, cutX: opts.cutX }
}

// ---------- utilidades para las etiquetas de espacios ----------
export function roomNames(elements: PlanElement[], mods: Record<string, Mod>): Array<{ name: string; x: number; y: number }> {
  return elements
    .filter((el) => el.type === 'espacio' && !mods[el.id]?.deleted)
    .map((el) => {
      const g = el.geo as RoomGeo
      return { name: (g as { name: string }).name || el.name, x: g.x / PX_PER_M, y: g.y / PX_PER_M }
    })
}

export const ELEV_LABELS: Record<ElevDir, string> = {
  norte: 'ELEVACIÓN NORTE',
  sur: 'ELEVACIÓN SUR',
  este: 'ELEVACIÓN ESTE',
  oeste: 'ELEVACIÓN OESTE',
  seccion: 'SECCIÓN TRANSVERSAL',
}
