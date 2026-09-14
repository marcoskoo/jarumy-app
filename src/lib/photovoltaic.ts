// ============================================================
// JARUMY APP — Potencial fotovoltaico en techos (Perú).
// Área de techo real del plano (o huella de espacios como
// respaldo), irradiación GHI por latitud (con caso especial
// Lima/nube costera), paneles 550 W de 1.65×1.00 m, PR 0.75
// con factores de merma comentados, CO₂, ahorro y retorno.
// Todos los números se calculan. SIN librerías externas.
// ============================================================

import type { PlanElement } from '@/lib/plan-data'
import type { RoofGeo, RoomGeo } from '@/lib/plan-data'
import { PX_PER_M } from '@/lib/plan-data'
import type { Mod } from '@/lib/store'

export interface PvRow {
  label: string
  value: string
}

export interface PvReport {
  roofAreaM2: number
  availableAreaM2: number
  panelAreaM2: number
  panelCount: number
  installedKwp: number
  annualKwh: number
  monthlyKwh: number
  performanceRatio: number
  ghiAnnualKwhM2Day: number
  co2AvoidedTons: number
  savingsMonthlyPen: number
  paybackYears: number
  rows: PvRow[]
}

// ---- parámetros de diseño ----
const PANEL_W = 550          // W por panel
const PANEL_W_M = 1.65       // ancho del panel (m)
const PANEL_H_M = 1.0        // alto del panel (m)
const USABLE_RATIO = 0.5     // 50% del techo: obstrucciones, separaciones y pasillos de mantenimiento
const PR = 0.75              // performance ratio global
// PR 0.75 desglosado (comentario): 0.9 temperatura · 0.9 suciedad/ensuciamiento ·
// 0.97 pérdidas DC/cables · 0.98 inversor ≈ 0.75 combinado.
const GRID_FACTOR = 0.38     // kg CO₂ por kWh en el sistema eléctrico peruano
const TARIFF_PEN = 0.52      // S/ por kWh residencial (promedio con bloqueo)
const CAPEX_PER_KWP = 3800   // S/ por kWp instalado (residencial, 2025)

/** Irradiación global horizontal (kWh/m²·día) por |latitud|, con caso Lima. */
const ghiForLat = (lat: number): number => {
  if (Math.abs(lat + 12) <= 1) return 4.5 // Lima y costa central: nube de mayo-octubre
  const a = Math.abs(lat)
  if (a <= 5) return 4.9   // Amazonía baja
  if (a <= 15) return 4.8  // costa norte / selva alta baja
  if (a <= 25) return 5.4  // norte árido (Piura, Chiclayo)
  if (a <= 35) return 5.0
  return 4.2               // latitudes altas
}

/**
 * Informe fotovoltaico del plano para una latitud dada.
 * Los techos (elementos 'techo') aportan el área; si no hay,
 * se usa el 95% de la huella de los espacios.
 */
export function computePvReport(elements: PlanElement[], mods: Record<string, Mod>, lat: number): PvReport {
  const drawable = elements.filter((el) => !mods[el.id]?.deleted)

  // ---- área de techo (m²) ----
  let roofAreaM2 = 0
  for (const el of drawable) {
    if (el.type !== 'techo') continue
    const g = el.geo as RoofGeo
    // w×h en px guardan la envolvente proyectada; el traslado no cambia el área
    roofAreaM2 += (g.w * g.h) / (PX_PER_M * PX_PER_M)
  }
  // respaldo: huella de espacios × 0.95 (muros perimetrales)
  let floorAreaM2 = 0
  for (const el of drawable) {
    if (el.type !== 'espacio') continue
    const g = el.geo as RoomGeo
    floorAreaM2 += (g.w * g.h) / (PX_PER_M * PX_PER_M)
  }
  if (roofAreaM2 <= 0 && floorAreaM2 > 0) roofAreaM2 = floorAreaM2 * 0.95

  const availableAreaM2 = roofAreaM2 * USABLE_RATIO
  const panelAreaM2 = PANEL_W_M * PANEL_H_M // 1.65 m² por panel
  const panelCount = Math.floor(availableAreaM2 / panelAreaM2)
  const installedKwp = panelCount * (PANEL_W / 1000)

  const ghi = ghiForLat(Number.isFinite(lat) ? lat : -12)
  const annualKwh = installedKwp * ghi * 365 * PR
  const monthlyKwh = annualKwh / 12
  const co2AvoidedTons = (annualKwh * GRID_FACTOR) / 1000
  const savingsMonthlyPen = monthlyKwh * TARIFF_PEN
  const capex = installedKwp * CAPEX_PER_KWP
  const paybackYears = annualKwh * TARIFF_PEN > 0 ? capex / (annualKwh * TARIFF_PEN) : 0

  const rows: PvRow[] = [
    { label: 'Área de techo', value: `${roofAreaM2.toFixed(1)} m²` },
    { label: 'Área útil para paneles (50%)', value: `${availableAreaM2.toFixed(1)} m²` },
    { label: 'Panel fotovoltaico', value: `${PANEL_W} W · ${PANEL_W_M.toFixed(2)} × ${PANEL_H_M.toFixed(2)} m` },
    { label: 'Número de paneles', value: `${panelCount}` },
    { label: 'Potencia instalada', value: `${installedKwp.toFixed(2)} kWp` },
    { label: 'Irradiación (GHI)', value: `${ghi.toFixed(1)} kWh/m²·día` },
    { label: 'Factor de rendimiento (PR)', value: `${PR.toFixed(2)} (temperatura, suciedad, cables e inversor)` },
    { label: 'Generación anual', value: `${Math.round(annualKwh).toLocaleString('es-PE')} kWh/año` },
    { label: 'Generación mensual promedio', value: `${Math.round(monthlyKwh).toLocaleString('es-PE')} kWh/mes` },
    { label: 'CO₂ evitado al año', value: `${co2AvoidedTons.toFixed(2)} t CO₂eq` },
    { label: 'Ahorro mensual estimado', value: `S/ ${savingsMonthlyPen.toFixed(2)}` },
    { label: 'Inversión estimada (CAPEX)', value: `S/ ${Math.round(capex).toLocaleString('es-PE')}` },
    { label: 'Retorno simple', value: panelCount > 0 ? `${paybackYears.toFixed(1)} años` : 'Sin paneles: no hay área de techo útil' },
  ]

  return {
    roofAreaM2,
    availableAreaM2,
    panelAreaM2,
    panelCount,
    installedKwp,
    annualKwh,
    monthlyKwh,
    performanceRatio: PR,
    ghiAnnualKwhM2Day: ghi,
    co2AvoidedTons,
    savingsMonthlyPen,
    paybackYears,
    rows,
  }
}
