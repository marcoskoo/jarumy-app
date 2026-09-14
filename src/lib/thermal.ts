// ============================================================
// JARUMY APP — Análisis térmico RNE E.020 (Perú).
// Transmitancia U de muros/techos/ventanas por capas, límites
// por zona climática (8 zonas) y riesgo de condensación
// superficial (Glaser simplificado con película interior).
// Todos los números se CALCULAN a partir de las capas; nada se
// fija por elemento. SIN librerías externas.
// ============================================================

import type { PlanElement } from '@/lib/plan-data'
import type { WallGeo, RoofGeo, WindowGeo } from '@/lib/plan-data'
import { PX_PER_M, WALL_TYPES } from '@/lib/plan-data'
import type { Mod } from '@/lib/store'

export interface ThermalLayer {
  name: string
  thicknessM: number
  lambda: number // W/m·K
}

export interface WallAssembly {
  id: string
  label: string
  layers: ThermalLayer[]
}

export interface ThermalRow {
  elementId: string
  elementName: string
  assembly: string
  thicknessCm: number
  uValue: number
  zoneLimit: number
  status: 'ok' | 'warn' | 'fail'
  suggestion: string
}

export interface ThermalZone {
  zone: string
  label: string
  wallLimit: number
  roofLimit: number
  windowLimit: number
  hdd18: number
  climate: string
}

export interface CondensationRow {
  elementName: string
  risk: 'bajo' | 'medio' | 'alto'
  dewPointC: number
  interiorC: number
  rhPct: number
  note: string
}

export interface ThermalReport {
  rows: ThermalRow[]
  worstU: number
  avgU: number
  zones: ThermalZone[]
  selectedZone: string
  condensation: CondensationRow[]
}

// ---- resistencias superficiales RNE E.020 (m²·K/W) ----
const RSI = 0.13 // película interior
const RSE = 0.04 // película exterior

// ---- condiciones interiores de diseño ----
const TI = 20      // °C interior
const RH = 60      // % HR interior

/** Tabla de zonas climáticas E.020 (8 zonas del Perú) con HDD18. */
const ZONES: ThermalZone[] = [
  { zone: '1', label: 'Zona 1 — Costa cálida seca', wallLimit: 1.7, roofLimit: 1.4, windowLimit: 5.8, hdd18: 50, climate: 'Cálido seco de costa sur' },
  { zone: '2', label: 'Zona 2 — Costa central (Lima)', wallLimit: 1.4, roofLimit: 1.0, windowLimit: 5.8, hdd18: 180, climate: 'Costa central nublada' },
  { zone: '3', label: 'Zona 3 — Selva baja', wallLimit: 1.4, roofLimit: 1.0, windowLimit: 5.8, hdd18: 30, climate: 'Tropical húmedo' },
  { zone: '4', label: 'Zona 4 — Sierra baja', wallLimit: 1.0, roofLimit: 0.75, windowLimit: 4.0, hdd18: 950, climate: 'Templado de valle andino' },
  { zone: '5', label: 'Zona 5 — Sierra alta fría', wallLimit: 0.85, roofLimit: 0.60, windowLimit: 3.5, hdd18: 1700, climate: 'Frío de altura' },
  { zone: '6', label: 'Zona 6 — Puna', wallLimit: 0.70, roofLimit: 0.50, windowLimit: 3.5, hdd18: 2400, climate: 'Muy frío de puna' },
  { zone: '7', label: 'Zona 7 — Selva alta', wallLimit: 1.2, roofLimit: 0.85, windowLimit: 4.5, hdd18: 600, climate: 'Templado húmedo de selva alta' },
  { zone: '8', label: 'Zona 8 — Costa norte', wallLimit: 1.7, roofLimit: 1.4, windowLimit: 5.8, hdd18: 40, climate: 'Cálido semiseco de costa norte' },
]

/** Temperatura exterior de diseño por zona (°C): costa 15 · sierra 7 · selva 24. */
const exteriorTempC = (zone: string): number => {
  switch (zone) {
    case '3': case '7': return 24   // selva
    case '4': case '5': case '6': return 7  // sierra / puna
    default: return 15             // costa
  }
}

/** U de un paquete de capas: U = 1/(Rsi + Σ(d/λ) + Rse). */
const uFromLayers = (layers: ThermalLayer[]): number => {
  const r = layers.reduce((acc, l) => acc + l.thicknessM / l.lambda, 0)
  return 1 / (RSI + r + RSE)
}

/** U añadiendo lana de vidrio de 50 mm (λ 0.036) por el exterior. */
const uWithInsulation = (u: number, mm = 0.05, lambda = 0.036): number =>
  1 / (1 / u + mm / lambda)

/** Punto de rocío por la fórmula de Magnus-Tetens (°C). */
const dewPointC = (tC: number, rhPct: number): number => {
  const a = 17.625, b = 243.04
  const alpha = Math.log(rhPct / 100) + (a * tC) / (b + tC)
  return (b * alpha) / (a - alpha)
}

/**
 * Ensamblajes de muro típicos del Perú con conductividades reales:
 * tarrajeo 1.15 · ladrillo soga 0.90 · ladrillo cabeza 1.35 ·
 * concreto 1.75 · placa de yeso 0.25 · lana de vidrio 0.036 W/m·K.
 */
export function wallAssemblies(): WallAssembly[] {
  return [
    {
      id: 'l140',
      label: 'Ladrillo 140 a soga + tarrajeo',
      layers: [
        { name: 'Tarrajeo interior (mortero 1:5)', thicknessM: 0.015, lambda: 1.15 },
        { name: 'Ladrillo de arcilla 140 (soga)', thicknessM: 0.14, lambda: 0.90 },
        { name: 'Tarrajeo exterior (mortero 1:5)', thicknessM: 0.015, lambda: 1.15 },
      ],
    },
    {
      id: 'l230',
      label: 'Ladrillo 230 a cabeza + tarrajeo',
      layers: [
        { name: 'Tarrajeo interior (mortero 1:5)', thicknessM: 0.015, lambda: 1.15 },
        { name: 'Ladrillo de arcilla 230 (cabeza)', thicknessM: 0.23, lambda: 1.35 },
        { name: 'Tarrajeo exterior (mortero 1:5)', thicknessM: 0.015, lambda: 1.15 },
      ],
    },
    {
      id: 'c175',
      label: 'Concreto armado 175 + tarrajeo',
      layers: [
        { name: 'Tarrajeo interior (mortero 1:5)', thicknessM: 0.015, lambda: 1.15 },
        { name: 'Concreto armado 175', thicknessM: 0.175, lambda: 1.75 },
        { name: 'Tarrajeo exterior (mortero 1:5)', thicknessM: 0.015, lambda: 1.15 },
      ],
    },
    {
      id: 'dw100',
      label: 'Drywall 100 (placa + lana de vidrio)',
      layers: [
        { name: 'Placa de yeso 12.5 mm', thicknessM: 0.0125, lambda: 0.25 },
        { name: 'Lana de vidrio 75 mm', thicknessM: 0.075, lambda: 0.036 },
        { name: 'Placa de yeso 12.5 mm', thicknessM: 0.0125, lambda: 0.25 },
      ],
    },
  ]
}

/** Ensamblajes de losa de techo (aligerada ≈ U 2.3 · maciza ≈ U 3.0 calculado). */
const ROOF_ASSEMBLIES: Record<string, { label: string; layers: ThermalLayer[] }> = {
  aligerada: {
    label: 'Losa aligerada 0.20 + tarrajeo',
    layers: [
      { name: 'Tarrajeo bajo losa', thicknessM: 0.02, lambda: 1.15 },
      { name: 'Losa aligerada 0.20 (equivalente)', thicknessM: 0.20, lambda: 0.80 },
    ],
  },
  maciza: {
    label: 'Losa maciza 0.25 + tarrajeo',
    layers: [
      { name: 'Tarrajeo bajo losa', thicknessM: 0.02, lambda: 1.15 },
      { name: 'Losa maciza de concreto 0.25', thicknessM: 0.25, lambda: 1.75 },
    ],
  },
}

/** U de ventana según tipo de vidrio (mod.windowType: 1 doble · 2 hermético PVC). */
const windowU = (m?: Mod): { u: number; label: string; thicknessCm: number } => {
  const t = m?.windowType ?? 0
  if (t === 2) return { u: 1.4, label: 'Ventana hermética PVC doble vidrio', thicknessCm: 3.6 }
  if (t === 1) return { u: 3.1, label: 'Ventana de vidrio doble', thicknessCm: 2.4 }
  return { u: 5.8, label: 'Ventana de vidrio simple', thicknessCm: 0.6 }
}

/** Ensamblaje de muro para un elemento: mod.wallType, o el más cercano por espesor. */
const assemblyFor = (el: PlanElement, m?: Mod): WallAssembly => {
  const assemblies = wallAssemblies()
  if (m?.wallType) {
    const hit = assemblies.find((a) => a.id === m.wallType)
    if (hit) return hit
  }
  // espesor del muro en m (mod.thickness manda sobre el geo)
  const g = el.geo as WallGeo
  const tM = (m?.thickness ?? g.t) / PX_PER_M
  // núcleo estructural de cada ensamblaje (ladrillo/concreto/lana)
  const cores: Record<string, number> = { l140: 0.14, l230: 0.23, c175: 0.175, dw100: 0.10 }
  let best = assemblies[0]
  let bestDiff = Infinity
  for (const a of assemblies) {
    const diff = Math.abs((cores[a.id] ?? 0) - tM)
    if (diff < bestDiff) { bestDiff = diff; best = a }
  }
  return best
}

const statusFor = (u: number, limit: number): 'ok' | 'warn' | 'fail' => {
  if (u <= limit) return 'ok'
  if (u <= limit * 1.15) return 'warn'
  return 'fail'
}

/**
 * Informe térmico completo del plano para una zona E.020:
 * filas por muro/techo/ventana, U peor/promedio, tabla de zonas y
 * riesgo de condensación superficial por tipo de muro encontrado.
 */
export function computeThermalReport(elements: PlanElement[], mods: Record<string, Mod>, zone: string): ThermalReport {
  const zn = ZONES.find((z) => z.zone === zone) ?? ZONES[0]
  const drawable = elements.filter((el) => !mods[el.id]?.deleted)
  const rows: ThermalRow[] = []

  // ---- muros ----
  for (const el of drawable) {
    if (el.type !== 'muro') continue
    const m = mods[el.id]
    const asm = assemblyFor(el, m)
    const u = uFromLayers(asm.layers)
    const limit = zn.wallLimit
    const status = statusFor(u, limit)
    const cm = Math.round(asm.layers.reduce((a, l) => a + l.thicknessM, 0) * 100)
    let suggestion: string
    if (status === 'ok') {
      suggestion = `Cumple el límite E.020 de la zona ${zn.zone} (U ≤ ${limit.toFixed(2)} W/m²K).`
    } else {
      const uNew = uWithInsulation(u)
      const pct = Math.round(((u - limit) / limit) * 100)
      suggestion = status === 'warn'
        ? `U excede el límite en ${pct}% — añadir aislante de lana de vidrio 50 mm reduce U a ${uNew.toFixed(2)}.`
        : `No cumple: añadir aislante de lana de vidrio 50 mm reduce U a ${uNew.toFixed(2)} (se exige U ≤ ${limit.toFixed(2)}).`
    }
    rows.push({
      elementId: el.id, elementName: el.name, assembly: asm.label,
      thicknessCm: cm, uValue: u, zoneLimit: limit, status, suggestion,
    })
  }

  // ---- techos ----
  for (const el of drawable) {
    if (el.type !== 'techo') continue
    const m = mods[el.id]
    const slab = ROOF_ASSEMBLIES[m?.slabType ?? 'aligerada'] ?? ROOF_ASSEMBLIES.aligerada
    const u = uFromLayers(slab.layers)
    const limit = zn.roofLimit
    const status = statusFor(u, limit)
    const cm = Math.round(slab.layers.reduce((a, l) => a + l.thicknessM, 0) * 100)
    let suggestion: string
    if (status === 'ok') {
      suggestion = `Cumple el límite de techo de la zona ${zn.zone} (U ≤ ${limit.toFixed(2)} W/m²K).`
    } else {
      const uNew = uWithInsulation(u, 0.05, 0.035) // poliestireno de 50 mm sobre losa
      suggestion = `Añadir plancha de poliestireno 50 mm (λ 0.035) sobre la losa reduce U a ${uNew.toFixed(2)} (límite ${limit.toFixed(2)}).`
    }
    rows.push({
      elementId: el.id, elementName: el.name, assembly: slab.label,
      thicknessCm: cm, uValue: u, zoneLimit: limit, status, suggestion,
    })
  }

  // ---- ventanas ----
  for (const el of drawable) {
    if (el.type !== 'ventana') continue
    const m = mods[el.id]
    const w = windowU(m)
    const limit = zn.windowLimit
    const status = statusFor(w.u, limit)
    const suggestion =
      status === 'ok'
        ? `Cumple el límite de ventanas de la zona ${zn.zone} (U ≤ ${limit.toFixed(2)} W/m²K).`
        : `Cambiar a vidrio doble (U ≈ 3.10) o ventana hermética PVC (U ≈ 1.40) — el vidrio simple no cumple en zona ${zn.zone}.`
    rows.push({
      elementId: el.id, elementName: el.name, assembly: w.label,
      thicknessCm: w.thicknessCm, uValue: w.u, zoneLimit: limit, status, suggestion,
    })
  }

  // ---- condensación superficial (Glaser simplificado) ----
  // Interior 20 °C / 60 % HR. Ts = Ti − Rsi·U·(Ti−Te): caída de temperatura
  // en la película interior. Riesgo alto si Ts < punto de rocío, medio si
  // Ts < rocío + 2 °C, bajo en el resto. Una entrada por TIPO de muro hallado.
  const te = exteriorTempC(zn.zone)
  const tdp = dewPointC(TI, RH)
  const condensation: CondensationRow[] = []
  const seenAssemblies = new Set<string>()
  for (const el of drawable) {
    if (el.type !== 'muro') continue
    const asm = assemblyFor(el, mods[el.id])
    if (seenAssemblies.has(asm.id)) continue
    seenAssemblies.add(asm.id)
    const u = uFromLayers(asm.layers)
    const ts = TI - RSI * u * (TI - te)
    const risk: CondensationRow['risk'] = ts < tdp ? 'alto' : ts < tdp + 2 ? 'medio' : 'bajo'
    const note =
      risk === 'alto'
        ? `Riesgo de condensación: la superficie interior llega a ${ts.toFixed(1)} °C, bajo el punto de rocío (${tdp.toFixed(1)} °C) con exterior a ${te} °C — aislar por el interior.`
        : risk === 'medio'
          ? `Margen estrecho: superficie interior a ${ts.toFixed(1)} °C frente a rocío ${tdp.toFixed(1)} °C — mejorar aislamiento o ventilación.`
          : `Sin condensación esperada: superficie interior a ${ts.toFixed(1)} °C, sobre el punto de rocío (${tdp.toFixed(1)} °C) con exterior a ${te} °C.`
    condensation.push({ elementName: asm.label, risk, dewPointC: tdp, interiorC: TI, rhPct: RH, note })
  }

  const worstU = rows.length ? Math.max(...rows.map((r) => r.uValue)) : 0
  const avgU = rows.length ? rows.reduce((a, r) => a + r.uValue, 0) / rows.length : 0

  return {
    rows,
    worstU: Math.round(worstU * 100) / 100,
    avgU: Math.round(avgU * 100) / 100,
    zones: ZONES,
    selectedZone: zn.zone,
    condensation,
  }
}

/** Etiqueta corta de un tipo de muro del plano (para UI). */
export const wallTypeLabel = (id: string): string => WALL_TYPES[id]?.label ?? id
