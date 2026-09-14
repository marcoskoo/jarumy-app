// ============================================================
// JARUMY APP — Análisis energético REAL calculado del modelo.
// Sustituye las constantes fijas del diálogo antiguo:
//  · Refrigeración (kWh/m²·año): CDD por zona E.020 + ganancias
//    solares por vidrio real (SHGC) + ganancias internas.
//  · Calefacción (kWh/m²·año): HDD18 de la zona + infiltración n50.
//  · Hermeticidad n50 (1/h): fugas de ventanería (perímetro),
//    puertas y tipo de muro calculadas de la geometría REAL.
//  · LEED v4.1 (estimado): scorecard dinámico — mejora % vs línea
//    base normativa, renovables (PV real), iluminación natural y
//    envolvente mejorada. SIN librerías externas.
// ============================================================

import type { PlanElement } from '@/lib/plan-data'
import type { WallGeo, RoofGeo, WindowGeo, RoomGeo, DoorGeo } from '@/lib/plan-data'
import { PX_PER_M } from '@/lib/plan-data'
import type { Mod } from '@/lib/store'

// ---------- zonas E.020: HDD (del thermal.ts) + CDD estimados ----------
// CDD18 (grados-día de refrigeración, base 18 °C) representativos por zona.
export const ZONE_CDD: Record<string, number> = {
  '1': 210,  // costa cálida seca
  '2': 60,   // costa central nublada (Lima)
  '3': 560,  // selva baja tropical
  '4': 35,   // sierra baja
  '5': 8,    // sierra alta fría
  '6': 0,    // puna
  '7': 130,  // selva alta
  '8': 340,  // costa norte semiseca
}
export const ZONE_HDD: Record<string, number> = {
  '1': 50, '2': 180, '3': 30, '4': 950, '5': 1700, '6': 2400, '7': 600, '8': 40,
}

// Irradiación solar anual sobre vidrio vertical (kWh/m²·año) por zona.
const ZONE_SOLAR_VERT: Record<string, number> = {
  '1': 1150, '2': 850, '3': 950, '4': 1450, '5': 1550, '6': 1600, '7': 1000, '8': 1250,
}

// U de ventanas por tipo de vidrio del mod.windowType (W/m²·K)
const U_WINDOW_BY_TYPE = [5.8, 3.3, 1.8] // simple · laminado 6+6 · DVH doble
const U_WINDOW_DEFAULT = 3.3
const SHGC_BY_TYPE = [0.82, 0.74, 0.6]

// ---------- fugas de envolvente a 50 Pa (m³/h por elemento) ----------
// Valores de construcción sin sellado (marco de aluminio sin doble junta,
// albañilería tarrajeada sin cámara) típicos de vivienda latinoamericana.
const Q50_WINDOW_PER_M = 3.6   // perímetro de ventana: marco sin doble junta
const Q50_DOOR = 20            // puerta exterior batiente sin burlete
const Q50_WALL_M2: Record<string, number> = {
  ladrillo: 0.9,   // albañilería tarrajeada sin cámara de aire
  concreto: 0.5,   // concreto armado
  drywall: 1.5,    // tabiquería seca (juntas)
}
const Q50_ROOF_PER_M = 2.4     // encuentro losa-muro perimetral

const RSI = 0.13, RSE = 0.04
const INTERIOR_H = 2.5 // altura libre por defecto (m) — mod.wallHeight manda por muro

export interface LeedCredit {
  name: string
  points: number
  max: number
  detail: string
}

export interface EnergyReport {
  floorAreaM2: number
  volumeM3: number
  wallAreaM2: number
  roofAreaM2: number
  glassAreaM2: number
  wfrPct: number
  uWall: number
  uWindow: number
  uRoof: number
  hdd18: number
  cdd18: number
  heatingKwhM2a: number
  coolingKwhM2a: number
  euiKwhM2a: number
  n50: number
  improvementPct: number
  leedPoints: number
  leedMedal: string
  leedCredits: LeedCredit[]
  notes: string[]
}

/** U real de un muro por espesor/tipo (tarrajeo 1.5 cm a cada lado + mampostería). */
function wallU(g: WallGeo, mod: Mod | undefined): number {
  const t = (mod?.thickness ?? g.t) / PX_PER_M // m
  const wallType = mod?.wallType
  let masonryLambda = 0.90 // ladrillo
  let masonryT = Math.max(0.07, t - 0.03)
  if (wallType === 'c175') masonryLambda = 1.75
  else if (wallType === 'dw100') {
    // drywall: 2 placas de yeso + cámara de aire
    const r = 2 * (0.0125 / 0.25) + 0.05 / 5.5
    return Math.round((1 / (RSI + r + RSE)) * 100) / 100
  } else if (wallType === 'l230') masonryLambda = 1.35
  const r = RSI + RSE + 2 * (0.015 / 1.15) + masonryT / masonryLambda
  return Math.round((1 / r) * 100) / 100
}

/** U de techo: losa aligerada 20 cm (+ aislante si losa 'aligerada'). */
function roofU(_g: RoofGeo, mod: Mod | undefined): number {
  // losa 20 cm concreto λ1.75 + cielo raso de yeso 12.5 mm
  const r = RSI + 0.20 / 1.75 + 0.0125 / 0.25 + RSE
  const base = 1 / r
  if (mod?.slabType === 'aislada') return Math.round((1 / (1 / base + 0.05 / 0.036)) * 100) / 100
  return Math.round(base * 100) / 100
}

/**
 * Informe energético del plano. `pvAnnualKwh` (opcional) proviene del
 * módulo fotovoltaico para el crédito de renovables de LEED.
 */
export function computeEnergy(
  elements: PlanElement[],
  mods: Record<string, Mod>,
  zone: string,
  pvAnnualKwh = 0,
): EnergyReport {
  const alive = elements.filter((e) => !mods[e.id]?.deleted)
  const rooms = alive.filter((e) => e.type === 'espacio').map((e) => e.geo as RoomGeo)
  const walls = alive.filter((e) => e.type === 'muro')
  const windows = alive.filter((e) => e.type === 'ventana')
  const doors = alive.filter((e) => e.type === 'puerta')
  const roofs = alive.filter((e) => e.type === 'techo')

  const notes: string[] = []

  // ---- áreas reales ----
  const floorAreaM2 = rooms.reduce((n, g) => n + (g.w / PX_PER_M) * (g.h / PX_PER_M), 0)
  const avgWallH = walls.length
    ? walls.reduce((n, e) => n + (mods[e.id]?.wallHeight || INTERIOR_H), 0) / walls.length
    : INTERIOR_H
  const wallAreaM2 = walls.reduce((n, e) => {
    const g = e.geo as WallGeo
    return n + (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / PX_PER_M) * avgWallH
  }, 0)
  const roofAreaM2 = roofs.length
    ? roofs.reduce((n, e) => {
        const g = e.geo as RoofGeo
        return n + (g.w / PX_PER_M) * (g.h / PX_PER_M)
      }, 0)
    : floorAreaM2 // sin techos dibujados: asume losa = huella
  if (!roofs.length && floorAreaM2 > 0) {
    notes.push('Sin elementos "techo": la losa se asume igual a la huella de espacios.')
  }
  const glassAreaM2 = windows.reduce((n, e) => {
    const g = e.geo as WindowGeo
    return n + (g.len / PX_PER_M) * 1.2 // alto nominal de vidrio 1.20 m
  }, 0)
  const wfrPct = floorAreaM2 > 0 ? (glassAreaM2 / floorAreaM2) * 100 : 0
  const volumeM3 = floorAreaM2 * avgWallH

  // ---- U reales (promedio ponderado por área) ----
  const uWall = wallAreaM2 > 0
    ? walls.reduce((n, e) => {
        const g = e.geo as WallGeo
        const a = (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / PX_PER_M) * avgWallH
        return n + wallU(g, mods[e.id]) * a
      }, 0) / wallAreaM2
    : 2.2
  const uWindow = glassAreaM2 > 0
    ? windows.reduce((n, e) => {
        const g = e.geo as WindowGeo
        const wt = mods[e.id]?.windowType ?? 1
        const a = (g.len / PX_PER_M) * 1.2
        return n + (U_WINDOW_BY_TYPE[wt] ?? U_WINDOW_DEFAULT) * a
      }, 0) / glassAreaM2
    : U_WINDOW_DEFAULT
  const uRoof = roofs.length
    ? roofs.reduce((n, e) => n + roofU(e.geo as RoofGeo, mods[e.id]), 0) / roofs.length
    : roofU({} as RoofGeo, undefined)

  const hdd18 = ZONE_HDD[zone] ?? 180
  const cdd18 = ZONE_CDD[zone] ?? 60
  const solarVert = ZONE_SOLAR_VERT[zone] ?? 850

  // ---- n50 real: fugas de la envolvente a 50 Pa ----
  let q50 = 0
  for (const e of windows) {
    const g = e.geo as WindowGeo
    q50 += Q50_WINDOW_PER_M * 2 * ((g.len / PX_PER_M) + 1.2)
  }
  q50 += Q50_DOOR * doors.length
  for (const e of walls) {
    const g = e.geo as WallGeo
    const a = (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / PX_PER_M) * avgWallH
    const wt = mods[e.id]?.wallType
    const kind = wt === 'c175' ? 'concreto' : wt === 'dw100' ? 'drywall' : 'ladrillo'
    q50 += Q50_WALL_M2[kind] * a
  }
  // perímetro de losa ≈ raíz del área (planta compacta)
  q50 += Q50_ROOF_PER_M * (Math.sqrt(roofAreaM2) * 4)
  const n50 = volumeM3 > 0 ? Math.round((q50 / volumeM3) * 10) / 10 : 0

  // ---- calefacción: transmisión + infiltración natural (kWh/m²·año) ----
  const qTransmitH =
    (uWall * wallAreaM2 + uRoof * roofAreaM2 + uWindow * glassAreaM2) * hdd18 * 24 / 1000
  const achNat = n50 / 20 // relación empírica n50/20 ≈ renovaciones/hora naturales
  const qInfiltrH = 0.34 * achNat * volumeM3 * hdd18 * 24 / 1000 // 0.34 Wh/m³·K
  const heatingKwhM2a = floorAreaM2 > 0
    ? Math.round(((qTransmitH + qInfiltrH) / floorAreaM2) * 10) / 10
    : 0

  // ---- refrigeración: transmisión + solar + internas (kWh/m²·año) ----
  const shgc = glassAreaM2 > 0
    ? windows.reduce((n, e) => {
        const g = e.geo as WindowGeo
        const wt = mods[e.id]?.windowType ?? 1
        return n + (SHGC_BY_TYPE[wt] ?? 0.74) * ((g.len / PX_PER_M) * 1.2)
      }, 0) / glassAreaM2
    : 0.74
  const shadeFactor = 0.72 // derrames/cortinas típicas
  const qSolarC = shgc * glassAreaM2 * solarVert * shadeFactor
  const qTransmitC =
    (uWall * wallAreaM2 + uRoof * roofAreaM2 + uWindow * glassAreaM2) * cdd18 * 24 / 1000
  // internas: iluminación+equipos 5 W/m² · 12 h/día · 365 → 21.9 kWh/m²·año
  const internalAnnual = floorAreaM2 * 21.9
  const seasonFactor = Math.min(1, 0.25 + cdd18 / 500) // fracción del año con carga
  const qInternalC = internalAnnual * 0.55 * seasonFactor // 55% cae en horario de enfriamiento
  const coolingKwhM2a = floorAreaM2 > 0
    ? Math.round(((qSolarC + qTransmitC + qInternalC) / floorAreaM2) * 10) / 10
    : 0

  // ---- EUI: demanda térmica + iluminación + equipos + agua caliente ----
  const dhwKwhM2a = 14.0 // agua caliente eléctrica: ~14 kWh/m²·año (vivienda PE)
  const lightingEquipKwhM2a = 21.9
  const euiKwhM2a = Math.round((heatingKwhM2a + coolingKwhM2a + dhwKwhM2a + lightingEquipKwhM2a) * 10) / 10

  // ---- LEED v4.1 (estimado simplificado, calculado del modelo) ----
  // Línea base normativa E.020: envolvente en el límite de la zona, vidrio
  // estándar SHGC 0.74 y n50=6. La base NO hereda propiedades del diseño.
  const zoneUWall = { '1': 1.7, '2': 1.4, '3': 1.4, '4': 1.0, '5': 0.85, '6': 0.7, '7': 1.2, '8': 1.7 }[zone] ?? 1.4
  const zoneURoof = { '1': 1.4, '2': 1.0, '3': 1.0, '4': 0.75, '5': 0.6, '6': 0.5, '7': 0.85, '8': 1.4 }[zone] ?? 1.0
  const zoneUWin = { '1': 5.8, '2': 5.8, '3': 5.8, '4': 4.0, '5': 3.5, '6': 3.5, '7': 4.5, '8': 5.8 }[zone] ?? 5.8
  const BASE_SHGC = 0.74 // vidrio estándar de la línea base (independiente del diseño)
  const baseTransmit = (zoneUWall * wallAreaM2 + zoneURoof * roofAreaM2 + zoneUWin * glassAreaM2)
  const baseHeating = (baseTransmit * hdd18 * 24 / 1000) / Math.max(1, floorAreaM2)
    + (0.34 * (6 / 20) * volumeM3 * hdd18 * 24 / 1000) / Math.max(1, floorAreaM2)
  const baseCooling = ((BASE_SHGC * glassAreaM2 * solarVert * shadeFactor)
    + (baseTransmit * cdd18 * 24 / 1000) + internalAnnual * 0.55 * seasonFactor) / Math.max(1, floorAreaM2)
  const baseEui = Math.round((baseHeating + baseCooling + dhwKwhM2a + lightingEquipKwhM2a) * 10) / 10
  const improvementPct = baseEui > 0
    ? Math.round(((baseEui - euiKwhM2a) / baseEui) * 1000) / 10
    : 0
  // EA Optimizar desempeño energético: 0 pts @ ≤10% → 18 pts @ ≥50%
  const eaPts = Math.max(0, Math.min(18, Math.round(((improvementPct - 10) / 40) * 18)))
  // EA Energía renovable: % del consumo cubierto por PV → hasta 6 pts
  const annualConsumptionKwh = euiKwhM2a * floorAreaM2
  const pvCoveragePct = annualConsumptionKwh > 0
    ? Math.min(100, Math.round((pvAnnualKwh / annualConsumptionKwh) * 1000) / 10)
    : 0
  const renewablePts = Math.round((pvCoveragePct / 100) * 6 * 2) / 2
  // EQ Iluminación natural: WFR real
  let daylightPts = 0
  if (wfrPct >= 10 && wfrPct <= 22) daylightPts = 3
  else if (wfrPct >= 8 && wfrPct <= 25) daylightPts = 2
  else if (wfrPct >= 5 && wfrPct <= 30) daylightPts = 1
  // EA Envolvente mejorada (hermeticidad)
  const envelopePts = n50 <= 1.5 ? 2 : n50 <= 2.5 ? 1 : 0
  // LT + MR + WE: dependen de datos de sitio no modelados → 0 (prerrequisitos sí asumidos)
  const leedCredits: LeedCredit[] = [
    {
      name: 'EA · Optimizar desempeño energético',
      points: eaPts, max: 18,
      detail: `${improvementPct >= 0 ? '+' : ''}${improvementPct.toFixed(1)}% vs línea base E.020 (EUI ${euiKwhM2a} vs ${baseEui} kWh/m²·año)`,
    },
    {
      name: 'EA · Energía renovable (PV techo)',
      points: renewablePts, max: 6,
      detail: pvAnnualKwh > 0
        ? `PV cubre ${pvCoveragePct.toFixed(1)}% del consumo anual (${Math.round(pvAnnualKwh)} de ${Math.round(annualConsumptionKwh)} kWh)`
        : 'Sin paneles PV — dibuje techos y evalúe el módulo fotovoltaico',
    },
    {
      name: 'EQ · Iluminación natural',
      points: daylightPts, max: 3,
      detail: `${wfrPct.toFixed(1)}% vidrio/piso real (${glassAreaM2.toFixed(1)} m² de vidrio)`,
    },
    {
      name: 'EA · Envolvente mejorada (n50)',
      points: envelopePts, max: 2,
      detail: `n50 ${n50.toFixed(1)} 1/h calculado de la fugacidad real (${Math.round(q50)} m³/h a 50 Pa / ${volumeM3.toFixed(0)} m³)`,
    },
  ]
  const leedPoints = Math.round(leedCredits.reduce((a, c) => a + c.points, 0) * 2) / 2
  const leedMedal = leedPoints >= 80 ? 'Platinum' : leedPoints >= 60 ? 'Gold'
    : leedPoints >= 50 ? 'Silver' : leedPoints >= 40 ? 'Certified' : 'Aún no alcanzable'
  notes.push(
    'LEED estimado sobre 4 créditos calculables del modelo (29 pts máx. de 110); los créditos de sitio/agua/materiales requieren datos externos.',
  )

  return {
    floorAreaM2: Math.round(floorAreaM2 * 10) / 10,
    volumeM3: Math.round(volumeM3),
    wallAreaM2: Math.round(wallAreaM2),
    roofAreaM2: Math.round(roofAreaM2),
    glassAreaM2: Math.round(glassAreaM2 * 10) / 10,
    wfrPct: Math.round(wfrPct * 10) / 10,
    uWall: Math.round(uWall * 100) / 100,
    uWindow: Math.round(uWindow * 100) / 100,
    uRoof: Math.round(uRoof * 100) / 100,
    hdd18, cdd18,
    heatingKwhM2a,
    coolingKwhM2a,
    euiKwhM2a,
    n50,
    improvementPct,
    leedPoints,
    leedMedal,
    leedCredits,
    notes,
  }
}
