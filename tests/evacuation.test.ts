// Pruebas de evacuación RNE A.130 y de la CONSTANTE COMPARTIDA con
// normativa.ts (el bug original: 30 m vs 25 m según el módulo).
import { describe, expect, it } from 'vitest'
import { computeEvacuation } from '../src/lib/evacuation'
import { MAX_TRAVEL_M, PERSONS_PER_CM } from '../src/lib/rne'
import { BASE_ELEMENTS } from '../src/lib/plan-data'
import type { PlanElement, RoomGeo, DoorGeo } from '../src/lib/plan-data'

const mkRoom = (id: string, name: string, x: number, y: number, w: number, h: number, usage?: string) => {
  const el: PlanElement = {
    id, type: 'espacio', layer: 'espacios', name,
    geo: { x, y, w, h, name: name.toUpperCase(), num: '01' } as RoomGeo,
  }
  return usage ? { el, mods: { [id]: { usage } } } : { el, mods: {} as Record<string, never> }
}

const mkDoor = (id: string, name: string, cx: number, cy: number, wM: number): PlanElement => ({
  id, type: 'puerta', layer: 'puertas', name,
  geo: { cx, cy, r: wM * 60, a0: -90, a1: 0, axis: 'v' } as DoorGeo,
})

describe('RNE A.130 — evacuación', () => {
  it('constantes compartidas: 25 m de recorrido y 0.8 pers/cm', () => {
    expect(MAX_TRAVEL_M).toBe(25)
    expect(PERSONS_PER_CM).toBe(0.8)
  })

  it('ambiente a >25 m de la puerta marca FALLO de recorrido', () => {
    // sala de 6×4 m con centro a ~28 m de la puerta → excede 25 m
    const room = mkRoom('r1', 'Sala', 150, 100, 360, 240, 'estar')
    const door = mkDoor('d1', 'Puerta principal', 2000, 220, 0.9)
    const rep = computeEvacuation([room.el, door], { r1: { usage: 'estar' } })
    expect(rep.maxTravelM).toBeGreaterThan(25)
    expect(rep.checks.find((c) => c.label === 'Recorrido máximo a salida')?.status).toBe('fail')
  })

  it('ambiente cercano a la puerta pasa el recorrido', () => {
    const room = mkRoom('r1', 'Sala', 150, 100, 360, 240, 'estar')
    const door = mkDoor('d1', 'Puerta principal', 330, 220, 0.9) // centro de la sala
    const rep = computeEvacuation([room.el, door], { r1: { usage: 'estar' } })
    expect(rep.maxTravelM).toBeLessThanOrEqual(MAX_TRAVEL_M)
    expect(rep.checks.find((c) => c.label === 'Recorrido máximo a salida')?.status).toBe('ok')
  })

  it('aforo: 0.9 m de puerta admite 72 personas (0.8/cm)', () => {
    const room = mkRoom('r1', 'Dormitorio', 150, 100, 180, 180, 'dormitorio')
    const door = mkDoor('d1', 'Puerta', 240, 190, 0.9)
    const rep = computeEvacuation([room.el, door], { r1: { usage: 'dormitorio' } })
    expect(rep.doors[0].aflowPer).toBe(72) // 90 cm × 0.8
    expect(rep.totalOccupants).toBe(2)     // dormitorio = 2 ocupantes
    expect(rep.aflowOK).toBe(true)
  })

  it('sin puertas → fallo de evacuación', () => {
    const room = mkRoom('r1', 'Sala', 150, 100, 240, 240, 'estar')
    const rep = computeEvacuation([room.el], {})
    expect(rep.rooms[0].nearestDoor).toBe('Sin puertas')
    expect(rep.rooms[0].status).toBe('fail')
  })

  it('el plano base de la app no crashea y produce informe completo', () => {
    const rep = computeEvacuation(BASE_ELEMENTS, {})
    expect(rep.rooms.length).toBeGreaterThan(0)
    expect(rep.doors.length).toBeGreaterThan(0)
    expect(rep.checks.length).toBeGreaterThanOrEqual(3)
  })
})
