'use client'

import { create } from 'zustand'
import type { PlanElement, LayerDef, StairGeo, RoofGeo, Phase, DrawGeo, WallGeo, DoorGeo, WindowGeo, RoomGeo, ColGeo, OpenGeo, TextGeo, FurnGeo, InstGeo, LevelDef } from '@/lib/plan-data'
import {
  BASE_ELEMENTS, LAYERS, BLOCK_LIBRARY, VIEW_W, VIEW_H, WALL_TYPES, PX_PER_M, glazingOf,
  HATCH_PATTERNS, offsetPolyline, segIntersect, sampleCatmullRom, DEFAULT_LEVELS, levelOf,
} from '@/lib/plan-data'
import type { ToolAction } from '@/lib/tools-data'
import { MATERIAL_COLORS, ROOM_FILLS, LINE_COLORS } from '@/lib/tools-data'
import { dayOfYear } from '@/lib/solar'
import {
  downloadPlanJson, parsePlanFile, listVersions, saveVersion, deleteVersion, type PlanSnapshotData,
} from '@/lib/plan-files'
import { saveAutosave, loadAutosave, clearAutosave, readAutosavePref, writeAutosavePref } from './autosave'
import { DEFAULT_OSNAP_MODES, type OsnapModes } from './osnap'
import type { ImageGeo, PinGeo } from './plan-data'

// ---------------- tipos ----------------

export interface Mod {
  rotation?: number
  flipX?: boolean
  flipY?: boolean
  scale?: number
  thickness?: number
  material?: string
  fill?: string
  precision?: number
  textHeight?: number
  swingFlip?: boolean
  hingeFlip?: boolean
  windowType?: number
  glazing?: number // tipo de vidrio (0 simple · 1 laminado 6+6 · 2 DVH aire · 3 DVH low-E) — ver GLAZING_TYPES
  size?: number
  deleted?: boolean
  colorLine?: string
  weight?: number
  dimOverride?: string
  justify?: 'start' | 'middle' | 'end'
  translate?: [number, number]
  wallType?: string
  phase?: Phase
  // --- parámetros BIM reales ---
  wallHeight?: number      // altura de muro (m)
  doorHeight?: number      // alto de puerta (m)
  doorKind?: 'simple' | 'corrediza' | 'doble'
  sill?: number            // antepecho de ventana (m)
  usage?: string           // uso del espacio (estar/dormitorio/cocina...)
  slabType?: string        // tipo de losa (aligerada/maciza)
  pipeDia?: number         // Ø de tubería (mm)
}

export interface HoverInfo {
  id: string
  type: string
  name: string
  layer: string
  cx: number // posición del cursor dentro del contenedor (px)
  cy: number
}

export interface ConsoleLine {
  text: string
  kind: 'cmd' | 'out' | 'err'
}

export interface SunSettings {
  active: boolean
  lat: number       // grados; negativo = hemisferio sur (Lima = -12)
  day: number       // día del año 1-365
  hour: number      // hora solar local (5-19, con decimales)
  wallH: number     // altura de muros en metros (para proyectar sombras)
  showPath: boolean // dibujar trayectorias de solsticios/equinoccio
}

interface Snapshot {
  elements: PlanElement[]
  mods: Record<string, Mod>
  gridSpacing: number
  levels?: LevelDef[]
}

interface JarumyState {
  // plan
  elements: PlanElement[]
  mods: Record<string, Mod>
  layers: LayerDef[]
  gridSpacing: number
  nextId: number
  // multinivel (Ola 8)
  levels: LevelDef[]
  activeLevel: number
  // vista
  zoom: number
  panX: number
  panY: number
  renderMode: boolean
  view3D: boolean
  showGrid: boolean
  snap: boolean
  ortho: boolean
  // ui
  hovered: HoverInfo | null
  selectedId: string | null
  selectedIds: string[]          // multi-selección (marquee / Ctrl+clic)
  activeTab: string
  drawTool: string | null
  drawPts: number[][]
  cursorSvg: [number, number]
  radialEnabled: boolean
  showLayers: boolean
  showProperties: boolean
  areaLabels: boolean
  autoDims: boolean
  insertRotation: number
  // osnap (referencias de objeto reales — F3)
  osnap: boolean
  osnapModes: OsnapModes
  // voz (Web Speech API)
  voiceActive: boolean
  // portapapeles interno de elementos (Ctrl+C/V/X)
  clipboard: { elements: PlanElement[]; mods: Record<string, Mod> } | null
  // prompt in-app (reemplaza window.prompt)
  promptState: { label: string; def: string; resolve: (v: string | null) => void } | null
  // nube: plano sincronizado en el servidor
  cloud: {
    planId: string | null
    planName: string
    projectName: string
    status: 'off' | 'idle' | 'saving' | 'saved' | 'error'
    lastSyncAt: number | null
    revision: number
    dirty: boolean
  }
  // sesión colaborativa en vivo (socket.io)
  collab: {
    active: boolean
    token: string | null
    permission: 'view' | 'edit'
    peers: string[]
    user: string
    messages: Array<{ user: string; text: string; at: number }>
  }
  // guard: aplicando un plano remoto (evita eco en el puente de sync)
  applyingRemote: boolean
  sun: SunSettings
  dialog: 'schedule' | 'catalog' | 'energy' | 'clash' | 'blocks' | 'pdf'
    | 'elevations' | 'iso3d' | 'normativa' | 'metrados' | 'versions' | 'escalera' | 'techo' | 'share'
    | 'quickselect' | 'lighting' | 'acoustic' | 'phases' | 'structural' | 'collab' | 'familias'
    | 'blockeditor' | 'cloud' | 'thermal' | 'accesibilidad' | 'evacuacion' | 'fotovoltaico'
    | 'aiplan' | 'ainorma' | 'walkthrough' | 'underlay' | null
  phaseFilter: Phase | null
  adminOpen: boolean
  fitTick: number
  // --- ajustes reales del documento ---
  renderQuality: 'borrador' | 'ultra'    // calidad de vista render
  planScale: 50 | 75 | 100               // escala de lámina 1:50 · 1:75 · 1:100
  units: 'm' | 'ft'                      // unidades del dibujo
  dimStyle: 'lineal' | 'arq60'           // estilo de cota (flechas vs oblicuas)
  textStyle: 'standard' | 'romans' | 'arquitectural'
  scheduleTab: 'espacios' | 'muros' | 'puertas' | 'ventanas' | 'sanitarios' | 'mobiliario'
  clashTolerance: number                 // tolerancia de colisiones (cm)
  // consola
  consoleLines: ConsoleLine[]
  // historial
  undoStack: Snapshot[]
  redoStack: Snapshot[]
  // auto-guardado (persistencia total del plano)
  autosaveOn: boolean
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  autosaveAt: number | null
  // acciones
  setHovered: (h: HoverInfo | null) => void
  setSelected: (id: string | null) => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  selectAll: () => void
  copySelection: () => void
  cutSelection: () => void
  pasteClipboard: (at?: [number, number]) => void
  deleteSelection: () => void
  nudgeSelection: (dx: number, dy: number) => void
  rotateSelectionBy: (deg: number) => void
  requestPrompt: (label: string, def?: string) => Promise<string | null>
  answerPrompt: (value: string | null) => void
  toggleOsnap: () => void
  setOsnapModes: (m: Partial<OsnapModes>) => void
  insertUnderlay: (src: string, w: number, h: number, name: string, kind: 'imagen' | 'pdf', page?: number) => void
  addPinReply: (pinId: string, text: string) => void
  importElements: (els: PlanElement[], source?: string, mods?: Record<string, Mod>) => void
  updateElementGeo: (id: string, mutate: (geo: Record<string, unknown>) => Record<string, unknown>) => void
  beginHistory: () => void
  setCloud: (p: Partial<JarumyState['cloud']>) => void
  setCollab: (p: Partial<JarumyState['collab']>) => void
  applyRemotePlan: (data: { elements: PlanElement[]; mods: Record<string, Mod>; layers?: unknown; gridSpacing?: number }) => void
  setActiveTab: (t: string) => void
  armDraw: (tool: string | null) => void
  addDrawPoint: (p: number[]) => void
  finishPolyline: () => void
  cancelDraw: () => void
  setPhaseFilter: (p: Phase | null) => void
  setCursorSvg: (p: [number, number]) => void
  setView: (v: Partial<{ zoom: number; panX: number; panY: number }>) => void
  zoomBy: (f: number, cx?: number, cy?: number) => void
  fitView: () => void
  toggle: (k: 'renderMode' | 'view3D' | 'showGrid' | 'snap' | 'ortho' | 'radialEnabled' | 'showLayers' | 'showProperties' | 'areaLabels' | 'autoDims') => void
  setDialog: (d: JarumyState['dialog']) => void
  setScheduleTab: (t: JarumyState['scheduleTab']) => void
  setClashTolerance: (v: number) => void
  setSetting: (k: 'renderQuality' | 'planScale' | 'units' | 'dimStyle' | 'textStyle', v: string | number) => void
  setAdminOpen: (v: boolean) => void
  pushConsole: (l: ConsoleLine) => void
  rotateInsert: () => void
  setSun: (p: Partial<SunSettings>) => void
  applyEffect: (elId: string | null, effect: string, value?: string | number) => void
  runGlobal: (g: string, elId?: string | null) => void
  executeAction: (action: ToolAction, elId?: string | null) => void
  insertBlock: (kind: string, x: number, y: number) => void
  insertStair: (geo: StairGeo) => void
  insertRoof: (geo: RoofGeo) => void
  insertPin: (x: number, y: number, text: string) => void
  cleanJoins: () => void
  exportShareFile: () => void
  importShareFile: (json: unknown) => void
  savePlanVersion: (name: string) => void
  deletePlanVersion: (id: string) => void
  restorePlanVersion: (data: PlanSnapshotData) => void
  setLayerVisible: (id: string, v: boolean) => void
  isolateLayer: (id: string) => void
  runCommand: (raw: string) => void
  undo: () => void
  redo: () => void
  newPlan: () => void
  walkthrough: () => void
  toggleAutosave: () => void
  restoreAutosave: () => boolean
  // multinivel (Ola 8)
  setActiveLevel: (id: number) => void
  addLevel: (name?: string, elev?: number, height?: number) => void
  updateLevel: (id: number, patch: Partial<Omit<LevelDef, 'id'>>) => void
  deleteLevel: (id: number) => void
  duplicateLevel: (id: number) => void
  moveSelectionToLevel: (levelId: number) => void
}

// ---------------- utilidades ----------------

const uid = () => `usr-${Math.random().toString(36).slice(2, 9)}`

const normalize2 = (v: number[]): number[] => {
  const l = Math.hypot(v[0], v[1])
  return l < 1e-9 ? [0, 0] : [v[0] / l, v[1] / l]
}

// usos RNE A.010 — ocupantes por ambiente (carga real para normativa/estructural)
export const USAGE_LABELS: Record<string, string> = {
  estar: 'Estar / convivencia', dormitorio: 'Dormitorio', cocina: 'Cocina', bano: 'Baño',
  lavanderia: 'Lavandería', comedor: 'Comedor', estudio: 'Estudio', garaje: 'Garaje',
  pasillo: 'Pasillo / circulación', escalera: 'Escalera', deposito: 'Depósito',
}
export const USAGE_OCCUPANCY: Record<string, number> = {
  estar: 6, dormitorio: 2, cocina: 3, bano: 1, lavanderia: 1, comedor: 6,
  estudio: 2, garaje: 2, pasillo: 1, escalera: 1, deposito: 1,
}

// ---------------- cuantificación REAL por elemento ----------------
// Metrados normados Perú (S10): ladrillo king kong 18 huecos de soga = 37.4 und/m²,
// mortero 0.03 m³/m², acero ~160 kg/m³ en columnas, albañilería según espesor real.
export function quantifyElement(el: PlanElement, mod: Mod): string[] {
  const out: string[] = []
  const th = (mod.thickness ?? (el.geo as WallGeo).t ?? 12) / PX_PER_M
  const H = mod.wallHeight || 2.5
  if (el.type === 'muro') {
    const g = el.geo as WallGeo
    const L = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / PX_PER_M
    const area = L * H
    const vol = area * th
    out.push(`CANTIDADES · ${el.name.toUpperCase()} — L ${L.toFixed(2)} m · espesor ${(th * 100).toFixed(0)} cm · altura ${H.toFixed(2)} m`)
    out.push(`  Área de muro: ${area.toFixed(2)} m² · Volumen de albañilería: ${vol.toFixed(2)} m³`)
    out.push(`  Ladrillo king kong 18 huecos (de soga): ${(area * 37.4).toFixed(0)} und · Mortero 1:5: ${(area * 0.03).toFixed(2)} m³`)
  } else if (el.type === 'puerta') {
    const g = el.geo as DoorGeo
    const w = g.r / PX_PER_M
    const h = mod.doorHeight || 2.1
    out.push(`CANTIDADES · ${el.name.toUpperCase()} — ${w.toFixed(2)} × ${h.toFixed(2)} m (${mod.doorKind || 'simple'})`)
    out.push(`  Área: ${(w * h).toFixed(2)} m² · 1 unidad · herrajes 1 juego · marco 2.70 ml`)
  } else if (el.type === 'ventana') {
    const g = el.geo as WindowGeo
    const w = g.len / PX_PER_M
    const h = 1.2
    const area = w * h
    const sill = mod.sill ?? 0.9
    const glass = glazingOf(mod)
    out.push(`CANTIDADES · ${el.name.toUpperCase()} — ${w.toFixed(2)} × ${h.toFixed(2)} m · antepecho ${sill.toFixed(2)} m`)
    out.push(`  Área: ${area.toFixed(2)} m² · ${glass.label}: ${(area * 0.85).toFixed(2)} m² · Perfil: ${(w * 2 + h * 2).toFixed(2)} ml · U ${glass.u} W/m²K`)
  } else if (el.type === 'columna') {
    const g = el.geo as ColGeo
    const s = (mod.size ?? g.size) / PX_PER_M
    out.push(`CANTIDADES · ${el.name.toUpperCase()} — ${s.toFixed(2)} × ${s.toFixed(2)} m · altura ${H.toFixed(2)} m`)
    out.push(`  Concreto f'c 210: ${(s * s * H).toFixed(3)} m³ · Acero ~${(s * s * H * 160).toFixed(1)} kg (160 kg/m³) · encofrado ${(4 * s * H).toFixed(2)} m²`)
  } else if (el.type === 'espacio') {
    const g = el.geo as RoomGeo
    const w = g.w / PX_PER_M, h = g.h / PX_PER_M
    out.push(`CANTIDADES · ${el.name.toUpperCase()} — ${w.toFixed(2)} × ${h.toFixed(2)} m · uso ${USAGE_LABELS[mod.usage || ''] || 'sin asignar'}`)
    out.push(`  Área: ${(w * h).toFixed(2)} m² · Piso: ${(w * h).toFixed(2)} m² · zócalo: ${(2 * (w + h)).toFixed(2)} ml · cielo raso: ${(w * h).toFixed(2)} m²`)
  } else if (el.type === 'techo') {
    const g = el.geo as RoofGeo
    const w = g.w / PX_PER_M, h = g.h / PX_PER_M
    const area = w * h
    const e = mod.slabType === 'maciza' ? 0.25 : 0.2
    out.push(`CANTIDADES · ${el.name.toUpperCase()} — ${w.toFixed(2)} × ${h.toFixed(2)} m · pendiente ${g.slope}%`)
    out.push(`  Área: ${area.toFixed(2)} m² · Concreto ${mod.slabType || 'aligerada'}: ${(area * e).toFixed(2)} m³ · viguetas ${(area / 0.4).toFixed(0)} und · acero ~${(area * 8).toFixed(0)} kg`)
  } else if (el.type === 'instalacion') {
    const g = el.geo as InstGeo
    let L = 0
    for (let i = 1; i < g.pts.length; i++) L += Math.hypot(g.pts[i][0] - g.pts[i - 1][0], g.pts[i][1] - g.pts[i - 1][1])
    out.push(`CANTIDADES · ${el.name.toUpperCase()} — Ø ${mod.pipeDia ?? g.diameter} mm · ${(L / PX_PER_M).toFixed(2)} ml`)
    out.push(`  Tubería PVC: ${(L / PX_PER_M).toFixed(2)} ml · accesorios ${Math.max(2, Math.round(L / PX_PER_M / 3))} und · ${g.kind === 'electrico' ? 'conductor 2.5 mm²' : g.kind === 'desague' ? 'pendiente 1.5%' : 'presión de trabajo 10 m.c.a.'}`)
  } else if (el.type === 'mobiliario' || el.type === 'sanitario') {
    const g = el.geo as FurnGeo
    out.push(`CANTIDADES · ${el.name.toUpperCase()} — bloque ${(g.w / PX_PER_M).toFixed(2)} × ${(g.h / PX_PER_M).toFixed(2)} m`)
    out.push(`  1 unidad · huella de piso ${(g.w * g.h / PX_PER_M / PX_PER_M).toFixed(2)} m²`)
  } else if (el.type === 'escalera') {
    const g = el.geo as StairGeo
    out.push(`CANTIDADES · ${el.name.toUpperCase()} — ${g.steps} pasos · huella ${(g.tread * 100).toFixed(0)} cm · contrahuella ${(g.riser * 100).toFixed(1)} cm`)
    out.push(`  Longitud de tramo: ${(g.steps * g.tread).toFixed(2)} m · concreto: ${((g.steps * g.tread) * (g.w / PX_PER_M) * 0.12).toFixed(2)} m³ (e=12 cm) · contrahuella ≤ 17.5 cm RNE ${g.riser <= 0.175 ? 'OK' : 'EXCEDE'}`)
  } else {
    out.push(`CANTIDADES · ${el.name} (${el.type}) — sin partida de metrado asociada`)
  }
  return out
}

const snapshot = (s: JarumyState): Snapshot => ({
  elements: JSON.parse(JSON.stringify(s.elements)),
  mods: JSON.parse(JSON.stringify(s.mods)),
  gridSpacing: s.gridSpacing,
  levels: JSON.parse(JSON.stringify(s.levels)),
})

const clone = (x: unknown) => JSON.parse(JSON.stringify(x))

const PHASE_LABELS: Record<Phase, string> = {
  existente: 'Existente', demolicion: 'Demolición', nueva: 'Nueva construcción',
}

// segmentos de corte de un elemento (muros, dibujos, terreno) para RECORTA/ALARGA
const segmentsOfElement = (el: PlanElement): number[][][] => {
  const segs: number[][][] = []
  const push = (pts: number[][]) => { for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]) }
  if (el.type === 'muro') {
    const g = el.geo as { x1: number; y1: number; x2: number; y2: number }
    segs.push([[g.x1, g.y1], [g.x2, g.y2]])
  } else if (el.type === 'dibujo') {
    const g = el.geo as DrawGeo
    if (g.kind === 'linea' || g.kind === 'polilinea' || g.kind === 'nube' || g.kind === 'hatch') push(g.pts)
    else if (g.kind === 'rectangulo') {
      const [x1, y1] = g.pts[0], [x2, y2] = g.pts[1]
      push([[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]])
    } else if (g.kind === 'circulo') {
      const [cx, cy] = g.pts[0], r = g.r || 40
      const ring: number[][] = []
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
      push(ring)
    }
  } else if (el.type === 'terreno') {
    const g = el.geo as { pts: number[][] }
    push(g.pts)
  }
  return segs
}

export const useJarumy = create<JarumyState>((set, get) => ({
  elements: clone(BASE_ELEMENTS),
  mods: {},
  layers: clone(LAYERS),
  gridSpacing: 60,
  nextId: 1,
  levels: clone(DEFAULT_LEVELS),
  activeLevel: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  renderMode: false,
  view3D: false,
  showGrid: true,
  snap: true,
  ortho: true,
  hovered: null,
  selectedId: null,
  selectedIds: [],
  activeTab: 'inicio',
  drawTool: null,
  drawPts: [],
  cursorSvg: [0, 0],
  radialEnabled: true,
  showLayers: true,
  showProperties: true,
  areaLabels: true,
  autoDims: true,
  insertRotation: 0,
  osnap: true,
  osnapModes: { ...DEFAULT_OSNAP_MODES },
  voiceActive: false,
  clipboard: null,
  promptState: null,
  cloud: { planId: null, planName: '', projectName: 'Proyecto sin nombre', status: 'off', lastSyncAt: null, revision: 0, dirty: false },
  collab: { active: false, token: null, permission: 'view', peers: [], user: 'Invitado', messages: [] },
  applyingRemote: false,
  sun: { active: false, lat: -12, day: dayOfYear(3, 21), hour: 12, wallH: 2.5, showPath: true },
  dialog: null,
  phaseFilter: null,
  adminOpen: false,
  fitTick: 0,
  renderQuality: 'borrador',
  planScale: 75,
  units: 'm',
  dimStyle: 'lineal',
  textStyle: 'standard',
  scheduleTab: 'espacios',
  clashTolerance: 1,
  consoleLines: [
    { text: 'JARUMY APP · Consola de comandos — escriba AYUDA para ver comandos', kind: 'out' },
  ],
  undoStack: [],
  redoStack: [],
  autosaveOn: true,
  autosaveStatus: 'idle',
  autosaveAt: null,

  setHovered: (h) => set((s) => ({
    hovered: h,
    selectedId: h ? h.id : s.selectedId,
  })),
  setSelected: (id) => set({ selectedId: id, selectedIds: id ? [id] : [] }),

  // ---------- multi-selección / portapapeles / edición grupal ----------
  setSelection: (ids) => set((s) => ({
    selectedIds: ids,
    selectedId: ids.length === 1 ? ids[0] : (ids.length ? s.selectedId : null),
  })),
  toggleSelection: (id) => set((s) => {
    const has = s.selectedIds.includes(id)
    const ids = has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id]
    return { selectedIds: ids, selectedId: ids.length === 1 ? ids[0] : null }
  }),
  selectAll: () => {
    const s = get()
    const ids = s.elements.filter((e) => !s.mods[e.id]?.deleted).map((e) => e.id)
    set({ selectedIds: ids })
    s.pushConsole({ text: `SELECCIONAR TODO: ${ids.length} objetos en el conjunto de selección (Ctrl+clic agrega/quita · arrastre con Shift = ventana)`, kind: 'out' })
  },
  copySelection: () => {
    const s = get()
    const ids = s.selectedIds.length ? s.selectedIds : (s.selectedId ? [s.selectedId] : [])
    if (!ids.length) { s.pushConsole({ text: 'COPIAR: no hay selección activa (clic sobre objetos o arrastre con Shift)', kind: 'err' }); return }
    const els = s.elements.filter((e) => ids.includes(e.id) && !s.mods[e.id]?.deleted)
    const mods: Record<string, Mod> = {}
    ids.forEach((id) => { if (s.mods[id]) mods[id] = clone(s.mods[id]) })
    set({ clipboard: { elements: clone(els), mods } })
    s.pushConsole({ text: `COPIAR: ${els.length} objeto${els.length !== 1 ? 's' : ''} al portapapeles de la app (Ctrl+V para pegar)`, kind: 'out' })
  },
  cutSelection: () => {
    const s = get()
    const ids = s.selectedIds.length ? s.selectedIds : (s.selectedId ? [s.selectedId] : [])
    if (!ids.length) return
    get().copySelection()
    set((st) => ({
      undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [],
      mods: ids.reduce((acc, id) => { acc[id] = { ...(st.mods[id] || {}), deleted: true }; return acc }, { ...st.mods }),
    }))
    s.pushConsole({ text: `CORTAR: ${ids.length} objeto${ids.length !== 1 ? 's' : ''} al portapapeles (pegar con Ctrl+V)`, kind: 'out' })
  },
  pasteClipboard: (at) => {
    const s = get()
    if (!s.clipboard || !s.clipboard.elements.length) { s.pushConsole({ text: 'PEGAR: el portapapeles está vacío (Ctrl+C sobre una selección)', kind: 'err' }); return }
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    const src = s.clipboard
    // punto de pegado: cursor del plano o desplazamiento fijo de 0.40 m
    let ax = 0, ay = 0
    if (at) { ax = at[0]; ay = at[1] }
    else if (s.drawTool === null && (s.cursorSvg[0] || s.cursorSvg[1])) { ax = s.cursorSvg[0]; ay = s.cursorSvg[1] }
    const xs = src.elements.flatMap((e) => {
      const g = e.geo as unknown as Record<string, unknown>
      if (Array.isArray(g.pts) && (g.pts as number[][]).length) return (g.pts as number[][]).map((p) => p[0])
      if (g.x1 !== undefined) return [g.x1 as number, g.x2 as number]
      if (g.cx !== undefined) return [g.cx as number]
      if (g.x !== undefined) return [g.x as number]
      return [0]
    })
    const ys = src.elements.flatMap((e) => {
      const g = e.geo as unknown as Record<string, unknown>
      if (Array.isArray(g.pts) && (g.pts as number[][]).length) return (g.pts as number[][]).map((p) => p[1])
      if (g.y1 !== undefined) return [g.y1 as number, g.y2 as number]
      if (g.cy !== undefined) return [g.cy as number]
      if (g.y !== undefined) return [g.y as number]
      return [0]
    })
    const ox = xs.length ? ax - (Math.min(...xs) + Math.max(...xs)) / 2 : 24
    const oy = ys.length ? ay - (Math.min(...ys) + Math.max(...ys)) / 2 : 24
    const newEls: PlanElement[] = src.elements.map((e) => {
      const g = clone(e.geo) as Record<string, unknown>
      if (Array.isArray(g.pts)) g.pts = (g.pts as number[][]).map((p) => [p[0] + ox, p[1] + oy])
      for (const k of ['x', 'x1', 'x2', 'cx']) if (g[k] !== undefined) g[k] = (g[k] as number) + ox
      for (const k of ['y', 'y1', 'y2', 'cy']) if (g[k] !== undefined) g[k] = (g[k] as number) + oy
      return { ...e, id: uid(), geo: g as unknown as typeof e.geo, name: `${e.name} (pegado)` }
    })
    const newMods: Record<string, Mod> = {}
    // los mods pegados conservan estilo pero no posición de origen (la geometría ya se movió)
    src.elements.forEach((e, i) => {
      const m = src.mods[e.id]
      if (m) newMods[newEls[i].id] = { ...m, deleted: false, translate: undefined }
    })
    set((st) => ({
      elements: [...st.elements, ...newEls],
      mods: { ...st.mods, ...newMods },
      selectedIds: newEls.map((e) => e.id),
      selectedId: newEls[0]?.id ?? null,
    }))
    s.pushConsole({ text: `PEGAR: ${newEls.length} objeto${newEls.length !== 1 ? 's' : ''} insertado${newEls.length !== 1 ? 's' : ''} en X ${(ax / PX_PER_M).toFixed(2)} · Y ${(ay / PX_PER_M).toFixed(2)} m`, kind: 'out' })
  },
  deleteSelection: () => {
    const s = get()
    const ids = s.selectedIds.length ? s.selectedIds : (s.selectedId ? [s.selectedId] : [])
    if (!ids.length) { s.pushConsole({ text: 'BORRAR: no hay selección activa', kind: 'err' }); return }
    set((st) => ({
      undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [],
      mods: ids.reduce((acc, id) => { acc[id] = { ...(st.mods[id] || {}), deleted: true }; return acc }, { ...st.mods }),
      selectedIds: [], selectedId: null,
    }))
    s.pushConsole({ text: `BORRAR: ${ids.length} objeto${ids.length !== 1 ? 's' : ''} eliminado${ids.length !== 1 ? 's' : ''} (Supr o Ctrl+Z para deshacer)`, kind: 'out' })
  },
  nudgeSelection: (dx, dy) => {
    const s = get()
    const ids = s.selectedIds.length ? s.selectedIds : (s.selectedId ? [s.selectedId] : [])
    if (!ids.length) return
    set((st) => ({
      mods: ids.reduce((acc, id) => {
        const t = (st.mods[id]?.translate) || [0, 0] as [number, number]
        acc[id] = { ...(st.mods[id] || {}), translate: [t[0] + dx, t[1] + dy] }
        return acc
      }, { ...st.mods }),
    }))
  },
  rotateSelectionBy: (deg) => {
    const s = get()
    const ids = s.selectedIds.length ? s.selectedIds : (s.selectedId ? [s.selectedId] : [])
    if (!ids.length) { s.pushConsole({ text: 'GIRAR: no hay selección activa', kind: 'err' }); return }
    set((st) => ({
      undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [],
      mods: ids.reduce((acc, id) => {
        acc[id] = { ...(st.mods[id] || {}), rotation: ((st.mods[id]?.rotation ?? 0) + deg) % 360 }
        return acc
      }, { ...st.mods }),
    }))
    s.pushConsole({ text: `GIRAR: ${ids.length} objeto${ids.length !== 1 ? 's' : ''} rotado${ids.length !== 1 ? 's' : ''} ${deg}° alrededor de su centroide`, kind: 'out' })
  },

  // ---------- prompt in-app (reemplaza window.prompt) ----------
  requestPrompt: (label, def = '') => new Promise<string | null>((resolve) => {
    set({ promptState: { label, def, resolve } })
  }),
  answerPrompt: (value) => {
    const p = get().promptState
    if (p) { p.resolve(value); set({ promptState: null }) }
  },

  // ---------- osnap ----------
  toggleOsnap: () => {
    const next = !get().osnap
    set({ osnap: next })
    get().pushConsole({ text: `OSNAP ${next ? 'ACTIVADO — imanes a extremos, medios, centros e intersecciones (F3)' : 'desactivado — solo rejilla'}`, kind: 'out' })
  },
  setOsnapModes: (m) => set((s) => ({ osnapModes: { ...s.osnapModes, ...m } })),

  // ---------- underlay de referencia (imagen / PDF) ----------
  insertUnderlay: (src, w, h, name, kind, page) => {
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    // escala para caber en el área de dibujo (máx 900×600 px) conservando aspecto
    const k = Math.min(900 / w, 600 / h, 1)
    const geo: ImageGeo = {
      kind, x: 150 + (900 - w * k) / 2, y: 100 + (600 - h * k) / 2,
      w: w * k, h: h * k, src, opacity: 0.85, name, page: page ?? 1,
    }
    const id = uid()
    set((st) => ({
      elements: [...st.elements, {
        id, type: 'imagen', layer: 'referencias',
        name: kind === 'pdf' ? `Underlay PDF: ${name}` : `Underlay imagen: ${name}`,
        level: st.activeLevel,
        geo,
      }],
      dialog: null,
    }))
    get().pushConsole({ text: `UNDERLAY ${kind === 'pdf' ? 'PDF' : 'IMAGEN'} insertado: ${name} · ${(geo.w / PX_PER_M).toFixed(1)}×${(geo.h / PX_PER_M).toFixed(1)} m · calque encima y ajuste opacidad desde el menú radial (capa Referencias)`, kind: 'out' })
  },

  // ---------- respuestas en pins (conversaciones) ----------
  addPinReply: (pinId, text) => {
    const s = get()
    const pin = s.elements.find((e) => e.id === pinId && e.type === 'pin')
    if (!pin) return
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    set((st) => ({
      elements: st.elements.map((e) => {
        if (e.id !== pinId) return e
        const g = e.geo as PinGeo
        return { ...e, geo: { ...g, replies: [...(g.replies || []), { author: s.collab.user === 'Invitado' ? 'J. Burga' : s.collab.user, text, at: Date.now() }] } as typeof e.geo }
      }),
    }))
    const n = ((pin.geo as PinGeo).replies?.length ?? 0) + 1
    s.pushConsole({ text: `RESPUESTA #${n} añadida al pin "${(pin.geo as PinGeo).text.slice(0, 40)}…" — el hilo se muestra junto al pin`, kind: 'out' })
  },

  // ---------- importación de elementos (DXF / IA) ----------
  importElements: (els, source = 'importación', extraMods) => {
    if (!els.length) return
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    set((st) => ({
      elements: [...st.elements, ...els],
      mods: extraMods && Object.keys(extraMods).length ? { ...st.mods, ...extraMods } : st.mods,
    }))
    get().pushConsole({ text: `${source.toUpperCase()}: ${els.length} elementos agregados al plano (capas conservadas · Ctrl+Z para revertir)`, kind: 'out' })
  },

  // ---------- edición de geometría directa (grips) ----------
  beginHistory: () => set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] })),
  updateElementGeo: (id, mutate) => set((st) => ({
    elements: st.elements.map((e) => e.id === id
      ? { ...e, geo: mutate(clone(e.geo) as unknown as Record<string, unknown>) as unknown as typeof e.geo }
      : e),
  })),

  setCloud: (p) => set((s) => ({ cloud: { ...s.cloud, ...p } })),
  setCollab: (p) => set((s) => ({ collab: { ...s.collab, ...p } })),
  applyRemotePlan: (data) => {
    // aplica un plano recibido del colaborativo (sin empujar historial ni disparar eco)
    set((st) => ({
      applyingRemote: true,
      elements: data.elements,
      mods: data.mods,
      gridSpacing: data.gridSpacing ?? st.gridSpacing,
    }))
    setTimeout(() => useJarumy.setState({ applyingRemote: false }), 60)
  },

  setActiveTab: (t) => set({ activeTab: t }),
  armDraw: (tool) => set((s) => ({
    drawTool: tool,
    drawPts: [],
    hovered: tool ? null : s.hovered,
  })),
  addDrawPoint: (p) => set((s) => ({ drawPts: [...s.drawPts, p] })),
  finishPolyline: () => {
    const s = get()
    const t = s.drawTool
    // familia de polilíneas: polilínea libre, tuberías/circuito MEP, terreno, curvas y anotaciones multiclic
    const polyFamily = ['polilinea', 'tuberia-agua', 'tuberia-desague', 'circuito', 'terreno', 'curvanivel', 'spline', 'nube', 'hatch']
    if (polyFamily.includes(t || '') && s.drawPts.length >= 2) {
      const tool = t as string
      const pts = [...s.drawPts]
      if (tool === 'hatch') {
        // patrón elegido en diálogo in-app (1 = ANSI31 · 2 = AR-B816 · 3 = GRAVEL · 4 = AR-CONC)
        void s.requestPrompt('Patrón de hachurado (1=ANSI31 concreto · 2=AR-B816 ladrillo · 3=GRAVEL grava · 4=AR-CONC mosaico):', '2').then((patIdx) => {
          if (patIdx === null || patIdx.trim() === '') { set({ drawPts: [] }); return }
          const pattern = (HATCH_PATTERNS[Math.min(4, Math.max(1, Number(patIdx) || 2)) - 1] || HATCH_PATTERNS[1]).id
          set((st) => ({
            undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [],
            elements: [...st.elements, {
              id: uid(), type: 'dibujo', layer: 'dibujo', name: `Hachurado ${pattern.toUpperCase()}`,
              level: st.activeLevel,
              geo: { kind: 'hatch', pts: [...pts, pts[0]], pattern },
            }],
            drawPts: [],
          }))
          get().pushConsole({ text: `HATCH aplicado: ${pattern.toUpperCase()} — región cerrada rellenada con patrón`, kind: 'out' })
        })
        return
      }
      if (tool === 'curvanivel') {
        void s.requestPrompt('Cota de elevación de la curva (m):', '100.00').then((elev) => {
          if (elev === null) { set({ drawPts: [] }); return }
          set((st) => ({
            undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [],
            elements: [...st.elements, {
              id: uid(), type: 'terreno', layer: 'terreno', name: `Curva nivel ${elev}`,
              geo: { kind: 'curva', pts, elev: Number(elev) || 0 },
            }],
            drawPts: [],
          }))
          get().pushConsole({ text: `CURVA DE NIVEL trazada — cota ${elev} m`, kind: 'out' })
        })
        return
      }
      set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
      if (tool === 'spline') {
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'dibujo', layer: 'dibujo', name: `Spline ${pts.length} pts`,
            level: st.activeLevel,
            geo: { kind: 'spline', pts },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: `SPLINE creada: curva suave (Catmull-Rom) por ${pts.length} puntos de control`, kind: 'out' })
      } else if (tool === 'nube') {
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Nube de control',
            level: st.activeLevel,
            geo: { kind: 'nube', pts: [...pts, pts[0]] },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: 'NUBE DE CONTROL trazada — región de revisión marcada (festones de arco)', kind: 'out' })
      } else if (tool === 'polilinea') {
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Polilínea',
            level: st.activeLevel,
            geo: { kind: 'polilinea', pts },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: 'Polilínea creada', kind: 'out' })
      } else if (tool === 'terreno') {
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'terreno', layer: 'terreno', name: 'Lote',
            level: st.activeLevel,
            geo: { kind: 'lote', pts },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: 'TERRENO: lote trazado — área y perímetro calculados (capa Terreno)', kind: 'out' })
      } else {
        const kind = tool === 'tuberia-agua' ? 'agua' : tool === 'tuberia-desague' ? 'desague' : 'electrico'
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'instalacion', layer: 'instalaciones',
            name: kind === 'agua' ? 'Tubería de agua' : kind === 'desague' ? 'Colector de desagüe' : 'Circuito eléctrico',
            level: st.activeLevel,
            geo: { kind, pts, diameter: kind === 'electrico' ? 6 : 10 },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: `${kind === 'agua' ? 'TUBERÍA DE AGUA' : kind === 'desague' ? 'COLECTOR DE DESAGÜE' : 'CIRCUITO ELÉCTRICO'} trazado (capa Instalaciones)`, kind: 'out' })
      }
    } else {
      set({ drawPts: [] })
    }
  },
  cancelDraw: () => set({ drawTool: null, drawPts: [] }),
  setPhaseFilter: (p) => set({ phaseFilter: p }),
  setCursorSvg: (p) => set({ cursorSvg: p }),
  setView: (v) => set(v),
  zoomBy: (f) => set((s) => {
    const zoom = Math.min(6, Math.max(0.25, s.zoom * f))
    return { zoom }
  }),
  fitView: () => set((s) => ({ fitTick: s.fitTick + 1 })),
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<JarumyState>),
  setDialog: (d) => set({ dialog: d }),
  setScheduleTab: (t) => set({ scheduleTab: t }),
  setClashTolerance: (v) => set({ clashTolerance: Math.max(0, Math.min(10, v)) }),
  setSetting: (k, v) => set(() => ({ [k]: v }) as Partial<JarumyState>),
  setAdminOpen: (v) => set({ adminOpen: v }),
  pushConsole: (l) => set((s) => ({ consoleLines: [...s.consoleLines.slice(-40), l] })),

  rotateInsert: () => set((s) => ({ insertRotation: (s.insertRotation + 90) % 360 })),

  setSun: (p) => set((s) => ({ sun: { ...s.sun, ...p } })),

  applyEffect: (elId, effect, value) => {
    if (!elId && effect !== 'stretch') return
    const s = get()

    // ESTIRA (ventana de cruces): valor = "cx,cy,dx,dy" — solo los vértices dentro del radio se mueven
    if (effect === 'stretch') {
      const [cx, cy, dx, dy] = String(value).split(',').map((n) => Number(n) || 0)
      const R = 90 // radio de cruces = 1.50 m
      let moved = 0
      let touched = 0
      set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
      let mods2 = { ...s.mods }
      set((st) => ({
        elements: st.elements.map((e) => {
          if (st.mods[e.id]?.deleted) return e
          const g = clone(e.geo) as Record<string, unknown>
          const within = (x: number, y: number) => Math.hypot(x - cx, y - cy) <= R
          let hit = false
          // vértices de polilíneas / dibujos / terreno
          if (Array.isArray(g.pts)) {
            g.pts = (g.pts as number[][]).map((p) => {
              if (within(p[0], p[1])) { moved++; hit = true; return [p[0] + dx, p[1] + dy] }
              return p
            })
          }
          // extremos de muros y cotas (por parejas x1y1 / x2y2)
          for (const [kx, ky] of [['x1', 'y1'], ['x2', 'y2']] as const) {
            if (g[kx] !== undefined && g[ky] !== undefined && within(g[kx] as number, g[ky] as number)) {
              g[kx] = (g[kx] as number) + dx; g[ky] = (g[ky] as number) + dy
              moved++; hit = true
            }
          }
          // anclas de bloques/ventanas/símbolos: arrastra el elemento completo
          if (!hit && g.x !== undefined && g.y !== undefined && within(g.x as number, g.y as number)) {
            const t = ((mods2[e.id]?.translate) || [0, 0]) as [number, number]
            mods2 = { ...mods2, [e.id]: { ...(mods2[e.id] || {}), translate: [t[0] + dx, t[1] + dy] } }
            set({ mods: mods2 })
            moved++; hit = true
            return e
          }
          if (hit) touched++
          return hit ? { ...e, geo: g as unknown as typeof e.geo } : e
        }),
      }))
      get().pushConsole({ text: `ESTIRA: ${moved} vértices en ${touched} elementos desplazados ${(dx / PX_PER_M).toFixed(2)}×${(dy / PX_PER_M).toFixed(2)} m (ventana de cruces R 1.50 m)`, kind: 'out' })
      return
    }

    const el = elId ? s.elements.find((e) => e.id === elId) : null
    if (!el) return
    const eid = elId as string
    const mods = { ...s.mods }
    const m: Mod = { ...(mods[eid] || {}) }
    const elements = s.elements

    const pushHistory = () => set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))

    switch (effect) {
      case 'rotate': {
        pushHistory()
        m.rotation = (m.rotation || 0) + Number(value)
        break
      }
      case 'mirror': {
        pushHistory()
        if (value === 'h') m.flipX = !m.flipX
        else m.flipY = !m.flipY
        break
      }
      case 'scale': {
        pushHistory()
        if (value === 'reset') m.scale = 1
        else m.scale = Math.min(2.2, Math.max(0.5, (m.scale || 1) * Number(value)))
        break
      }
      case 'thicken': {
        pushHistory()
        const wall = el.geo as { t: number }
        m.thickness = Math.min(26, Math.max(4, (m.thickness ?? wall.t) + Number(value)))
        break
      }
      case 'thickness': {
        pushHistory()
        m.thickness = Number(value) * 0.6
        break
      }
      case 'material': {
        pushHistory()
        m.material = MATERIAL_COLORS[String(value)] || '#92400e'
        break
      }
      case 'fillRoom': {
        pushHistory()
        m.fill = ROOM_FILLS[String(value)] ?? 'transparent'
        break
      }
      case 'precision':
        m.precision = Number(value)
        break
      case 'textHeight':
        pushHistory()
        m.textHeight = Number(value)
        break
      case 'size':
        pushHistory()
        m.size = Number(value) * 0.6
        break
      case 'swingFlip':
        pushHistory()
        m.swingFlip = !m.swingFlip
        break
      case 'hingeFlip':
        pushHistory()
        m.hingeFlip = !m.hingeFlip
        break
      case 'windowType':
        pushHistory()
        m.windowType = Number(value)
        break
      case 'glazing':
        // vidrio de la ventana — única fuente: GLAZING_TYPES (plan-data)
        pushHistory()
        m.glazing = Number(value)
        break
      case 'colorLine':
        pushHistory()
        m.colorLine = LINE_COLORS[String(value)] || '#f59e0b'
        break
      case 'wallType': {
        pushHistory()
        const def = WALL_TYPES[String(value)]
        if (def) { m.wallType = def.id; m.thickness = def.t }
        break
      }
      case 'resolvePin': {
        pushHistory()
        set((st) => ({
          elements: st.elements.map((e) => e.id === eid ? { ...e, geo: { ...e.geo, resolved: true } as typeof e.geo } : e),
        }))
        break
      }
      case 'reopenPin': {
        pushHistory()
        set((st) => ({
          elements: st.elements.map((e) => e.id === eid ? { ...e, geo: { ...e.geo, resolved: false } as typeof e.geo } : e),
        }))
        break
      }
      case 'weight':
        pushHistory()
        // valor en mm de pluma (0.6 mm → 1.2 px de trazo)
        m.weight = Number(value) * 2
        break
      case 'dimOverride':
        m.dimOverride = value === '' ? undefined : String(value)
        break
      case 'justify':
        m.justify = value as 'start' | 'middle' | 'end'
        break
      case 'delete': {
        pushHistory()
        m.deleted = true
        break
      }
      case 'rename':
      case 'renumber': {
        pushHistory()
        set((st) => ({
          elements: st.elements.map((e) => {
            if (e.id !== eid) return e
            const g = clone(e.geo)
            if (g.name !== undefined) g.name = String(value)
            else if (g.num !== undefined) g.num = String(value)
            else if (g.text !== undefined) g.text = String(value)
            return { ...e, name: String(value), geo: g }
          }),
        }))
        break
      }
      case 'duplicate':
      case 'duplicateTriple': {
        pushHistory()
        const copies = effect === 'duplicate' ? 1 : 3
        const newEls: PlanElement[] = []
        for (let i = 1; i <= copies; i++) {
          const g = clone(el.geo)
          if (g.x !== undefined) { g.x += 26 * i; g.y += 26 * i }
          else if (g.pts) g.pts = g.pts.map((p: number[]) => [p[0] + 26 * i, p[1] + 26 * i])
          else if (g.cx !== undefined) { g.cx += 26 * i; g.cy += 26 * i }
          newEls.push({ ...el, id: uid(), geo: g, name: `${el.name} (copia ${i})` })
        }
        set((st) => ({ elements: [...st.elements, ...newEls] }))
        get().pushConsole({ text: `${copies === 1 ? 'Elemento duplicado' : 'Matriz de 3 creada'}: ${el.name}`, kind: 'out' })
        break
      }
      case 'matchAll': {
        pushHistory()
        const sameType = elements.filter((e) => e.type === el.type)
        const srcMod = mods[eid] || {}
        const next: Record<string, Mod> = { ...mods }
        sameType.forEach((e) => {
          if (e.id === eid) return
          next[e.id] = { ...(next[e.id] || {}), thickness: srcMod.thickness, material: srcMod.material, fill: srcMod.fill }
        })
        set({ mods: next })
        get().pushConsole({ text: `MATCHPROP: propiedades aplicadas a ${sameType.length - 1} elementos`, kind: 'out' })
        break
      }
      case 'phase': {
        pushHistory()
        m.phase = value as Phase
        const label = PHASE_LABELS[value as Phase] || String(value)
        get().pushConsole({ text: `FASE: ${el.name} → ${label}`, kind: 'out' })
        break
      }
      case 'arrayRect': {
        // valor: "columnas,filas,dx,dy" (separación en metros)
        pushHistory()
        const parts = String(value).split(',').map((v) => Number(v.trim()) || 0)
        const cols = Math.max(1, Math.min(10, Math.round(parts[0]) || 3))
        const rows = Math.max(1, Math.min(10, Math.round(parts[1]) || 1))
        const dx = Math.max(12, parts[2] * PX_PER_M || 2 * PX_PER_M)
        const dy = Math.max(12, parts[3] * PX_PER_M || 2 * PX_PER_M)
        const newEls: PlanElement[] = []
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          if (i === 0 && j === 0) continue
          const g = clone(el.geo)
          const tx = dx * i, ty = dy * j
          if (g.pts) g.pts = (g.pts as number[][]).map((p) => [p[0] + tx, p[1] + ty])
          else if (g.x !== undefined) { g.x += tx; g.y += ty }
          else if (g.cx !== undefined) { g.cx += tx; g.cy += ty }
          newEls.push({ ...el, id: uid(), geo: g, name: `${el.name} [${i},${j}]` })
        }
        set((st) => ({ elements: [...st.elements, ...newEls] }))
        get().pushConsole({ text: `MATRIZ RECTANGULAR: ${cols}×${rows} — ${newEls.length} copias con separación ${(dx / PX_PER_M).toFixed(2)}×${(dy / PX_PER_M).toFixed(2)} m`, kind: 'out' })
        break
      }
      case 'arrayPolar': {
        // valor: "cantidad,ángulo total (°)"
        pushHistory()
        const parts = String(value).split(',').map((v) => Number(v.trim()) || 0)
        const n = Math.max(2, Math.min(24, Math.round(parts[0]) || 6))
        const total = parts[1] || 360
        // centroide y radio de anillo a partir del bbox del elemento
        const gAny = el.geo as { pts?: number[][]; x?: number; y?: number; w?: number; h?: number; cx?: number; cy?: number; r?: number }
        let cx = 0, cy = 0, span = 120
        if (gAny.pts?.length) {
          const xs = gAny.pts.map((p) => p[0]), ys = gAny.pts.map((p) => p[1])
          cx = (Math.min(...xs) + Math.max(...xs)) / 2; cy = (Math.min(...ys) + Math.max(...ys)) / 2
          span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
        } else if (gAny.cx !== undefined) { cx = gAny.cx; cy = gAny.cy || 0; span = (gAny.r || 40) * 2 }
        else { cx = (gAny.x || 0) + (gAny.w || 0) / 2; cy = (gAny.y || 0) + (gAny.h || 0) / 2; span = Math.max(gAny.w || 60, gAny.h || 60) }
        const R = span / 2 + 90
        const newEls: PlanElement[] = []
        const newMods: Record<string, Mod> = { ...mods }
        for (let i = 1; i <= n; i++) {
          const a = (total / n) * i * Math.PI / 180
          const id = uid()
          newEls.push({ ...el, id, name: `${el.name} (polar ${i})` })
          newMods[id] = { ...(mods[eid] || {}), translate: [cx + R * Math.cos(a) - cx, cy + R * Math.sin(a) - cy], rotation: (total / n) * i }
        }
        set((st) => ({ elements: [...st.elements, ...newEls], mods: newMods }))
        get().pushConsole({ text: `MATRIZ POLAR: ${n} elementos en ${total}° — radio de anillo ${(R / PX_PER_M).toFixed(2)} m`, kind: 'out' })
        break
      }
      case 'offset': {
        // EQUISDIST: valor = distancia en metros
        pushHistory()
        const d = Number(value) * PX_PER_M
        const g = el.geo as DrawGeo
        let newEl: PlanElement | null = null
        if (g.kind === 'circulo') {
          newEl = { ...el, id: uid(), name: `${el.name} (offset ${Number(value)} m)`, geo: { ...clone(g), r: (g.r || 40) + d } }
        } else if (g.pts?.length >= 2) {
          const closed = g.kind === 'rectangulo' || g.kind === 'hatch' || g.kind === 'nube'
          const src = g.kind === 'rectangulo'
            ? [[g.pts[0][0], g.pts[0][1]], [g.pts[1][0], g.pts[0][1]], [g.pts[1][0], g.pts[1][1]], [g.pts[0][0], g.pts[1][1]], [g.pts[0][0], g.pts[0][1]]]
            : g.kind === 'spline' ? sampleCatmullRom(g.pts, 8) : g.pts
          newEl = { ...el, id: uid(), name: `${el.name} (offset ${Number(value)} m)`, geo: { kind: 'polilinea', pts: offsetPolyline(src, d, closed) } }
        }
        if (newEl) {
          set((st) => ({ elements: [...st.elements, newEl as PlanElement] }))
          get().pushConsole({ text: `EQUISDIST: copia a ${Number(value)} m (${(d).toFixed(0)} px) — ${el.name}`, kind: 'out' })
        } else {
          get().pushConsole({ text: 'EQUISDIST: solo líneas, polilíneas, rectángulos, círculos y splines', kind: 'err' })
        }
        break
      }
      case 'explode': {
        // EXPLOT: bloques de mobiliario/sanitario → 4 líneas de su rectángulo envolvente
        if (el.type === 'mobiliario' || el.type === 'sanitario') {
          const fg = el.geo as FurnGeo
          pushHistory()
          const corners: number[][][] = [
            [[fg.x, fg.y], [fg.x + fg.w, fg.y]],
            [[fg.x + fg.w, fg.y], [fg.x + fg.w, fg.y + fg.h]],
            [[fg.x + fg.w, fg.y + fg.h], [fg.x, fg.y + fg.h]],
            [[fg.x, fg.y + fg.h], [fg.x, fg.y]],
          ]
          const newEls: PlanElement[] = corners.map((c, i) => ({
            id: uid(), type: 'dibujo', layer: el.layer, name: `${el.name} · lado ${i + 1}`,
            geo: { kind: 'linea', pts: c },
          }))
          set((st) => ({ elements: [...st.elements, ...newEls], mods: { ...st.mods, [eid]: { ...(st.mods[eid] || {}), deleted: true } } }))
          get().pushConsole({ text: `EXPLOTA: bloque "${el.name}" separado en 4 líneas editables de ${(fg.w / PX_PER_M).toFixed(2)}×${(fg.h / PX_PER_M).toFixed(2)} m`, kind: 'out' })
          break
        }
        const g = el.geo as DrawGeo
        if (!g.pts || g.pts.length < 2) {
          get().pushConsole({ text: 'EXPLOT: el elemento no contiene geometría explotable', kind: 'err' })
          return
        }
        pushHistory()
        const src = g.kind === 'spline' ? sampleCatmullRom(g.pts, 8)
          : g.kind === 'rectangulo'
            ? [[g.pts[0][0], g.pts[0][1]], [g.pts[1][0], g.pts[0][1]], [g.pts[1][0], g.pts[1][1]], [g.pts[0][0], g.pts[1][1]], [g.pts[0][0], g.pts[0][1]]]
            : g.pts
        const newEls: PlanElement[] = []
        for (let i = 1; i < src.length; i++) {
          newEls.push({ id: uid(), type: 'dibujo', layer: el.layer, name: `${el.name} · seg ${i}`, geo: { kind: 'linea', pts: [[src[i - 1][0], src[i - 1][1]], [src[i][0], src[i][1]]] } })
        }
        set((st) => ({ elements: [...st.elements, ...newEls], mods: { ...st.mods, [eid]: { ...(st.mods[eid] || {}), deleted: true } } }))
        get().pushConsole({ text: `EXPLOTA: ${el.name} separado en ${newEls.length} líneas editables`, kind: 'out' })
        break
      }
      case 'trimAt': {
        // RECORTA: valor = "x,y" del clic sobre el tramo a eliminar
        const g = el.geo as DrawGeo
        if (g.kind !== 'linea') {
          get().pushConsole({ text: 'RECORTA: use EXPLOTA primero en polilíneas y luego recorte las líneas', kind: 'err' })
          return
        }
        const [px, py] = String(value).split(',').map(Number)
        const cuts: number[][] = []
        for (const other of elements) {
          if (other.id === eid || mods[other.id]?.deleted) continue
          for (const seg of segmentsOfElement(other)) {
            const ip = segIntersect(g.pts[0], g.pts[1], seg[0], seg[1])
            if (ip) cuts.push(ip)
          }
        }
        if (cuts.length === 0) {
          get().pushConsole({ text: 'RECORTA: la línea no cruza ningún borde de corte', kind: 'err' })
          return
        }
        pushHistory()
        const [a, b] = g.pts
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const t = (q: number[]) => ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L * L)
        const sorted = cuts.map((c) => ({ c, tc: t(c) })).sort((u, v) => u.tc - v.tc)
        const tClick = t([px, py])
        const withEnds = [{ c: a, tc: 0 }, ...sorted, { c: b, tc: 1 }]
        const idx = withEnds.findIndex((q) => q.tc > tClick)
        const pieceA = withEnds.slice(0, Math.max(1, idx))
        const pieceB = withEnds.slice(Math.min(withEnds.length - 1, idx))
        const keepA = pieceA.length >= 2
        const keepB = pieceB.length >= 2
        set((st) => ({
          elements: st.elements.map((e) => {
            if (e.id !== eid) return e
            if (keepA) return { ...e, geo: { kind: 'linea', pts: [[pieceA[0].c[0], pieceA[0].c[1]], [pieceA[pieceA.length - 1].c[0], pieceA[pieceA.length - 1].c[1]]] } }
            return { ...e, geo: { kind: 'linea', pts: [[pieceB[0].c[0], pieceB[0].c[1]], [pieceB[pieceB.length - 1].c[0], pieceB[pieceB.length - 1].c[1]]] } }
          }).concat(keepA && keepB ? [{
            id: uid(), type: 'dibujo', layer: el.layer, name: `${el.name} · recorte`,
            geo: { kind: 'linea', pts: [[pieceB[0].c[0], pieceB[0].c[1]], [pieceB[pieceB.length - 1].c[0], pieceB[pieceB.length - 1].c[1]]] },
          }] : []),
        }))
        get().pushConsole({ text: `RECORTA: tramo eliminado en la intersección (${cuts.length} borde${cuts.length > 1 ? 's' : ''} de corte)`, kind: 'out' })
        break
      }
      case 'extendTo': {
        // ALARGA: valor = id del elemento límite
        const g = el.geo as DrawGeo
        if (g.kind !== 'linea') {
          get().pushConsole({ text: 'ALARGA: solo líneas rectas (use EXPLOTA antes si es polilínea)', kind: 'err' })
          return
        }
        const bound = elements.find((e) => e.id === String(value))
        if (!bound) {
          get().pushConsole({ text: 'ALARGA: no se encontró el elemento límite', kind: 'err' })
          return
        }
        const [a, b] = g.pts
        const dx = b[0] - a[0], dy = b[1] - a[1]
        const hits: Array<{ p: number[]; t: number }> = []
        for (const seg of segmentsOfElement(bound)) {
          const r = seg[1][0] - seg[0][0], s = seg[1][1] - seg[0][1]
          const den = dx * s - dy * r
          if (Math.abs(den) < 1e-9) continue
          const u = ((seg[0][0] - a[0]) * s - (seg[0][1] - a[1]) * r) / den
          const v = ((seg[0][0] - a[0]) * dy - (seg[0][1] - a[1]) * dx) / den
          if (v >= -0.02 && v <= 1.02 && (u < -0.02 || u > 1.02)) hits.push({ p: [a[0] + dx * u, a[1] + dy * u], t: u })
        }
        if (hits.length === 0) {
          get().pushConsole({ text: 'ALARGA: la línea no alcanza el límite — no hay intersección en su dirección', kind: 'err' })
          return
        }
        pushHistory()
        hits.sort((h1, h2) => h1.t - h2.t)
        const near = hits[0].t < 0 ? hits[0] : hits[hits.length - 1]
        set((st) => ({
          elements: st.elements.map((e) => {
            if (e.id !== eid) return e
            return near.t < 0
              ? { ...e, geo: { kind: 'linea', pts: [[near.p[0], near.p[1]], [b[0], b[1]]] } }
              : { ...e, geo: { kind: 'linea', pts: [[a[0], a[1]], [near.p[0], near.p[1]]] } }
          }),
        }))
        get().pushConsole({ text: `ALARGA: ${el.name} extendido hasta ${bound.name}`, kind: 'out' })
        break
      }
      case 'shortenA':
      case 'shortenB':
      case 'extendA':
      case 'extendB': {
        pushHistory()
        set((st) => ({
          elements: st.elements.map((e) => {
            if (e.id !== eid || e.type !== 'muro') return e
            const g = clone(e.geo)
            const d = (effect.startsWith('shorten') ? -40 : 40)
            if (g.x1 === g.x2) {
              if (g.y1 < g.y2) { if (effect.endsWith('A')) g.y1 -= d; else g.y2 += d }
              else { if (effect.endsWith('A')) g.y1 += d; else g.y2 -= d }
            } else {
              if (g.x1 < g.x2) { if (effect.endsWith('A')) g.x1 -= d; else g.x2 += d }
              else { if (effect.endsWith('A')) g.x1 += d; else g.x2 -= d }
            }
            return { ...e, geo: g }
          }),
        }))
        break
      }
      case 'dimRefresh':
        get().pushConsole({ text: 'Cota recalculada geométricamente', kind: 'out' })
        break
      case 'translate': {
        pushHistory()
        const [dx, dy] = String(value).split(',').map(Number)
        m.translate = [dx || 0, dy || 0]
        break
      }
      case 'translateM': {
        // desplazamiento exacto en METROS (prompt @dx,dy)
        pushHistory()
        const [dx, dy] = String(value).replace('@', '').split(',').map(Number)
        m.translate = [(dx || 0) * PX_PER_M, (dy || 0) * PX_PER_M]
        get().pushConsole({ text: `MUEVE: ${el.name} desplazado @${(dx || 0).toFixed(2)},${(dy || 0).toFixed(2)} m (coordenadas relativas)`, kind: 'out' })
        break
      }
      case 'gridSpacing':
        set({ gridSpacing: Number(value) })
        break
      case 'chamferRect': {
        // RECTÁNGULO CON CHAFLÁN: convierte el rectángulo seleccionado en polilínea de 8 vértices
        const g = el.geo as DrawGeo
        if (el.type !== 'dibujo' || g.kind !== 'rectangulo') {
          get().pushConsole({ text: 'CHAFLÁN: seleccione un RECTÁNGULO del plano (dibújelo con REC primero)', kind: 'err' })
          return
        }
        const c = Number(value) * PX_PER_M || 6
        const [x1, y1] = g.pts[0], [x2, y2] = g.pts[1]
        const bx = Math.min(x1, x2), by = Math.min(y1, y2)
        const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1)
        const cc = Math.min(c, w / 3, h / 3)
        pushHistory()
        const pts = [
          [bx, by + cc], [bx + cc, by], [bx + w - cc, by], [bx + w, by + cc],
          [bx + w, by + h - cc], [bx + w - cc, by + h], [bx + cc, by + h], [bx, by + h - cc], [bx, by + cc],
        ]
        set((st) => ({
          elements: st.elements.map((e) => e.id === eid ? { ...e, geo: { kind: 'polilinea', pts } as typeof e.geo, name: `${e.name} (chaflán ${Number(value)} m)` } : e),
        }))
        get().pushConsole({ text: `CHAFLÁN: rectángulo de ${(w / PX_PER_M).toFixed(2)}×${(h / PX_PER_M).toFixed(2)} m convertido a polilínea con 4 chaflanes de ${Number(value)} m`, kind: 'out' })
        break
      }
      case 'wallHeight': {
        pushHistory()
        m.wallHeight = Number(value)
        get().pushConsole({ text: `ALTURA DE MURO: ${el.name} → ${Number(value).toFixed(2)} m (usada en cantidades, elevaciones y cálculo estructural)`, kind: 'out' })
        break
      }
      case 'doorHeight': {
        pushHistory()
        m.doorHeight = Number(value)
        get().pushConsole({ text: `ALTO DE PUERTA: ${el.name} → ${Number(value).toFixed(2)} m`, kind: 'out' })
        break
      }
      case 'doorKind': {
        pushHistory()
        m.doorKind = String(value) as Mod['doorKind']
        get().pushConsole({ text: `PUERTA ${String(value).toUpperCase()}: ${el.name} — el giro en planta se actualiza en tiempo real`, kind: 'out' })
        break
      }
      case 'sill': {
        pushHistory()
        m.sill = Number(value)
        get().pushConsole({ text: `ANTEPECHO: ${el.name} → ${Number(value).toFixed(2)} m sobre el nivel del piso terminado`, kind: 'out' })
        break
      }
      case 'usage': {
        pushHistory()
        m.usage = String(value)
        const occ = USAGE_OCCUPANCY[String(value)] || 4
        get().pushConsole({ text: `USO DEL ESPACIO: ${USAGE_LABELS[String(value)] || value} · ocupación ${occ} personas (RNE A.010)`, kind: 'out' })
        break
      }
      case 'slabType': {
        pushHistory()
        m.slabType = String(value)
        const label = value === 'aligerada' ? 'aligerada e=0.20 m (viguetas cada 0.40 · f\'c 210)' : 'maciza e=0.25 m (f\'c 210)'
        get().pushConsole({ text: `LOSA: ${el.name} → ${label}`, kind: 'out' })
        break
      }
      case 'pipeDia': {
        pushHistory()
        m.pipeDia = Number(value)
        // cambio REAL del diámetro en la geometría (afecta el render)
        set((st) => ({
          elements: st.elements.map((e) => e.id === eid && e.type === 'instalacion'
            ? { ...e, geo: { ...(e.geo as { pts: number[][]; kind: string }), diameter: Number(value) } as typeof e.geo }
            : e),
        }))
        get().pushConsole({ text: `Ø TUBERÍA: ${el.name} → ${Number(value)} mm (${(Number(value) / 25.4).toFixed(2)}")`, kind: 'out' })
        break
      }
      case 'fillet':
      case 'chamfer': {
        // EMPALME con radio real / ACHAFLANA entre el muro seleccionado y el adyacente
        const g = el.geo as { x1: number; y1: number; x2: number; y2: number; t: number }
        if (el.type !== 'muro') {
          get().pushConsole({ text: `${effect === 'fillet' ? 'EMPALME' : 'ACHAFLANA'}: solo sobre muros — seleccione un muro con un extremo tocando otro muro`, kind: 'err' })
          return
        }
        const walls = elements.filter((e) => e.type === 'muro' && e.id !== eid && !mods[e.id]?.deleted)
        let corner: { other: PlanElement; p: number[]; endA: 'A' | 'B' } | null = null
        let best = Infinity
        for (const w of walls) {
          const wg = w.geo as typeof g
          const ends: Array<[number, number, 'A' | 'B']> = [[g.x1, g.y1, 'A'], [g.x2, g.y2, 'B']]
          for (const [ex, ey, eA] of ends) {
            for (const p2 of [[wg.x1, wg.y1], [wg.x2, wg.y2]] as Array<[number, number]>) {
              const d = Math.hypot(ex - p2[0], ey - p2[1])
              if (d < 30 && d < best) { best = d; corner = { other: w, p: p2, endA: eA } }
            }
          }
        }
        if (!corner) {
          get().pushConsole({ text: `${effect === 'fillet' ? 'EMPALME' : 'ACHAFLANA'}: no hay otro muro tocando un extremo del muro seleccionado`, kind: 'err' })
          return
        }
        const wg = corner.other.geo as typeof g
        // P = punto de esquina compartido; uA/uB = direcciones hacia el otro extremo de cada muro
        const P = corner.p
        const otherA: number[] = corner.endA === 'A' ? [g.x2, g.y2] : [g.x1, g.y1]
        const otherB: number[] = Math.hypot(wg.x1 - P[0], wg.y1 - P[1]) < Math.hypot(wg.x2 - P[0], wg.y2 - P[1]) ? [wg.x2, wg.y2] : [wg.x1, wg.y1]
        const uA = normalize2([otherA[0] - P[0], otherA[1] - P[1]])
        const uB = normalize2([otherB[0] - P[0], otherB[1] - P[1]])
        const theta = Math.acos(Math.max(-1, Math.min(1, uA[0] * uB[0] + uA[1] * uB[1])))
        if (theta < 0.05 || theta > Math.PI - 0.05) {
          get().pushConsole({ text: 'EMPALME: los muros son colineales — no hay esquina que redondear', kind: 'err' })
          return
        }
        const lenA = Math.hypot(otherA[0] - P[0], otherA[1] - P[1])
        const lenB = Math.hypot(otherB[0] - P[0], otherB[1] - P[1])
        let R = Number(value) * PX_PER_M
        // limitar R para no comerse los muros completos
        const maxR = Math.min(lenA, lenB) * Math.tan(theta / 2) * 0.85
        if (R > maxR) R = maxR
        const d = R / Math.tan(theta / 2)
        const TA: number[] = [P[0] + uA[0] * d, P[1] + uA[1] * d]
        const TB: number[] = [P[0] + uB[0] * d, P[1] + uB[1] * d]
        pushHistory()
        let newGeo: DrawGeo
        if (effect === 'fillet') {
          // centro del arco: TA + R·nA con nA perpendicular a uA apuntando hacia TB
          let nA: number[] = [-uA[1], uA[0]]
          if ((TB[0] - TA[0]) * nA[0] + (TB[1] - TA[1]) * nA[1] < 0) nA = [uA[1], -uA[0]]
          const C: number[] = [TA[0] + nA[0] * R, TA[1] + nA[1] * R]
          const midD: number[] = [(TA[0] + TB[0]) / 2, (TA[1] + TB[1]) / 2]
          const uM = normalize2([midD[0] - C[0], midD[1] - C[1]])
          const midArc: number[] = [C[0] + uM[0] * R, C[1] + uM[1] * R]
          newGeo = { kind: 'arco', pts: [TA, midArc, TB] }
        } else {
          newGeo = { kind: 'linea', pts: [TA, TB] }
        }
        set((st) => ({
          elements: st.elements.map((e) => {
            if (e.id === eid) {
              const gg = { ...(e.geo as typeof g) }
              if (corner!.endA === 'A') { gg.x1 = TA[0]; gg.y1 = TA[1] } else { gg.x2 = TA[0]; gg.y2 = TA[1] }
              return { ...e, geo: gg }
            }
            if (e.id === corner!.other.id) {
              const gg = { ...(e.geo as typeof g) }
              if (Math.hypot(gg.x1 - P[0], gg.y1 - P[1]) < Math.hypot(gg.x2 - P[0], gg.y2 - P[1])) { gg.x1 = TB[0]; gg.y1 = TB[1] } else { gg.x2 = TB[0]; gg.y2 = TB[1] }
              return { ...e, geo: gg }
            }
            return e
          }).concat([{
            id: uid(), type: 'dibujo', layer: 'muros',
            name: effect === 'fillet' ? `Empalme R${(R / PX_PER_M).toFixed(2)}` : `Chaflán ${(d / PX_PER_M).toFixed(2)}`,
            geo: newGeo,
          }]),
        }))
        get().pushConsole({
          text: `${effect === 'fillet' ? 'EMPALME' : 'ACHAFLANA'}: esquina a ${(theta * 180 / Math.PI).toFixed(0)}° unida con ${effect === 'fillet' ? `arco R${(R / PX_PER_M).toFixed(2)} m` : `corte de ${(d / PX_PER_M).toFixed(2)} m`} — ambos muros acortados hasta el punto de tangencia`,
          kind: 'out',
        })
        break
      }
      case 'mirrorErase': {
        // SIMETRÍA con borrado de originales — eje "x,7.50" (vertical) o "y,3.00" (horizontal)
        const [axisRaw, posRaw] = String(value).split(',')
        const axis = axisRaw.trim().toLowerCase()
        const pos = (Number(posRaw) || 0) * PX_PER_M
        if (axis !== 'x' && axis !== 'y') {
          get().pushConsole({ text: 'SIMETRÍA: eje no válido — use el formato "x,7.50" o "y,3.00" (distancia en metros)', kind: 'err' })
          return
        }
        pushHistory()
        const g2 = clone(el.geo) as Record<string, unknown>
        const refl = (v: number) => axis === 'x' ? 2 * pos - v : v
        const reflY = (v: number) => axis === 'y' ? 2 * pos - v : v
        if (g2.pts) g2.pts = (g2.pts as number[][]).map((p) => [refl(p[0]), reflY(p[1])])
        for (const k of ['x', 'x1', 'x2', 'cx']) if (g2[k] !== undefined) g2[k] = refl(g2[k] as number)
        for (const k of ['y', 'y1', 'y2', 'cy']) if (g2[k] !== undefined) g2[k] = reflY(g2[k] as number)
        // el original se REFLEJA en sitio (equivale a copiar + borrar originales en una sola operación)
        set((st) => ({
          elements: [...st.elements.map((e) => e.id === eid ? { ...e, geo: g2 as unknown as typeof e.geo, name: `${e.name} (simetría)` } : e)],
          mods: { ...st.mods, [eid]: { ...(st.mods[eid] || {}), translate: undefined } },
        }))
        get().pushConsole({ text: `SIMETRÍA: ${el.name} reflejado sobre el eje ${axis.toUpperCase()} = ${Number(posRaw).toFixed(2)} m — originales borrados (copia espejo generada)`, kind: 'out' })
        break
      }
      case 'matchLayer': {
        pushHistory()
        const sameType = elements.filter((e) => e.type === el.type)
        set((st) => ({
          elements: st.elements.map((e) => sameType.some((t) => t.id === e.id) ? { ...e, layer: el.layer } : e),
        }))
        get().pushConsole({ text: `MATCHPROP (solo capa): capa "${el.layer}" aplicada a ${sameType.length - 1} elementos del mismo tipo`, kind: 'out' })
        break
      }
      case 'convertDoor': {
        // CONVERTIR APERTURA → puerta simple / doble (carpintería real)
        const g = el.geo as OpenGeo
        if (el.type !== 'apertura') {
          get().pushConsole({ text: 'CONVERTIR: solo aperturas/vanos libres', kind: 'err' })
          return
        }
        pushHistory()
        const r = g.orient === 'h' ? g.len : g.len
        const newEls: PlanElement[] = []
        const label = String(value)
        if (label === 'simple') {
          newEls.push({
            id: uid(), type: 'puerta', layer: 'puertas', name: `Puerta ${(g.len / PX_PER_M).toFixed(2)} m`,
            geo: g.orient === 'h'
              ? { cx: g.x, cy: g.y, r, a0: 0, a1: 90, axis: 'h' }
              : { cx: g.x, cy: g.y, r, a0: -90, a1: 0, axis: 'v' },
          })
        } else if (label === 'doble') {
          const half = r / 2
          newEls.push({
            id: uid(), type: 'puerta', layer: 'puertas', name: `Doble puerta ${(g.len / PX_PER_M).toFixed(2)} m · hoja 1`,
            geo: g.orient === 'h'
              ? { cx: g.x, cy: g.y, r: half, a0: 0, a1: 90, axis: 'h' }
              : { cx: g.x, cy: g.y, r: half, a0: -90, a1: 0, axis: 'v' },
          }, {
            id: uid(), type: 'puerta', layer: 'puertas', name: `Doble puerta ${(g.len / PX_PER_M).toFixed(2)} m · hoja 2`,
            geo: g.orient === 'h'
              ? { cx: g.x + g.len, cy: g.y, r: half, a0: 180, a1: 90, axis: 'h' }
              : { cx: g.x, cy: g.y + g.len, r: half, a0: 90, a1: 180, axis: 'v' },
          })
        } else {
          get().pushConsole({ text: `HUECO LIBRE: ${el.name} — vano de ${(g.len / PX_PER_M).toFixed(2)} m sin carpintería (sin cambios)`, kind: 'out' })
          return
        }
        set((st) => ({
          elements: [...st.elements, ...newEls],
          mods: { ...st.mods, [eid]: { ...(st.mods[eid] || {}), deleted: true } },
        }))
        get().pushConsole({ text: `CONVERTIR: apertura → ${label === 'doble' ? 'doble puerta (2 hojas)' : 'puerta simple'} de ${(g.len / PX_PER_M).toFixed(2)} m con giro — original oculto (DESHACER para revertir)`, kind: 'out' })
        break
      }
      case 'qtyReport': {
        // CUANTIFICACIÓN REAL del elemento seleccionado
        const lines = quantifyElement(el, mods[eid] || {})
        lines.forEach((l) => get().pushConsole({ text: l, kind: 'out' }))
        break
      }
      case 'roomCalc': {
        const g = el.geo as RoomGeo
        const w = g.w / PX_PER_M, h = g.h / PX_PER_M
        const area = w * h
        const per = 2 * (w + h)
        const H = mods[eid]?.wallHeight || 2.7
        const kind = String(value)
        if (kind === 'area') get().pushConsole({ text: `ÁREA (${el.name}): ${w.toFixed(2)} × ${h.toFixed(2)} m = ${area.toFixed(2)} m² — etiqueta visible en el plano`, kind: 'out' })
        else if (kind === 'perim') get().pushConsole({ text: `PERÍMETRO (${el.name}): 2 × (${w.toFixed(2)} + ${h.toFixed(2)}) = ${per.toFixed(2)} m — medido por línea media de muros`, kind: 'out' })
        else get().pushConsole({ text: `VOLUMEN (${el.name}): ${area.toFixed(2)} m² × altura ${H.toFixed(2)} m = ${(area * H).toFixed(2)} m³ (BIM)`, kind: 'out' })
        break
      }
      case 'arrayPath': {
        // MATRIZ POR TRAYECTO — valor: "pathId,cantidad"
        const [pathId, nRaw] = String(value).split(',')
        const path = elements.find((e) => e.id === pathId)
        const n = Math.max(2, Math.min(30, Math.round(Number(nRaw)) || 6))
        if (!path || (path.type !== 'dibujo' && path.type !== 'terreno')) {
          get().pushConsole({ text: 'MATRIZ POR TRAYECTO: seleccione una polilínea/lote como trayecto', kind: 'err' })
          return
        }
        const pg = path.geo as DrawGeo
        const src = pg.kind === 'spline' ? sampleCatmullRom(pg.pts, 10)
          : pg.kind === 'rectangulo'
            ? [[pg.pts[0][0], pg.pts[0][1]], [pg.pts[1][0], pg.pts[0][1]], [pg.pts[1][0], pg.pts[1][1]], [pg.pts[0][0], pg.pts[1][1]], [pg.pts[0][0], pg.pts[0][1]]]
            : pg.pts
        if (!src || src.length < 2) {
          get().pushConsole({ text: 'MATRIZ POR TRAYECTO: el trayecto no tiene geometría válida', kind: 'err' })
          return
        }
        // muestreo por longitud de arco
        const lens: number[] = [0]
        for (let i = 1; i < src.length; i++) lens.push(lens[i - 1] + Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]))
        const total = lens[lens.length - 1]
        // centroide del elemento a copiar
        const eg = el.geo as { pts?: number[][]; x?: number; y?: number; w?: number; h?: number; cx?: number; cy?: number }
        let ax = 0, ay = 0
        if (eg.pts?.length) {
          const xs = eg.pts.map((p) => p[0]), ys = eg.pts.map((p) => p[1])
          ax = (Math.min(...xs) + Math.max(...xs)) / 2; ay = (Math.min(...ys) + Math.max(...ys)) / 2
        } else if (eg.cx !== undefined) { ax = eg.cx; ay = eg.cy || 0 }
        else { ax = (eg.x || 0) + (eg.w || 0) / 2; ay = (eg.y || 0) + (eg.h || 0) / 2 }
        pushHistory()
        const newEls: PlanElement[] = []
        for (let k = 1; k <= n; k++) {
          const target = (total / (n + 1)) * k
          let i = 1
          while (i < lens.length && lens[i] < target) i++
          const t = (target - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1])
          const px = src[i - 1][0] + (src[i][0] - src[i - 1][0]) * t
          const py = src[i - 1][1] + (src[i][1] - src[i - 1][1]) * t
          const g2 = clone(el.geo) as Record<string, unknown>
          const dx = px - ax, dy = py - ay
          if (g2.pts) g2.pts = (g2.pts as number[][]).map((p) => [p[0] + dx, p[1] + dy])
          for (const key of ['x', 'x1', 'x2', 'cx']) if (g2[key] !== undefined) g2[key] = (g2[key] as number) + dx
          for (const key of ['y', 'y1', 'y2', 'cy']) if (g2[key] !== undefined) g2[key] = (g2[key] as number) + dy
          newEls.push({ ...el, id: uid(), geo: g2 as unknown as typeof el.geo, name: `${el.name} · trayecto ${k}` })
        }
        set((st) => ({ elements: [...st.elements, ...newEls] }))
        get().pushConsole({ text: `MATRIZ POR TRAYECTO: ${n} copias distribuidas cada ${(total / PX_PER_M / (n + 1)).toFixed(2)} m a lo largo de ${(total / PX_PER_M).toFixed(2)} m de trayecto`, kind: 'out' })
        break
      }
      case 'copyText': {
        const g = el.geo as TextGeo
        const text = g.text || el.name
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(text).then(
            () => get().pushConsole({ text: `TEXTO copiado al portapapeles: "${text.slice(0, 60)}"`, kind: 'out' }),
            () => get().pushConsole({ text: 'TEXTO: el navegador bloqueó el acceso al portapapeles', kind: 'err' }),
          )
        } else {
          get().pushConsole({ text: `TEXTO: "${text}"`, kind: 'out' })
        }
        break
      }
      case 'underlayOpacity': {
        pushHistory()
        set((st) => ({
          elements: st.elements.map((e) => e.id === eid && e.type === 'imagen'
            ? { ...e, geo: { ...e.geo, opacity: Math.min(1, Math.max(0.1, Number(value))) } as typeof e.geo }
            : e),
        }))
        get().pushConsole({ text: `UNDERLAY: opacidad → ${(Number(value) * 100).toFixed(0)}% — calque encima con la capa Referencias encendida`, kind: 'out' })
        break
      }
      case 'pinReply': {
        const t = String(value ?? '').trim()
        if (t) get().addPinReply(eid, t)
        break
      }
      default:
        break
    }
    if (Object.keys(m).length > 0) {
      mods[eid] = m
      set({ mods })
    }
  },

  runGlobal: (g, elId) => {
    const s = get()
    switch (g) {
      case 'toggleRender':
        set({ renderMode: !s.renderMode })
        s.pushConsole({ text: `RENDER ${!s.renderMode ? 'activado' : 'desactivado'} (V-Ray/Lumion)`, kind: 'out' })
        break
      case 'toggle3D':
        set({ view3D: !s.view3D })
        s.pushConsole({ text: `Vista 3D ${!s.view3D ? 'activada' : 'desactivada'}`, kind: 'out' })
        break
      case 'toggleGrid':
        set({ showGrid: !s.showGrid })
        break
      case 'toggleSnap':
        set({ snap: !s.snap })
        break
      case 'toggleOrtho':
        set({ ortho: !s.ortho })
        break
      case 'toggleLayers':
        set({ showLayers: !s.showLayers })
        break
      case 'toggleProperties':
        set({ showProperties: !s.showProperties })
        break
      case 'zoomIn':
        s.zoomBy(1.25)
        break
      case 'zoomOut':
        s.zoomBy(0.8)
        break
      case 'fit':
        s.fitView()
        break
      case 'showSchedule':
        set({ dialog: 'schedule' })
        break
      case 'showCatalog':
        set({ dialog: 'catalog' })
        break
      case 'showBlockLibrary':
        set({ dialog: 'blocks' })
        break
      case 'showPdfExport':
        set({ dialog: 'pdf' })
        break
      // ---------- multinivel (Ola 8): acciones directas del ribbon ----------
      case 'nivelDup':
        s.duplicateLevel(s.activeLevel)
        break
      case 'nivelElim':
        s.deleteLevel(s.activeLevel)
        break
      case 'showElevations':
        set({ dialog: 'elevations' })
        break
      case 'showIso3D':
        set({ dialog: 'iso3d' })
        break
      case 'showNormativa':
        set({ dialog: 'normativa' })
        break
      case 'showMetrados':
        set({ dialog: 'metrados' })
        break
      case 'showVersions':
        set({ dialog: 'versions' })
        break
      case 'showShare':
        set({ dialog: 'share' })
        break
      case 'showStairDialog':
        set({ dialog: 'escalera' })
        break
      case 'showRoofDialog':
        set({ dialog: 'techo' })
        break
      case 'showQuickSelect':
        set({ dialog: 'quickselect' })
        break
      case 'showLighting':
        set({ dialog: 'lighting' })
        break
      case 'showAcoustic':
        set({ dialog: 'acoustic' })
        break
      case 'showPhases':
        set({ dialog: 'phases' })
        break
      case 'exportDxf': {
        const nDxf = s.elements.filter((e) => !s.mods[e.id]?.deleted).length
        set({ dialog: null })
        import('@/lib/dxf-export').then(({ exportPlanDxf }) => {
          const r = exportPlanDxf(s.elements, s.mods, s.layers)
          s.pushConsole({ text: `DXF EXPORTADO: ${r.filename} · ${r.bytes.toLocaleString('es-PE')} bytes · ${nDxf} objetos · capas conservadas · unidades en metros`, kind: 'out' })
        })
        break
      }
      case 'exportPng':
      case 'exportSvg': {
        import('@/lib/raster-export').then(async (mod) => {
          const svgEl = mod.getRegisteredSvg()
          if (!svgEl) {
            s.pushConsole({ text: 'EXPORTAR: no se encontró el lienzo — abra el plano e intente de nuevo', kind: 'err' })
            return
          }
          const r = g === 'exportPng'
            ? await mod.exportPlanPng(svgEl)
            : await mod.exportPlanSvg(svgEl)
          if (r) s.pushConsole({ text: `${g === 'exportPng' ? 'PNG' : 'SVG'} EXPORTADO: ${r.filename} · ${(r.bytes / 1024).toFixed(1)} KB`, kind: 'out' })
        })
        break
      }
      case 'exportPlanJson':
        s.exportShareFile()
        break
      case 'cleanJoins':
        s.cleanJoins()
        break
      case 'energyReport':
        set({ dialog: 'energy' })
        break
      case 'clashCheck':
        set({ dialog: 'clash' })
        break
      case 'toggleAreas':
        set((st) => ({ areaLabels: !st.areaLabels }))
        s.pushConsole({ text: `ROTULADO DE ÁREAS ${!s.areaLabels ? 'activado' : 'desactivado'} — etiquetas m² ${!s.areaLabels ? 'visibles' : 'ocultas'}`, kind: 'out' })
        break
      case 'toggleAutoDims': {
        const nSpaces = s.elements.filter((e) => e.type === 'espacio' && !s.mods[e.id]?.deleted).length
        set((st) => ({ autoDims: !st.autoDims }))
        s.pushConsole({ text: `ACOTACIÓN AUTOMÁTICA ${!s.autoDims ? 'activada' : 'desactivada'} — ${nSpaces} ambientes · ${nSpaces * 2} cotas interiores (ancho y alto en m)`, kind: 'out' })
        break
      }
      case 'toggleSun': {
        const next = !s.sun.active
        set({ sun: { ...s.sun, active: next } })
        s.pushConsole({ text: `HELIODÓN ${next ? 'ACTIVADO — sombras proyectadas según latitud/fecha/hora' : 'desactivado'}`, kind: 'out' })
        break
      }
      case 'toggleSunPath':
        set({ sun: { ...s.sun, showPath: !s.sun.showPath } })
        s.pushConsole({ text: `Trayectorias solares ${!s.sun.showPath ? 'visibles' : 'ocultas'} (solsticios + equinoccio)`, kind: 'out' })
        break
      case 'sunSummer': {
        const d = s.sun.lat >= 0 ? dayOfYear(6, 21) : dayOfYear(12, 21)
        set({ sun: { ...s.sun, active: true, day: d } })
        s.pushConsole({ text: `SOLSTICIO DE VERANO (${s.sun.lat >= 0 ? '21 jun' : '21 dic'}) — sombra ${'mínima'} del año`, kind: 'out' })
        break
      }
      case 'sunWinter': {
        const d = s.sun.lat >= 0 ? dayOfYear(12, 21) : dayOfYear(6, 21)
        set({ sun: { ...s.sun, active: true, day: d } })
        s.pushConsole({ text: `SOLSTICIO DE INVIERNO (${s.sun.lat >= 0 ? '21 dic' : '21 jun'}) — sombra máxima del año`, kind: 'out' })
        break
      }
      case 'sunEquinox':
        set({ sun: { ...s.sun, active: true, day: dayOfYear(3, 21) } })
        s.pushConsole({ text: 'EQUINOCCIO (21 mar) — día y noche duran lo mismo; sombra media', kind: 'out' })
        break
      case 'print':
        if (typeof window !== 'undefined') window.print()
        break
      case 'purge': {
        // PURGA real: elimina definitivamente los elementos marcados como borrados
        const purged = s.elements.filter((e) => s.mods[e.id]?.deleted).length
        const emptyLayers = s.layers.filter((l) => !s.elements.some((e) => e.layer === l.id && !s.mods[e.id]?.deleted)).length
        if (purged > 0) {
          set((st) => ({
            elements: st.elements.filter((e) => !st.mods[e.id]?.deleted),
            undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [],
          }))
        }
        s.pushConsole({
          text: `PURGA: ${purged} elemento${purged !== 1 ? 's' : ''} borrado${purged !== 1 ? 's' : ''} eliminado${purged !== 1 ? 's' : ''} definitivamente · ${emptyLayers} capa${emptyLayers !== 1 ? 's' : ''} sin objetos · ${s.elements.length - purged} objetos vivos`,
          kind: 'out',
        })
        break
      }
      case 'auditCmd': {
        // AUDIT real: verifica integridad geométrica del dibujo
        const issues: string[] = []
        const alive = s.elements.filter((e) => !s.mods[e.id]?.deleted)
        for (const e of alive) {
          if (e.type === 'muro') {
            const g = e.geo as { x1: number; y1: number; x2: number; y2: number; t: number }
            if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) < 2) issues.push(`${e.name}: longitud casi nula`)
            const th = s.mods[e.id]?.thickness ?? g.t
            if (!th || th < 3) issues.push(`${e.name}: espesor inválido`)
          }
          if (e.type === 'espacio') {
            const g = e.geo as { name: string; w: number; h: number }
            if (!g.name || !g.name.trim()) issues.push('Espacio sin nombre')
            if (g.w < 12 || g.h < 12) issues.push(`${g.name || 'Espacio'}: dimensiones mínimas`)
          }
          if (e.type === 'cota') {
            const g = e.geo as { x1: number; y1: number; x2: number; y2: number }
            if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) < 1) issues.push(`${e.name}: puntos coincidentes`)
          }
        }
        if (issues.length === 0) {
          s.pushConsole({ text: `AUDIT: 0 errores — ${alive.length} objetos verificados (longitudes, espesores, nombres y cotas íntegros)`, kind: 'out' })
        } else {
          issues.slice(0, 8).forEach((i) => s.pushConsole({ text: `AUDIT · ${i}`, kind: 'err' }))
          s.pushConsole({ text: `AUDIT: ${issues.length} observaciones en ${alive.length} objetos`, kind: 'err' })
        }
        break
      }
      case 'undo':
        s.undo()
        break
      case 'redo':
        s.redo()
        break
      case 'newPlan':
        s.newPlan()
        break
      case 'walkthrough':
        s.walkthrough()
        break
      case 'isolateLayer': {
        const el = s.elements.find((e) => e.id === (elId || s.selectedId))
        if (el) s.isolateLayer(el.layer)
        break
      }
      case 'hideLayer': {
        const el = s.elements.find((e) => e.id === (elId || s.selectedId))
        if (el) s.setLayerVisible(el.layer, false)
        break
      }
      // ---------- guardar / versiones ----------
      case 'saveNow': {
        const n = listVersions().length + 1
        s.savePlanVersion(`Plano v${n} — ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`)
        break
      }
      case 'saveCopy': {
        const n = listVersions().length + 1
        s.savePlanVersion(`Copia jarumy-plano-v${n}`)
        break
      }
      case 'bimExcel': {
        // cuadros BIM → Excel multi-hoja (Resumen + 5 cuadros)
        import('@/lib/bim-schedules').then((mod) => {
          const st = get()
          const data = mod.computeBimSchedules(st.elements, st.mods)
          const r = mod.downloadBimWorkbook(data, 'PLANO JARUMY')
          get().pushConsole({ text: `CUADROS BIM EXPORTADOS: ${r.filename} · ${(r.bytes / 1024).toFixed(1)} KB · 6 hojas (Resumen + Espacios + Muros + Puertas + Ventanas + Sanitarios) — ábralo en Excel, LibreOffice o Google Sheets`, kind: 'out' })
        })
        break
      }
      // ---------- ajustes de documento reales ----------
      case 'unitsMetric':
        set({ units: 'm' })
        s.pushConsole({ text: 'UNIDADES: métrico decimal activo — precisión 0.00 m, cotas en metros', kind: 'out' })
        break
      case 'unitsImperial':
        set({ units: 'ft' })
        s.pushConsole({ text: 'UNIDADES: arquitectural (pies-pulgadas) activo — cotas en \'-" con precisión 1/16"', kind: 'out' })
        break
      case 'scale50':
      case 'scale75':
      case 'scale100': {
        const sc = g === 'scale50' ? 50 : g === 'scale75' ? 75 : 100
        set({ planScale: sc as 50 | 75 | 100 })
        s.pushConsole({ text: `ESCALA DE LÁMINA 1:${sc} — cotas y textos reajustados automáticamente al factor ${(100 / sc).toFixed(2)}`, kind: 'out' })
        break
      }
      case 'dimStyleArq':
        set({ dimStyle: s.dimStyle === 'arq60' ? 'lineal' : 'arq60' })
        s.pushConsole({ text: `ESTILO DE COTA: ${s.dimStyle === 'arq60' ? 'LINEAL (flechas)' : '"ARQ-60" (oblicuas, texto 2.5 mm, ISO-25)'} — aplicado a todas las cotas`, kind: 'out' })
        break
      case 'textStyleRomans':
        set({ textStyle: s.textStyle === 'romans' ? 'standard' : 'romans' })
        s.pushConsole({ text: `ESTILO DE TEXTO: ${s.textStyle === 'romans' ? 'STANDARD' : '"Romans" — altura 0.20 m, oblicua 15°'} — aplicado a todos los textos`, kind: 'out' })
        break
      case 'textStyleArq':
        set({ textStyle: s.textStyle === 'arquitectural' ? 'standard' : 'arquitectural' })
        s.pushConsole({ text: `ESTILO DE TEXTO: ${s.textStyle === 'arquitectural' ? 'STANDARD' : '"Arquitectural" — altura 0.20 m, factor de anchura 0.85'} — aplicado a todos los textos`, kind: 'out' })
        break
      case 'renderDraft':
        set({ renderQuality: 'borrador', renderMode: true })
        s.pushConsole({ text: 'RENDER BORRADOR: GI básico, sin cáusticas — vista previa rápida (30 s)', kind: 'out' })
        break
      case 'renderUltra':
        set({ renderQuality: 'ultra', renderMode: true })
        s.pushConsole({ text: 'RENDER ULTRA: sombras suaves multicapa + texturas afinadas — denoiser activado (ray tracing 4K)', kind: 'out' })
        break
      // ---------- BIM real ----------
      case 'structuralReport':
        set({ dialog: 'structural' })
        break
      case 'showCollab':
        set({ dialog: 'collab' })
        break
      case 'showCloud':
        set({ dialog: 'cloud' })
        break
      case 'showThermal':
        set({ dialog: 'thermal' })
        break
      case 'showAccesibilidad':
        set({ dialog: 'accesibilidad' })
        break
      case 'showEvacuacion':
        set({ dialog: 'evacuacion' })
        break
      case 'showPv':
        set({ dialog: 'fotovoltaico' })
        break
      case 'showAiPlan':
        set({ dialog: 'aiplan' })
        break
      case 'showAiNorma':
        set({ dialog: 'ainorma' })
        break
      case 'showWalkthrough':
        set({ dialog: 'walkthrough' })
        break
      case 'showUnderlay':
        set({ dialog: 'underlay' })
        break
      case 'toggleOsnap':
        s.toggleOsnap()
        break
      case 'selectAll':
        s.selectAll()
        break
      case 'copySel':
        s.copySelection()
        break
      case 'cutSel':
        s.cutSelection()
        break
      case 'pasteSel':
        s.pasteClipboard()
        break
      case 'armSeleccionar':
        s.armDraw('seleccionar')
        s.pushConsole({ text: 'SELECCIONAR: arrastre una ventana sobre los objetos (o Shift+arrastre directo) · Ctrl+clic agrega/quita', kind: 'cmd' })
        break
      case 'importDxf': {
        // dispara el input de archivo oculto montado en la página
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('jarumy-import-dxf'))
        break
      }
      case 'exportIfc': {
        const nIfc = s.elements.filter((e) => !s.mods[e.id]?.deleted).length
        set({ dialog: null })
        import('@/lib/ifc-export').then(({ exportPlanIfc }) => {
          try {
            const r = exportPlanIfc(s.elements, s.mods, s.levels)
            const url = URL.createObjectURL(new Blob([r.content], { type: 'application/x-step' }))
            const a = document.createElement('a')
            a.href = url; a.download = r.filename
            document.body.appendChild(a); a.click(); a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 4000)
            s.pushConsole({ text: `IFC EXPORTADO: ${r.filename} · ${(r.bytes / 1024).toFixed(1)} KB · ${nIfc} objetos en ${s.levels.length} IfcBuildingStorey — ábralo en Revit, ArchiCAD, BIMcollab o Solibri (esquema IFC4)`, kind: 'out' })
          } catch {
            s.pushConsole({ text: 'IFC: error al generar el archivo', kind: 'err' })
          }
        })
        break
      }
      case 'exportObj':
      case 'exportStl': {
        const isStl = g === 'exportStl'
        const n3d = s.elements.filter((e) => !s.mods[e.id]?.deleted).length
        set({ dialog: null })
        import('@/lib/mesh-export').then(({ exportPlanObj, exportPlanStl }) => {
          try {
            const r = isStl ? exportPlanStl(s.elements, s.mods) : exportPlanObj(s.elements, s.mods)
            const url = URL.createObjectURL(new Blob([r.content], { type: isStl ? 'model/stl' : 'model/obj' }))
            const a = document.createElement('a')
            a.href = url; a.download = r.filename
            document.body.appendChild(a); a.click(); a.remove()
            setTimeout(() => URL.revokeObjectURL(url), 4000)
            s.pushConsole({ text: `${isStl ? 'STL' : 'OBJ'} EXPORTADO: ${r.filename} · ${(r.bytes / 1024).toFixed(1)} KB · malla de ${n3d} objetos extruidos (${isStl ? 'listo para impresión 3D' : 'listo para Blender/SketchUp/3ds Max'})`, kind: 'out' })
          } catch {
            s.pushConsole({ text: `${isStl ? 'STL' : 'OBJ'}: error al generar la malla`, kind: 'err' })
          }
        })
        break
      }
      case 'toggleVoice': {
        const next = !s.voiceActive
        set({ voiceActive: next })
        s.pushConsole({ text: `VOZ ${next ? 'ACTIVADA — haga clic en el micrófono de la consola y hable su comando («línea», «guardar», «vista tres de»…)' : 'desactivada'}`, kind: 'out' })
        break
      }
      case 'listPins': {
        const pins = s.elements.filter((e) => e.type === 'pin' && !s.mods[e.id]?.deleted)
        if (!pins.length) { s.pushConsole({ text: 'PINES: no hay comentarios en el plano — use la herramienta PIN (capa Comentarios)', kind: 'err' }); break }
        const resolved = pins.filter((p) => (p.geo as PinGeo).resolved).length
        const withReplies = pins.filter((p) => (p.geo as PinGeo).replies?.length).length
        s.pushConsole({ text: `PINES DE COMENTARIO: ${pins.length} en el plano · ${resolved} resueltos · ${withReplies} con respuestas`, kind: 'out' })
        pins.forEach((p) => {
          const g = p.geo as PinGeo
          s.pushConsole({ text: `  · ${p.name}: "${g.text.slice(0, 50)}" — ${g.resolved ? 'RESUELTO' : 'PENDIENTE'}${g.replies?.length ? ` · ${g.replies.length} respuesta${g.replies.length > 1 ? 's' : ''} (última de ${g.replies[g.replies.length - 1].author})` : ''}`, kind: 'out' })
        })
        break
      }
      case 'showFamilias':
        set({ dialog: 'familias' })
        break
      case 'showBlockEditor': {
        const target = elId || s.selectedId
        if (!target) {
          s.pushConsole({ text: 'EDITOR DE BLOQUES: seleccione primero un bloque del plano (clic derecho)', kind: 'err' })
          return
        }
        set({ dialog: 'blockeditor' })
        break
      }
      case 'showScheduleMuros':
      case 'showSchedulePuertas':
      case 'showScheduleVentanas':
      case 'showScheduleSanitarios': {
        const tab = g === 'showScheduleMuros' ? 'muros' : g === 'showSchedulePuertas' ? 'puertas'
          : g === 'showScheduleVentanas' ? 'ventanas' : 'sanitarios'
        set({ scheduleTab: tab as JarumyState['scheduleTab'], dialog: 'schedule' })
        break
      }
      // ---------- estados de capa reales (Layer States) ----------
      case 'layerStateRevision': {
        // preset real "Revisión": mobiliario apagado, cotas encendidas
        set((st) => ({
          layers: st.layers.map((l) => ({
            ...l,
            visible: l.id === 'mobiliario' || l.id === 'instalaciones' ? false
              : l.id === 'cotas' || l.id === 'textos' || l.id === 'comentarios' ? true
              : l.visible,
          })),
        }))
        s.pushConsole({ text: 'ESTADO DE CAPA "REVISIÓN" APLICADO: mobiliario e instalaciones apagados · cotas, textos y comentarios encendidos', kind: 'out' })
        break
      }
      case 'layerStateSave': {
        if (typeof window !== 'undefined') {
          try {
            const saved = { name: `Estado ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`, layers: s.layers.map((l) => ({ id: l.id, visible: l.visible })) }
            const list = JSON.parse(window.localStorage.getItem('jarumy-layerstates') || '[]') as Array<{ name: string; layers: Array<{ id: string; visible: boolean }> }>
            list.push(saved)
            window.localStorage.setItem('jarumy-layerstates', JSON.stringify(list.slice(-10)))
            s.pushConsole({ text: `ESTADO DE CAPA GUARDADO: "${saved.name}" — ${list.length} estados en el historial (máx. 10)`, kind: 'out' })
          } catch {
            s.pushConsole({ text: 'ESTADO DE CAPA: no se pudo guardar (almacenamiento no disponible)', kind: 'err' })
          }
        }
        break
      }
      // ---------- trazado por lotes REAL (multi-lámina) ----------
      case 'batchPlot': {
        const nSheets = s.levels.length + 6 // índice + plantas + 4 elevaciones + sección
        s.pushConsole({ text: `TRAZADO POR LOTES: ${nSheets} láminas — índice (A-00) + ${s.levels.length} planta(s) por nivel + 4 elevaciones + sección transversal`, kind: 'out' })
        s.pushConsole({ text: 'TRAZADO: pulse «Trazar lote completo» en el diálogo para generar el PDF multi-lámina con cartela numerada', kind: 'out' })
        set({ dialog: 'pdf' })
        break
      }
      default:
        break
    }
  },

  executeAction: (action, elId) => {
    const s = get()
    switch (action.kind) {
      case 'effect':
        if (action.effect === 'rename' || action.effect === 'renumber') return // manejado por prompt
        s.applyEffect(elId || s.selectedId, action.effect!, action.value)
        break
      case 'global':
        s.runGlobal(action.global!, elId)
        break
      case 'draw':
        s.armDraw(action.draw!)
        s.pushConsole({ text: `Herramienta activa: ${action.draw} — clic en el plano (ESC para salir)`, kind: 'cmd' })
        break
      case 'info':
        s.pushConsole({ text: action.info!, kind: 'out' })
        break
      case 'prompt': {
        const target = elId || s.selectedId
        if (!target && action.prompt!.effect !== 'stretch') {
          s.pushConsole({ text: `${action.prompt!.label.split('—')[0].trim()}: seleccione primero un elemento del plano (clic derecho sobre él)`, kind: 'err' })
          return
        }
        void s.requestPrompt(action.prompt!.label, action.prompt!.def || '').then((val) => {
          if (val === null) return
          s.applyEffect(target, action.prompt!.effect, val)
        })
        break
      }
      default:
        break
    }
  },

  insertBlock: (kind, x, y) => {
    const s = get()
    const block = BLOCK_LIBRARY.find((b) => b.kind === kind)
    if (!block) return
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    const id = uid()
    set((st) => ({
      elements: [...st.elements, {
        id,
        type: block.sanitary ? 'sanitario' : 'mobiliario',
        layer: block.sanitary ? 'sanitarios' : 'mobiliario',
        name: block.label,
        level: st.activeLevel,
        geo: { kind: block.kind, x: x - block.w / 2, y: y - block.h / 2, w: block.w, h: block.h },
      }],
      // rotación acumulada con R durante la inserción
      mods: st.insertRotation % 360 !== 0 ? { ...st.mods, [id]: { rotation: st.insertRotation } } : st.mods,
    }))
    s.pushConsole({ text: `Bloque insertado: ${block.label}${s.insertRotation % 360 !== 0 ? ` (rotado ${s.insertRotation}°)` : ''}`, kind: 'out' })
  },

  insertStair: (geo) => {
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    set((st) => ({
      elements: [...st.elements, {
        id: uid(), type: 'escalera', layer: 'muros',
        name: `Escalera ${geo.steps} pasos`,
        level: st.activeLevel,
        geo: { ...geo, x: VIEW_W / 2 - geo.w / 2, y: VIEW_H / 2 - geo.h / 2 },
      }],
      dialog: null,
    }))
    get().pushConsole({ text: `ESCALERA creada: ${geo.steps} pasos · huella ${(geo.tread * 100).toFixed(0)} cm · contrahuella ${(geo.riser * 100).toFixed(1)} cm — use MOVER para recolocar`, kind: 'out' })
  },

  insertRoof: (geo) => {
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    set((st) => ({
      elements: [...st.elements, {
        id: uid(), type: 'techo', layer: 'muros',
        name: geo.kind === 'dos-aguas' ? 'Techo a dos aguas' : geo.kind === 'cuatro-aguas' ? 'Techo a cuatro aguas' : 'Techo plano',
        level: st.activeLevel,
        geo: { ...geo, x: VIEW_W / 2 - geo.w / 2, y: VIEW_H / 2 - geo.h / 2 },
      }],
      dialog: null,
    }))
    get().pushConsole({ text: `TECHO creado: ${geo.kind} · pendiente ${geo.slope}% — use MOVER para recolocar`, kind: 'out' })
  },

  insertPin: (x, y, text) => {
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    const n = get().elements.filter((e) => e.type === 'pin').length + 1
    set((st) => ({
      elements: [...st.elements, {
        id: uid(), type: 'pin', layer: 'comentarios',
        name: `Comentario ${n}`,
        level: st.activeLevel,
        geo: { x, y, text, author: 'J. Burga' },
      }],
    }))
    get().pushConsole({ text: `PIN #${n} de comentario colocado (capa Comentarios)`, kind: 'out' })
  },

  cleanJoins: () => {
    const s = get()
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    // extiende cada extremo de muro hasta el eje del muro que toca
    // (unión en T/L: el hueco entre cara y eje queda cerrado)
    const walls = s.elements.filter((e) => e.type === 'muro' && !s.mods[e.id]?.deleted)
    let fixes = 0
    const elements = s.elements.map((el) => {
      if (el.type !== 'muro' || s.mods[el.id]?.deleted) return el
      const g = { ...(el.geo as { x1: number; y1: number; x2: number; y2: number; t: number }) }
      for (const w of walls) {
        if (w.id === el.id) continue
        const wg = w.geo as typeof g
        const wx0 = Math.min(wg.x1, wg.x2), wx1 = Math.max(wg.x1, wg.x2)
        const wy0 = Math.min(wg.y1, wg.y2), wy1 = Math.max(wg.y1, wg.y2)
        const tol = 6
        // extremo A dentro del cuerpo del otro muro (con margen)?
        const inA = g.x1 >= wx0 - tol && g.x1 <= wx1 + tol && g.y1 >= wy0 - tol && g.y1 <= wy1 + tol
        // y el otro muro es aproximadamente perpendicular o cruza el eje
        if (inA) {
          const cx = (wx0 + wx1) / 2, cy = (wy0 + wy1) / 2
          const d = Math.hypot(g.x1 - cx, g.y1 - cy)
          const d2 = Math.hypot(g.x2 - cx, g.y2 - cy)
          if (d < d2 && d > 1) { g.x1 = cx; g.y1 = cy; fixes++ }
        }
        const inB = g.x2 >= wx0 - tol && g.x2 <= wx1 + tol && g.y2 >= wy0 - tol && g.y2 <= wy1 + tol
        if (inB) {
          const cx = (wx0 + wx1) / 2, cy = (wy0 + wy1) / 2
          const d = Math.hypot(g.x2 - cx, g.y2 - cy)
          const d2 = Math.hypot(g.x1 - cx, g.y1 - cy)
          if (d < d2 && d > 1) { g.x2 = cx; g.y2 = cy; fixes++ }
        }
      }
      return { ...el, geo: g }
    })
    set({ elements })
    get().pushConsole({ text: `UNIONES T/L: ${fixes} extremos de muro extendidos hasta el eje de intersección`, kind: 'out' })
  },

  exportShareFile: () => {
    const s = get()
    downloadPlanJson({ elements: s.elements, mods: s.mods, layers: s.layers, gridSpacing: s.gridSpacing })
    get().pushConsole({ text: 'PLANO COMPARTIDO: archivo .jarumy.json descargado — envíelo a su colega (Importar plano para restaurarlo)', kind: 'out' })
  },

  importShareFile: (json) => {
    const parsed = parsePlanFile(json)
    if (!parsed) {
      get().pushConsole({ text: 'IMPORTAR: archivo no válido (se esperaba un plano .jarumy.json exportado por esta app)', kind: 'err' })
      return
    }
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    set({
      elements: parsed.elements,
      mods: parsed.mods,
      layers: parsed.layers,
      gridSpacing: parsed.gridSpacing,
      dialog: null,
    })
    get().pushConsole({ text: `PLANO IMPORTADO: ${parsed.elements.length} elementos restaurados (${new Date(parsed.savedAt).toLocaleString('es-PE')})`, kind: 'out' })
  },

  savePlanVersion: (name) => {
    const s = get()
    const v = saveVersion({ elements: s.elements, mods: s.mods, layers: s.layers, gridSpacing: s.gridSpacing }, name)
    get().pushConsole({ text: `VERSIÓN GUARDADA: "${v.name}" · ${v.data.elements.length} elementos · ${listVersions().length} versiones en el historial`, kind: 'out' })
  },

  deletePlanVersion: (id) => {
    deleteVersion(id)
    get().pushConsole({ text: 'Versión eliminada del historial', kind: 'out' })
  },

  restorePlanVersion: (data) => {
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    set({ elements: data.elements, mods: data.mods, layers: data.layers, gridSpacing: data.gridSpacing })
    get().pushConsole({ text: `VERSIÓN RESTAURADA: ${data.elements.length} elementos · ${new Date(data.savedAt).toLocaleString('es-PE')}`, kind: 'out' })
  },

  toggleAutosave: () => {
    const next = !get().autosaveOn
    writeAutosavePref(next)
    if (next) {
      set({ autosaveOn: true })
      persistAutosaveNow() // snapshot inmediato del estado actual
      get().pushConsole({ text: 'AUTO-GUARDADO ACTIVADO: el plano completo (elementos, capas, ajustes y vista) se guarda solo tras cada cambio en este navegador', kind: 'out' })
    } else {
      clearAutosave()
      set({ autosaveOn: false, autosaveStatus: 'idle', autosaveAt: null })
      get().pushConsole({ text: 'AUTO-GUARDADO DESACTIVADO: copia local eliminada — use GUARDAR (versiones) o COMPARTIR (.json) para conservar el plano', kind: 'out' })
    }
  },

  restoreAutosave: () => {
    if (typeof window === 'undefined') return false
    if (!readAutosavePref()) {
      set({ autosaveOn: false })
      get().pushConsole({ text: 'AUTO-GUARDADO desactivado (preferencia recordada) — actívelo en la barra de estado para persistir el plano', kind: 'out' })
      return false
    }
    const data = loadAutosave()
    if (!data) return false // arranque limpio: no hay plano guardado
    set({
      elements: data.elements,
      mods: data.mods,
      layers: data.layers,
      levels: data.levels,
      activeLevel: data.activeLevel,
      gridSpacing: data.gridSpacing,
      nextId: data.nextId,
      renderQuality: data.renderQuality,
      planScale: data.planScale,
      units: data.units,
      dimStyle: data.dimStyle,
      textStyle: data.textStyle,
      clashTolerance: data.clashTolerance,
      sun: data.sun,
      renderMode: data.renderMode,
      view3D: data.view3D,
      showGrid: data.showGrid,
      snap: data.snap,
      ortho: data.ortho,
      radialEnabled: data.radialEnabled,
      showLayers: data.showLayers,
      showProperties: data.showProperties,
      areaLabels: data.areaLabels,
      autoDims: data.autoDims,
      insertRotation: data.insertRotation,
      phaseFilter: data.phaseFilter,
      osnap: data.osnap,
      osnapModes: { ...DEFAULT_OSNAP_MODES, ...(data.osnapModes || {}) },
      autosaveOn: true,
    })
    // la vista se aplica tras el auto-encuadre inicial del lienzo
    // (PlanCanvas mide su tamaño de forma asíncrona y re-encuadra)
    const { zoom, panX, panY } = data
    setTimeout(() => useJarumy.setState({ zoom, panX, panY }), 300)
    get().pushConsole({
      text: `PLANO RESTAURADO del auto-guardado: ${data.elements.length} elementos · ${data.layers.length} capas · ${data.levels.length} nivel(es) · guardado ${new Date(data.savedAt).toLocaleString('es-PE')}`,
      kind: 'out',
    })
    return true
  },

  setLayerVisible: (id, v) => set((s) => ({
    layers: s.layers.map((l) => (l.id === id ? { ...l, visible: v } : l)),
  })),

  isolateLayer: (id) => set((s) => ({
    layers: s.layers.map((l) => ({ ...l, visible: l.id === id })),
  })),

  runCommand: async (raw) => {
    const s = get()
    const cmd = raw.trim().toUpperCase()
    s.pushConsole({ text: `Comando: ${cmd}`, kind: 'cmd' })
    if (!cmd) return
    const ask = (label: string, def = '') => s.requestPrompt(label, def)
    const alias: Record<string, () => void | Promise<void>> = {
      'L': () => s.armDraw('linea'), 'LINEA': () => s.armDraw('linea'),
      'PL': () => s.armDraw('polilinea'), 'POLILINEA': () => s.armDraw('polilinea'),
      'C': () => s.armDraw('circulo'), 'CIRCULO': () => s.armDraw('circulo'),
      'REC': () => s.armDraw('rectangulo'), 'RECTANGULO': () => s.armDraw('rectangulo'),
      'T': () => s.armDraw('texto'), 'TEXTO': () => s.armDraw('texto'),
      'COTA': () => s.armDraw('cota'), 'ACOTA': () => s.armDraw('cota'),
      'BORRAR': () => s.armDraw('borrar'), 'E': () => s.armDraw('borrar'),
      'M': () => s.armDraw('mover'), 'MUEVE': () => s.armDraw('mover'), 'MOVER': () => s.armDraw('mover'),
      'CO': () => s.armDraw('copiar'), 'COPIA': () => s.armDraw('copiar'),
      'REJILLA': () => s.runGlobal('toggleGrid'), 'GRID': () => s.runGlobal('toggleGrid'),
      'SNAP': () => s.runGlobal('toggleSnap'), 'ORTO': () => s.runGlobal('toggleOrtho'),
      'RENDER': () => s.runGlobal('toggleRender'),
      'AJUSTAR': () => s.runGlobal('fit'), 'Z': () => s.runGlobal('fit'),
      'PURGA': () => s.runGlobal('purge'), 'PURGE': () => s.runGlobal('purge'),
      'AUDIT': () => s.runGlobal('auditCmd'), 'AUDITA': () => s.runGlobal('auditCmd'),
      'CATALOGO': () => s.runGlobal('showCatalog'),
      'CUADRO': () => s.runGlobal('showSchedule'), 'ESPACIOS': () => s.runGlobal('showSchedule'),
      'COLISIONES': () => s.runGlobal('clashCheck'),
      'ENERGIA': () => s.runGlobal('energyReport'),
      'BLOQUES': () => s.runGlobal('showBlockLibrary'), 'BIBLIOTECA': () => s.runGlobal('showBlockLibrary'),
      'SOL': () => s.runGlobal('toggleSun'), 'HELIODON': () => s.runGlobal('toggleSun'), 'SOMBRAS': () => s.runGlobal('toggleSun'),
      'AREAS': () => s.runGlobal('toggleAreas'), 'ROTULAR': () => s.runGlobal('toggleAreas'),
      'ACOTAR': () => s.runGlobal('toggleAutoDims'), 'AUTOCOTA': () => s.runGlobal('toggleAutoDims'),
      'ACOTACION': () => s.runGlobal('toggleAutoDims'), 'COTASAUTO': () => s.runGlobal('toggleAutoDims'),
      'PDF': () => s.runGlobal('showPdfExport'), 'EXPORTAR': () => s.runGlobal('showPdfExport'), 'EXPPDF': () => s.runGlobal('showPdfExport'),
      'DXF': () => s.runGlobal('exportDxf'), 'DWG': () => s.runGlobal('exportDxf'),
      'PNG': () => s.runGlobal('exportPng'), 'SVG': () => s.runGlobal('exportSvg'),
      'ELEVACION': () => s.runGlobal('showElevations'), 'ELEVACIONES': () => s.runGlobal('showElevations'), 'SECCION': () => s.runGlobal('showElevations'),
      '3D': () => s.runGlobal('showIso3D'), 'ISOMETRICO': () => s.runGlobal('showIso3D'), 'VISTA3D': () => s.runGlobal('showIso3D'),
      'NORMA': () => s.runGlobal('showNormativa'), 'NORMATIVA': () => s.runGlobal('showNormativa'), 'RNE': () => s.runGlobal('showNormativa'),
      'METRADO': () => s.runGlobal('showMetrados'), 'METRADOS': () => s.runGlobal('showMetrados'), 'S10': () => s.runGlobal('showMetrados'), 'PRESUPUESTO': () => s.runGlobal('showMetrados'),
      'COMPARTIR': () => s.runGlobal('showShare'), 'HISTORIAL': () => s.runGlobal('showVersions'), 'VERSIONES': () => s.runGlobal('showVersions'),
      'ESCALERA': () => s.runGlobal('showStairDialog'), 'TECHO': () => s.runGlobal('showRoofDialog'),
      // --- curvas y anotaciones multiclic ---
      'ARCO': () => s.armDraw('arco'), 'ELIPSE': () => s.armDraw('elipse'), 'SPLINE': () => s.armDraw('spline'),
      'DIRECTRIZ': () => s.armDraw('directriz'), 'NUBE': () => s.armDraw('nube'), 'NUBEDECTRL': () => s.armDraw('nube'),
      'HATCH': () => s.armDraw('hatch'), 'ACHURA': () => s.armDraw('hatch'), 'ACHURADO': () => s.armDraw('hatch'),
      'ACOTANG': () => s.armDraw('cota-ang'), 'ACOTRAD': () => s.armDraw('cota-rad'), 'PUNTO': () => s.armDraw('punto'),
      // --- edición pro ---
      'MATRIZ': async () => {
        const v = await ask('MATRIZ RECTANGULAR — columnas,filas,sepX m,sepY m:', '3,2,2.00,2.00')
        if (v) s.applyEffect(s.selectedId, 'arrayRect', v)
      },
      'MATRIZPOLAR': async () => {
        const v = await ask('MATRIZ POLAR — cantidad,ángulo total (°):', '6,360')
        if (v) s.applyEffect(s.selectedId, 'arrayPolar', v)
      },
      'EQUISDIST': async () => {
        const v = await ask('EQUISDIST — distancia de offset (m):', '0.15')
        if (v) s.applyEffect(s.selectedId, 'offset', Number(v) || 0.15)
      },
      'OFFSET': async () => {
        const v = await ask('EQUISDIST — distancia de offset (m):', '0.15')
        if (v) s.applyEffect(s.selectedId, 'offset', Number(v) || 0.15)
      },
      'RECORTA': () => s.armDraw('recorta'), 'ALARGA': () => s.armDraw('alarga'),
      'EXPLOT': () => s.applyEffect(s.selectedId, 'explode'), 'EXPLOTA': () => s.applyEffect(s.selectedId, 'explode'),
      'FASE': async () => {
        const v = await ask('FASE (existente / demolicion / nueva):', 'demolicion')
        if (v && ['existente', 'demolicion', 'nueva'].includes(v.trim().toLowerCase())) s.applyEffect(s.selectedId, 'phase', v.trim().toLowerCase())
        else if (v) s.pushConsole({ text: 'FASE: valor no válido — use existente, demolicion o nueva', kind: 'err' })
      },
      // --- análisis y productividad ---
      'QSELECT': () => s.runGlobal('showQuickSelect'), 'QUICKSELECT': () => s.runGlobal('showQuickSelect'), 'FILTRO': () => s.runGlobal('showQuickSelect'),
      'LUX': () => s.runGlobal('showLighting'), 'ILUMINACION': () => s.runGlobal('showLighting'), 'ILUMINA': () => s.runGlobal('showLighting'),
      'ACUSTICA': () => s.runGlobal('showAcoustic'), 'RUIDO': () => s.runGlobal('showAcoustic'),
      'FASES': () => s.runGlobal('showPhases'), 'DEMOLICION': () => s.runGlobal('showPhases'),
      'AGUA': () => s.armDraw('tuberia-agua'), 'TUBERIA': () => s.armDraw('tuberia-agua'),
      'DESAGUE': () => s.armDraw('tuberia-desague'), 'CIRCUITO': () => s.armDraw('circuito'), 'ELECTRICO': () => s.armDraw('circuito'),
      'LOTE': () => s.armDraw('terreno'), 'TERRENO': () => s.armDraw('terreno'), 'CURVA': () => s.armDraw('curvanivel'),
      'PIN': () => s.armDraw('pin'), 'COMENTARIO': () => s.armDraw('pin'),
      'UNIONES': () => s.runGlobal('cleanJoins'), 'EMPALMAR': () => s.runGlobal('cleanJoins'),
      'U': () => s.runGlobal('undo'), 'DESHACER': () => s.runGlobal('undo'),
      'REHACER': () => s.runGlobal('redo'),
      'NUEVO': () => s.runGlobal('newPlan'),
      'ADMIN': () => set({ adminOpen: true }),
      'RECORRIDO': () => s.runGlobal('walkthrough'),
      // --- herramientas reales nuevas ---
      'GUARDAR': () => s.runGlobal('saveNow'), 'GRABAR': () => s.runGlobal('saveNow'),
      'AUTOGUARDADO': () => s.toggleAutosave(), 'AUTOGUARDA': () => s.toggleAutosave(), 'AUTOSAVE': () => s.toggleAutosave(),
      'EXCELBIM': () => s.runGlobal('bimExcel'), 'CUADROEXCEL': () => s.runGlobal('bimExcel'), 'BIMEXCEL': () => s.runGlobal('bimExcel'),
      'ESTRUCTURAL': () => s.runGlobal('structuralReport'), 'CARGAS': () => s.runGlobal('structuralReport'),
      'COLABORACION': () => s.runGlobal('showCollab'), 'FAMILIAS': () => s.runGlobal('showFamilias'),
      'LAYERSTATES': () => s.runGlobal('layerStateSave'), 'ESTADOCAPA': () => s.runGlobal('layerStateSave'),
      'ESTIRA': () => s.armDraw('estira'),
      'EMPALME': async () => {
        const v = await ask('EMPALME — radio de empalme (m):', '0.15')
        if (v) s.applyEffect(s.selectedId, 'fillet', Number(v) || 0.15)
      },
      'SIMETRIA': async () => {
        const v = await ask('SIMETRÍA — eje y posición (ej. "x,7.50" o "y,3.00"):', 'x,7.50')
        if (v) s.applyEffect(s.selectedId, 'mirrorErase', v)
      },
      'TRAYECTO': async () => {
        const v = await ask('MATRIZ POR TRAYECTO — cantidad de copias:', '6')
        if (v) { s.armDraw(`matriztrayecto:${Number(v) || 6}`) }
      },
      'UNIDADES': async () => {
        const v = await ask('UNIDADES — m (métrico) o ft (pies-pulgadas):', 'm')
        if (v) s.runGlobal(String(v).trim().toLowerCase().startsWith('f') ? 'unitsImperial' : 'unitsMetric')
      },
      'ESCALA': async () => {
        const v = await ask('ESCALA DE LÁMINA — 50, 75 o 100 (1:X):', '75')
        if (v) s.runGlobal(String(v).trim() === '50' ? 'scale50' : String(v).trim() === '100' ? 'scale100' : 'scale75')
      },
      'BATCHPLOT': () => s.runGlobal('batchPlot'),
      // --- multinivel (Ola 8) ---
      'NIVELES': () => {
        s.pushConsole({ text: `NIVELES DEL EDIFICIO (${s.levels.length}):`, kind: 'out' })
        for (const lv of s.levels) {
          const n = s.elements.filter((e) => !s.mods[e.id]?.deleted && (e.level ?? 0) === lv.id).length
          const mark = lv.id === s.activeLevel ? ' ← ACTIVO' : ''
          s.pushConsole({ text: `  · ${lv.name} — cota +${lv.elev.toFixed(2)} m · altura ${lv.height.toFixed(2)} m · ${n} objetos${mark}`, kind: 'out' })
        }
        s.pushConsole({ text: 'NIVEL <nombre> para cambiar · NIVELNUEVO <nombre> para crear · NIVELDUP para duplicar el activo', kind: 'out' })
      },
      'NIVEL': async () => {
        const v = await ask('NOMBRE DEL NIVEL ACTIVO (PB · P1 · AZOTEA…):', s.levels.find((l) => l.id === s.activeLevel)?.name || 'PB')
        if (!v) return
        const target = s.levels.find((l) => l.name.toUpperCase() === v.trim().toUpperCase())
        if (target) s.setActiveLevel(target.id)
        else s.pushConsole({ text: `NIVEL: no existe "${v.trim()}" — use NIVELNUEVO para crearlo`, kind: 'err' })
      },
      'NIVELNUEVO': async () => {
        const v = await ask('NOMBRE DEL NIVEL NUEVO:', `P${s.levels.length}`)
        if (v === null) return
        s.addLevel(v.trim() || undefined)
      },
      'NIVELDUP': () => s.duplicateLevel(s.activeLevel),
      'NIVELELIM': () => s.deleteLevel(s.activeLevel),
      'MUROS': () => s.runGlobal('showScheduleMuros'),
      'PUERTAS': () => s.runGlobal('showSchedulePuertas'),
      'VENTANAS': () => s.runGlobal('showScheduleVentanas'),
      // --- nube / colaboración / importación / IA / análisis nuevos ---
      'PLANOS': () => s.runGlobal('showCloud'), 'CLOUD': () => s.runGlobal('showCloud'), 'NUBEWEB': () => s.runGlobal('showCloud'),
      'IFC': () => s.runGlobal('exportIfc'), 'OBJ': () => s.runGlobal('exportObj'), 'STL': () => s.runGlobal('exportStl'),
      'IMPORTARDXF': () => s.runGlobal('importDxf'), 'DXFIMPORT': () => s.runGlobal('importDxf'), 'IMPORTAR': () => s.runGlobal('importDxf'),
      'UNDERLAY': () => s.runGlobal('showUnderlay'), 'REFERENCIA': () => s.runGlobal('showUnderlay'), 'CALCAR': () => s.runGlobal('showUnderlay'),
      'IA': () => s.runGlobal('showAiPlan'), 'GENERAR': () => s.runGlobal('showAiPlan'), 'AIPLAN': () => s.runGlobal('showAiPlan'),
      'IANORMA': () => s.runGlobal('showAiNorma'), 'REVISOR': () => s.runGlobal('showAiNorma'),
      'VOZ': () => set((st) => ({ voiceActive: !st.voiceActive })), 'MICROFONO': () => set((st) => ({ voiceActive: !st.voiceActive })),
      'TERMICA': () => s.runGlobal('showThermal'), 'UVALUE': () => s.runGlobal('showThermal'), 'E020': () => s.runGlobal('showThermal'),
      'ACCESIBILIDAD': () => s.runGlobal('showAccesibilidad'), 'A010ACC': () => s.runGlobal('showAccesibilidad'),
      'EVACUACION': () => s.runGlobal('showEvacuacion'), 'A130': () => s.runGlobal('showEvacuacion'), 'SALIDAS': () => s.runGlobal('showEvacuacion'),
      'FOTOVOLTAICO': () => s.runGlobal('showPv'), 'FV': () => s.runGlobal('showPv'), 'SOLARFV': () => s.runGlobal('showPv'),
      'WALKTHROUGH': () => s.runGlobal('showWalkthrough'), 'FPS': () => s.runGlobal('showWalkthrough'), 'PRIMERAPERSONA': () => s.runGlobal('showWalkthrough'),
      'OSNAP': () => s.toggleOsnap(), 'IMANES': () => s.toggleOsnap(), 'F3': () => s.toggleOsnap(),
      'SELECCIONAR': () => s.runGlobal('armSeleccionar'), 'SELECT': () => s.runGlobal('armSeleccionar'),
      'PEGAR': () => s.pasteClipboard(), 'PASTE': () => s.pasteClipboard(),
      'COPIARSEL': () => s.copySelection(), 'CORTAR': () => s.cutSelection(),
      'TODOSEL': () => s.selectAll(), 'SELECTALL': () => s.selectAll(),
    }
    if (alias[cmd]) { alias[cmd](); return }
    if (cmd === 'AYUDA' || cmd === '?') {
      const ayuda = [
        'Comandos disponibles:',
        'L/LINEA · PL/POLILINEA · C/CIRCULO · REC/RECTANGULO · T/TEXTO · COTA',
        'CURVAS: ARCO · ELIPSE · SPLINE · PUNTO · HATCH/ACHURA (patrones CAD)',
        'ANOTAR: DIRECTRIZ · NUBE/NUBEDECTRL · ACOTANG (angular) · ACOTRAD (radio)',
        'M/MOVER · CO/COPIA · E/BORRAR · U/DESHACER · REHACER · NUEVO',
        'EDICION: MATRIZ · MATRIZPOLAR · EQUISDIST/OFFSET · RECORTA · ALARGA · EXPLOTA · ESTIRA · EMPALME · SIMETRÍA · TRAYECTO',
        'SELECCION: SELECCIONAR (ventana) · TODOSEL · COPIARSEL/CORTAR/PEGAR (Ctrl+C/V/X) · OSNAP (F3)',
        'REJILLA · SNAP · ORTO · RENDER · 3D · AJUSTAR · RECORRIDO · WALKTHROUGH/FPS (1ª persona)',
        'PURGA · AUDIT · CUADRO · MUROS · PUERTAS · VENTANAS · COLISIONES · ENERGIA · ESTRUCTURAL · CATALOGO · ADMIN · AYUDA',
        'INSTALACIONES: AGUA · DESAGUE · CIRCUITO · ELECTRICO (ENTER termina el trazo)',
        'PARAMÉTRICOS: ESCALERA · TECHO · LOTE · CURVA · UNIONES (T/L limpias)',
        'BIM: FASES (existente/demolición/nueva) · FASE (asignar a selección) · QSELECT',
        'ANÁLISIS: NORMATIVA (RNE A.010/A.130) · METRADOS/S10/PRESUPUESTO · ELEVACIONES · LUX · ACUSTICA (Rw)',
        'ANÁLISIS NUEVOS: TERMICA (E.020) · ACCESIBILIDAD · EVACUACION (A.130) · FOTOVOLTAICO/FV',
        'IMPORTAR: IMPORTAR/IMPORTARDXF (DXF R12) · UNDERLAY/CALCAR (imagen/PDF de referencia)',
        'EXPORTAR: PDF · DXF/DWG · PNG · SVG · IFC (BIM) · OBJ/STL (3D) · EXCELBIM · COMPARTIR (.json) · BATCHPLOT',
        'NUBE/COLAB: PLANOS/CLOUD (planos en la nube + enlaces) · COLABORACION (sesión en vivo)',
        'IA: IA/GENERAR (plano desde texto) · IANORMA (revisor RNE) · VOZ (comandos hablados)',
        'DOC: UNIDADES (m/ft) · ESCALA (1:50/1:75/1:100) · GUARDAR · AUTOGUARDADO (on/off)',
      ]
      ayuda.forEach((l) => s.pushConsole({ text: l, kind: 'out' }))
      return
    }
    s.pushConsole({ text: `Comando desconocido: "${cmd}". Escriba AYUDA.`, kind: 'err' })
  },

  undo: () => {
    const s = get()
    if (s.undoStack.length === 0) {
      s.pushConsole({ text: 'No hay nada que deshacer', kind: 'err' })
      return
    }
    const prev = s.undoStack[s.undoStack.length - 1]
    set({
      elements: prev.elements, mods: prev.mods, gridSpacing: prev.gridSpacing,
      levels: prev.levels ?? s.levels,
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, snapshot(s)],
    })
    s.pushConsole({ text: 'DESHACER: última acción revertida', kind: 'out' })
  },

  redo: () => {
    const s = get()
    if (s.redoStack.length === 0) {
      s.pushConsole({ text: 'No hay nada que rehacer', kind: 'err' })
      return
    }
    const nxt = s.redoStack[s.redoStack.length - 1]
    set({
      elements: nxt.elements, mods: nxt.mods, gridSpacing: nxt.gridSpacing,
      levels: nxt.levels ?? s.levels,
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, snapshot(s)],
    })
    s.pushConsole({ text: 'REHACER: acción restaurada', kind: 'out' })
  },

  newPlan: () => {
    set({
      elements: clone(BASE_ELEMENTS), mods: {}, gridSpacing: 60,
      levels: clone(DEFAULT_LEVELS), activeLevel: 0,
      undoStack: [], redoStack: [],
    })
    get().pushConsole({ text: 'Plano restablecido a la versión base', kind: 'out' })
  },

  walkthrough: () => {
    const s = get()
    const tour: Array<[number, number, number]> = [
      [1.9, -80, -20], [2.6, -420, -60], [2.4, -760, -180],
      [2.2, -620, -420], [2.8, -880, -420], [1, 0, 0],
    ]
    let i = 0
    const step = () => {
      if (i >= tour.length) { s.pushConsole({ text: 'Recorrido finalizado (Enscape/Lumion)', kind: 'out' }); return }
      const [z, px, py] = tour[i++]
      set({ zoom: z, panX: px, panY: py })
      setTimeout(step, 1100)
    }
    s.pushConsole({ text: 'RECORRIDO: simulación de walkthrough iniciada…', kind: 'out' })
    step()
  },

  // ---------- multinivel (Ola 8) ----------
  setActiveLevel: (id) => {
    const s = get()
    if (!s.levels.some((l) => l.id === id)) return
    const lv = s.levels.find((l) => l.id === id)!
    const count = s.elements.filter((e) => !s.mods[e.id]?.deleted && levelOf(e) === id).length
    set({ activeLevel: id, selectedIds: [], selectedId: null })
    s.pushConsole({ text: `NIVEL ACTIVO: ${lv.name} (cota +${lv.elev.toFixed(2)} m · altura ${lv.height.toFixed(2)} m) — ${count} objetos en planta`, kind: 'out' })
  },

  addLevel: (name, elev, height) => {
    const s = get()
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    const ids = s.levels.map((l) => l.id)
    const newId = (ids.length ? Math.max(...ids) : 0) + 1
    const last = s.levels[s.levels.length - 1]
    const lv: LevelDef = {
      id: newId,
      name: name?.trim() || `P${newId}`,
      elev: Number.isFinite(elev) ? elev! : (last ? last.elev + last.height : 0) + 0.3,
      height: Number.isFinite(height) && height! > 1.8 ? height! : 2.5,
    }
    set((st) => ({ levels: [...st.levels, lv], activeLevel: lv.id }))
    s.pushConsole({ text: `NIVEL CREADO: ${lv.name} — cota +${lv.elev.toFixed(2)} m · dibuje la planta de este piso (los objetos existentes permanecen en su nivel)`, kind: 'out' })
  },

  updateLevel: (id, patch) => {
    const s = get()
    if (!s.levels.some((l) => l.id === id)) return
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    set((st) => ({ levels: st.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
    const lv = get().levels.find((l) => l.id === id)!
    s.pushConsole({ text: `NIVEL ACTUALIZADO: ${lv.name} — cota +${lv.elev.toFixed(2)} m · altura ${lv.height.toFixed(2)} m`, kind: 'out' })
  },

  deleteLevel: (id) => {
    const s = get()
    if (id === 0 || !s.levels.some((l) => l.id === id)) {
      s.pushConsole({ text: 'NIVEL: la planta base (PB) no se puede eliminar', kind: 'err' }); return
    }
    const moving = s.elements.filter((e) => levelOf(e) === id)
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    set((st) => ({
      levels: st.levels.filter((l) => l.id !== id),
      // los objetos del nivel eliminado se reasignan a PB (0) para no perderlos
      elements: moving.length ? st.elements.map((e) => (levelOf(e) === id ? { ...e, level: 0 } : e)) : st.elements,
      activeLevel: st.activeLevel === id ? 0 : st.activeLevel,
    }))
    s.pushConsole({ text: `NIVEL ELIMINADO: ${moving.length} objeto(s) reasignado(s) a PB — use Ctrl+Z para revertir`, kind: 'out' })
  },

  duplicateLevel: (id) => {
    const s = get()
    const src = s.levels.find((l) => l.id === id)
    if (!src) return
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    const ids = s.levels.map((l) => l.id)
    const newId = (ids.length ? Math.max(...ids) : 0) + 1
    const lv: LevelDef = {
      id: newId,
      name: `${src.name} (copia)`,
      elev: src.elev + src.height + 0.3,
      height: src.height,
    }
    // duplica muros/puertas/ventanas/espacios/escaleras del nivel fuente
    const srcEls = s.elements.filter((e) => levelOf(e) === id && !s.mods[e.id]?.deleted
      && ['muro', 'puerta', 'ventana', 'espacio', 'escalera', 'columna', 'apertura'].includes(e.type))
    const copies: PlanElement[] = srcEls.map((e) => ({ ...clone(e), id: uid(), level: newId }))
    set((st) => ({ levels: [...st.levels, lv], elements: [...st.elements, ...copies], activeLevel: newId }))
    s.pushConsole({ text: `NIVEL DUPLICADO: ${lv.name} — ${copies.length} objetos copiados de ${src.name} (muros, vanos, espacios y estructura)`, kind: 'out' })
  },

  moveSelectionToLevel: (levelId) => {
    const s = get()
    if (!s.levels.some((l) => l.id === levelId)) return
    const ids = s.selectedIds.length ? s.selectedIds : (s.selectedId ? [s.selectedId] : [])
    if (!ids.length) { s.pushConsole({ text: 'MOVER A NIVEL: no hay selección activa', kind: 'err' }); return }
    const lv = s.levels.find((l) => l.id === levelId)!
    set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)], redoStack: [] }))
    set((st) => ({ elements: st.elements.map((e) => (ids.includes(e.id) ? { ...e, level: levelId } : e)) }))
    s.pushConsole({ text: `MOVER A NIVEL: ${ids.length} objeto(s) → ${lv.name}`, kind: 'out' })
  },
}))

// ---------------- selectores multinivel ----------------

/** Elementos visibles de un nivel (los que se dibujan/anotan en planta). */
export const elementsOfLevel = (s: { elements: PlanElement[] }, levelId: number): PlanElement[] =>
  s.elements.filter((e) => levelOf(e) === levelId)

// ---------------- auto-guardado total (suscripción con debounce) ----------------
// Persiste TODO el plano (documento + ajustes + vista + modos) 0.9 s después
// de cada cambio real, con volcados de seguridad al cerrar la pestaña, al
// ocultar la ventana y un respaldo periódico cada 20 s.

function autosavePayload() {
  const st = useJarumy.getState()
  return {
    elements: st.elements,
    mods: st.mods,
    layers: st.layers,
    levels: st.levels,
    activeLevel: st.activeLevel,
    gridSpacing: st.gridSpacing,
    nextId: st.nextId,
    renderQuality: st.renderQuality,
    planScale: st.planScale,
    units: st.units,
    dimStyle: st.dimStyle,
    textStyle: st.textStyle,
    clashTolerance: st.clashTolerance,
    sun: st.sun,
    zoom: st.zoom,
    panX: st.panX,
    panY: st.panY,
    renderMode: st.renderMode,
    view3D: st.view3D,
    showGrid: st.showGrid,
    snap: st.snap,
    ortho: st.ortho,
    radialEnabled: st.radialEnabled,
    showLayers: st.showLayers,
    showProperties: st.showProperties,
    areaLabels: st.areaLabels,
    autoDims: st.autoDims,
    insertRotation: st.insertRotation,
    phaseFilter: st.phaseFilter,
    osnap: st.osnap,
    osnapModes: st.osnapModes,
  }
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let autosaveErrLogged = false

function persistAutosaveNow() {
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null }
  const st = useJarumy.getState()
  if (!st.autosaveOn) return
  const ok = saveAutosave(autosavePayload())
  useJarumy.setState({
    autosaveStatus: ok ? 'saved' : 'error',
    autosaveAt: ok ? Date.now() : st.autosaveAt,
  })
  if (!ok && !autosaveErrLogged) {
    autosaveErrLogged = true
    useJarumy.getState().pushConsole({ text: 'AUTO-GUARDADO: el navegador rechazó la escritura (cuota llena o modo privado) — use COMPARTIR (.json) para conservar el plano', kind: 'err' })
  } else if (ok) {
    autosaveErrLogged = false
  }
}

if (typeof window !== 'undefined') {
  useJarumy.subscribe((st, prev) => {
    if (!st.autosaveOn) return
    // solo reacciona a cambios de datos persistibles (ignora hover/selección/consola)
    const unchanged = st.elements === prev.elements && st.mods === prev.mods && st.layers === prev.layers
      && st.levels === prev.levels && st.activeLevel === prev.activeLevel
      && st.gridSpacing === prev.gridSpacing && st.nextId === prev.nextId && st.sun === prev.sun
      && st.zoom === prev.zoom && st.panX === prev.panX && st.panY === prev.panY
      && st.renderQuality === prev.renderQuality && st.planScale === prev.planScale && st.units === prev.units
      && st.dimStyle === prev.dimStyle && st.textStyle === prev.textStyle && st.clashTolerance === prev.clashTolerance
      && st.renderMode === prev.renderMode && st.view3D === prev.view3D && st.showGrid === prev.showGrid
      && st.snap === prev.snap && st.ortho === prev.ortho && st.radialEnabled === prev.radialEnabled
      && st.showLayers === prev.showLayers && st.showProperties === prev.showProperties
      && st.areaLabels === prev.areaLabels && st.autoDims === prev.autoDims
      && st.insertRotation === prev.insertRotation && st.phaseFilter === prev.phaseFilter
      && st.osnap === prev.osnap && st.osnapModes === prev.osnapModes
    if (unchanged) return
    useJarumy.setState({ autosaveStatus: 'saving' })
    if (autosaveTimer) clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(persistAutosaveNow, 900)
  })
  // volcados de seguridad: cierre de pestaña, pestaña oculta y respaldo periódico
  window.addEventListener('beforeunload', () => { if (autosaveTimer) persistAutosaveNow() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && autosaveTimer) persistAutosaveNow()
  })
  window.setInterval(() => { if (autosaveTimer) persistAutosaveNow() }, 20000)
}
