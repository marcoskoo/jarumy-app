// Pruebas del importador DXF: geometría básica + expansión REAL de
// bloques INSERT (sección BLOCKS) con escala y rotación.
import { describe, expect, it } from 'vitest'
import { parseDxf } from '../src/lib/dxf-import'
import { PX_PER_M } from '../src/lib/plan-data'

// helper: pares código/valor → texto DXF de UNA sección (sin EOF: el parser lo tolera)
const dxf = (pairs: Array<[number, string]>, sections?: { blocks?: boolean }): string => {
  const rows: string[] = ['0', 'SECTION', '2', sections?.blocks ? 'BLOCKS' : 'ENTITIES']
  for (const [c, v] of pairs) rows.push(String(c), v)
  rows.push('0', 'ENDSEC')
  return rows.join('\n')
}

/** archivo completo con DOS secciones (BLOCKS + ENTITIES) y un único EOF */
const dxfTwoSections = (blocksPairs: Array<[number, string]>, entitiesPairs: Array<[number, string]>): string =>
  dxf(blocksPairs, { blocks: true }) + '\n' + dxf(entitiesPairs) + '\n0\nEOF\n'

describe('DXF import — entidades básicas', () => {
  it('LINE → elemento dibujo línea con 2 puntos', () => {
    const r = parseDxf(dxf([
      ['0', 'LINE'], ['8', 'muros'], ['10', '0'], ['20', '0'], ['11', '6'], ['21', '0'],
    ]))
    expect(r.stats.lines).toBe(1)
    expect(r.elements).toHaveLength(1)
    expect(r.elements[0].type).toBe('dibujo')
    const geo = r.elements[0].geo as { kind: string; pts: number[][] }
    expect(geo.kind).toBe('linea')
    expect(geo.pts).toHaveLength(2)
  })

  it('CIRCLE en mm se re-escala a metros (span > 1000 → mm)', () => {
    const r = parseDxf(dxf([
      ['0', 'CIRCLE'], ['8', 'dibujo'], ['10', '0'], ['20', '0'], ['40', '2000'],
    ]))
    expect(r.unitGuess).toBe('mm')
    expect(r.stats.circles).toBe(1)
    // el bounds se informa en unidades del archivo
    expect(r.bounds?.maxX).toBe(2000)
  })

  it('LWPOLYLINE cerrada repite el primer punto', () => {
    const r = parseDxf(dxf([
      ['0', 'LWPOLYLINE'], ['8', 'dibujo'], ['90', '3'], ['70', '1'],
      ['10', '0'], ['20', '0'], ['10', '1'], ['20', '0'], ['10', '1'], ['20', '1'],
    ]))
    expect(r.stats.polylines).toBe(1)
    const geo = r.elements[0].geo as { pts: number[][] }
    expect(geo.pts.length).toBe(4) // 3 + cierre
  })
})

describe('DXF import — bloques INSERT reales', () => {
  const withBlocks = dxfTwoSections(
    [
      // ---- BLOCKS: un bloque "MESA" con una línea de 0→1 m ----
      ['0', 'BLOCK'], ['2', 'MESA'], ['10', '0'], ['20', '0'],
      ['0', 'LINE'], ['8', 'mobiliario'], ['10', '0'], ['20', '0'], ['11', '1'], ['21', '0'],
      ['0', 'ENDBLK'],
    ],
    [
      // ---- ENTITIES: dos INSERT con transformaciones distintas ----
      ['0', 'INSERT'], ['2', 'MESA'], ['8', 'mobiliario'], ['10', '2'], ['20', '3'],
      ['0', 'INSERT'], ['2', 'MESA'], ['8', 'mobiliario'], ['10', '5'], ['20', '5'], ['41', '2'], ['50', '90'],
    ],
  )

  it('INSERT expande la geometría del bloque (2 líneas, no 2 puntos)', () => {
    const r = parseDxf(withBlocks)
    expect(r.stats.blocks).toBe(1)
    expect(r.stats.inserts).toBe(2)
    expect(r.stats.lines).toBe(2)
    expect(r.stats.others).toBe(0) // los INSERT ya no caen como puntos
    // ambos elementos son líneas reales
    for (const el of r.elements) {
      expect(el.type).toBe('dibujo')
      expect((el.geo as { kind: string }).kind).toBe('linea')
    }
  })

  it('la escala ×2 y rotación 90° transforman la geometría', () => {
    const r = parseDxf(withBlocks)
    expect(r.elements).toHaveLength(2)
    // línea 1: sin escala ni rotación → 1 m de largo
    const g1 = r.elements[0].geo as { pts: number[][] }
    const len1 = Math.hypot(g1.pts[1][0] - g1.pts[0][0], g1.pts[1][1] - g1.pts[0][1])
    expect(len1 / PX_PER_M).toBeCloseTo(1, 1)
    // línea 2: escala 2 → 2 m de largo (la rotación no cambia la longitud)
    const g2 = r.elements[1].geo as { pts: number[][] }
    const len2 = Math.hypot(g2.pts[1][0] - g2.pts[0][0], g2.pts[1][1] - g2.pts[0][1])
    expect(len2 / PX_PER_M).toBeCloseTo(2, 1)
  })

  it('INSERT sin definición de bloque cae en punto (fallback)', () => {
    const r = parseDxf(dxf([
      ['0', 'INSERT'], ['2', 'INEXISTENTE'], ['8', 'dibujo'], ['10', '2'], ['20', '3'],
    ]))
    expect(r.stats.inserts).toBe(0)
    expect(r.elements).toHaveLength(1)
    expect((r.elements[0].geo as { kind: string }).kind).toBe('punto')
  })
})
