// Pruebas de regresión de los bugs de CORRECTNESS (Fase 0 del diagnóstico):
//  1. Elevación/sección: doble traslación de muros verticales tras el corte
//     y detección de muros realmente cortados por el plano.
//  2. Vidriería: U/SHGC desde GLAZING_TYPES (mod.glazing), ignora la
//     apertura (mod.windowType) y coincide entre energía/térmica/metrados.
//  3. Drywall: energy.wallU usa el MISMO ensamblaje que thermal (lana 75 mm).
//  4. Ocupantes: cuadro BIM = informe de evacuación (regla RNE por uso).
import { describe, expect, it } from 'vitest'
import { buildElevation } from '../src/lib/elevation'
import { computeEnergy } from '../src/lib/energy'
import { computeThermalReport } from '../src/lib/thermal'
import { computeBimSchedules } from '../src/lib/bim-schedules'
import { computeEvacuation } from '../src/lib/evacuation'
import { GLAZING_TYPES, glazingOf, PX_PER_M } from '../src/lib/plan-data'
import type { PlanElement, WallGeo, RoomGeo, DoorGeo, WindowGeo } from '../src/lib/plan-data'
import type { Mod } from '../src/lib/store'

const mkWall = (id: string, x1: number, y1: number, x2: number, y2: number, t = 12): PlanElement => ({
  id, type: 'muro', layer: 'muros', name: `Muro ${id}`,
  geo: { x1, y1, x2, y2, t } as WallGeo,
})

const mkRoom = (id: string, name: string, x: number, y: number, w: number, h: number): PlanElement => ({
  id, type: 'espacio', layer: 'espacios', name,
  geo: { x, y, w, h, name: name.toUpperCase(), num: '01' } as RoomGeo,
})

const mkDoor = (id: string, cx: number, cy: number, wM: number): PlanElement => ({
  id, type: 'puerta', layer: 'puertas', name: `Puerta ${id}`,
  geo: { cx, cy, r: wM * 60, a0: -90, a1: 0, axis: 'v' } as DoorGeo,
})

const mkWin = (id: string, x: number, y: number, lenM: number): PlanElement => ({
  id, type: 'ventana', layer: 'ventanas', name: `Ventana ${id}`,
  geo: { x, y, len: lenM * PX_PER_M, orient: 'h', t: 12 } as WindowGeo,
})

// ---------- 1) Sección: traslación y muros cortados ----------
describe('Elevación — corte de sección', () => {
  const cutFaces = (elev: ReturnType<typeof buildElevation>) =>
    elev.lines.filter((l) => l.w === 0.05 && l.y1 === 0 && l.y2 === 2.5) // caras del corte (y no las líneas de suelo)
  const bgLines = (elev: ReturnType<typeof buildElevation>) =>
    elev.lines.filter((l) => l.w === 0.03 && l.y1 === 0 && l.y2 === 2.5) // fondo proyectado

  it('muro vertical DETRÁS del corte se dibuja en x + tx (no 2×tx)', () => {
    // muro vertical (x=600px) trasladado +120px → debe proyectarse en (600+120)/60
    const wall = mkWall('v1', 600, 100, 600, 500)
    const mods: Record<string, Mod> = { v1: { translate: [120, 0] } }
    const elev = buildElevation([wall], mods, 'seccion', { cutX: 300 })
    // líneas finas discontinuas = proyección de muro no cortado
    const proj = elev.lines.filter((l) => l.dash && l.w === 0.02)
    expect(proj.length).toBeGreaterThan(0)
    expect(proj[0].x1).toBeCloseTo((600 + 120) / PX_PER_M, 2) // nunca (600+240)/PX_PER_M
  })

  it('muro vertical cortado por su espesor → rectángulo sólido centrado en el muro', () => {
    const wall = mkWall('v1', 600, 100, 600, 500, 15) // t=15px=0.25 m
    const mods: Record<string, Mod> = { v1: { translate: [120, 0] } }
    // el plano cae EXACTO sobre el muro trasladado (720 px): |0| ≤ t/2
    const elev = buildElevation([wall], mods, 'seccion', { cutX: 720 })
    const faces = cutFaces(elev)
    expect(faces.length).toBe(2)
    const xs = faces.map((f) => f.x1).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo((720 - 7.5) / PX_PER_M, 2)
    expect(xs[1]).toBeCloseTo((720 + 7.5) / PX_PER_M, 2)
  })

  it('muro horizontal cruzado por el plano se dibuja CORTADO (no de fondo)', () => {
    // muro horizontal de x=200..900px; el corte en 500px lo cruza
    const wall = mkWall('h1', 200, 300, 900, 300, 15)
    const elev = buildElevation([wall], {}, 'seccion', { cutX: 500 })
    const faces = cutFaces(elev)
    expect(faces.length).toBe(2) // dos caras del corte en 8.33±0.125 m
    const xs = faces.map((f) => f.x1).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(500 / PX_PER_M - 7.5 / PX_PER_M, 2)
    expect(xs[1]).toBeCloseTo(500 / PX_PER_M + 7.5 / PX_PER_M, 2)
    // y NO dibuja las líneas de fondo de longitud completa
    expect(bgLines(elev).length).toBe(0)
  })

  it('muro horizontal NO cruzado queda como fondo proyectado', () => {
    const wall = mkWall('h1', 200, 300, 400, 300, 15)
    const elev = buildElevation([wall], {}, 'seccion', { cutX: 800 })
    expect(cutFaces(elev).length).toBe(0)
    expect(bgLines(elev).length).toBeGreaterThan(0)
  })
})

// ---------- 2) Vidriería: una sola fuente de verdad ----------
describe('Vidriería — GLAZING_TYPES única fuente', () => {
  it('glazingOf: por defecto vidrio simple (U 5.8) y niveles 0-3 válidos', () => {
    expect(glazingOf().u).toBe(5.8)
    expect(glazingOf({ glazing: 1 }).u).toBe(5.4)
    expect(glazingOf({ glazing: 2 }).u).toBe(2.8)
    expect(glazingOf({ glazing: 3 }).u).toBe(1.4)
    expect(glazingOf({ glazing: 99 }).u).toBe(5.8) // índice inválido → simple
    expect(Object.keys(GLAZING_TYPES)).toHaveLength(4)
  })

  it('energía: windowType (apertura) NO altera el U del vidrio', () => {
    const win = mkWin('w1', 100, 100, 1.5)
    const room = mkRoom('r1', 'Sala', 100, 100, 300, 300)
    const base = computeEnergy([win, room], {}, '2').uWindow
    // apertura corrediza (windowType 1): antes subía el U a 3.3
    const corrediza = computeEnergy([win, room], { w1: { windowType: 1 } }, '2').uWindow
    expect(corrediza).toBe(base)
    expect(base).toBe(5.8) // vidrio simple por defecto
    // DVH low-E baja el U a 1.4
    const dvh = computeEnergy([win, room], { w1: { glazing: 3 } }, '2').uWindow
    expect(dvh).toBe(1.4)
  })

  it('térmica: el U de la fila de ventana viene de GLAZING_TYPES', () => {
    const win = mkWin('w1', 100, 100, 1.5)
    const wall = mkWall('m1', 100, 100, 400, 100)
    const rep = computeThermalReport([win, wall], { w1: { glazing: 3 } }, '2')
    const row = rep.rows.find((r) => r.assembly.includes('DVH low-E'))
    expect(row?.uValue).toBe(1.4)
  })

  it('metrados (store) anuncian el vidrio real con su U — no un 1.4 falso', () => {
    // computeMetrados está en el store (cliente); se valida indirectamente
    // a través de la misma tabla: el texto del metrado usa glazingOf(mod)
    const glass = glazingOf({ glazing: 0 })
    expect(glass.label).toBe('Vidrio simple 6 mm')
    expect(glass.u).toBe(5.8)
  })
})

// ---------- 3) Drywall: energy == thermal ----------
describe('Drywall dw100 — mismo U en energía y térmica', () => {
  it('energy.wallU(dw100) ≈ thermal(dw100) ≈ 0.42-0.43 W/m²K', () => {
    const wall = mkWall('d1', 100, 100, 700, 100, 6) // dw100 t=6px
    const mods: Record<string, Mod> = { d1: { wallType: 'dw100' } }
    const room = mkRoom('r1', 'Sala', 100, 100, 600, 300)
    const energy = computeEnergy([wall, room], mods, '2').uWall
    const thermal = computeThermalReport([wall], mods, '2')
    const dwRow = thermal.rows.find((r) => r.assembly.includes('Drywall'))
    // antes: energy daba ~3.58 (cámara de aire λ5.5) vs thermal 0.425
    expect(energy).toBeLessThan(0.5)
    expect(energy).toBeGreaterThan(0.35)
    expect(dwRow?.uValue).toBeCloseTo(energy, 1)
  })
})

// ---------- 4) Ocupantes: BIM == evacuación ----------
describe('Ocupantes — cuadro BIM y evacuación coinciden', () => {
  it('dormitorio de 12 m² = 2 ocupantes en BIM y en evacuación (no área/4.5=3)', () => {
    const room = mkRoom('r1', 'Dormitorio', 150, 100, 360, 200) // 12 m²
    const door = mkDoor('d1', 300, 300, 0.9)
    const bim = computeBimSchedules([room, door], {})
    const evac = computeEvacuation([room, door], {})
    expect(bim.espacios[0].ocup).toBe(2) // antes: round(12/4.5)=3
    expect(bim.espacios[0].ocup).toBe(evac.rooms[0].occupants)
    expect(bim.espacios[0].ocup).toBe(evac.totalOccupants)
  })

  it('totales de ocupación idénticos entre módulos para un plano mixto', () => {
    const sala = mkRoom('r1', 'Sala', 150, 100, 360, 240)      // estar: 6
    const dorm = mkRoom('r2', 'Dormitorio', 520, 100, 240, 240) // dormitorio: 2
    const cocina = mkRoom('r3', 'Cocina', 520, 350, 240, 180)   // cocina: 3
    const door = mkDoor('d1', 300, 300, 0.9)
    const els = [sala, dorm, cocina, door]
    const bim = computeBimSchedules(els, {})
    const evac = computeEvacuation(els, {})
    expect(bim.espacios.reduce((n, r) => n + r.ocup, 0)).toBe(evac.totalOccupants)
    expect(evac.totalOccupants).toBe(11)
  })
})
