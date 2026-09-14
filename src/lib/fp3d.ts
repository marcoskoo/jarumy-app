// ============================================================
// JARUMY APP — Walkthrough en 1ª persona (perspectiva real).
// Cámara a altura de ojo (1.60 m) con heading controlable,
// proyección perspectiva y orden del pintor por profundidad.
// WASD para desplazarse · Q/E (o ←→) para girar.
// ============================================================

import type { PlanElement } from './plan-data'
import type { WallGeo, WindowGeo, DoorGeo, ColGeo, StairGeo, RoomGeo } from './plan-data'
import { PX_PER_M } from './plan-data'
import type { Mod } from './store'

export interface FpCam { x: number; y: number; heading: number } // metros, heading en radianes (0 = +X)

export interface FpFace {
  pts: Array<[number, number]> // ya proyectados a pantalla
  depth: number
  fill: string
}

export interface FpScene {
  faces: FpFace[]
  inside: boolean // la cámara está dentro de algún ambiente (para HUD)
  roomName: string
}

const EYE = 1.6
const FOV = (Math.PI / 180) * 70 // 70° horizontal

function shade(hex: string, k: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const c = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    .map((v) => Math.max(0, Math.min(255, Math.round(v * k))))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/** Construye la escena en perspectiva desde la cámara. W/H en px de pantalla. */
export function buildFpScene(
  elements: PlanElement[],
  mods: Record<string, Mod>,
  cam: FpCam,
  W: number,
  H: number,
): FpScene {
  const toM = (px: number) => px / PX_PER_M
  const cos = Math.cos(cam.heading)
  const sin = Math.sin(cam.heading)
  // base de cámara: forward = (cos, sin, 0); right = (sin, -cos, 0); up = z
  const focal = (W / 2) / Math.tan(FOV / 2)

  // proyecta un punto 3D (metros, y invertida para z-up) a pantalla; null si está detrás
  const project = (x: number, y: number, z: number): [number, number] | null => {
    const dx = x - cam.x
    const dy = y - cam.y
    const dz = z - EYE
    // coordenadas de cámara
    const f = dx * cos + dy * sin          // profundidad hacia adelante
    const r = dx * sin - dy * cos          // derecha
    if (f < 0.08) return null
    return [W / 2 + (r / f) * focal, H / 2 - (dz / f) * focal]
  }
  const depthOf = (x: number, y: number, z: number) =>
    (x - cam.x) * cos + (y - cam.y) * sin + z * 0.001

  interface Face { wp: Array<[number, number, number]>; fill: string; d: number }
  const faces: Face[] = []

  const pushQuad = (wp: Array<[number, number, number]>, fill: string) => {
    const d = wp.reduce((a, p) => a + depthOf(p[0], p[1], p[2]), 0) / wp.length
    if (d < -0.5) return // totalmente detrás
    faces.push({ wp, fill, d })
  }

  // pisos (placas) — siempre visibles desde arriba
  let inside = false
  let roomName = ''
  for (const el of elements) {
    if (el.type !== 'espacio' || mods[el.id]?.deleted) continue
    const g = el.geo as RoomGeo
    const tx = mods[el.id]?.translate?.[0] ?? 0
    const ty = mods[el.id]?.translate?.[1] ?? 0
    const x0 = toM(g.x + tx), y0 = toM(g.y + ty), w = toM(g.w), h = toM(g.h)
    pushQuad([[x0, y0, 0.01], [x0 + w, y0, 0.01], [x0 + w, y0 + h, 0.01], [x0, y0 + h, 0.01]], 'rgb(206,203,196)')
    if (cam.x > x0 && cam.x < x0 + w && cam.y > y0 && cam.y < y0 + h) { inside = true; roomName = g.name }
  }

  // muros: caja con 2 caras interiores visibles (según orientación) + vanos
  for (const el of elements) {
    if (el.type !== 'muro' || mods[el.id]?.deleted) continue
    const g = el.geo as WallGeo
    const m = mods[el.id]
    const t = toM(m?.thickness ?? g.t)
    const H2 = m?.wallHeight || 2.5
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const vert = g.x1 === g.x2
    if (vert) {
      const x = toM(g.x1 + tx), yA = toM(Math.min(g.y1, g.y2) + ty), yB = toM(Math.max(g.y1, g.y2) + ty)
      // cara oeste y este
      pushQuad([[x - t / 2, yA, 0], [x - t / 2, yB, 0], [x - t / 2, yB, H2], [x - t / 2, yA, H2]], 'rgb(186,183,190)')
      pushQuad([[x + t / 2, yA, 0], [x + t / 2, yB, 0], [x + t / 2, yB, H2], [x + t / 2, yA, H2]], 'rgb(176,173,180)')
      // testigos superior
      pushQuad([[x - t / 2, yB, H2], [x + t / 2, yB, H2], [x + t / 2, yA, H2], [x - t / 2, yA, H2]], 'rgb(150,147,154)')
    } else {
      const y = toM(g.y1 + ty), xA = toM(Math.min(g.x1, g.x2) + tx), xB = toM(Math.max(g.x1, g.x2) + tx)
      pushQuad([[xA, y - t / 2, 0], [xB, y - t / 2, 0], [xB, y - t / 2, H2], [xA, y - t / 2, H2]], 'rgb(186,183,190)')
      pushQuad([[xA, y + t / 2, 0], [xB, y + t / 2, 0], [xB, y + t / 2, H2], [xA, y + t / 2, H2]], 'rgb(176,173,180)')
      pushQuad([[xA, y - t / 2, H2], [xA, y + t / 2, H2], [xB, y + t / 2, H2], [xB, y - t / 2, H2]], 'rgb(150,147,154)')
    }
  }

  // vanos: puertas y ventanas como rectángulos flotantes ligeramente dentro del muro
  for (const el of elements) {
    if (mods[el.id]?.deleted) continue
    const tx = mods[el.id]?.translate?.[0] ?? 0
    const ty = mods[el.id]?.translate?.[1] ?? 0
    if (el.type === 'puerta') {
      const g = el.geo as DoorGeo
      const w = toM(g.r)
      const h = mods[el.id]?.doorHeight || 2.1
      if (g.axis === 'v') {
        const x = toM(g.cx + tx), yA = toM(g.cy + ty) - w / 2
        faces.push({ wp: [[x, yA, 0.02], [x, yA + w, 0.02], [x, yA + w, h], [x, yA, h]], fill: 'rgb(133,109,74)', d: depthOf(x, yA, 0.5) })
      } else {
        const y = toM(g.cy + ty), xA = toM(g.cx + tx) - w / 2
        faces.push({ wp: [[xA, y, 0.02], [xA + w, y, 0.02], [xA + w, y, h], [xA, y, h]], fill: 'rgb(133,109,74)', d: depthOf(xA, y, 0.5) })
      }
    } else if (el.type === 'ventana') {
      const g = el.geo as WindowGeo
      const w = toM(g.len)
      const h = 1.2, z0 = mods[el.id]?.sill ?? 0.9
      if (g.orient === 'h') {
        const y = toM(g.y + ty), xA = toM(g.x + tx)
        faces.push({ wp: [[xA, y, z0], [xA + w, y, z0], [xA + w, y, z0 + h], [xA, y, z0 + h]], fill: 'rgb(168,196,214)', d: depthOf(xA, y, z0 + 0.4) })
      } else {
        const x = toM(g.x + tx), yA = toM(g.y + ty)
        faces.push({ wp: [[x, yA, z0], [x, yA + w, z0], [x, yA + w, z0 + h], [x, yA, z0 + h]], fill: 'rgb(168,196,214)', d: depthOf(x, yA, z0 + 0.4) })
      }
    } else if (el.type === 'columna') {
      const g = el.geo as ColGeo
      const s = toM(mods[el.id]?.size ?? g.size)
      const x = toM(g.x + tx), y = toM(g.y + ty)
      pushQuad([[x - s / 2, y - s / 2, 0], [x + s / 2, y - s / 2, 0], [x + s / 2, y - s / 2, 2.5], [x - s / 2, y - s / 2, 2.5]], 'rgb(148,144,156)')
      pushQuad([[x - s / 2, y + s / 2, 0], [x + s / 2, y + s / 2, 0], [x + s / 2, y + s / 2, 2.5], [x - s / 2, y + s / 2, 2.5]], 'rgb(148,144,156)')
    } else if (el.type === 'escalera') {
      const g = el.geo as StairGeo
      const tx2 = mods[el.id]?.translate?.[0] ?? 0
      const ty2 = mods[el.id]?.translate?.[1] ?? 0
      const wM = toM(g.w), run = toM(g.h) / g.steps
      for (let i = 0; i < g.steps; i++) {
        const yA = toM(g.y + ty2) + run * i
        pushQuad([[toM(g.x + tx2), yA, g.riser * i], [toM(g.x + tx2) + wM, yA, g.riser * i], [toM(g.x + tx2) + wM, yA + run, g.riser * (i + 1)], [toM(g.x + tx2), yA + run, g.riser * (i + 1)]], 'rgb(196,192,184)')
      }
    }
  }

  // orden del pintor + proyección con recorte simple
  faces.sort((a, b) => b.d - a.d)
  const out: FpFace[] = []
  for (const f of faces) {
    const pts: Array<[number, number]> = []
    let ok = 0
    for (const p of f.wp) {
      const pr = project(p[0], p[1], p[2])
      if (pr) { pts.push(pr); ok++ } else { pts.push(pr ?? [W / 2, H / 2]) }
    }
    if (ok >= 2) out.push({ pts, depth: f.d, fill: f.fill })
  }

  return { faces: out, inside, roomName }
}

/** Mueve la cámara con detección de colisión simple (no atraviesa muros). */
export function moveFpCam(
  cam: FpCam,
  dxMeters: number,
  dyMeters: number,
  elements: PlanElement[],
  mods: Record<string, Mod>,
): FpCam {
  const toM = (px: number) => px / PX_PER_M
  let nx = cam.x + dxMeters
  let ny = cam.y + dyMeters
  const R = 0.25 // radio del "cuerpo"
  for (const el of elements) {
    if (el.type !== 'muro' || mods[el.id]?.deleted) continue
    const g = el.geo as WallGeo
    const m = mods[el.id]
    const t = toM(m?.thickness ?? g.t) / 2 + R
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    if (g.x1 === g.x2) {
      const wx = toM(g.x1 + tx)
      const yA = toM(Math.min(g.y1, g.y2) + ty) - R, yB = toM(Math.max(g.y1, g.y2) + ty) + R
      if (ny > yA && ny < yB && Math.abs(nx - wx) < t) nx = cam.x
    } else {
      const wy = toM(g.y1 + ty)
      const xA = toM(Math.min(g.x1, g.x2) + tx) - R, xB = toM(Math.max(g.x1, g.x2) + tx) + R
      if (nx > xA && nx < xB && Math.abs(ny - wy) < t) ny = cam.y
    }
  }
  // límites de la lámina
  nx = Math.max(1, Math.min(19, nx))
  ny = Math.max(1, Math.min(12.5, ny))
  return { ...cam, x: nx, y: ny }
}
