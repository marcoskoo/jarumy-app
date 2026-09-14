// ============================================================
// JARUMY APP — Verificación de accesibilidad (RNE A.010 /
// A.050 y NTP 334.007). Todas las verificaciones se calculan
// desde la geometría real del plano (px/60 → m). SIN librerías.
// ============================================================

import type { PlanElement } from '@/lib/plan-data'
import type { DoorGeo, RoomGeo, FurnGeo, StairGeo } from '@/lib/plan-data'
import { PX_PER_M } from '@/lib/plan-data'
import type { Mod } from '@/lib/store'

export interface AccessCheck {
  id: string
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  elementIds: string[]
}

// severidad para combinar estados
const RANK: Record<AccessCheck['status'], number> = { ok: 0, warn: 1, fail: 2 }
const worst = (st: AccessCheck['status'][]): AccessCheck['status'] =>
  st.reduce<AccessCheck['status']>((a, s) => (RANK[s] > RANK[a] ? s : a), 'ok')

const m = (px: number) => px / PX_PER_M // px → m

/** Uso inferido de un espacio: mod.usage, o por el nombre. */
const usageOf = (el: PlanElement, mod?: Mod): string => {
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
  return ''
}

/**
 * Batería de verificaciones de accesibilidad sobre el plano.
 * Devuelve 7 checks (puertas, ambientes, pasillos, rampas,
 * escaleras, baño accesible y circulación exterior) con estado,
 * detalle en español con números concretos y ids involucrados.
 */
export function computeAccessibility(elements: PlanElement[], mods: Record<string, Mod>): AccessCheck[] {
  const drawable = elements.filter((el) => !mods[el.id]?.deleted)
  const doors = drawable.filter((el) => el.type === 'puerta')
  const rooms = drawable.filter((el) => el.type === 'espacio')
  const ramps = drawable.filter((el) => (el.type === 'mobiliario' || el.type === 'sanitario') && (el.geo as FurnGeo).kind === 'rampa')
  const stairs = drawable.filter((el) => el.type === 'escalera')
  const checks: AccessCheck[] = []

  // ---------- 1) ancho libre de puertas ----------
  {
    const ids: string[] = []
    const bad: string[] = []
    let status: AccessCheck['status'] = 'ok'
    for (const d of doors) {
      const g = d.geo as DoorGeo
      const w = m(g.r)
      if (w >= 0.9) continue
      ids.push(d.id)
      if (w < 0.8) {
        bad.push(`${d.name}: ${w.toFixed(2)} m — inaccesible (mínimo 0.90 m)`)
        status = worst([status, 'fail'])
      } else {
        bad.push(`${d.name}: ${w.toFixed(2)} m — accesible solo con aproximación frontal`)
        status = worst([status, 'warn'])
      }
    }
    checks.push({
      id: 'puertas-ancho',
      label: 'Ancho libre de puertas (A.050)',
      status: doors.length === 0 ? 'ok' : status,
      detail: doors.length === 0
        ? 'No hay puertas en el plano — nada que verificar.'
        : bad.length === 0
          ? `${doors.length} puerta(s) con ancho ≥ 0.90 m: cumplen A.050 art. 14.`
          : `${doors.length - bad.length} de ${doors.length} puertas cumplen. Revisar: ${bad.join(' · ')}.`,
      elementIds: ids,
    })
  }

  // ---------- 2) lado mínimo de ambientes ----------
  {
    const ids: string[] = []
    const bad: string[] = []
    let status: AccessCheck['status'] = 'ok'
    for (const r of rooms) {
      const usage = usageOf(r, mods[r.id])
      if (usage !== 'estar' && usage !== 'dormitorio') continue
      const g = r.geo as RoomGeo
      const side = m(Math.min(g.w, g.h))
      if (side < 1.2) {
        ids.push(r.id)
        bad.push(`${r.name}: lado mínimo ${side.toFixed(2)} m (se requieren 1.20 m)`)
        status = 'warn'
      }
    }
    const total = rooms.filter((r) => ['estar', 'dormitorio'].includes(usageOf(r, mods[r.id]))).length
    checks.push({
      id: 'ambientes-lado',
      label: 'Lado mínimo de ambientes (A.010)',
      status: total === 0 ? 'ok' : status,
      detail: total === 0
        ? 'No hay estar ni dormitorios definidos — nada que verificar.'
        : bad.length === 0
          ? `${total} ambiente(s) de estar/dormitorio con lado mínimo ≥ 1.20 m.`
          : `Ambientes con lado < 1.20 m: ${bad.join(' · ')}.`,
      elementIds: ids,
    })
  }

  // ---------- 3) ancho de pasillos ----------
  {
    const ids: string[] = []
    const bad: string[] = []
    let status: AccessCheck['status'] = 'ok'
    let total = 0
    for (const r of rooms) {
      const usage = usageOf(r, mods[r.id])
      if (usage !== 'pasillo' && !r.name.toLowerCase().includes('pasillo')) continue
      total++
      const g = r.geo as RoomGeo
      const w = m(Math.min(g.w, g.h))
      ids.push(r.id)
      if (w < 1.0) {
        bad.push(`${r.name}: ${w.toFixed(2)} m — < 1.00 m`)
        status = worst([status, 'fail'])
      } else if (w < 1.2) {
        bad.push(`${r.name}: ${w.toFixed(2)} m — entre 1.00 y 1.20 m`)
        status = worst([status, 'warn'])
      }
    }
    checks.push({
      id: 'pasillos-ancho',
      label: 'Ancho de pasillos (A.010 art. 23)',
      status: total === 0 ? 'ok' : status,
      detail: total === 0
        ? 'No hay pasillos definidos en el plano.'
        : bad.length === 0
          ? `${total} pasillo(s) con ancho ≥ 1.20 m: cumplen.`
          : `Pasillos por revisar: ${bad.join(' · ')} — A.010 exige ≥ 1.20 m (1.00 m admisible en viviendas unifamiliares).`,
      elementIds: ids,
    })
  }

  // ---------- 4) rampas ----------
  {
    const ids: string[] = []
    const bad: string[] = []
    let status: AccessCheck['status'] = 'ok'
    for (const r of ramps) {
      const g = r.geo as FurnGeo
      const w = m(g.w)
      ids.push(r.id)
      if (w < 0.9) {
        bad.push(`${r.name}: ancho ${w.toFixed(2)} m (mínimo 0.90 m)`)
        status = worst([status, 'fail'])
      }
    }
    checks.push({
      id: 'rampas',
      label: 'Rampas accesibles (A.010 art. 8)',
      status: ramps.length === 0 ? 'ok' : status,
      detail: ramps.length === 0
        ? 'No hay rampas en el plano — verificar el acceso exterior a nivel.'
        : bad.length === 0
          ? `${ramps.length} rampa(s) con ancho ≥ 0.90 m y pendiente estándar 1:12 (8.33%) — recordatorio A.010: pendiente máxima 8%.`
          : `${bad.join(' · ')}. Pendiente máxima A.010: 8% (1:12) con descansos cada 9 m.`,
      elementIds: ids,
    })
  }

  // ---------- 5) escaleras: Blondel ----------
  {
    const ids: string[] = []
    const bad: string[] = []
    let status: AccessCheck['status'] = 'ok'
    for (const s of stairs) {
      const g = s.geo as StairGeo
      const blondel = 2 * g.riser + g.tread
      ids.push(s.id)
      const cBad = g.riser > 0.175
      const hBad = g.tread < 0.25
      const bBad = blondel < 0.58 || blondel > 0.64
      if (cBad || hBad || bBad) {
        status = worst([status, 'fail'])
        bad.push(
          `${s.name}: contrahuella ${(g.riser * 100).toFixed(1)} cm (máx 17.5) · huella ${(g.tread * 100).toFixed(0)} cm (mín 25) · Blondel 2c+h = ${blondel.toFixed(2)} m (0.61 ± 0.03)`,
        )
      }
    }
    checks.push({
      id: 'escaleras-blondel',
      label: 'Escaleras — regla de Blondel (A.010 art. 10)',
      status: stairs.length === 0 ? 'ok' : status,
      detail: stairs.length === 0
        ? 'No hay escaleras en el plano — nada que verificar.'
        : bad.length === 0
          ? `${stairs.length} escalera(s) cumplen: contrahuella ≤ 0.175 m, huella ≥ 0.25 m y 2c+h = 0.61 ± 0.03 m.`
          : `No cumplen: ${bad.join(' · ')}.`,
      elementIds: ids,
    })
  }

  // ---------- 6) baño accesible ----------
  {
    const ids: string[] = []
    const bad: string[] = []
    let status: AccessCheck['status'] = 'ok'
    let total = 0
    for (const r of rooms) {
      const usage = usageOf(r, mods[r.id])
      const name = r.name.toLowerCase()
      if (usage !== 'bano' && !name.includes('baño') && !name.includes('bano')) continue
      total++
      const g = r.geo as RoomGeo
      const area = (m(g.w) * m(g.h))
      const side = m(Math.min(g.w, g.h))
      ids.push(r.id)
      if (area < 1.5 || side < 1.2) {
        bad.push(`${r.name}: ${area.toFixed(2)} m² y lado mínimo ${side.toFixed(2)} m — se busca ≥ 1.5 m² y ≥ 1.20 m para el inodoro con giro de silla de ruedas`)
        status = 'warn'
      }
    }
    checks.push({
      id: 'bano-accesible',
      label: 'Baño accesible (A.050 art. 22)',
      status: total === 0 ? 'ok' : status,
      detail: total === 0
        ? 'No se detectó baño en el plano — sin verificación de baño accesible.'
        : bad.length === 0
          ? `${total} baño(s) con área ≥ 1.5 m² y lado ≥ 1.20 m: admiten espacio libre de 1.20 m ante el inodoro.`
          : `${bad.join(' · ')}.`,
      elementIds: ids,
    })
  }

  // ---------- 7) circulación exterior (puerta principal) ----------
  {
    const principal = doors.find((d) => d.name.toLowerCase().includes('principal'))
    const ids: string[] = []
    let status: AccessCheck['status'] = 'ok'
    let detail: string
    if (!principal) {
      detail = 'No se identificó puerta principal por nombre — verificar el acceso exterior manualmente.'
    } else {
      ids.push(principal.id)
      const g = principal.geo as DoorGeo
      const w = m(g.r)
      if (ramps.length > 0) {
        detail = `La puerta principal (“${principal.name}”, ${w.toFixed(2)} m) cuenta con rampa de acceso en el plano.`
      } else {
        status = 'warn'
        detail = `La puerta principal (“${principal.name}”, ${w.toFixed(2)} m) no tiene rampa asociada — A.010 art. 8 exige rampa o acceso a nivel cuando hay desnivel.`
      }
    }
    checks.push({ id: 'circulacion-exterior', label: 'Circulación exterior (A.010)', status, detail, elementIds: ids })
  }

  return checks
}
