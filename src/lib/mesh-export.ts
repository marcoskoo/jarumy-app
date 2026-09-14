// ============================================================
// JARUMY APP — Exportador de mallas 3D (OBJ + STL ASCII).
// Reconstruye la misma lógica de cajas de iso3d.ts pero en un
// formato de intercambio: pisos (placa delgada), muros (espesor
// y altura reales del mod), columnas, escaleras (pasos apilados)
// y techos (caja plana a la altura de muro). Unidades en METROS,
// Y invertida (−y/60) y Z hacia arriba. Se omiten los elementos
// con mod.deleted. SIN librerías externas.
// ============================================================

import type { PlanElement } from '@/lib/plan-data'
import type { WallGeo, RoomGeo, ColGeo, StairGeo, RoofGeo } from '@/lib/plan-data'
import { PX_PER_M } from '@/lib/plan-data'
import type { Mod } from '@/lib/store'

export interface MeshResult {
  filename: string
  content: string
  bytes: number
}

export interface Mesh {
  verts: number[][]  // [x, y, z] en metros
  tris: number[][]   // triples de índices de vértice (base 0)
}

/** Altura de muro por defecto (m) — coincide con iso3d.ts / IFC. */
const WALL_H = 2.5

/**
 * Construye la malla indexada del plano: cajas extruidas por elemento.
 * Triángulos con winding exterior (normales hacia afuera).
 */
export function planToMesh(elements: PlanElement[], mods: Record<string, Mod>): Mesh {
  const verts: number[][] = []
  const tris: number[][] = []

  /** Empuja una caja (x,y = esquina inferior en planta, z = cota de base). */
  const pushBox = (x: number, y: number, z: number, w: number, d: number, h: number): void => {
    if (w <= 0 || d <= 0 || h <= 0) return
    const base = verts.length
    // 8 esquinas: 0-3 base (z), 4-7 techo (z+h)
    verts.push(
      [x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z],
      [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h],
    )
    const T = (a: number, b: number, c: number) => tris.push([base + a, base + b, base + c])
    // suelo (-z) y techo (+z)
    T(0, 2, 1); T(0, 3, 2)
    T(4, 5, 6); T(4, 6, 7)
    // caras laterales: -y, +x, +y, -x
    T(0, 1, 5); T(0, 5, 4)
    T(1, 2, 6); T(1, 6, 5)
    T(2, 3, 7); T(2, 7, 6)
    T(3, 0, 4); T(3, 4, 7)
  }

  // coordenadas de la app (px, Y-abajo) → mundo (m, Y-arriba, Z-arriba)
  const XM = (px: number) => px / PX_PER_M
  const YM = (px: number) => -px / PX_PER_M

  const drawable = elements.filter((el) => !mods[el.id]?.deleted)

  // altura real de techos: máximo de wallHeight entre muros (mínimo WALL_H)
  let topH = WALL_H
  for (const el of drawable) {
    if (el.type !== 'muro') continue
    topH = Math.max(topH, mods[el.id]?.wallHeight ?? WALL_H)
  }

  // ---- pisos: espacios como placas de 0.02 m (tope en z=0) ----
  for (const el of drawable) {
    if (el.type !== 'espacio') continue
    const g = el.geo as RoomGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const x0 = XM(g.x + tx) - 0.02
    const wM = g.w / PX_PER_M + 0.04
    // Y invertida: el borde superior en planta (menor y px) es el mayor y mundo
    const yTop = YM(g.y + ty)
    const dM = g.h / PX_PER_M + 0.04
    pushBox(x0, yTop - dM, -0.02, wM, dM, 0.02)
  }

  // ---- muros: espesor del mod, altura del mod, honrando translate ----
  for (const el of drawable) {
    if (el.type !== 'muro') continue
    const g = el.geo as WallGeo
    const m = mods[el.id]
    const t = (m?.thickness ?? g.t) / PX_PER_M
    const h = m?.wallHeight ?? WALL_H
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    if (g.x1 === g.x2) {
      // muro vertical: espesor en X, longitud en Y
      const x = XM(g.x1 + tx) - t / 2
      const yTop = YM(Math.max(g.y1, g.y2) + ty)
      const len = Math.abs(g.y2 - g.y1) / PX_PER_M
      pushBox(x, yTop - len, 0, t, len, h)
    } else {
      // muro horizontal: longitud en X, espesor en Y
      const x = XM(Math.min(g.x1, g.x2) + tx)
      const yc = YM(g.y1 + ty)
      const len = Math.abs(g.x2 - g.x1) / PX_PER_M
      pushBox(x, yc - t / 2, 0, len, t, h)
    }
  }

  // ---- columnas: cuadrado del mod.size ----
  for (const el of drawable) {
    if (el.type !== 'columna') continue
    const g = el.geo as ColGeo
    const m = mods[el.id]
    const s = (m?.size ?? g.size) / PX_PER_M
    const h = m?.wallHeight ?? WALL_H
    pushBox(XM(g.x) - s / 2, YM(g.y) - s / 2, 0, s, s, h)
  }

  // ---- escaleras: pasos apilados (como iso3d.ts) ----
  for (const el of drawable) {
    if (el.type !== 'escalera') continue
    const g = el.geo as StairGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const wM = g.w / PX_PER_M
    const run = g.h / PX_PER_M / g.steps // avance en planta por paso (m)
    for (let i = 0; i < g.steps; i++) {
      const yBpx = g.y + ty + (g.h / g.steps) * (i + 1) // borde superior del paso (px)
      const yTop = YM(yBpx)                              // mayor y mundo
      pushBox(XM(g.x + tx), yTop - run, 0, wM, run + 0.01, g.riser * (i + 1))
    }
  }

  // ---- techos: caja plana a la altura de muro (bounding box) ----
  for (const el of drawable) {
    if (el.type !== 'techo') continue
    const g = el.geo as RoofGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const x = XM(g.x + tx)
    const wM = g.w / PX_PER_M
    const yTop = YM(g.y + ty)
    const dM = g.h / PX_PER_M
    pushBox(x, yTop - dM, topH, wM, dM, 0.12) // losa plana de 12 cm sobre los muros
  }

  return { verts, tris }
}

/** Exporta la malla como Wavefront OBJ (ASCII). */
export function exportPlanObj(elements: PlanElement[], mods: Record<string, Mod>): MeshResult {
  const { verts, tris } = planToMesh(elements, mods)
  const out: string[] = [
    '# Jarumy APP — plano exportado',
    '# Vertices en metros · Z hacia arriba · Y invertida respecto del plano 2D',
    'o Jarumy_Plano',
  ]
  for (const v of verts) {
    out.push(`v ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`)
  }
  for (const t of tris) {
    out.push(`f ${t[0] + 1} ${t[1] + 1} ${t[2] + 1}`) // OBJ indexa desde 1
  }
  const content = `${out.join('\n')}\n`
  return { filename: 'jarumy-plano.obj', content, bytes: content.length }
}

/** Normal de un triángulo por el método de Newell (normalizada). */
const newellNormal = (a: number[], b: number[], c: number[]): [number, number, number] => {
  const nx = (a[1] - b[1]) * (a[2] + b[2]) + (b[1] - c[1]) * (b[2] + c[2]) + (c[1] - a[1]) * (c[2] + a[2])
  const ny = (a[2] - b[2]) * (a[0] + b[0]) + (b[2] - c[2]) * (b[0] + c[0]) + (c[2] - a[2]) * (c[0] + a[0])
  const nz = (a[0] - b[0]) * (a[1] + b[1]) + (b[0] - c[0]) * (b[1] + c[1]) + (c[0] - a[0]) * (c[1] + a[1])
  const L = Math.hypot(nx, ny, nz)
  return L < 1e-12 ? [0, 0, 0] : [nx / L, ny / L, nz / L]
}

/** Exporta la malla como STL ASCII (sólido Jarumy_Plano). */
export function exportPlanStl(elements: PlanElement[], mods: Record<string, Mod>): MeshResult {
  const { verts, tris } = planToMesh(elements, mods)
  const out: string[] = ['solid Jarumy_Plano']
  for (const t of tris) {
    const a = verts[t[0]], b = verts[t[1]], c = verts[t[2]]
    const [nx, ny, nz] = newellNormal(a, b, c)
    out.push(`  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}`)
    out.push('    outer loop')
    out.push(`      vertex ${a[0].toFixed(6)} ${a[1].toFixed(6)} ${a[2].toFixed(6)}`)
    out.push(`      vertex ${b[0].toFixed(6)} ${b[1].toFixed(6)} ${b[2].toFixed(6)}`)
    out.push(`      vertex ${c[0].toFixed(6)} ${c[1].toFixed(6)} ${c[2].toFixed(6)}`)
    out.push('    endloop')
    out.push('  endfacet')
  }
  out.push('endsolid Jarumy_Plano')
  const content = `${out.join('\n')}\n`
  return { filename: 'jarumy-plano.stl', content, bytes: content.length }
}
