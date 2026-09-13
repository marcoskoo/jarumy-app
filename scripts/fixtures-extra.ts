// Elementos de prueba: escalera, techo, instalaciones, terreno, pines, símbolos
import type { PlanElement, SymKind } from '../src/lib/plan-data'

export function insertStairFixture(base: PlanElement[]) {
  const elements = [...base]
  // escalera 2.50 m · 15 pasos · huella 0.25 · contrahuella 0.167
  elements.push({
    id: 'usr-escalera1', type: 'escalera', layer: 'muros', name: 'Escalera 15 pasos',
    geo: { x: 200, y: 150, w: 60, h: 225, steps: 15, riser: 0.1667, tread: 0.25, dir: 'up' },
  })
  // techo a dos aguas sobre toda la vivienda
  elements.push({
    id: 'usr-techo1', type: 'techo', layer: 'muros', name: 'Techo a dos aguas',
    geo: { x: 150, y: 100, w: 900, h: 600, slope: 30, kind: 'dos-aguas', ridge: 'h' },
  })
  return { elements, mods: {} as Record<string, never> }
}

export function insertRoofFixture(base: PlanElement[]) {
  const elements = [...base]
  elements.push({
    id: 'usr-techo2', type: 'techo', layer: 'muros', name: 'Techo cuatro aguas',
    geo: { x: 100, y: 50, w: 400, h: 300, slope: 25, kind: 'cuatro-aguas', ridge: 'h' },
  })
  return elements
}

export function insertInstFixture(base: PlanElement[]) {
  const elements = [...base]
  elements.push({
    id: 'usr-agua1', type: 'instalacion', layer: 'instalaciones', name: 'Tubería de agua',
    geo: { kind: 'agua', pts: [[150, 320], [400, 320], [400, 500]], diameter: 10 },
  })
  elements.push({
    id: 'usr-desag1', type: 'instalacion', layer: 'instalaciones', name: 'Colector de desagüe',
    geo: { kind: 'desague', pts: [[645, 464], [645, 700], [1000, 700]], diameter: 12 },
  })
  elements.push({
    id: 'usr-elec1', type: 'instalacion', layer: 'instalaciones', name: 'Circuito eléctrico',
    geo: { kind: 'electrico', pts: [[900, 150], [900, 340], [1050, 340]], diameter: 6 },
  })
  return elements
}

export function insertTerrainFixture(base: PlanElement[]) {
  const elements = [...base]
  elements.push({
    id: 'usr-lote1', type: 'terreno', layer: 'terreno', name: 'Lote',
    geo: { kind: 'lote', pts: [[60, 40], [1140, 40], [1140, 760], [60, 760]], name: 'LOTE 1 - MZ A' },
  })
  elements.push({
    id: 'usr-curva1', type: 'terreno', layer: 'terreno', name: 'Curva nivel 100',
    geo: { kind: 'curva', pts: [[60, 100], [1140, 120]], elev: 100 },
  })
  return elements
}

export function insertPinFixture(base: PlanElement[]) {
  const elements = [...base]
  elements.push({
    id: 'usr-pin1', type: 'pin', layer: 'comentarios', name: 'Comentario 1',
    geo: { x: 400, y: 250, text: 'Revisar ancho de vano aquí', author: 'J. Burga' },
  })
  elements.push({
    id: 'usr-pin2', type: 'pin', layer: 'comentarios', name: 'Comentario 2',
    geo: { x: 800, y: 550, text: 'Subir countertop 5 cm', author: 'J. Burga', resolved: true },
  })
  return elements
}

export function insertSymFixture(base: PlanElement[]) {
  const elements = [...base]
  const syms: Array<[SymKind, number, number]> = [
    ['luz', 300, 200], ['luz', 500, 200], ['tomacorriente', 200, 450], ['interruptor', 640, 200],
    ['tablero', 660, 120], ['punto-agua', 370, 440], ['punto-desague', 645, 480], ['medidor-agua', 140, 300],
  ]
  syms.forEach(([kind, x, y], i) => {
    elements.push({
      id: `usr-sym${i}`, type: 'simbolo', layer: 'instalaciones', name: `Símbolo ${kind}`,
      geo: { kind, x, y },
    })
  })
  return elements
}
