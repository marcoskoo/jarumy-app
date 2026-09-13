// ============================================================
// JARUMY APP — Compartir plan (.jarumy.json) e historial de
// versiones (snapshots en localStorage, sin dependencias)
// ============================================================

import type { PlanElement, LayerDef } from './plan-data'
import type { Mod } from './store'

export interface PlanSnapshotData {
  elements: PlanElement[]
  mods: Record<string, Mod>
  layers: LayerDef[]
  gridSpacing: number
  savedAt: string
}

export interface PlanVersion {
  id: string
  name: string
  savedAt: string
  data: PlanSnapshotData
}

const LS_VERSIONS = 'jarumy_versions'
const MAX_VERSIONS = 30

function validSnapshot(x: unknown): x is PlanSnapshotData {
  const s = x as PlanSnapshotData
  return !!s && Array.isArray(s.elements) && typeof s.mods === 'object'
    && Array.isArray(s.layers) && typeof s.gridSpacing === 'number'
}

/** Serializa el plano actual a un archivo descargable .jarumy.json */
export function downloadPlanJson(data: Omit<PlanSnapshotData, 'savedAt'>) {
  if (typeof document === 'undefined') return
  const payload: PlanSnapshotData = { ...data, savedAt: new Date().toISOString() }
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `jarumy-plano-${new Date().toISOString().slice(0, 10)}.jarumy.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Valida un JSON leído de archivo; null si no es un plano Jarumy. */
export function parsePlanFile(json: unknown): PlanSnapshotData | null {
  try {
    const obj = typeof json === 'string' ? JSON.parse(json) : json
    if (!validSnapshot(obj)) return null
    return { ...obj, savedAt: obj.savedAt || new Date().toISOString() }
  } catch {
    return null
  }
}

// ---------------- historial de versiones (localStorage) ----------------

function readAll(): PlanVersion[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LS_VERSIONS)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((v) => v && v.id && validSnapshot(v.data)) : []
  } catch {
    return []
  }
}

function writeAll(vs: PlanVersion[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_VERSIONS, JSON.stringify(vs.slice(-MAX_VERSIONS)))
  } catch {
    // cuota llena: descarta la mitad más antigua y reintenta una vez
    try {
      window.localStorage.setItem(LS_VERSIONS, JSON.stringify(vs.slice(-Math.ceil(MAX_VERSIONS / 2))))
    } catch { /* sin espacio */ }
  }
}

export function listVersions(): PlanVersion[] {
  return readAll().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
}

export function saveVersion(data: Omit<PlanSnapshotData, 'savedAt'>, name?: string): PlanVersion {
  const savedAt = new Date().toISOString()
  const v: PlanVersion = {
    id: `v-${Math.random().toString(36).slice(2, 9)}`,
    name: name?.trim() || `Versión ${new Date().toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
    savedAt,
    data: { ...data, savedAt },
  }
  const all = readAll()
  all.push(v)
  writeAll(all)
  return v
}

export function deleteVersion(id: string) {
  writeAll(readAll().filter((v) => v.id !== id))
}
