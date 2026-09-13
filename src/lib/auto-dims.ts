// ============================================================
// JARUMY APP — Acotación automática
// Genera cotas interiores (ancho + alto, en metros) para cada
// ambiente del plano, recalculadas en tiempo real desde el
// estado. Estilo: líneas de extensión + línea de cota + ticks
// oblicuos (idéntico a las cotas manuales, en azul cielo para
// distinguirlas de las dibujadas a mano en ámbar).
// ============================================================

import type { PlanElement, RoomGeo } from './plan-data'
import { PX_PER_M } from './plan-data'
import type { Mod } from './store'

/** Una cota automática generada a partir de un ambiente. */
export interface AutoDim {
  /** arista medida (extremos reales, en px del plano) */
  x1: number
  y1: number
  x2: number
  y2: number
  /** desfase perpendicular de la línea de cota (px, hacia el interior) */
  off: number
  /** true = arista vertical (cota de alto, texto rotado) */
  vert: boolean
  /** ambiente pequeño → texto compacto */
  small: boolean
}

/**
 * Cotas interiores por ambiente: ancho (arista superior) y alto
 * (arista izquierda), con la línea de cota desplazada hacia
 * dentro. Respeta el mod `translate` y los elementos borrados.
 */
export function autoDimensions(elements: PlanElement[], mods: Record<string, Mod>): AutoDim[] {
  const dims: AutoDim[] = []
  for (const el of elements) {
    if (el.type !== 'espacio') continue
    if (mods[el.id]?.deleted) continue
    const g = el.geo as RoomGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const x = g.x + tx
    const y = g.y + ty
    const minSide = Math.min(g.w, g.h)
    const small = minSide < 150
    const off = small ? 14 : 17
    // ancho: arista superior (línea de cota dentro del ambiente)
    dims.push({ x1: x, y1: y, x2: x + g.w, y2: y, off, vert: false, small })
    // alto: arista izquierda (línea de cota dentro del ambiente)
    dims.push({ x1: x, y1: y, x2: x, y2: y + g.h, off, vert: true, small })
  }
  return dims
}

/** Texto de la cota en metros (2 decimales). */
export function autoDimText(d: AutoDim): string {
  const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1)
  return `${(len / PX_PER_M).toFixed(2)} m`
}

/** Número de ambientes acotados (2 cotas por ambiente). */
export function autoDimCount(dims: AutoDim[]): number {
  return dims.length
}
