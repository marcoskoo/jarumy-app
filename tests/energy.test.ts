// Pruebas del análisis energético REAL (Ola 8): refrigeración por CDD,
// calefacción por HDD + infiltración n50, y scorecard LEED dinámico.
import { describe, expect, it } from 'vitest'
import { computeEnergy, ZONE_CDD, ZONE_HDD } from '../src/lib/energy'
import { BASE_ELEMENTS } from '../src/lib/plan-data'

describe('Análisis energético (cálculo real del modelo)', () => {
  it('zonas E.020 con HDD/CDD coherentes', () => {
    expect(ZONE_HDD['6']).toBeGreaterThan(ZONE_HDD['2']) // puna más fría que Lima
    expect(ZONE_CDD['3']).toBeGreaterThan(ZONE_CDD['2']) // selva más cálida que Lima
    expect(ZONE_CDD['6']).toBe(0)                          // puna sin refrigeración
  })

  it('el plano base produce un informe con áreas y U reales', () => {
    const r = computeEnergy(BASE_ELEMENTS, {}, '2')
    expect(r.floorAreaM2).toBeGreaterThan(100)
    expect(r.wallAreaM2).toBeGreaterThan(50)
    expect(r.glassAreaM2).toBeGreaterThan(5)
    expect(r.wfrPct).toBeGreaterThan(5)
    expect(r.uWall).toBeGreaterThan(0.5)
    expect(r.uWall).toBeLessThan(3) // ladrillo tarrajeado ~1.4-2.2
    expect(r.volumeM3).toBeGreaterThan(300)
  })

  it('la selva (Z3) demanda MÁS refrigeración que Lima (Z2)', () => {
    const lima = computeEnergy(BASE_ELEMENTS, {}, '2')
    const selva = computeEnergy(BASE_ELEMENTS, {}, '3')
    expect(selva.coolingKwhM2a).toBeGreaterThan(lima.coolingKwhM2a)
  })

  it('la puna (Z6) demanda MÁS calefacción que Lima (Z2)', () => {
    const lima = computeEnergy(BASE_ELEMENTS, {}, '2')
    const puna = computeEnergy(BASE_ELEMENTS, {}, '6')
    expect(puna.heatingKwhM2a).toBeGreaterThan(lima.heatingKwhM2a)
  })

  it('n50 en rango físico (0.5..12 1/h) y sensible al tipo de muro', () => {
    const r = computeEnergy(BASE_ELEMENTS, {}, '2')
    expect(r.n50).toBeGreaterThan(0.5)
    expect(r.n50).toBeLessThan(12)
    expect(r.euiKwhM2a).toBeGreaterThan(30)
    // drywall (juntas más fugaces) aumenta n50 vs albañilería
    const mods: Record<string, { wallType: string }> = {}
    for (const el of BASE_ELEMENTS) if (el.type === 'muro') mods[el.id] = { wallType: 'dw100' }
    const dry = computeEnergy(BASE_ELEMENTS, mods as never, '2')
    expect(dry.n50).toBeGreaterThan(r.n50)
  })

  it('LEED responde a la envolvente: DVH (glazing 2) mejora la puntuación', () => {
    const base = computeEnergy(BASE_ELEMENTS, {}, '2')
    // cambia todas las ventanas a DVH doble hermético (U 2.8 vs 5.8 simple).
    // OJO: mod.glazing es el VIDRIO; mod.windowType es la apertura y NO
    // altera la transmitancia (fijado en la Fase 0 del diagnóstico)
    const mods: Record<string, { glazing: number }> = {}
    for (const el of BASE_ELEMENTS) if (el.type === 'ventana') mods[el.id] = { glazing: 2 }
    const mejor = computeEnergy(BASE_ELEMENTS, mods as never, '2')
    expect(mejor.uWindow).toBeLessThan(base.uWindow)
    expect(mejor.euiKwhM2a).toBeLessThan(base.euiKwhM2a)
    expect(mejor.improvementPct).toBeGreaterThan(base.improvementPct)
    expect(mejor.leedPoints).toBeGreaterThanOrEqual(base.leedPoints)
  })

  it('PV real suma créditos LEED de renovables', () => {
    const sin = computeEnergy(BASE_ELEMENTS, {}, '2', 0)
    const con = computeEnergy(BASE_ELEMENTS, {}, '2', 6000)
    expect(con.leedPoints).toBeGreaterThan(sin.leedPoints)
    const renovables = con.leedCredits.find((c) => c.name.includes('renovable'))
    expect(renovables?.points).toBeGreaterThan(0)
  })
})
