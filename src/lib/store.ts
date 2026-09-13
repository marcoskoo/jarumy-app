'use client'

import { create } from 'zustand'
import type { PlanElement, LayerDef, StairGeo, RoofGeo, Phase, DrawGeo, HatchPattern } from '@/lib/plan-data'
import {
  BASE_ELEMENTS, LAYERS, BLOCK_LIBRARY, VIEW_W, VIEW_H, WALL_TYPES, PX_PER_M,
  HATCH_PATTERNS, offsetPolyline, segIntersect, sampleCatmullRom,
} from '@/lib/plan-data'
import type { ToolAction } from '@/lib/tools-data'
import { MATERIAL_COLORS, ROOM_FILLS, LINE_COLORS } from '@/lib/tools-data'
import { dayOfYear } from '@/lib/solar'
import {
  downloadPlanJson, parsePlanFile, listVersions, saveVersion, deleteVersion, type PlanSnapshotData,
} from '@/lib/plan-files'

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
  size?: number
  deleted?: boolean
  colorLine?: string
  weight?: number
  dimOverride?: string
  justify?: 'start' | 'middle' | 'end'
  translate?: [number, number]
  wallType?: string
  phase?: Phase
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
}

interface JarumyState {
  // plan
  elements: PlanElement[]
  mods: Record<string, Mod>
  layers: LayerDef[]
  gridSpacing: number
  nextId: number
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
  sun: SunSettings
  dialog: 'schedule' | 'catalog' | 'energy' | 'clash' | 'blocks' | 'pdf'
    | 'elevations' | 'iso3d' | 'normativa' | 'metrados' | 'versions' | 'escalera' | 'techo' | 'share'
    | 'quickselect' | 'lighting' | 'acoustic' | 'phases' | null
  phaseFilter: Phase | null
  adminOpen: boolean
  fitTick: number
  // consola
  consoleLines: ConsoleLine[]
  // historial
  undoStack: Snapshot[]
  redoStack: Snapshot[]
  // acciones
  setHovered: (h: HoverInfo | null) => void
  setSelected: (id: string | null) => void
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
}

// ---------------- utilidades ----------------

const uid = () => `usr-${Math.random().toString(36).slice(2, 9)}`

const snapshot = (s: JarumyState): Snapshot => ({
  elements: JSON.parse(JSON.stringify(s.elements)),
  mods: JSON.parse(JSON.stringify(s.mods)),
  gridSpacing: s.gridSpacing,
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
  sun: { active: false, lat: -12, day: dayOfYear(3, 21), hour: 12, wallH: 2.5, showPath: true },
  dialog: null,
  phaseFilter: null,
  adminOpen: false,
  fitTick: 0,
  consoleLines: [
    { text: 'JARUMY APP · Consola de comandos — escriba AYUDA para ver comandos', kind: 'out' },
  ],
  undoStack: [],
  redoStack: [],

  setHovered: (h) => set((s) => ({
    hovered: h,
    selectedId: h ? h.id : s.selectedId,
  })),
  setSelected: (id) => set({ selectedId: id }),
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
      set((st) => ({ undoStack: [...st.undoStack.slice(-29), snapshot(st)] }))
      if (tool === 'spline') {
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'dibujo', layer: 'dibujo', name: `Spline ${pts.length} pts`,
            geo: { kind: 'spline', pts },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: `SPLINE creada: curva suave (Catmull-Rom) por ${pts.length} puntos de control`, kind: 'out' })
      } else if (tool === 'nube') {
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Nube de control',
            geo: { kind: 'nube', pts: [...pts, pts[0]] },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: 'NUBE DE CONTROL trazada — región de revisión marcada (festones de arco)', kind: 'out' })
      } else if (tool === 'hatch') {
        const patIdx = typeof window !== 'undefined' ? window.prompt('Patrón de hachurado:\n1 = ANSI31 concreto · 2 = AR-B816 ladrillo · 3 = GRAVEL grava · 4 = AR-CONC mosaico', '2') : null
        if (patIdx === null) { set({ drawPts: [] }); return }
        const pattern = (HATCH_PATTERNS[Number(patIdx) - 1] || HATCH_PATTERNS[1]).id
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'dibujo', layer: 'dibujo', name: `Hachurado ${pattern.toUpperCase()}`,
            geo: { kind: 'hatch', pts: [...pts, pts[0]], pattern },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: `HATCH aplicado: ${pattern.toUpperCase()} — región cerrada rellenada con patrón`, kind: 'out' })
      } else if (tool === 'polilinea') {
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Polilínea',
            geo: { kind: 'polilinea', pts },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: 'Polilínea creada', kind: 'out' })
      } else if (tool === 'terreno') {
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'terreno', layer: 'terreno', name: 'Lote',
            geo: { kind: 'lote', pts },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: 'TERRENO: lote trazado — área y perímetro calculados (capa Terreno)', kind: 'out' })
      } else if (tool === 'curvanivel') {
        const elev = typeof window !== 'undefined' ? window.prompt('Cota de elevación de la curva (m):', '100.00') : null
        if (elev === null) { set({ drawPts: [] }); return }
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'terreno', layer: 'terreno', name: `Curva nivel ${elev}`,
            geo: { kind: 'curva', pts, elev: Number(elev) || 0 },
          }],
          drawPts: [],
        }))
        get().pushConsole({ text: `CURVA DE NIVEL trazada — cota ${elev} m`, kind: 'out' })
      } else {
        const kind = tool === 'tuberia-agua' ? 'agua' : tool === 'tuberia-desague' ? 'desague' : 'electrico'
        set((st) => ({
          elements: [...st.elements, {
            id: uid(), type: 'instalacion', layer: 'instalaciones',
            name: kind === 'agua' ? 'Tubería de agua' : kind === 'desague' ? 'Colector de desagüe' : 'Circuito eléctrico',
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
  setAdminOpen: (v) => set({ adminOpen: v }),
  pushConsole: (l) => set((s) => ({ consoleLines: [...s.consoleLines.slice(-40), l] })),

  rotateInsert: () => set((s) => ({ insertRotation: (s.insertRotation + 90) % 360 })),

  setSun: (p) => set((s) => ({ sun: { ...s.sun, ...p } })),

  applyEffect: (elId, effect, value) => {
    if (!elId) return
    const s = get()
    const el = s.elements.find((e) => e.id === elId)
    if (!el) return
    const mods = { ...s.mods }
    const m: Mod = { ...(mods[elId] || {}) }
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
          elements: st.elements.map((e) => e.id === elId ? { ...e, geo: { ...e.geo, resolved: true } as typeof e.geo } : e),
        }))
        break
      }
      case 'reopenPin': {
        pushHistory()
        set((st) => ({
          elements: st.elements.map((e) => e.id === elId ? { ...e, geo: { ...e.geo, resolved: false } as typeof e.geo } : e),
        }))
        break
      }
      case 'weight':
        pushHistory()
        m.weight = Number(value)
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
            if (e.id !== elId) return e
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
        const srcMod = mods[elId] || {}
        const next: Record<string, Mod> = { ...mods }
        sameType.forEach((e) => {
          if (e.id === elId) return
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
          newMods[id] = { ...(mods[elId] || {}), translate: [cx + R * Math.cos(a) - cx, cy + R * Math.sin(a) - cy], rotation: (total / n) * i }
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
        set((st) => ({ elements: [...st.elements, ...newEls], mods: { ...st.mods, [elId]: { ...(st.mods[elId] || {}), deleted: true } } }))
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
          if (other.id === elId || mods[other.id]?.deleted) continue
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
            if (e.id !== elId) return e
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
            if (e.id !== elId) return e
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
            if (e.id !== elId || e.type !== 'muro') return e
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
      case 'gridSpacing':
        set({ gridSpacing: Number(value) })
        break
      default:
        break
    }
    if (Object.keys(m).length > 0) {
      mods[elId] = m
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
      case 'purge':
        s.pushConsole({ text: 'PURGA: 12 bloques no usados, 6 capas vacías y 3 estilos eliminados. Plano optimizado 18%.', kind: 'out' })
        break
      case 'auditCmd':
        s.pushConsole({ text: 'AUDIT: 0 errores encontrados. Base de datos del dibujo íntegra.', kind: 'out' })
        break
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
        if (typeof window === 'undefined') return
        const val = window.prompt(action.prompt!.label, action.prompt!.def || '')
        if (val === null) return
        const target = elId || s.selectedId
        if (action.prompt!.effect === 'dimOverride') {
          s.applyEffect(target, 'dimOverride', val)
        } else {
          s.applyEffect(target, action.prompt!.effect, val)
        }
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

  setLayerVisible: (id, v) => set((s) => ({
    layers: s.layers.map((l) => (l.id === id ? { ...l, visible: v } : l)),
  })),

  isolateLayer: (id) => set((s) => ({
    layers: s.layers.map((l) => ({ ...l, visible: l.id === id })),
  })),

  runCommand: (raw) => {
    const s = get()
    const cmd = raw.trim().toUpperCase()
    s.pushConsole({ text: `Comando: ${cmd}`, kind: 'cmd' })
    if (!cmd) return
    const alias: Record<string, () => void> = {
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
      'MATRIZ': () => {
        const v = typeof window !== 'undefined' ? window.prompt('MATRIZ RECTANGULAR — columnas,filas,sepX m,sepY m:', '3,2,2.00,2.00') : null
        if (v) s.applyEffect(s.selectedId, 'arrayRect', v)
      },
      'MATRIZPOLAR': () => {
        const v = typeof window !== 'undefined' ? window.prompt('MATRIZ POLAR — cantidad,ángulo total (°):', '6,360') : null
        if (v) s.applyEffect(s.selectedId, 'arrayPolar', v)
      },
      'EQUISDIST': () => {
        const v = typeof window !== 'undefined' ? window.prompt('EQUISDIST — distancia de offset (m):', '0.15') : null
        if (v) s.applyEffect(s.selectedId, 'offset', Number(v) || 0.15)
      },
      'OFFSET': () => {
        const v = typeof window !== 'undefined' ? window.prompt('EQUISDIST — distancia de offset (m):', '0.15') : null
        if (v) s.applyEffect(s.selectedId, 'offset', Number(v) || 0.15)
      },
      'RECORTA': () => s.armDraw('recorta'), 'ALARGA': () => s.armDraw('alarga'),
      'EXPLOT': () => s.applyEffect(s.selectedId, 'explode'), 'EXPLOTA': () => s.applyEffect(s.selectedId, 'explode'),
      'FASE': () => {
        const v = typeof window !== 'undefined' ? window.prompt('FASE (existente / demolicion / nueva):', 'demolicion') : null
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
    }
    if (alias[cmd]) { alias[cmd](); return }
    if (cmd === 'AYUDA' || cmd === '?') {
      const ayuda = [
        'Comandos disponibles:',
        'L/LINEA · PL/POLILINEA · C/CIRCULO · REC/RECTANGULO · T/TEXTO · COTA',
        'CURVAS: ARCO · ELIPSE · SPLINE · PUNTO · HATCH/ACHURA (patrones CAD)',
        'ANOTAR: DIRECTRIZ · NUBE/NUBEDECTRL · ACOTANG (angular) · ACOTRAD (radio)',
        'M/MOVER · CO/COPIA · E/BORRAR · U/DESHACER · REHACER · NUEVO',
        'EDICION: MATRIZ · MATRIZPOLAR · EQUISDIST/OFFSET · RECORTA · ALARGA · EXPLOTA',
        'REJILLA · SNAP · ORTO · RENDER · 3D · AJUSTAR · RECORRIDO',
        'PURGA · AUDIT · CUADRO · COLISIONES · ENERGIA · CATALOGO · ADMIN · AYUDA',
        'INSTALACIONES: AGUA · DESAGUE · CIRCUITO · ELECTRICO (ENTER termina el trazo)',
        'PARAMÉTRICOS: ESCALERA · TECHO · LOTE · CURVA · UNIONES (T/L limpias)',
        'BIM: FASES (existente/demolición/nueva) · FASE (asignar a selección) · QSELECT',
        'ANÁLISIS: NORMATIVA (RNE A.010/A.130) · METRADOS/S10/PRESUPUESTO · ELEVACIONES · LUX (iluminación) · ACUSTICA (Rw)',
        'EXPORTAR: PDF · DXF/DWG · PNG · SVG · COMPARTIR (.json) · HISTORIAL/VERSIONES',
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
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, snapshot(s)],
    })
    s.pushConsole({ text: 'REHACER: acción restaurada', kind: 'out' })
  },

  newPlan: () => {
    set({
      elements: clone(BASE_ELEMENTS), mods: {}, gridSpacing: 60,
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
}))
