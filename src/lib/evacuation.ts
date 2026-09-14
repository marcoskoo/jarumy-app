// ============================================================
// JARUMY APP — Rutas de evacuación RNE A.130 (Perú).
// Ocupancia por ambiente (mapa local igual a USAGE_OCCUPANCY
// del store para evitar importación circular), distancia al
// vano de salida más cercano, capacidad de salidas por afluencia
// y densidad de ocupación. SIN librerías externas.
// ============================================================

import type { PlanElement } from '@/lib/plan-data'
import type { RoomGeo, DoorGeo } from '@/lib/plan-data'
import { PX_PER_M } from '@/lib/plan-data'
import { MAX_TRAVEL_M, PERSONS_PER_CM, MIN_EXIT_DOOR_M } from '@/lib/rne'
import type { Mod } from '@/lib/store'

export interface EvacRoom {
  name: string
  areaM2: number
  occupants: number
  centroid: [number, number] // px (Y hacia abajo, como la app)
  nearestDoor: string
  distanceM: number
  status: 'ok' | 'fail'
}

export interface EvacDoor {
  name: string
  widthM: number
  aflowPer: number // aforo máximo por puerta (personas)
}

export interface EvacCheck {
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
}

export interface EvacuationReport {
  rooms: EvacRoom[]
  doors: EvacDoor[]
  totalOccupants: number
  totalExitWidthM: number
  maxTravelM: number
  aflowOK: boolean
  densityOK: boolean
  checks: EvacCheck[]
}

// ---- ocupantes por uso (RNE A.010 / A.130) — copia local de USAGE_OCCUPANCY ----
// Exportada para que bim-schedules use EXACTAMENTE la misma ocupancia que
// el informe de evacuación (una sola regla de negocio, cero divergencia).
export const USAGE_OCCUPANCY: Record<string, number> = {
  estar: 6, dormitorio: 2, cocina: 3, bano: 1, lavanderia: 1, comedor: 6,
  estudio: 2, garaje: 2, pasillo: 1, escalera: 1, deposito: 1,
}

/** Ocupantes de un ambiente: por uso RNE; sin uso reconocido, 1 por 6 m². */
export const occupantsFor = (usage: string, areaM2: number): number =>
  USAGE_OCCUPANCY[usage] ?? Math.max(1, Math.round(areaM2 / 6))

// distancia máxima de recorrido en vivienda (RNE A.130): 25 m — constante
// compartida con normativa.ts (src/lib/rne.ts) para que ambos módulos
// validen SIEMPRE la misma cifra
// aforo por puerta: 0.8 personas por cm de ancho libre (módulo A.130)
const PERSONS_PER_CM_LOCAL = PERSONS_PER_CM

/** Uso inferido de un espacio: mod.usage, o por el nombre. */
export const usageOf = (el: PlanElement, mod?: Mod): string => {
  if (mod?.usage) return mod.usage
  const n = `${el.name} ${(el.geo as RoomGeo).name ?? ''}`.toLowerCase()
  if (n.includes('sala') || n.includes('estar')) return 'estar'
  if (n.includes('dorm')) return 'dormitorio'
  if (n.includes('cocina')) return 'cocina'
  if (n.includes('baño') || n.includes('bano')) return 'bano'
  if (n.includes('comedor')) return 'comedor'
  if (n.includes('pasillo')) return 'pasillo'
  if (n.includes('lavander')) return 'lavanderia'
  if (n.includes('estudio')) return 'estudio'
  if (n.includes('garaje') || n.includes('garage')) return 'garaje'
  if (n.includes('deposito')) return 'deposito'
  return ''
}

/**
 * Informe de evacuación A.130 del plano: ambientes con ocupantes y
 * distancia a la puerta más cercana, puertas con aforo, y checks
 * globales (recorrido máximo, afluencia y densidad).
 */
export function computeEvacuation(elements: PlanElement[], mods: Record<string, Mod>): EvacuationReport {
  const drawable = elements.filter((el) => !mods[el.id]?.deleted)
  const roomsEls = drawable.filter((el) => el.type === 'espacio')
  const doorsEls = drawable.filter((el) => el.type === 'puerta')

  // ---- puertas: ancho y aforo ----
  const doors: EvacDoor[] = doorsEls.map((d) => {
    const g = d.geo as DoorGeo
    const widthM = g.r / PX_PER_M
    const widthCm = widthM * 100
    return { name: d.name, widthM, aflowPer: Math.round(widthCm * PERSONS_PER_CM_LOCAL) }
  })

  // ---- ambientes: área, ocupantes, puerta más cercana ----
  const rooms: EvacRoom[] = roomsEls.map((r) => {
    const g = r.geo as RoomGeo
    const areaM2 = Math.round(((g.w / PX_PER_M) * (g.h / PX_PER_M)) * 100) / 100
    const usage = usageOf(r, mods[r.id])
    // ocupancia por uso; si no hay uso reconocido se estima 1 persona por 6 m²
    const occupants = occupantsFor(usage, areaM2)
    const centroid: [number, number] = [g.x + g.w / 2, g.y + g.h / 2]

    // distancia mínima (euclidiana, en m) al borde de giro de cada puerta
    let nearestDoor = '—'
    let distanceM = 0
    let best = Infinity
    for (const d of doorsEls) {
      const dg = d.geo as DoorGeo
      const distPx = Math.hypot(dg.cx - centroid[0], dg.cy - centroid[1])
      if (distPx < best) { best = distPx; nearestDoor = d.name }
    }
    if (Number.isFinite(best)) distanceM = Math.round((best / PX_PER_M) * 100) / 100
    const status: EvacRoom['status'] =
      doorsEls.length === 0 || !Number.isFinite(best) || distanceM > MAX_TRAVEL_M ? 'fail' : 'ok'
    if (doorsEls.length === 0) nearestDoor = 'Sin puertas'

    return { name: r.name, areaM2, occupants, centroid, nearestDoor, distanceM, status }
  })

  // ---- totales ----
  const totalOccupants = rooms.reduce((a, r) => a + r.occupants, 0)
  const totalAreaM2 = rooms.reduce((a, r) => a + r.areaM2, 0)
  const totalExitWidthM = Math.round(doors.reduce((a, d) => a + d.widthM, 0) * 100) / 100
  const totalExitWidthCm = totalExitWidthM * 100
  const maxTravelM = rooms.length ? Math.max(...rooms.map((r) => r.distanceM)) : 0
  // capacidad total de salidas vs. ocupantes
  const exitCapacity = Math.round(totalExitWidthCm * PERSONS_PER_CM_LOCAL)
  const aflowOK = exitCapacity >= totalOccupants
  // densidad neta: área total por ocupante ≥ 1 m²
  const densityOK = totalOccupants === 0 || totalAreaM2 / totalOccupants >= 1

  // ---- checks globales en español ----
  const checks: EvacCheck[] = []

  // 1) recorrido máximo
  if (rooms.length === 0) {
    checks.push({ label: 'Recorrido máximo a salida', status: 'ok', detail: 'No hay ambientes definidos — nada que verificar.' })
  } else if (doors.length === 0) {
    checks.push({ label: 'Recorrido máximo a salida', status: 'fail', detail: `El plano no tiene puertas de salida: ${rooms.length} ambiente(s) sin ruta de evacuación.` })
  } else {
    const st: EvacCheck['status'] = maxTravelM > MAX_TRAVEL_M ? 'fail' : maxTravelM >= 20 ? 'warn' : 'ok'
    checks.push({
      label: 'Recorrido máximo a salida',
      status: st,
      detail: st === 'ok'
        ? `Recorrido máximo ${maxTravelM.toFixed(2)} m ≤ 25 m (A.130 vivienda) — cumple.`
        : st === 'warn'
          ? `Recorrido máximo ${maxTravelM.toFixed(2)} m: entre 20 y 25 m — próximo al límite A.130 de 25 m, prever segunda salida.`
          : `Recorrido máximo ${maxTravelM.toFixed(2)} m > 25 m — se requiere ruta de evacuación alternativa (A.130).`,
    })
  }

  // 2) afluencia por puertas
  if (doors.length === 0) {
    checks.push({ label: 'Capacidad de salidas (afluencia)', status: 'fail', detail: 'Sin puertas no hay capacidad de salida.' })
  } else {
    checks.push({
      label: 'Capacidad de salidas (afluencia)',
      status: aflowOK ? 'ok' : 'fail',
      detail: aflowOK
        ? `Ancho total de salida ${totalExitWidthM.toFixed(2)} m admite ≈ ${exitCapacity} personas (0.8 pers./cm) para ${totalOccupants} ocupantes — cumple.`
        : `Ancho total de salida ${totalExitWidthM.toFixed(2)} m admite ≈ ${exitCapacity} personas para ${totalOccupants} ocupantes — falta ${(totalOccupants - exitCapacity)} por evacuar; ampliar o añadir salidas.`,
    })
  }

  // 3) densidad de ocupación
  checks.push({
    label: 'Densidad de ocupación',
    status: densityOK ? 'ok' : 'fail',
    detail: totalOccupants === 0
      ? 'No hay ocupantes calculados — sin verificación de densidad.'
      : `${totalAreaM2.toFixed(2)} m² entre ${totalOccupants} ocupantes = ${(totalAreaM2 / totalOccupants).toFixed(2)} m²/ocupante ${densityOK ? '(≥ 1 m² — cumple)' : '(< 1 m² — no cumple A.130)'}.`,
  })

  // 4) puertas angostas (< 0.90 m reducen la capacidad real)
  const narrow = doorsEls.filter((d) => (d.geo as DoorGeo).r / PX_PER_M < MIN_EXIT_DOOR_M)
  if (doors.length > 0) {
    checks.push({
      label: 'Puertas de evacuación',
      status: narrow.length === doorsEls.length ? 'warn' : 'ok',
      detail: narrow.length === 0
        ? `${doorsEls.length} puerta(s) de salida, todas con ancho ≥ 0.90 m.`
        : `${doorsEls.length} puerta(s); ${narrow.length} con ancho < 0.90 m (${narrow.map((d) => d.name).join(' · ')}) — A.130 exige ≥ 0.90 m en puertas de salida.`,
    })
  }

  return { rooms, doors, totalOccupants, totalExitWidthM, maxTravelM, aflowOK, densityOK, checks }
}
