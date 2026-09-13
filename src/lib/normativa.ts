// ============================================================
// JARUMY APP — Verificación normativa automática (Perú).
// RNE A.010 (condiciones de higiene y accesibilidad),
// A.040 (vivienda) y A.130 (evacuación). Lee el modelo y
// devuelve checks con estado OK/AVISO/FALLO vinculables a
// elementos del plano.
// ============================================================

import type { PlanElement } from './plan-data'
import type { RoomGeo, DoorGeo, WindowGeo } from './plan-data'
import { PX_PER_M, roomAreaM2 } from './plan-data'
import type { Mod } from './store'

export interface NormCheck {
  code: string
  norm: string
  title: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  elId?: string
}

export interface NormReport {
  checks: NormCheck[]
  summary: { ok: number; warn: number; fail: number }
}

const norm = (name: string) => `RNE ${name} (Perú)`

export function checkNormativa(
  elements: PlanElement[],
  mods: Record<string, Mod>,
): NormReport {
  const drawable = elements.filter((el) => !mods[el.id]?.deleted)
  const checks: NormCheck[] = []

  const rooms = drawable.filter((e) => e.type === 'espacio').map((e) => ({ el: e, g: e.geo as RoomGeo }))
  const doors = drawable.filter((e) => e.type === 'puerta').map((e) => ({ el: e, g: e.geo as DoorGeo }))
  const wins = drawable.filter((e) => e.type === 'ventana').map((e) => ({ el: e, g: e.geo as WindowGeo }))

  // ---------- A.010: puerta de acceso ≥ 0.90 m ----------
  const mainDoor = doors.find((d) => /principal|acceso|ingreso/i.test(d.el.name))
    ?? doors.sort((a, b) => b.g.r - a.g.r)[0]
  if (mainDoor) {
    const w = mainDoor.g.r / PX_PER_M
    checks.push({
      code: 'A.010-120',
      norm: norm('A.010'),
      title: 'Puerta de acceso accesible ≥ 0.90 m',
      status: w >= 0.90 ? 'ok' : 'fail',
      detail: w >= 0.90
        ? `Puerta de ${w.toFixed(2)} m (${mainDoor.el.name}): cumple el ancho mínimo de accesibilidad.`
        : `Puerta de ${w.toFixed(2)} m (${mainDoor.el.name}): NO cumple el mínimo de 0.90 m libre para accesibilidad (A.010 art. 12).`,
      elId: mainDoor.el.id,
    })
  } else {
    checks.push({
      code: 'A.010-120', norm: norm('A.010'), title: 'Puerta de acceso accesible ≥ 0.90 m',
      status: 'warn', detail: 'No se detectó puerta de acceso: marque la principal con "principal" en su nombre para verificarla.',
    })
  }

  // ---------- A.010: puertas interiores ≥ 0.70 m ----------
  const narrowDoors = doors.filter((d) => d.g.r / PX_PER_M < 0.70)
  checks.push({
    code: 'A.010-120b', norm: norm('A.010'), title: 'Puertas interiores ≥ 0.70 m',
    status: narrowDoors.length === 0 ? 'ok' : 'warn',
    detail: narrowDoors.length === 0
      ? `Las ${doors.length} puertas cumplen el ancho mínimo interior de 0.70 m.`
      : `${narrowDoors.length} puerta(s) menores a 0.70 m: ${narrowDoors.map((d) => `${d.el.name} (${(d.g.r / PX_PER_M).toFixed(2)} m)`).join(', ')}. Considere ampliarlas o justificarlas como vanos.`,
    elId: narrowDoors[0]?.el.id,
  })

  // ---------- A.010: baños — área ≥ 1.2 m² y lado ≥ 0.90 m ----------
  const bathRooms = rooms.filter((r) => /ba[ñn]o|sshh|servicio|higiene/i.test(r.g.name || r.el.name))
  if (bathRooms.length === 0) {
    checks.push({
      code: 'A.010-45', norm: norm('A.010'), title: 'Baños: área ≥ 1.20 m² · lado ≥ 0.90 m',
      status: 'warn', detail: 'No se detectaron baños en el modelo (nombres con "BAÑO"/"SSHH").',
    })
  } else {
    const bad = bathRooms.filter((r) => {
      const area = roomAreaM2(r.g)
      const side = Math.min(r.g.w, r.g.h) / PX_PER_M
      return area < 1.2 || side < 0.90
    })
    checks.push({
      code: 'A.010-45', norm: norm('A.010'), title: 'Baños: área ≥ 1.20 m² · lado ≥ 0.90 m',
      status: bad.length === 0 ? 'ok' : 'fail',
      detail: bad.length === 0
        ? `${bathRooms.length} baño(s) cumplen: área ≥ 1.20 m² con lado libre ≥ 0.90 m.`
        : `${bad.length} baño(s) incumplen: ${bad.map((r) => {
            const side = Math.min(r.g.w, r.g.h) / PX_PER_M
            const area = roomAreaM2(r.g)
            const why = area < 1.2 ? `área ${area.toFixed(2)} m² < 1.20` : `lado ${side.toFixed(2)} m < 0.90`
            return `${r.g.name} (${why})`
          }).join(', ')}.`,
      elId: bad[0]?.el.id,
    })
  }

  // ---------- A.040: dormitorios ≥ 7.50 m² (vivienda) ----------
  const dorms = rooms.filter((r) => /dormitorio|rec[áa]mara/i.test(r.g.name || r.el.name))
  if (dorms.length === 0) {
    checks.push({
      code: 'A.040-70', norm: norm('A.040'), title: 'Dormitorios ≥ 7.50 m² (vivienda)',
      status: 'warn', detail: 'No se detectaron dormitorios nombrados en el modelo.',
    })
  } else {
    const bad = dorms.filter((r) => roomAreaM2(r.g) < 7.5)
    checks.push({
      code: 'A.040-70', norm: norm('A.040'), title: 'Dormitorios ≥ 7.50 m² (vivienda)',
      status: bad.length === 0 ? 'ok' : 'warn',
      detail: bad.length === 0
        ? `${dorms.length} dormitorio(s) cumplen el área mínima de 7.50 m² (el principal debería ≥ 9.00 m²).`
        : `${bad.map((r) => `${r.g.name} (${roomAreaM2(r.g).toFixed(2)} m²)`).join(', ')}: por debajo de 7.50 m² — A.040 exige ampliar o justificar.`,
      elId: bad[0]?.el.id,
    })
  }

  // ---------- A.010: iluminación/ventilación ≥ 10% del área de piso ----------
  for (const r of rooms) {
    const area = roomAreaM2(r.g)
    // ventanas que tocan el borde del ambiente (mismo eje con tolerancia 8 px)
    const t = 8
    let vanoM2 = 0
    for (const w of wins) {
      const inside =
        w.g.orient === 'h'
          ? Math.abs(w.g.y - r.g.y) <= t || Math.abs(w.g.y - (r.g.y + r.g.h)) <= t
          : Math.abs(w.g.x - r.g.x) <= t || Math.abs(w.g.x - (r.g.x + r.g.w)) <= t
      if (!inside) continue
      const xOK = w.g.orient === 'h'
        ? w.g.x >= r.g.x - t && w.g.x + w.g.len <= r.g.x + r.g.w + t
        : w.g.y >= r.g.y - t && w.g.y + w.g.len <= r.g.y + r.g.h + t
      if (xOK) vanoM2 += (w.g.len / PX_PER_M) * 1.20 // alto nominal 1.20 m
    }
    const pct = area > 0 ? (vanoM2 / area) * 100 : 0
    if (vanoM2 === 0) {
      checks.push({
        code: 'A.010-80', norm: norm('A.010'), title: `Iluminación natural: ${r.g.name}`,
        status: 'fail',
        detail: `Sin vanos en el perímetro: 0% frente al 10% mínimo del área de piso (${area.toFixed(2)} m²).`,
        elId: r.el.id,
      })
    } else {
      checks.push({
        code: 'A.010-80', norm: norm('A.010'), title: `Iluminación natural: ${r.g.name}`,
        status: pct >= 10 ? 'ok' : 'warn',
        detail: pct >= 10
          ? `${vanoM2.toFixed(2)} m² de vano = ${pct.toFixed(1)}% del piso (${area.toFixed(2)} m²): cumple el 10% mínimo.`
          : `${vanoM2.toFixed(2)} m² de vano = ${pct.toFixed(1)}% del piso (${area.toFixed(2)} m²): por debajo del 10% recomendado (A.010 art. 21).`,
        elId: r.el.id,
      })
    }
  }

  // ---------- A.130: distancia a la salida ≤ 30 m ----------
  if (mainDoor) {
    const exit = { x: mainDoor.g.cx, y: mainDoor.g.cy }
    let worst: { name: string; d: number; elId: string } | null = null
    for (const r of rooms) {
      const cx = r.g.x + r.g.w / 2, cy = r.g.y + r.g.h / 2
      // distancia real aproximada: centroide → salida + semidiagonal (ruta interior)
      const d = (Math.hypot(cx - exit.x, cy - exit.y) + Math.hypot(r.g.w, r.g.h) / 2) / PX_PER_M
      if (!worst || d > worst.d) worst = { name: r.g.name, d, elId: r.el.id }
    }
    if (worst) {
      checks.push({
        code: 'A.130-25', norm: norm('A.130'), title: 'Distancia máx. a la salida ≤ 30 m',
        status: worst.d <= 30 ? 'ok' : 'fail',
        detail: worst.d <= 30
          ? `El punto más alejado (${worst.name}) está a ${worst.d.toFixed(1)} m de la puerta principal: dentro del límite de 30 m.`
          : `El punto más alejado (${worst.name}) está a ${worst.d.toFixed(1)} m: EXCEDE el máximo de 30 m — requiere una salida adicional.`,
        elId: worst.elId,
      })
    }
  }

  // ---------- resumen ----------
  const summary = {
    ok: checks.filter((c) => c.status === 'ok').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  }
  return { checks, summary }
}
