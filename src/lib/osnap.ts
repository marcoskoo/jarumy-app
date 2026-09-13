// ============================================================
// JARUMY APP — OSnap (referencias de objeto reales).
// Calcula puntos de imán: extremo (endpoint), punto medio
// (midpoint), centro, cuadrante e intersección — como el OSNAP
// de AutoCAD (F3). Los candidatos se precalculan cuando cambia
// el plano y la búsqueda se hace por radio en píxeles de PANTALLA
// (independiente del zoom).
// ============================================================

import type { PlanElement } from './plan-data'
import type { WallGeo, DrawGeo, ColGeo, WindowGeo, TerrainGeo, InstGeo } from './plan-data'
import type { Mod } from './store'

export type OsnapKind = 'endpoint' | 'midpoint' | 'center' | 'intersection' | 'quadrant'

export interface OsnapModes {
  endpoint: boolean
  midpoint: boolean
  center: boolean
  intersection: boolean
}

export const DEFAULT_OSNAP_MODES: OsnapModes = {
  endpoint: true, midpoint: true, center: true, intersection: true,
}

export interface OsnapCandidate { pt: [number, number]; kind: OsnapKind; elId: string }

export interface OsnapIndex {
  candidates: OsnapCandidate[]
  segments: Array<[number[], number[]]> // para intersecciones (muros + líneas)
}

const TOL = 1e-6

// intersección segmento-segmento (tolerante)
function segX(a1: number[], a2: number[], b1: number[], b2: number[]): number[] | null {
  const d1x = a2[0] - a1[0], d1y = a2[1] - a1[1], d2x = b2[0] - b1[0], d2y = b2[1] - b1[1]
  const den = d1x * d2y - d1y * d2x
  if (Math.abs(den) < 1e-9) return null
  const t = ((b1[0] - a1[0]) * d2y - (b1[1] - a1[1]) * d2x) / den
  const u = ((b1[0] - a1[0]) * d1y - (b1[1] - a1[1]) * d1x) / den
  if (t < -TOL || t > 1 + TOL || u < -TOL || u > 1 + TOL) return null
  return [a1[0] + d1x * t, a1[1] + d1y * t]
}

/**
 * Construye el índice de candidatos de OSnap para el plano actual.
 * - endpoint: extremos de muro, vértices de polilíneas/dibujos/terreno/instalaciones, extremos de ventana
 * - midpoint: puntos medios de cada segmento recto
 * - center: centros de círculo/elipse/cota-rad y columnas
 * - quadrant: 4 cuadrantes de círculos
 * - intersection: cruces entre muros y líneas (precalculado)
 */
export function buildOsnapIndex(elements: PlanElement[], mods: Record<string, Mod>): OsnapIndex {
  const candidates: OsnapCandidate[] = []
  const segments: Array<[number[], number[]]> = []
  const push = (x: number, y: number, kind: OsnapKind, elId: string) => {
    if (Number.isFinite(x) && Number.isFinite(y)) candidates.push({ pt: [x, y], kind, elId })
  }

  for (const el of elements) {
    if (mods[el.id]?.deleted) continue
    const tx = mods[el.id]?.translate?.[0] ?? 0
    const ty = mods[el.id]?.translate?.[1] ?? 0
    const g = el.geo as unknown as Record<string, unknown>

    if (el.type === 'muro') {
      const w = g as unknown as WallGeo
      push(w.x1 + tx, w.y1 + ty, 'endpoint', el.id)
      push(w.x2 + tx, w.y2 + ty, 'endpoint', el.id)
      push((w.x1 + w.x2) / 2 + tx, (w.y1 + w.y2) / 2 + ty, 'midpoint', el.id)
      segments.push([[w.x1 + tx, w.y1 + ty], [w.x2 + tx, w.y2 + ty]])
      continue
    }

    if (el.type === 'columna') {
      const c = g as unknown as ColGeo
      push(c.x + tx, c.y + ty, 'center', el.id)
      continue
    }

    if (el.type === 'ventana') {
      const wg = g as unknown as WindowGeo
      const x = wg.x + tx, y = wg.y + ty
      if (wg.orient === 'h') {
        push(x, y, 'endpoint', el.id); push(x + wg.len, y, 'endpoint', el.id)
        push(x + wg.len / 2, y, 'midpoint', el.id)
      } else {
        push(x, y, 'endpoint', el.id); push(x, y + wg.len, 'endpoint', el.id)
        push(x, y + wg.len / 2, 'midpoint', el.id)
      }
      continue
    }

    if (el.type === 'terreno') {
      const tg = g as unknown as TerrainGeo
      tg.pts.forEach((p) => push(p[0] + tx, p[1] + ty, 'endpoint', el.id))
      continue
    }

    if (el.type === 'instalacion') {
      const ig = g as unknown as InstGeo
      ig.pts.forEach((p) => push(p[0] + tx, p[1] + ty, 'endpoint', el.id))
      continue
    }

    if (el.type === 'dibujo') {
      const d = g as unknown as DrawGeo
      const pts = (d.pts || []).map((p) => [p[0] + tx, p[1] + ty] as number[])
      if (pts.length) {
        if (d.kind === 'circulo') {
          const [cx, cy] = pts[0]
          const r = d.r || 40
          push(cx, cy, 'center', el.id)
          push(cx + r, cy, 'quadrant', el.id); push(cx - r, cy, 'quadrant', el.id)
          push(cx, cy + r, 'quadrant', el.id); push(cx, cy - r, 'quadrant', el.id)
        } else if (d.kind === 'elipse') {
          const [cx, cy] = pts[0]
          push(cx, cy, 'center', el.id)
        } else if (d.kind === 'cota-rad') {
          push(pts[0][0], pts[0][1], 'center', el.id)
          if (pts[1]) push(pts[1][0], pts[1][1], 'endpoint', el.id)
        } else {
          // línea / polilinea / rectángulo / arco / spline / nube / hatch: vértices + medios
          pts.forEach((p) => push(p[0], p[1], 'endpoint', el.id))
          for (let i = 1; i < pts.length; i++) {
            push((pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2, 'midpoint', el.id)
            if (d.kind === 'linea') segments.push([pts[i - 1], pts[i]])
          }
        }
      }
    }
  }

  // intersecciones muro-muro, muro-línea y línea-línea (precalculadas)
  const seen = new Set<string>()
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const ip = segX(segments[i][0], segments[i][1], segments[j][0], segments[j][1])
      if (ip) {
        const key = `${ip[0].toFixed(1)}|${ip[1].toFixed(1)}`
        if (!seen.has(key)) { seen.add(key); candidates.push({ pt: [ip[0], ip[1]], kind: 'intersection', elId: `${i}:${j}` }) }
      }
    }
  }

  return { candidates, segments }
}

const PRIORITY: Record<OsnapKind, number> = {
  endpoint: 0, intersection: 1, midpoint: 2, center: 3, quadrant: 4,
}

/**
 * Busca el candidato más cercano al cursor dentro de `radiusPx` (en píxeles
 * de pantalla). Devuelve null si no hay imán o si los modos lo excluyen.
 */
export function findOsnap(
  index: OsnapIndex,
  cursorSvg: [number, number],
  zoom: number,
  modes: OsnapModes,
  radiusScreenPx = 14,
): OsnapCandidate | null {
  if (!index.candidates.length) return null
  const r = radiusScreenPx / Math.max(0.05, zoom) // radio en px de plano
  let best: OsnapCandidate | null = null
  let bestScore = Infinity
  for (const c of index.candidates) {
    if (!modes[c.kind]) continue
    const d = Math.hypot(c.pt[0] - cursorSvg[0], c.pt[1] - cursorSvg[1])
    if (d > r) continue
    // prioridad por tipo (extremo > intersección > medio > centro > cuadrante) desempatada por distancia
    const score = d + PRIORITY[c.kind] * r * 0.35
    if (score < bestScore) { bestScore = score; best = c }
  }
  return best
}

// glifos del indicador OSnap por tipo (como AutoCAD)
export const OSNAP_GLYPHS: Record<OsnapKind, { shape: 'square' | 'triangle' | 'circle' | 'cross' | 'diamond'; label: string }> = {
  endpoint: { shape: 'square', label: 'extremo' },
  midpoint: { shape: 'triangle', label: 'medio' },
  center: { shape: 'circle', label: 'centro' },
  intersection: { shape: 'cross', label: 'intersección' },
  quadrant: { shape: 'diamond', label: 'cuadrante' },
}
