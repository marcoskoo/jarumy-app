// ============================================================
// JARUMY APP — Vista 3D axonométrica interactiva.
// Extruye muros/columnas/escaleras como cajas, levanta techos
// con pendiente real y pinta vanos sobre las caras. Cámara
// ortográfica con yaw/pitch controlables (painter's algorithm).
// ============================================================

import type { PlanElement } from './plan-data'
import type { WallGeo, WindowGeo, DoorGeo, ColGeo, StairGeo, RoofGeo } from './plan-data'
import { PX_PER_M } from './plan-data'
import type { Mod } from './store'

export interface Vec3 { x: number; y: number; z: number }

export interface Quad {
  // puntos 2D ya proyectados (moltiplicar por zoom al renderizar)
  pts: Array<[number, number]>
  fill: string
  stroke?: string
}

export interface IsoScene {
  quads: Quad[]
  cx: number  // centroide 2D de la escena (para centrar el viewBox)
  cy: number
  spanW: number
  spanH: number
  /** sombreado solar activo (dirección al sol usada) */
  sun?: { azimuth: number; elevation: number }
}

const WALL_H = 2.5

// ---- cámara ----
export interface CamParams { yaw: number; pitch: number }

function camBasis(yawDeg: number, pitchDeg: number) {
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  // dirección de vista (hacia dónde mira la cámara)
  const dir: Vec3 = {
    x: Math.cos(pitch) * Math.cos(yaw),
    y: Math.cos(pitch) * Math.sin(yaw),
    z: -Math.sin(pitch),
  }
  // derecha = up × dir (normalizado)
  let right: Vec3 = { x: -dir.y, y: dir.x, z: 0 }
  const rl = Math.hypot(right.x, right.y) || 1
  right = { x: right.x / rl, y: right.y / rl, z: 0 }
  // arriba = dir × derecha
  const up: Vec3 = {
    x: dir.y * right.z - dir.z * right.y,
    y: dir.z * right.x - dir.x * right.z,
    z: dir.x * right.y - dir.y * right.x,
  }
  return { dir, right, up }
}

function shade(hex: string, k: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const c = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    .map((v) => Math.max(0, Math.min(255, Math.round(v * k))))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

interface Box {
  x: number; y: number; w: number; d: number; h: number  // metros (x,y = esquina inferior)
  color: string
  top?: string
}

export function buildIsoScene(
  elements: PlanElement[],
  mods: Record<string, Mod>,
  cam: CamParams,
  opts: { includeFurniture?: boolean; sunDir?: Vec3; sunAzimuth?: number; sunElevation?: number; ultra?: boolean } = {},
): IsoScene {
  const drawable = elements.filter((el) => !mods[el.id]?.deleted)
  const { dir, right, up } = camBasis(cam.yaw, cam.pitch)
  const P = (x: number, y: number, z: number): [number, number] => [
    x * right.x + y * right.y + z * right.z,
    -(x * up.x + y * up.y + z * up.z),
  ]
  const depth = (x: number, y: number, z: number) => x * dir.x + y * dir.y + z * dir.z
  // luz: dirección REAL al sol (heliodón) o la fija por defecto
  const L = opts.sunDir && opts.sunDir.x * opts.sunDir.x + opts.sunDir.y * opts.sunDir.y + opts.sunDir.z * opts.sunDir.z > 1e-6
    ? opts.sunDir
    : { x: 0.45, y: 0.25, z: 0.86 }
  const Llen = Math.hypot(L.x, L.y, L.z) || 1
  const Lx = L.x / Llen, Ly = L.y / Llen, Lz = L.z / Llen
  const ambient = opts.ultra ? 0.42 : 0.52
  const gain = opts.ultra ? 0.72 : 0.55

  interface Face { pts: Array<[number, number]>; d: number; fill: string; stroke?: string }
  const faces: Face[] = []

  /** Cara por sus 4 vértices 3D: normal real (cross) + sombreado solar. */
  const pushFace = (quad: Array<[number, number, number]>, base: string, stroke?: string) => {
    // normal = (q1-q0) × (q2-q0), normalizada; se corrige para apuntar a la cámara
    const [a, b, c] = quad
    const u: Vec3 = { x: b[0] - a[0], y: b[1] - a[1], z: b[2] - a[2] }
    const v: Vec3 = { x: c[0] - a[0], y: c[1] - a[1], z: c[2] - a[2] }
    let n: Vec3 = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    }
    const nl = Math.hypot(n.x, n.y, n.z) || 1
    n = { x: n.x / nl, y: n.y / nl, z: n.z / nl }
    // orientar hacia la cámara (para que las caras visibles reciban luz positiva)
    if (n.x * dir.x + n.y * dir.y + n.z * dir.z > 0) { n = { x: -n.x, y: -n.y, z: -n.z } }
    const light = Math.max(0, n.x * Lx + n.y * Ly + n.z * Lz)
    const k = ambient + gain * light
    faces.push({
      pts: quad.map(([X, Y, Z]) => P(X, Y, Z)),
      d: quad.reduce((acc, [X, Y, Z]) => acc + depth(X, Y, Z), 0) / 4,
      fill: shade(base, k),
      stroke,
    })
  }

  const pushBox = (b: Box) => {
    // 6 caras del prisma rectangular (sombreado por normal + sol)
    const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.d, z0 = 0, z1 = b.h
    const pushFace = (quad: Array<[number, number, number]>, base: string) => {
      const [a, bb, c] = quad
      const u: Vec3 = { x: bb[0] - a[0], y: bb[1] - a[1], z: bb[2] - a[2] }
      const v: Vec3 = { x: c[0] - a[0], y: c[1] - a[1], z: c[2] - a[2] }
      let n: Vec3 = {
        x: u.y * v.z - u.z * v.y,
        y: u.z * v.x - u.x * v.z,
        z: u.x * v.y - u.y * v.x,
      }
      const nl = Math.hypot(n.x, n.y, n.z) || 1
      n = { x: n.x / nl, y: n.y / nl, z: n.z / nl }
      if (n.x * dir.x + n.y * dir.y + n.z * dir.z > 0) { n = { x: -n.x, y: -n.y, z: -n.z } }
      const light = Math.max(0, n.x * Lx + n.y * Ly + n.z * Lz)
      faces.push({
        pts: quad.map(([X, Y, Z]) => P(X, Y, Z)),
        d: quad.reduce((acc, [X, Y, Z]) => acc + depth(X, Y, Z), 0) / 4,
        fill: shade(base, ambient + gain * light),
      })
    }
    const c: Array<[number, number, number]> = []
    for (const [X, Y, Z] of [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ]) c.push([X, Y, Z])
    // top · -y · +x · +y · -x (el fondo no se ve en axonometría)
    pushFace([c[4], c[5], c[6], c[7]], b.top || b.color)
    pushFace([c[0], c[1], c[5], c[4]], b.color)
    pushFace([c[1], c[2], c[6], c[5]], b.color)
    pushFace([c[2], c[3], c[7], c[6]], b.color)
    pushFace([c[3], c[0], c[4], c[7]], b.color)
  }

  // cara con vano: rectángulo sobre una cara vertical del muro
  const pushOpening = (a: Vec3, bX: Vec3, kind: 'door' | 'window') => {
    // a = esquina inferior-izquierda del vano, bX = esquina inferior-derecha
    const h = kind === 'door' ? 2.10 : 1.20
    const z0 = kind === 'door' ? 0 : 0.90
    const z1 = z0 + h
    const quad: Array<[number, number, number]> = [
      [a.x, a.y, z0], [bX.x, bX.y, z0], [bX.x, bX.y, z1], [a.x, a.y, z1],
    ]
    const fill = kind === 'door' ? 'rgb(122,102,64)' : 'rgb(168,196,214)'
    faces.push({
      pts: quad.map(([X, Y, Z]) => P(X, Y, Z)),
      d: quad.reduce((acc, [X, Y, Z]) => acc + depth(X, Y, Z), 0) / 4 - 0.03, // delante del muro
      fill,
      stroke: 'rgba(30,35,45,0.55)',
    })
  }

  const toM = (px: number) => px / PX_PER_M

  // pisos (espacios como placas bajas)
  for (const el of drawable) {
    if (el.type !== 'espacio') continue
    const g = el.geo as { x: number; y: number; w: number; h: number }
    const m = mods[el.id]
    pushBox({
      x: toM(g.x + (m?.translate?.[0] ?? 0)) - 0.02, y: toM(g.y + (m?.translate?.[1] ?? 0)) - 0.02,
      w: toM(g.w) + 0.04, d: toM(g.h) + 0.04, h: 0.06,
      color: 'rgb(216,214,208)', top: 'rgb(233,231,225)',
    })
  }

  // muros + vanos
  for (const el of drawable) {
    if (el.type !== 'muro') continue
    const g = el.geo as WallGeo
    const m = mods[el.id]
    const t = toM(m?.thickness ?? g.t)
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const x0 = toM(Math.min(g.x1, g.x2) + tx)
    const y0 = toM(Math.min(g.y1, g.y2) + ty)
    const len = toM(Math.abs(g.x2 - g.x1) || Math.abs(g.y2 - g.y1))
    const vert = g.x1 === g.x2
    const box: Box = vert
      ? { x: toM(g.x1 + tx) - t / 2, y: y0, w: t, d: len, h: WALL_H, color: 'rgb(120,116,126)' }
      : { x: x0, y: toM(g.y1 + ty) - t / 2, w: len, d: t, h: WALL_H, color: 'rgb(120,116,126)' }
    pushBox(box)

    // vanos sobre las dos caras del muro (offset hacia afuera: painter los oculta bien)
    for (const o of drawable) {
      if (o.type === 'ventana') {
        const og = o.geo as WindowGeo
        const om = mods[o.id]
        const otx = om?.translate?.[0] ?? 0
        const oty = om?.translate?.[1] ?? 0
        const wx = toM(og.x + otx), wy = toM(og.y + oty), wl = toM(og.len)
        if (og.orient === 'h' && !vert) {
          const yN = toM(g.y1 + ty) - t / 2 - 0.02
          const yS = toM(g.y1 + ty) + t / 2 + 0.02
          pushOpening({ x: wx, y: yN, z: 0 }, { x: wx + wl, y: yN, z: 0 }, 'window')
          pushOpening({ x: wx, y: yS, z: 0 }, { x: wx + wl, y: yS, z: 0 }, 'window')
        } else if (og.orient === 'v' && vert) {
          const xW = toM(g.x1 + tx) - t / 2 - 0.02
          const xE = toM(g.x1 + tx) + t / 2 + 0.02
          pushOpening({ x: xW, y: wy, z: 0 }, { x: xW, y: wy + wl, z: 0 }, 'window')
          pushOpening({ x: xE, y: wy, z: 0 }, { x: xE, y: wy + wl, z: 0 }, 'window')
        }
      } else if (o.type === 'puerta') {
        const og = o.geo as DoorGeo
        const om2 = mods[o.id]
        const otx = om2?.translate?.[0] ?? 0
        const oty = om2?.translate?.[1] ?? 0
        const w = toM(og.r)
        if (og.axis === 'v' && vert) {
          const xW = toM(g.x1 + tx) - t / 2 - 0.02
          const xE = toM(g.x1 + tx) + t / 2 + 0.02
          const yA = toM(og.cy + oty) - w / 2
          pushOpening({ x: xW, y: yA, z: 0 }, { x: xW, y: yA + w, z: 0 }, 'door')
          pushOpening({ x: xE, y: yA, z: 0 }, { x: xE, y: yA + w, z: 0 }, 'door')
        } else if (og.axis === 'h' && !vert) {
          const yN = toM(g.y1 + ty) - t / 2 - 0.02
          const yS = toM(g.y1 + ty) + t / 2 + 0.02
          const xA = toM(og.cx + otx) - w / 2
          pushOpening({ x: xA, y: yN, z: 0 }, { x: xA + w, y: yN, z: 0 }, 'door')
          pushOpening({ x: xA, y: yS, z: 0 }, { x: xA + w, y: yS, z: 0 }, 'door')
        }
      }
    }
  }

  // columnas
  for (const el of drawable) {
    if (el.type !== 'columna') continue
    const g = el.geo as ColGeo
    const m = mods[el.id]
    const s = toM(m?.size ?? g.size)
    pushBox({ x: toM(g.x) - s / 2, y: toM(g.y) - s / 2, w: s, d: s, h: WALL_H, color: 'rgb(148,144,156)' })
  }

  // escaleras: cajas apiladas
  for (const el of drawable) {
    if (el.type !== 'escalera') continue
    const g = el.geo as StairGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const wM = toM(g.w)
    const run = toM(g.h) / g.steps
    for (let i = 0; i < g.steps; i++) {
      const yA = toM(g.y + ty) + run * i
      pushBox({ x: toM(g.x + tx), y: yA, w: wM, d: run + 0.01, h: g.riser * (i + 1), color: 'rgb(196,192,184)' })
    }
  }

  // techos paramétricos: quads inclinados
  for (const el of drawable) {
    if (el.type !== 'techo') continue
    const g = el.geo as RoofGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const x0 = toM(g.x + tx), y0 = toM(g.y + ty)
    const wM = toM(g.w), dM = toM(g.h)
    const rise = g.kind === 'plano' ? 0.08 : (g.ridge === 'h' ? dM : wM) / 2 * (g.slope / 100)
    const apexZ = WALL_H + rise
    if (g.kind === 'dos-aguas') {
      if (g.ridge === 'h') {
        const yMid = y0 + dM / 2
        // dos aguas + gable ends (normales reales → sombreado solar)
        pushFace([[x0, y0, WALL_H], [x0 + wM, y0, WALL_H], [x0 + wM, yMid, apexZ], [x0, yMid, apexZ]], 'rgb(94,108,120)')
        pushFace([[x0, y0 + dM, WALL_H], [x0 + wM, y0 + dM, WALL_H], [x0 + wM, yMid, apexZ], [x0, yMid, apexZ]], 'rgb(84,96,108)')
      } else {
        const xMid = x0 + wM / 2
        pushFace([[x0, y0, WALL_H], [xMid, y0, apexZ], [xMid, y0 + dM, apexZ], [x0, y0 + dM, WALL_H]], 'rgb(94,108,120)')
        pushFace([[x0 + wM, y0, WALL_H], [xMid, y0, apexZ], [xMid, y0 + dM, apexZ], [x0 + wM, y0 + dM, WALL_H]], 'rgb(84,96,108)')
      }
    } else {
      // plano o cuatro aguas: casquete simple
      pushFace([[x0, y0, WALL_H], [x0 + wM, y0, WALL_H], [x0 + wM, y0 + dM, WALL_H], [x0, y0 + dM, WALL_H]], 'rgb(88,100,112)')
    }
  }

  // mobiliario (cajas bajas, opcional)
  if (opts.includeFurniture) {
    for (const el of drawable) {
      if (el.type !== 'mobiliario' && el.type !== 'sanitario') continue
      const g = el.geo as { x: number; y: number; w: number; h: number }
      const m = mods[el.id]
      const tx = m?.translate?.[0] ?? 0
      const ty = m?.translate?.[1] ?? 0
      pushBox({
        x: toM(g.x + tx), y: toM(g.y + ty), w: toM(g.w), d: toM(g.h), h: 0.42,
        color: 'rgb(150,132,104)', top: 'rgb(172,152,120)',
      })
    }
  }

  // orden del pintor: lejos → cerca
  faces.sort((a, b) => a.d - b.d)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of faces) {
    for (const [x, y] of f.pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
  }
  if (!Number.isFinite(minX)) { minX = -5; minY = -5; maxX = 5; maxY = 5 }

  return {
    quads: faces.map((f) => ({ pts: f.pts, fill: f.fill, stroke: f.stroke })),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    spanW: Math.max(maxX - minX, 1),
    spanH: Math.max(maxY - minY, 1),
    sun: opts.sunAzimuth !== undefined && opts.sunElevation !== undefined
      ? { azimuth: opts.sunAzimuth, elevation: opts.sunElevation }
      : undefined,
  }
}
