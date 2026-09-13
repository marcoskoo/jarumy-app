// ============================================================
// JARUMY APP — Auto-guardado total del plano.
// Persiste el documento completo (elementos, mods, capas,
// ajustes del documento, vista y modos de trabajo) en
// localStorage, con saneamiento defensivo al cargar para
// sobrevivir a versiones antiguas o datos corruptos.
// ============================================================

import type { PlanElement, LayerDef, Phase } from './plan-data'
import type { Mod, SunSettings } from './store'
import { DEFAULT_OSNAP_MODES, type OsnapModes } from './osnap'

export const AUTOSAVE_KEY = 'jarumy_autosave'
export const AUTOSAVE_PREF = 'jarumy_autosave_on'
const SCHEMA = 1

export interface AutosaveData {
  v: number
  savedAt: number
  // documento
  elements: PlanElement[]
  mods: Record<string, Mod>
  layers: LayerDef[]
  gridSpacing: number
  nextId: number
  // ajustes del documento
  renderQuality: 'borrador' | 'ultra'
  planScale: 50 | 75 | 100
  units: 'm' | 'ft'
  dimStyle: 'lineal' | 'arq60'
  textStyle: 'standard' | 'romans' | 'arquitectural'
  clashTolerance: number
  sun: SunSettings
  // vista y modos de trabajo
  zoom: number
  panX: number
  panY: number
  renderMode: boolean
  view3D: boolean
  showGrid: boolean
  snap: boolean
  ortho: boolean
  radialEnabled: boolean
  showLayers: boolean
  showProperties: boolean
  areaLabels: boolean
  autoDims: boolean
  insertRotation: number
  phaseFilter: Phase | null
  osnap: boolean
  osnapModes: OsnapModes
}

/** Escribe el auto-guardado completo. false si el navegador lo rechaza (cuota llena / modo privado). */
export function saveAutosave(d: Omit<AutosaveData, 'v' | 'savedAt'>): boolean {
  if (typeof window === 'undefined') return false
  try {
    const payload: AutosaveData = { ...d, v: SCHEMA, savedAt: Date.now() }
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def)

/** Lee y sanea el auto-guardado; null si no existe o no es un plano Jarumy válido. */
export function loadAutosave(): AutosaveData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const x = JSON.parse(raw) as Partial<AutosaveData>
    if (!x || !Array.isArray(x.elements) || !Array.isArray(x.layers)
      || typeof x.mods !== 'object' || x.mods === null) return null
    const sun = (x.sun || {}) as Partial<SunSettings>
    return {
      v: SCHEMA,
      savedAt: num(x.savedAt, Date.now()),
      elements: x.elements,
      mods: x.mods as Record<string, Mod>,
      layers: x.layers,
      gridSpacing: num(x.gridSpacing, 60),
      nextId: Math.max(1, Math.round(num(x.nextId, 1))),
      renderQuality: x.renderQuality === 'ultra' ? 'ultra' : 'borrador',
      planScale: x.planScale === 50 || x.planScale === 100 ? x.planScale : 75,
      units: x.units === 'ft' ? 'ft' : 'm',
      dimStyle: x.dimStyle === 'arq60' ? 'arq60' : 'lineal',
      textStyle: x.textStyle === 'romans' || x.textStyle === 'arquitectural' ? x.textStyle : 'standard',
      clashTolerance: Math.min(10, Math.max(0, num(x.clashTolerance, 1))),
      sun: {
        active: bool(sun.active, false),
        lat: Math.min(90, Math.max(-90, num(sun.lat, -12))),
        day: Math.min(365, Math.max(1, Math.round(num(sun.day, 80)))),
        hour: Math.min(19, Math.max(5, num(sun.hour, 12))),
        wallH: Math.min(6, Math.max(1.5, num(sun.wallH, 2.5))),
        showPath: bool(sun.showPath, true),
      },
      zoom: Math.min(12, Math.max(0.1, num(x.zoom, 1))),
      panX: num(x.panX, 0),
      panY: num(x.panY, 0),
      renderMode: bool(x.renderMode, false),
      view3D: bool(x.view3D, false),
      showGrid: bool(x.showGrid, true),
      snap: bool(x.snap, true),
      ortho: bool(x.ortho, true),
      radialEnabled: bool(x.radialEnabled, true),
      showLayers: bool(x.showLayers, true),
      showProperties: bool(x.showProperties, true),
      areaLabels: bool(x.areaLabels, true),
      autoDims: bool(x.autoDims, true),
      insertRotation: num(x.insertRotation, 0),
      phaseFilter: x.phaseFilter === 'existente' || x.phaseFilter === 'demolicion' || x.phaseFilter === 'nueva'
        ? x.phaseFilter : null,
      osnap: bool(x.osnap, true),
      osnapModes: { ...DEFAULT_OSNAP_MODES, ...((x.osnapModes || {}) as Partial<OsnapModes>) },
    }
  } catch {
    return null
  }
}

/** Elimina la copia local del plano (al desactivar el auto-guardado). */
export function clearAutosave() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(AUTOSAVE_KEY) } catch { /* sin acceso */ }
}

/** Preferencia del usuario (activado por defecto). */
export function readAutosavePref(): boolean {
  if (typeof window === 'undefined') return true
  try { return window.localStorage.getItem(AUTOSAVE_PREF) !== 'off' } catch { return true }
}

export function writeAutosavePref(on: boolean) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(AUTOSAVE_PREF, on ? 'on' : 'off') } catch { /* sin acceso */ }
}
