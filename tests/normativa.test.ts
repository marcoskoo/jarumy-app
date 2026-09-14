// Pruebas del módulo normativo: fixture mínimo de vivienda (mismas
// convenciones de plan-data: 60 px = 1 m, Y hacia abajo).
import { describe, expect, it } from 'vitest'
import { checkNormativa } from '../src/lib/normativa'
import { BASE_ELEMENTS } from '../src/lib/plan-data'
import { MAX_TRAVEL_M } from '../src/lib/rne'
import type { PlanElement, RoomGeo, DoorGeo, WindowGeo } from '../src/lib/plan-data'
import type { Mod } from '../src/lib/store'

const mkRoom = (id: string, name: string, x: number, y: number, w: number, h: number): PlanElement => ({
  id, type: 'espacio', layer: 'espacios', name,
  geo: { x, y, w, h, name: name.toUpperCase(), num: '01' } as RoomGeo,
})

const mkDoor = (id: string, name: string, cx: number, cy: number, wM: number): PlanElement => ({
  id, type: 'puerta', layer: 'puertas', name,
  geo: { cx, cy, r: wM * 60, a0: -90, a1: 0, axis: 'v' } as DoorGeo,
})

const mkWin = (id: string, name: string, x: number, y: number, lenM: number, orient: 'h' | 'v'): PlanElement => ({
  id, type: 'ventana', layer: 'ventanas', name,
  geo: { x, y, len: lenM * 60, orient, t: 12 } as WindowGeo,
})

describe('RNE A.010/A.040/A.130 — checkNormativa', () => {
  it('puerta de acceso de 0.90 m pasa; de 0.80 m falla', () => {
    const ok = checkNormativa(
      [mkRoom('r1', 'Sala', 150, 100, 240, 240), mkDoor('d1', 'Puerta principal 0.90', 150, 220, 0.9)],
      {},
    )
    expect(ok.checks.find((c) => c.code === 'A.010-120')?.status).toBe('ok')

    const bad = checkNormativa(
      [mkRoom('r1', 'Sala', 150, 100, 240, 240), mkDoor('d1', 'Puerta principal 0.80', 150, 220, 0.8)],
      {},
    )
    expect(bad.checks.find((c) => c.code === 'A.010-120')?.status).toBe('fail')
  })

  it('baño de 1.2 m² con lado 0.90 m cumple A.010', () => {
    const rep = checkNormativa(
      [mkRoom('b1', 'Baño', 150, 100, 54, 150), mkDoor('d1', 'Puerta principal 0.90', 150, 130, 0.9)],
      {},
    )
    const bath = rep.checks.find((c) => c.code === 'A.010-45')
    expect(bath?.status).toBe('ok')
  })

  it('baño de 0.96 m² y lado 0.80 m falla A.010', () => {
    const rep = checkNormativa(
      [mkRoom('b1', 'Baño', 150, 100, 48, 72), mkDoor('d1', 'Puerta principal 0.90', 150, 130, 0.9)],
      {},
    )
    expect(rep.checks.find((c) => c.code === 'A.010-45')?.status).toBe('fail')
  })

  it('dormitorio < 7.5 m² genera AVISO (A.040)', () => {
    const rep = checkNormativa(
      [mkRoom('d1', 'Dormitorio 1', 150, 100, 180, 120), mkDoor('p1', 'Puerta principal 0.90', 150, 130, 0.9)],
      {},
    )
    expect(rep.checks.find((c) => c.code === 'A.040-70')?.status).toBe('warn')
  })

  it('iluminación: ventana del 10%+ del piso pasa, sin vanos falla', () => {
    const room = mkRoom('s1', 'Sala', 150, 100, 240, 240) // 4×4 = 16 m²
    const door = mkDoor('d1', 'Puerta principal 0.90', 150, 220, 0.9)
    const sinVano = checkNormativa([room, door], {})
    expect(sinVano.checks.find((c) => c.title.includes('Iluminación natural'))?.status).toBe('fail')

    // vano en el muro norte (y=100): 1.5 m de largo → 1.5×1.2 = 1.8 m² = 11.25% ≥ 10%
    const conVano = checkNormativa([room, mkWin('v1', 'Ventana sala', 180, 100, 1.5, 'h'), door], {})
    expect(conVano.checks.find((c) => c.title.includes('Iluminación natural'))?.status).toBe('ok')
  })

  it('A.130 usa el MISMO límite que evacuation.ts (constante compartida)', () => {
    // vivienda lejana: 12 m de recorrido → dentro de cualquier límite
    const rep = checkNormativa(
      [mkRoom('r1', 'Sala', 150, 100, 720, 240), mkDoor('d1', 'Puerta principal 0.90', 150, 130, 0.9)],
      {},
    )
    const travel = rep.checks.find((c) => c.code === 'A.130-25')
    expect(travel).toBeDefined()
    expect(travel?.status).toBe('ok')
    // el límite normativo compartido es 25 m (RNE A.130 vivienda)
    expect(MAX_TRAVEL_M).toBe(25)
    expect(travel?.title).toContain('25 m')
  })

  it('el plano base de la app pasa los checks estructurales sin crashear', () => {
    const rep = checkNormativa(BASE_ELEMENTS, {})
    expect(rep.checks.length).toBeGreaterThan(5)
    expect(rep.summary).toBeDefined()
    expect(rep.summary.ok + rep.summary.warn + rep.summary.fail).toBe(rep.checks.length)
  })
})
