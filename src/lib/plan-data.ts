// ============================================================
// JARUMY APP — Plano arquitectónico base
// Vivienda unifamiliar 15×10 m · 60 px = 1 m · Esc. 1:60
// ============================================================

import type { ElementType } from './tools-data'

export interface WallGeo { x1: number; y1: number; x2: number; y2: number; t: number }
export interface DoorGeo { cx: number; cy: number; r: number; a0: number; a1: number; axis: 'h' | 'v' }
export interface WindowGeo { x: number; y: number; len: number; orient: 'h' | 'v'; t: number }
export interface RoomGeo { x: number; y: number; w: number; h: number; name: string; num: string }
export interface FurnGeo { kind: string; x: number; y: number; w: number; h: number }
export interface DimGeo { x1: number; y1: number; x2: number; y2: number; offset: number }
export interface TextGeo { x: number; y: number; text: string; size: number; anchor: 'start' | 'middle' | 'end' }
export interface ColGeo { x: number; y: number; size: number }
export interface OpenGeo { x: number; y: number; len: number; orient: 'h' | 'v' }
export interface DrawGeo { kind: string; pts: number[][]; r?: number; text?: string }

// --- elementos paramétricos / MEP / terreno / colaboración ---
export interface StairGeo {
  x: number; y: number; w: number; h: number
  steps: number; riser: number; tread: number  // contrahuella y huella en METROS
  dir: 'up' | 'down' | 'left' | 'right'        // sentido de subida en planta
}
export interface RoofGeo {
  x: number; y: number; w: number; h: number
  slope: number                                // pendiente en %
  kind: 'dos-aguas' | 'cuatro-aguas' | 'plano'
  ridge: 'h' | 'v'                             // orientación de la cumbrera
}
export interface InstGeo { kind: 'agua' | 'desague' | 'electrico'; pts: number[][]; diameter: number }
export interface SymGeo { kind: SymKind; x: number; y: number }
export type SymKind =
  | 'luz' | 'tomacorriente' | 'interruptor' | 'tablero'
  | 'punto-agua' | 'punto-desague' | 'medidor-agua'
export interface TerrainGeo { kind: 'lote' | 'curva'; pts: number[][]; name?: string; elev?: number }
export interface PinGeo { x: number; y: number; text: string; author: string; resolved?: boolean }

export interface PlanElement {
  id: string
  type: ElementType
  layer: string
  name: string
  geo: WallGeo | DoorGeo | WindowGeo | RoomGeo | FurnGeo | DimGeo | TextGeo | ColGeo | OpenGeo | DrawGeo
    | StairGeo | RoofGeo | InstGeo | SymGeo | TerrainGeo | PinGeo
}

export interface LayerDef {
  id: string
  name: string
  color: string
  visible: boolean
  locked: boolean
}

export const VIEW_W = 1200
export const VIEW_H = 820
export const PX_PER_M = 60

export const LAYERS: LayerDef[] = [
  { id: 'muros', name: 'Muros', color: '#d4d4d8', visible: true, locked: false },
  { id: 'puertas', name: 'Puertas y vanos', color: '#fbbf24', visible: true, locked: false },
  { id: 'ventanas', name: 'Ventanas', color: '#2dd4bf', visible: true, locked: false },
  { id: 'espacios', name: 'Espacios', color: '#a3a3a3', visible: true, locked: false },
  { id: 'mobiliario', name: 'Mobiliario', color: '#d97706', visible: true, locked: false },
  { id: 'sanitarios', name: 'Sanitarios', color: '#14b8a6', visible: true, locked: false },
  { id: 'cotas', name: 'Cotas', color: '#f59e0b', visible: true, locked: false },
  { id: 'textos', name: 'Textos', color: '#e4e4e7', visible: true, locked: false },
  { id: 'estructura', name: 'Estructura', color: '#a855f7', visible: true, locked: false },
  { id: 'dibujo', name: 'Dibujo', color: '#fb923c', visible: true, locked: false },
  { id: 'instalaciones', name: 'Instalaciones MEP', color: '#38bdf8', visible: true, locked: false },
  { id: 'terreno', name: 'Terreno', color: '#84cc16', visible: true, locked: false },
  { id: 'comentarios', name: 'Comentarios', color: '#fb7185', visible: true, locked: false },
]

// --- tipos de muro multicapa (espesor real + patrón de render) ---
export interface WallTypeDef { id: string; label: string; t: number; hatch: 'ladrillo' | 'concreto' | 'drywall' | 'silleria'; color: string }
export const WALL_TYPES: Record<string, WallTypeDef> = {
  l140: { id: 'l140', label: 'Ladrillo 140', t: 8.4, hatch: 'ladrillo', color: '#3f3f46' },
  l230: { id: 'l230', label: 'Ladrillo 230', t: 13.8, hatch: 'silleria', color: '#333338' },
  c175: { id: 'c175', label: 'Concreto 175', t: 10.5, hatch: 'concreto', color: '#52525b' },
  dw100: { id: 'dw100', label: 'Drywall 100', t: 6, hatch: 'drywall', color: '#8b8b96' },
}

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, t: number): PlanElement => ({
  id: `muro-${id}`, type: 'muro', layer: 'muros', name: `Muro ${id}`,
  geo: { x1, y1, x2, y2, t },
})

const door = (id: string, name: string, geo: DoorGeo): PlanElement => ({
  id: `puerta-${id}`, type: 'puerta', layer: 'puertas', name, geo,
})

const win = (id: string, name: string, x: number, y: number, len: number, orient: 'h' | 'v'): PlanElement => ({
  id: `vent-${id}`, type: 'ventana', layer: 'ventanas', name,
  geo: { x, y, len, orient, t: 12 },
})

const furn = (id: string, kind: string, name: string, x: number, y: number, w: number, h: number, sanitary = false): PlanElement => ({
  id: `${sanitary ? 'san' : 'mob'}-${id}`, type: sanitary ? 'sanitario' : 'mobiliario',
  layer: sanitary ? 'sanitarios' : 'mobiliario', name,
  geo: { kind, x, y, w, h },
})

const dim = (id: string, x1: number, y1: number, x2: number, y2: number, offset: number): PlanElement => ({
  id: `cota-${id}`, type: 'cota', layer: 'cotas', name: `Cota ${id}`,
  geo: { x1, y1, x2, y2, offset },
})

const txt = (id: string, x: number, y: number, text: string, size = 17, anchor: 'start' | 'middle' | 'end' = 'middle'): PlanElement => ({
  id: `txt-${id}`, type: 'texto', layer: 'textos', name: `Texto ${id}`,
  geo: { x, y, text, size, anchor },
})

const col = (id: string, x: number, y: number): PlanElement => ({
  id: `col-${id}`, type: 'columna', layer: 'estructura', name: `Columna ${id}`,
  geo: { x, y, size: 18 },
})

export const ROOMS: PlanElement[] = [
  { id: 'esp-sala', type: 'espacio', layer: 'espacios', name: 'Sala', geo: { x: 150, y: 100, w: 480, h: 300, name: 'SALA', num: '01' } },
  { id: 'esp-cocina', type: 'espacio', layer: 'espacios', name: 'Cocina', geo: { x: 150, y: 400, w: 480, h: 300, name: 'COCINA', num: '02' } },
  { id: 'esp-dorm1', type: 'espacio', layer: 'espacios', name: 'Dormitorio 1', geo: { x: 630, y: 100, w: 420, h: 240, name: 'DORMITORIO 1', num: '03' } },
  { id: 'esp-bano', type: 'espacio', layer: 'espacios', name: 'Baño', geo: { x: 630, y: 340, w: 250, h: 170, name: 'BAÑO', num: '04' } },
  { id: 'esp-vestidor', type: 'espacio', layer: 'espacios', name: 'Vestidor', geo: { x: 880, y: 340, w: 170, h: 170, name: 'VESTIDOR', num: '05' } },
  { id: 'esp-dorm2', type: 'espacio', layer: 'espacios', name: 'Dormitorio 2', geo: { x: 630, y: 510, w: 420, h: 190, name: 'DORMITORIO 2', num: '06' } },
]

export const WALLS: PlanElement[] = [
  // ------ Muro norte (y=100) ------
  wall('n1', 150, 100, 220, 100, 12), wall('n2', 360, 100, 420, 100, 12),
  wall('n3', 560, 100, 700, 100, 12), wall('n4', 840, 100, 900, 100, 12),
  wall('n5', 1000, 100, 1050, 100, 12),
  // ------ Muro sur (y=700) ------
  wall('s1', 150, 700, 700, 700, 12), wall('s2', 860, 700, 900, 700, 12),
  wall('s3', 1000, 700, 1050, 700, 12),
  // ------ Muro oeste (x=150) ------
  wall('w1', 150, 100, 150, 240, 12), wall('w2', 150, 320, 150, 460, 12),
  wall('w3', 150, 600, 150, 700, 12),
  // ------ Muro este (x=1050) ------
  wall('e1', 1050, 100, 1050, 150, 12), wall('e2', 1050, 290, 1050, 700, 12),
  // ------ Interior vertical x=630 ------
  wall('i1', 630, 100, 630, 160, 8), wall('i2', 630, 240, 630, 390, 8),
  wall('i3', 630, 460, 630, 560, 8), wall('i4', 630, 640, 630, 700, 8),
  // ------ Interior horizontal y=400 ------
  wall('i5', 150, 400, 260, 400, 8), wall('i6', 380, 400, 630, 400, 8),
  // ------ Interior horizontal y=340 ------
  wall('i7', 630, 340, 900, 340, 8), wall('i8', 980, 340, 1050, 340, 8),
  // ------ Interior vertical x=880 y horizontal y=510 ------
  wall('i9', 880, 340, 880, 510, 8), wall('i10', 630, 510, 1050, 510, 8),
]

export const DOORS: PlanElement[] = [
  door('principal', 'Puerta principal 0.90', { cx: 150, cy: 320, r: 80, a0: -90, a1: 0, axis: 'v' }),
  door('dorm1', 'Puerta dorm. 1 0.90', { cx: 630, cy: 160, r: 80, a0: 90, a1: 0, axis: 'v' }),
  door('bano', 'Puerta baño 0.70', { cx: 630, cy: 390, r: 70, a0: 90, a1: 0, axis: 'v' }),
  door('dorm2', 'Puerta dorm. 2 0.90', { cx: 630, cy: 640, r: 80, a0: -90, a1: 0, axis: 'v' }),
  door('vestidor', 'Puerta vestidor 0.90', { cx: 980, cy: 340, r: 80, a0: 180, a1: 90, axis: 'h' }),
]

export const OPENINGS: PlanElement[] = [
  { id: 'ap-cocina', type: 'apertura', layer: 'puertas', name: 'Vano sala-cocina 1.20', geo: { x: 260, y: 400, len: 120, orient: 'h' } },
]

export const WINDOWS: PlanElement[] = [
  win('sala1', 'Ventana sala 2.30', 220, 100, 140, 'h'),
  win('sala2', 'Ventana sala 2.30', 420, 100, 140, 'h'),
  win('dorm1a', 'Ventana dorm. 1 2.30', 700, 100, 140, 'h'),
  win('dorm1b', 'Ventana dorm. 1 1.60', 900, 100, 100, 'h'),
  win('dorm1c', 'Ventana dorm. 1 2.30', 1050, 150, 140, 'v'),
  win('cocina', 'Ventana cocina 2.30', 150, 460, 140, 'v'),
  win('dorm2a', 'Ventana dorm. 2 2.60', 700, 700, 160, 'h'),
  win('dorm2b', 'Ventana dorm. 2 1.60', 900, 700, 100, 'h'),
]

export const FURNITURE: PlanElement[] = [
  // Sala
  furn('sofa', 'sofa', 'Sofá 3 cuerpos', 230, 300, 180, 70),
  furn('mesacentro', 'mesacentro', 'Mesa de centro', 280, 205, 80, 48),
  furn('tv', 'tv', 'Panel TV', 250, 110, 140, 14),
  furn('alfombra', 'alfombra', 'Alfombra 3.5×3', 225, 190, 220, 185),
  furn('sillon', 'sillon', 'Sillón individual', 480, 285, 62, 62),
  // Cocina
  furn('counterN', 'counter', 'Módulo de cocina', 160, 406, 260, 58),
  furn('counterW', 'counter', 'Módulo de cocina', 156, 464, 58, 226),
  furn('stove', 'stove', 'Cocina 4 hornillas', 210, 408, 58, 54, true),
  furn('sinkk', 'sinkk', 'Fregadero doble', 340, 412, 55, 48, true),
  furn('refri', 'refri', 'Refrigeradora', 560, 410, 56, 66),
  furn('isla', 'isla', 'Isla de cocina', 300, 555, 140, 72),
  furn('mesacomedor', 'mesacomedor', 'Mesa comedor', 510, 560, 100, 100),
  // Dormitorio 1
  furn('cama1', 'cama', 'Cama plaza y media', 795, 106, 135, 185),
  furn('mesita1', 'mesitanoche', 'Mesita de noche', 735, 106, 50, 45),
  furn('mesita2', 'mesitanoche', 'Mesita de noche', 945, 106, 50, 45),
  furn('ropero1', 'ropero', 'Ropero 6 puertas', 640, 272, 150, 62),
  // Baño
  furn('ducha', 'ducha', 'Ducha 0.90×0.90', 790, 344, 88, 88, true),
  furn('inodoro', 'inodoro', 'Inodoro', 645, 464, 46, 40, true),
  furn('lavatorio', 'lavatorio', 'Lavatorio con gabinete', 760, 452, 74, 50, true),
  // Vestidor
  furn('estante1', 'estante', 'Estante modular', 890, 344, 150, 42),
  furn('estante2', 'estante', 'Estante modular', 890, 462, 150, 44),
  furn('islav', 'islav', 'Isla de vestidor', 925, 405, 80, 48),
  // Dormitorio 2
  furn('cama2', 'cama', 'Cama individual', 715, 515, 130, 168),
  furn('mesita3', 'mesitanoche', 'Mesita de noche', 648, 518, 50, 44),
  furn('escritorio', 'escritorio', 'Escritorio', 890, 518, 140, 58),
  furn('sillaesc', 'sillaescritorio', 'Silla giratoria', 935, 590, 42, 42),
  furn('ropero2', 'ropero', 'Ropero 4 puertas', 988, 540, 56, 150),
]

export const COLUMNS: PlanElement[] = [
  col('a', 150, 100), col('b', 1050, 100), col('c', 150, 700), col('d', 1050, 700),
  col('e', 630, 400), col('f', 630, 510),
]

export const DIMENSIONS: PlanElement[] = [
  dim('total', 150, 100, 1050, 100, -58),   // superior total 15.00
  dim('sala', 150, 100, 630, 100, -30),     // superior sala 8.00
  dim('der', 630, 100, 1050, 100, -30),     // superior derecha 7.00
  dim('izq', 150, 100, 150, 700, -72),      // izquierda total 10.00
  dim('izqc', 150, 400, 150, 700, -44),     // izquierda cocina 5.00
  dim('inf', 630, 700, 1050, 700, 55),      // inferior dorm2 7.00
]

export const TEXTS: PlanElement[] = [
  txt('titulo', 600, 34, 'VIVIENDA UNIFAMILIAR — PLANTA ARQUITECTÓNICA', 20, 'middle'),
  txt('esc', 150, 778, 'ESC. 1 : 60   ·   m²   ·   SUPERFICIE TECHADA 149.5 m²', 13, 'start'),
  txt('lam', 1050, 778, 'LÁMINA A-01   ·   JARUMY APP', 13, 'end'),
]

export const BASE_ELEMENTS: PlanElement[] = [
  ...ROOMS, ...WALLS, ...OPENINGS, ...DOORS, ...WINDOWS,
  ...FURNITURE, ...COLUMNS, ...DIMENSIONS, ...TEXTS,
]

// Bloques insertables desde la biblioteca (cat: agrupación del explorador visual)
export type BlockCat = 'mobiliario' | 'cocina' | 'sanitarios' | 'exterior' | 'otros' | 'detalles'

export interface BlockDef {
  kind: string
  label: string
  w: number
  h: number
  cat: BlockCat
  sanitary?: boolean
}

export const BLOCK_CATS: { id: BlockCat; label: string; icon: string }[] = [
  { id: 'mobiliario', label: 'Mobiliario', icon: 'Armchair' },
  { id: 'cocina', label: 'Cocina', icon: 'CookingPot' },
  { id: 'sanitarios', label: 'Sanitarios', icon: 'Bath' },
  { id: 'exterior', label: 'Exterior', icon: 'TreePine' },
  { id: 'detalles', label: 'Detalles constructivos', icon: 'DraftingCompass' },
  { id: 'otros', label: 'Otros', icon: 'Shapes' },
]

export const BLOCK_LIBRARY: BlockDef[] = [
  // --- Mobiliario ---
  { kind: 'sofa', label: 'Sofá 3 cuerpos', w: 180, h: 70, cat: 'mobiliario' },
  { kind: 'sofados', label: 'Sofá 2 cuerpos', w: 90, h: 51, cat: 'mobiliario' },
  { kind: 'sofal', label: 'Sofá en L', w: 156, h: 108, cat: 'mobiliario' },
  { kind: 'sillon', label: 'Sillón individual', w: 62, h: 62, cat: 'mobiliario' },
  { kind: 'puff', label: 'Puf', w: 33, h: 33, cat: 'mobiliario' },
  { kind: 'mesacentro', label: 'Mesa de centro', w: 80, h: 48, cat: 'mobiliario' },
  { kind: 'mesacomedor', label: 'Mesa comedor 4p', w: 100, h: 100, cat: 'mobiliario' },
  { kind: 'mesacomedor6', label: 'Mesa comedor 6p', w: 96, h: 54, cat: 'mobiliario' },
  { kind: 'silla', label: 'Silla de comedor', w: 27, h: 30, cat: 'mobiliario' },
  { kind: 'taburete', label: 'Taburete', w: 24, h: 24, cat: 'mobiliario' },
  { kind: 'tv', label: 'Panel TV', w: 140, h: 14, cat: 'mobiliario' },
  { kind: 'muebletv', label: 'Rack de TV', w: 96, h: 24, cat: 'mobiliario' },
  { kind: 'alfombra', label: 'Alfombra 3.5×3', w: 220, h: 185, cat: 'mobiliario' },
  { kind: 'cama', label: 'Cama plaza y media', w: 135, h: 185, cat: 'mobiliario' },
  { kind: 'camaking', label: 'Cama king', w: 108, h: 123, cat: 'mobiliario' },
  { kind: 'camaindividual', label: 'Cama individual', w: 63, h: 114, cat: 'mobiliario' },
  { kind: 'cuna', label: 'Cuna', w: 42, h: 81, cat: 'mobiliario' },
  { kind: 'mesitanoche', label: 'Mesita de noche', w: 50, h: 45, cat: 'mobiliario' },
  { kind: 'ropero', label: 'Ropero 6 puertas', w: 150, h: 62, cat: 'mobiliario' },
  { kind: 'comoda', label: 'Cómoda 6 cajones', w: 66, h: 33, cat: 'mobiliario' },
  { kind: 'estante', label: 'Estante modular', w: 150, h: 42, cat: 'mobiliario' },
  { kind: 'librero', label: 'Librero', w: 72, h: 24, cat: 'mobiliario' },
  { kind: 'escritorio', label: 'Escritorio', w: 140, h: 58, cat: 'mobiliario' },
  { kind: 'sillaescritorio', label: 'Silla giratoria', w: 42, h: 42, cat: 'mobiliario' },
  // --- Cocina ---
  { kind: 'counter', label: 'Módulo de cocina', w: 260, h: 58, cat: 'cocina' },
  { kind: 'esquinero', label: 'Módulo esquinero', w: 54, h: 54, cat: 'cocina' },
  { kind: 'despensa', label: 'Despensa alta', w: 36, h: 132, cat: 'cocina' },
  { kind: 'stove', label: 'Cocina 4 hornillas', w: 58, h: 54, cat: 'cocina' },
  { kind: 'campana', label: 'Campana extractora', w: 36, h: 30, cat: 'cocina' },
  { kind: 'horno', label: 'Horno empotrado', w: 36, h: 36, cat: 'cocina' },
  { kind: 'sinkk', label: 'Fregadero doble', w: 55, h: 48, cat: 'cocina' },
  { kind: 'fregadero1', label: 'Fregadero simple', w: 30, h: 27, cat: 'cocina' },
  { kind: 'lavavajillas', label: 'Lavavajillas', w: 36, h: 36, cat: 'cocina' },
  { kind: 'refri', label: 'Refrigeradora', w: 56, h: 66, cat: 'cocina' },
  { kind: 'refri2', label: 'Refrig. side-by-side', w: 54, h: 45, cat: 'cocina' },
  { kind: 'isla', label: 'Isla de cocina', w: 140, h: 72, cat: 'cocina' },
  { kind: 'barra', label: 'Barra de desayuno', w: 108, h: 36, cat: 'cocina' },
  // --- Sanitarios ---
  { kind: 'inodoro', label: 'Inodoro', w: 46, h: 40, cat: 'sanitarios', sanitary: true },
  { kind: 'inodoropared', label: 'Inodoro de pared', w: 22, h: 33, cat: 'sanitarios', sanitary: true },
  { kind: 'lavatorio', label: 'Lavatorio', w: 74, h: 50, cat: 'sanitarios', sanitary: true },
  { kind: 'lavatoriodoble', label: 'Lavatorio doble', w: 72, h: 30, cat: 'sanitarios', sanitary: true },
  { kind: 'bidet', label: 'Bidet', w: 24, h: 36, cat: 'sanitarios', sanitary: true },
  { kind: 'urinario', label: 'Urinario', w: 21, h: 24, cat: 'sanitarios', sanitary: true },
  { kind: 'ducha', label: 'Ducha 0.90×0.90', w: 88, h: 88, cat: 'sanitarios', sanitary: true },
  { kind: 'banera', label: 'Bañera 1.70×0.80', w: 102, h: 48, cat: 'sanitarios', sanitary: true },
  { kind: 'jacuzzi', label: 'Jacuzzi 1.8×1.8', w: 108, h: 108, cat: 'sanitarios', sanitary: true },
  { kind: 'lavadora', label: 'Lavadora', w: 36, h: 36, cat: 'sanitarios', sanitary: true },
  { kind: 'secadora', label: 'Secadora', w: 36, h: 36, cat: 'sanitarios', sanitary: true },
  // --- Exterior ---
  { kind: 'arbol', label: 'Árbol copa 2.5 m', w: 150, h: 150, cat: 'exterior' },
  { kind: 'palmera', label: 'Palmera copa 3 m', w: 180, h: 180, cat: 'exterior' },
  { kind: 'arbusto', label: 'Arbusto 1.0 m', w: 60, h: 60, cat: 'exterior' },
  { kind: 'maceta', label: 'Maceta 0.5 m', w: 30, h: 30, cat: 'exterior' },
  { kind: 'grama', label: 'Césped 3×3 m', w: 180, h: 180, cat: 'exterior' },
  { kind: 'bancojardin', label: 'Banco de jardín', w: 90, h: 30, cat: 'exterior' },
  { kind: 'pergola', label: 'Pérgola 3×3 m', w: 180, h: 180, cat: 'exterior' },
  { kind: 'parrilla', label: 'Parrilla 1.2×0.6', w: 72, h: 36, cat: 'exterior' },
  { kind: 'piscina', label: 'Piscina 6×3 m', w: 360, h: 180, cat: 'exterior' },
  { kind: 'auto', label: 'Automóvil 4.5 m', w: 270, h: 130, cat: 'exterior' },
  { kind: 'camioneta', label: 'Camioneta 5.4 m', w: 324, h: 120, cat: 'exterior' },
  // --- Otros ---
  { kind: 'ascensor', label: 'Ascensor', w: 90, h: 90, cat: 'otros' },
  { kind: 'rampa', label: 'Rampa accesible', w: 72, h: 144, cat: 'otros' },
  { kind: 'chimenea', label: 'Chimenea', w: 54, h: 54, cat: 'otros' },
  { kind: 'extintor', label: 'Extintor', w: 24, h: 24, cat: 'otros' },
  { kind: 'tablero', label: 'Tablero eléctrico', w: 21, h: 15, cat: 'otros' },
  // --- Detalles constructivos (secciones a escalas mayores) ---
  { kind: 'det-cimiento', label: 'Cimiento corrido', w: 120, h: 90, cat: 'detalles' },
  { kind: 'det-sobrecimiento', label: 'Sobrecimiento', w: 120, h: 60, cat: 'detalles' },
  { kind: 'det-muro-soga', label: 'Muro a soga (elev.)', w: 150, h: 100, cat: 'detalles' },
  { kind: 'det-muro-cabeza', label: 'Muro a cabeza (elev.)', w: 150, h: 100, cat: 'detalles' },
  { kind: 'det-junta', label: 'Junta de dilatación', w: 150, h: 60, cat: 'detalles' },
  { kind: 'det-derrame', label: 'Derrame de ventana', w: 150, h: 100, cat: 'detalles' },
  { kind: 'det-losa', label: 'Losa aligerada (sección)', w: 180, h: 90, cat: 'detalles' },
  { kind: 'det-escalera', label: 'Escalera (sección)', w: 180, h: 120, cat: 'detalles' },
  { kind: 'det-tuboagua', label: 'Tubería de agua (det.)', w: 100, h: 100, cat: 'detalles' },
  { kind: 'det-tubodesague', label: 'Tubería de desagüe (det.)', w: 100, h: 100, cat: 'detalles' },
]

export function roomAreaM2(geo: RoomGeo): number {
  return Math.round(((geo.w / PX_PER_M) * (geo.h / PX_PER_M)) * 100) / 100
}

// --- geometría de terreno ---

/** Área de un polígono (fórmula del cordón / shoelace) en m². */
export function polygonAreaM2(pts: number[][]): number {
  if (pts.length < 3) return 0
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.round(Math.abs(a / 2) / (PX_PER_M * PX_PER_M) * 100) / 100
}

/** Perímetro de polígono en m. */
export function polygonPerimeterM(pts: number[][]): number {
  if (pts.length < 2) return 0
  let p = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    p += Math.hypot(x2 - x1, y2 - y1)
  }
  return Math.round(p / PX_PER_M * 100) / 100
}

export function elementSummary(el: PlanElement): string {
  switch (el.type) {
    case 'muro': {
      const g = el.geo as WallGeo
      const len = Math.abs(g.x2 - g.x1) + Math.abs(g.y2 - g.y1)
      return `Longitud ${(len / PX_PER_M).toFixed(2)} m · Espesor ${(g.t / PX_PER_M * 100).toFixed(0)} cm`
    }
    case 'puerta': {
      const g = el.geo as DoorGeo
      return `Ancho ${(g.r / PX_PER_M).toFixed(2)} m · Giro 90°`
    }
    case 'ventana': {
      const g = el.geo as WindowGeo
      return `Ancho ${(g.len / PX_PER_M).toFixed(2)} m · Vidrio laminado`
    }
    case 'espacio': {
      const g = el.geo as RoomGeo
      return `${roomAreaM2(g).toFixed(2)} m² · Uso: ${el.name}`
    }
    case 'cota': {
      const g = el.geo as DimGeo
      const d = Math.hypot(g.x2 - g.x1, g.y2 - g.y1)
      return `Valor real ${(d / PX_PER_M).toFixed(2)} m`
    }
    case 'escalera': {
      const g = el.geo as StairGeo
      return `${g.steps} pasos · huella ${(g.tread * 100).toFixed(0)} cm · contrahuella ${(g.riser * 100).toFixed(1)} cm`
    }
    case 'techo': {
      const g = el.geo as RoofGeo
      return `${g.kind === 'dos-aguas' ? 'A dos aguas' : g.kind === 'cuatro-aguas' ? 'A cuatro aguas' : 'Plano'} · pend. ${g.slope}%`
    }
    case 'instalacion': {
      const g = el.geo as InstGeo
      return `${g.kind === 'agua' ? 'Agua' : g.kind === 'desague' ? 'Desagüe' : 'Eléctrico'} · Ø ${(g.diameter / PX_PER_M * 100).toFixed(0)} mm · ${g.pts.length} tramos`
    }
    case 'simbolo': {
      const g = el.geo as SymGeo
      const names: Record<string, string> = {
        'luz': 'Luminaria', 'tomacorriente': 'Tomacorriente', 'interruptor': 'Interruptor',
        'tablero': 'Tablero', 'punto-agua': 'Punto de agua', 'punto-desague': 'Punto de desagüe', 'medidor-agua': 'Medidor de agua',
      }
      return names[g.kind] || g.kind
    }
    case 'terreno': {
      const g = el.geo as TerrainGeo
      if (g.kind === 'curva') return `Curva de nivel ${g.elev?.toFixed(2) ?? ''} m`
      return `Lote · ${polygonAreaM2(g.pts).toLocaleString('es-PE')} m² · perímetro ${polygonPerimeterM(g.pts).toFixed(2)} m`
    }
    case 'pin': {
      const g = el.geo as PinGeo
      return `${g.resolved ? 'Resuelto' : 'Pendiente'} · ${g.author}`
    }
    default:
      return el.name
  }
}
