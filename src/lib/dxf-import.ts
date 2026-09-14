// ============================================================
// JARUMY APP — Importador DXF R12/R2000 (ASCII).
// Operación inversa de dxf-export.ts: lee la sección ENTITIES
// en pares código-de-grupo/valor, detecta unidades (m/mm/pulg),
// convierte m→px (×60), invierte Y (DXF crece hacia arriba, la
// app hacia abajo) y centra el dibujo en el área de dibujo del
// plano (150..1050 × 100..700 px). Parsing puro de texto —
// SIN librerías externas. Tolerante a CRLF, secciones faltantes
// y pares malformados (se saltan con gracia).
// ============================================================

import type { PlanElement, DrawGeo, TextGeo } from '@/lib/plan-data'
import { PX_PER_M } from '@/lib/plan-data'

export interface DxfImportResult {
  elements: PlanElement[]
  stats: { lines: number; circles: number; arcs: number; polylines: number; texts: number; others: number; inserts: number; blocks: number }
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
  unitGuess: 'm' | 'mm' | 'in'
}

// --- entidad cruda tal como aparece en el archivo (unidades del DXF) ---
interface RawEnt {
  type: string            // LINE / CIRCLE / ARC / TEXT / MTEXT / LWPOLYLINE / POLYLINE / VERTEX / POINT / INSERT / ...
  layer: string           // código de grupo 8
  pairs: Array<[number, string]>
  verts: number[][]       // vértices acumulados (POLYLINE + VERTEX)
  closed: boolean         // bandera 70 bit 1
  block?: string          // nombre de bloque (INSERT, código 2)
}

/** Valor numérico de un código de grupo (primera ocurrencia). NaN si no existe. */
const pairNum = (ent: RawEnt, code: number): number => {
  for (const [c, v] of ent.pairs) if (c === code) { const n = Number.parseFloat(v); return n }
  return NaN
}

/** Valor textual de un código de grupo (primera ocurrencia). '' si no existe. */
const pairStr = (ent: RawEnt, code: number): string => {
  for (const [c, v] of ent.pairs) if (c === code) return v
  return ''
}

/** Limpia códigos de formato de MTEXT (\f...; \H...; \P; llaves). */
const cleanMtext = (s: string): string =>
  s
    .replace(/\\P/g, ' ')               // salto de párrafo → espacio
    .replace(/\\[A-Za-z][^;\\]*;/g, '') // códigos de formato \fArial; \H2x; \W1; ...
    .replace(/[{}]/g, '')               // llaves de agrupación
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Parsea el contenido completo de un DXF ASCII. Devuelve los elementos ya
 * transformados a coordenadas de pantalla de la app, estadísticas por tipo
 * de entidad, el bounds en unidades ORIGINALES del archivo y la unidad
 * detectada (heurística por extensión del dibujo).
 */
export function parseDxf(text: string): DxfImportResult {
  const stats = { lines: 0, circles: 0, arcs: 0, polylines: 0, texts: 0, others: 0, inserts: 0, blocks: 0 }
  const raw: string = (text ?? '').replace(/^\uFEFF/, '') // BOM
  const rows = raw.split(/\r\n|\r|\n/)

  // ---------- 1) lectura de pares código/valor y entidades ----------
  const ents: RawEnt[] = []            // sección ENTITIES
  const blocksRaw: RawEnt[] = []       // sección BLOCKS (definiciones de bloques)
  let section = ''              // sección actual (ENTITIES, HEADER, ...)
  let expectSectionName = false // tras (0,'SECTION') llega (2,'NOMBRE')
  let cur: RawEnt | null = null
  let poly: RawEnt | null = null // POLYLINE esperando sus VERTEX hasta SEQEND
  let polySection = ''         // sección donde se abrió la POLYLINE (ENTITIES/BLOCKS)

  const newEnt = (type: string): RawEnt => ({ type, layer: '', pairs: [], verts: [], closed: false })

  // vuelca el vértice en curso (entidad VERTEX) dentro de la POLYLINE abierta
  const flushVertex = () => {
    if (cur && cur.type === 'VERTEX' && poly) {
      const x = pairNum(cur, 10), y = pairNum(cur, 20)
      if (Number.isFinite(x) && Number.isFinite(y)) poly.verts.push([x, y])
    }
  }
  // cierra la POLYLINE en curso (al llegar SEQEND u otra entidad); también
  // desactiva cur si apuntaba a la misma POLYLINE para no duplicarla
  const finishPoly = () => {
    if (poly) {
      ;(polySection === 'BLOCKS' ? blocksRaw : ents).push(poly)
      if (cur === poly) cur = null
      poly = null
    }
  }
  // emite la entidad normal en curso (no VERTEX ni POLYLINE)
  const flushEntity = () => {
    if (cur && cur !== poly && cur.type !== 'VERTEX') {
      ;(section === 'BLOCKS' ? blocksRaw : ents).push(cur)
    }
    cur = null
  }

  for (let i = 0; i + 1 < rows.length; i += 2) {
    const codeRow = rows[i].trim()
    if (codeRow === '' || !/^-?\d+$/.test(codeRow)) { i -= 1; continue } // re-sincroniza de a 1 línea
    const code = Number.parseInt(codeRow, 10)
    const value = (rows[i + 1] ?? '').trim()

    if (code === 0) {
      const t = value.toUpperCase()
      flushVertex()
      expectSectionName = false // un nuevo token 0 invalida la espera de nombre
      const isVertex = t === 'VERTEX'
      const isSeqEnd = t === 'SEQEND'
      // POLYLINE abierta que no continúa con VERTEX/SEQEND → se cierra aquí
      // (tolerancia a archivos sin SEQEND)
      if (poly && !isVertex && !isSeqEnd) finishPoly()
      // entidad normal pendiente → emitir antes de empezar la siguiente
      flushEntity()
      if (t === 'SECTION') { expectSectionName = true; continue }
      if (t === 'ENDSEC') { section = ''; continue }
      if (t === 'EOF') break
      if (isVertex) {
        // vértice de la polilínea en curso; sin POLYLINE abierta se ignora (malformado)
        cur = poly ? newEnt('VERTEX') : null
        continue
      }
      if (isSeqEnd) { finishPoly(); continue }
      // dentro de BLOCKS también capturamos entidades (definiciones de bloques)
      cur = (section === 'ENTITIES' || section === 'BLOCKS') ? newEnt(t) : null
      if (cur && t === 'POLYLINE') { poly = cur; polySection = section }
      continue
    }

    if (expectSectionName && code === 2) { section = value.toUpperCase(); expectSectionName = false; continue }
    if (section !== 'ENTITIES' && section !== 'BLOCKS') continue
    if (!cur) continue

    cur.pairs.push([code, value])
    if (code === 8) cur.layer = value
  }
  flushVertex()
  finishPoly()
  flushEntity()

  // ---------- 1b) mapa de definiciones de bloques (BLOCKS) ----------
  // Estructura: (0,BLOCK)(2,nombre)…entidades…(0,ENDBLK). Las entidades
  // intermedias pertenecen al bloque abierto por el último BLOCK.
  const blocksMap = new Map<string, RawEnt[]>()
  {
    let currentBlockName: string | null = null
    for (const be of blocksRaw) {
      if (be.type === 'BLOCK') { currentBlockName = pairStr(be, 2) || null; continue }
      if (be.type === 'ENDBLK') { currentBlockName = null; continue }
      if (!currentBlockName) continue
      if (!blocksMap.has(currentBlockName)) blocksMap.set(currentBlockName, [])
      blocksMap.get(currentBlockName)!.push(be)
    }
    stats.blocks = blocksMap.size
  }

  // ---------- 1c) expansión REAL de INSERT (bloques con transformación) ----------
  // Cada INSERT resuelve la geometría de su bloque con: punto de inserción
  // (10/20), escala X/Y (41/42) y rotación CCW (50). Los bloques anidados se
  // expanden hasta 2 niveles. Los INSERT sin definición caen en el punto.
  const transformPoint = (
    x: number, y: number,
    ix: number, iy: number, sx: number, sy: number, cos: number, sin: number
  ): [number, number] => [
    ix + x * sx * cos - y * sy * sin,
    iy + x * sx * sin + y * sy * cos,
  ]

  const transformSub = (
    sub: RawEnt, layer: string,
    ix: number, iy: number, sx: number, sy: number, rotDeg: number
  ): RawEnt => {
    const RAD = Math.PI / 180
    const cos = Math.cos(rotDeg * RAD), sin = Math.sin(rotDeg * RAD)
    const T = (x: number, y: number) => transformPoint(x, y, ix, iy, sx, sy, cos, sin)
    const rScale = Math.max(Math.abs(sx), Math.abs(sy))
    const out: RawEnt = { type: sub.type, layer: sub.layer || layer, pairs: [], verts: [], closed: sub.closed }
    const setNum = (code: number, v: number) => out.pairs.push([code, String(v)])
    const setStr = (code: number, v: string) => out.pairs.push([code, v])
    switch (sub.type) {
      case 'LINE': {
        const x1 = pairNum(sub, 10), y1 = pairNum(sub, 20), x2 = pairNum(sub, 11), y2 = pairNum(sub, 21)
        const a = T(x1, y1), b = T(x2, y2)
        setNum(10, a[0]); setNum(20, a[1]); setNum(11, b[0]); setNum(21, b[1])
        break
      }
      case 'CIRCLE': case 'ARC': {
        const cx = pairNum(sub, 10), cy = pairNum(sub, 20), r = pairNum(sub, 40)
        const c = T(cx, cy)
        setNum(10, c[0]); setNum(20, c[1]); setNum(40, r * rScale)
        if (sub.type === 'ARC') {
          const a0 = pairNum(sub, 50), a1 = pairNum(sub, 51)
          // espejo si la escala invierte la orientación; si no, solo rotación
          const mirror = (sx * sy) < 0
          const na0 = mirror ? -(a0 + rotDeg) : a0 + rotDeg
          const na1 = mirror ? -(a1 + rotDeg) : a1 + rotDeg
          setNum(50, na0); setNum(51, na1)
        }
        break
      }
      case 'TEXT': case 'MTEXT': {
        const x = pairNum(sub, 10), y = pairNum(sub, 20), h = pairNum(sub, 40)
        const c = T(x, y)
        setNum(10, c[0]); setNum(20, c[1])
        if (Number.isFinite(h) && h > 0) setNum(40, h * Math.abs(sy))
        for (const [code, v] of sub.pairs) if (code === 1 || code === 3) setStr(code, v)
        break
      }
      case 'LWPOLYLINE': {
        let px: number | null = null
        for (const [code, v] of sub.pairs) {
          if (code === 10) px = Number.parseFloat(v)
          else if (code === 20 && px !== null && Number.isFinite(px)) {
            const q = T(px, Number.parseFloat(v))
            setNum(10, q[0]); setNum(20, q[1])
            px = null
          } else if (code === 70) setNum(70, Number.parseFloat(v) || 0)
        }
        break
      }
      case 'POLYLINE': {
        out.verts = sub.verts.map(([x, y]) => T(x, y))
        for (const [code, v] of sub.pairs) if (code === 70) setNum(70, Number.parseFloat(v) || 0)
        break
      }
      case 'POINT': {
        const x = pairNum(sub, 10), y = pairNum(sub, 20)
        const c = T(x, y)
        setNum(10, c[0]); setNum(20, c[1])
        break
      }
      default:
        // otros tipos: copiar tal cual (raro en bloques de dibujo)
        out.pairs = [...sub.pairs]
        break
    }
    return out
  }

  const expandInsert = (e: RawEnt, depth: number): RawEnt[] => {
    if (e.type !== 'INSERT') return [e]
    const block = pairStr(e, 2)
    const ix = pairNum(e, 10), iy = pairNum(e, 20)
    const sxRaw = pairNum(e, 41), syRaw = pairNum(e, 42)
    const rotRaw = pairNum(e, 50)
    if (!block || !blocksMap.has(block) || ![ix, iy].every(Number.isFinite) || depth > 2) return [e]
    const sx = Number.isFinite(sxRaw) && sxRaw !== 0 ? sxRaw : 1
    const sy = Number.isFinite(syRaw) && syRaw !== 0 ? syRaw : 1
    const rot = Number.isFinite(rotRaw) ? rotRaw : 0
    const subs = blocksMap.get(block)!
    const out: RawEnt[] = []
    for (const sub of subs) {
      if (sub.type === 'INSERT') {
        // inserto anidado: transforma su punto/rotación y expande recursivamente
        const RAD = Math.PI / 180
        const cos = Math.cos(rot * RAD), sin = Math.sin(rot * RAD)
        const nx = pairNum(sub, 10), ny = pairNum(sub, 20)
        const t = transformPoint(nx, ny, ix, iy, sx, sy, cos, sin)
        const nested: RawEnt = { type: 'INSERT', layer: sub.layer || e.layer, pairs: [], verts: [], closed: false }
        nested.pairs.push([2, pairStr(sub, 2)])
        nested.pairs.push([10, String(t[0])], [20, String(t[1])])
        const nsx = pairNum(sub, 41), nsy = pairNum(sub, 42), nrot = pairNum(sub, 50)
        if (Number.isFinite(nsx) && nsx !== 0) nested.pairs.push([41, String(nsx * sx)])
        if (Number.isFinite(nsy) && nsy !== 0) nested.pairs.push([42, String(nsy * sy)])
        nested.pairs.push([50, String((Number.isFinite(nrot) ? nrot : 0) + rot)])
        out.push(...expandInsert(nested, depth + 1))
        continue
      }
      if (sub.type === 'BLOCK' || sub.type === 'ENDBLK') continue
      out.push(transformSub(sub, e.layer, ix, iy, sx, sy, rot))
    }
    stats.inserts += out.length
    return out
  }

  const expanded: RawEnt[] = []
  for (const e of ents) expanded.push(...expandInsert(e, 0))

  // ---------- 2) bounds en unidades del archivo (incluye radios de círculos) ----------
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const ext = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  for (const e of expanded) {
    switch (e.type) {
      case 'LINE': ext(pairNum(e, 10), pairNum(e, 20)); ext(pairNum(e, 11), pairNum(e, 21)); break
      case 'CIRCLE': case 'ARC': {
        const cx = pairNum(e, 10), cy = pairNum(e, 20), r = pairNum(e, 40)
        ext(cx - r, cy - r); ext(cx + r, cy + r); break
      }
      case 'TEXT': case 'MTEXT': ext(pairNum(e, 10), pairNum(e, 20)); break
      case 'LWPOLYLINE': {
        let px: number | null = null
        for (const [c, v] of e.pairs) {
          if (c === 10) px = Number.parseFloat(v)
          else if (c === 20 && px !== null) { ext(px, Number.parseFloat(v)); px = null }
        }
        break
      }
      case 'POLYLINE': e.verts.forEach((p) => ext(p[0], p[1])); break
      case 'POINT': case 'INSERT': ext(pairNum(e, 10), pairNum(e, 20)); break
    }
  }
  const hasGeom = Number.isFinite(minX)
  if (!hasGeom) { minX = minY = 0; maxX = maxY = 0 }

  // ---------- 3) detección de unidades ----------
  // Heurística: una vivienda en metros mide ~5-60 unidades; en pulgadas ~200-2400;
  // en milímetros > 3000. Extensión > 1000 → mm; 100..1000 → pulgadas; resto → metros.
  const spanRaw = Math.max(maxX - minX, maxY - minY)
  let unitGuess: 'm' | 'mm' | 'in' = 'm'
  let factor = 1 // factor → metros
  if (spanRaw > 1000) { unitGuess = 'mm'; factor = 0.001 }
  else if (spanRaw >= 100) { unitGuess = 'in'; factor = 0.0254 }

  // ---------- 4) transformación m→px con Y invertida + centrado ----------
  // El exportador escribe metros con Y hacia arriba; la app usa px con Y hacia abajo.
  // Área de dibujo del plano: x 150..1050 · y 100..700 (900×600 px).
  const AREA_X0 = 150, AREA_X1 = 1050, AREA_Y0 = 100, AREA_Y1 = 700
  const bx0 = minX * factor, bx1 = maxX * factor, by0 = minY * factor, by1 = maxY * factor
  const wM = Math.max(bx1 - bx0, 1e-6), hM = Math.max(by1 - by0, 1e-6)
  const cxM = (bx0 + bx1) / 2, cyM = (by0 + by1) / 2
  // escala de ajuste para que quepa en el área de dibujo (nunca agranda más de 1:1)
  const fit = Math.min(1, (AREA_X1 - AREA_X0) / (wM * PX_PER_M), (AREA_Y1 - AREA_Y0) / (hM * PX_PER_M))
  // newX = -oldY·60 + offset  (equivalente: (cyM - y)·60·fit + centroY)
  const P = (x: number, y: number): [number, number] => [
    (AREA_X0 + AREA_X1) / 2 + (x - cxM) * PX_PER_M * fit,
    (AREA_Y0 + AREA_Y1) / 2 + (cyM - y) * PX_PER_M * fit,
  ]
  const toM = (v: number) => v * factor

  // ---------- 5) capas DXF → capa de la app ----------
  const APP_LAYERS = ['muros', 'puertas', 'ventanas', 'espacios', 'mobiliario', 'sanitarios',
    'cotas', 'textos', 'estructura', 'dibujo', 'instalaciones', 'terreno', 'comentarios']
  const mapLayer = (name: string): string => {
    const l = (name || '').toLowerCase()
    if (!l) return 'dibujo'
    // coincidencia exacta con una capa de la app (roundtrip del exportador)
    if (APP_LAYERS.includes(l)) return l
    // si no, la más cercana por palabras clave (incluye prefijos de fase BIM)
    if (l.includes('muro') || l.includes('wall')) return 'muros'
    if (l.includes('cota') || l.includes('dim')) return 'cotas'
    if (l.includes('text') || l.includes('nota') || l.includes('anotac')) return 'textos'
    if (l.includes('puerta') || l.includes('door')) return 'puertas'
    if (l.includes('vent') || l.includes('window')) return 'ventanas'
    if (l.includes('sanit') || l.includes('baño') || l.includes('bano')) return 'sanitarios'
    if (l.includes('mob') || l.includes('furn')) return 'mobiliario'
    if (l.includes('estruc') || l.includes('struct') || l.includes('column')) return 'estructura'
    if (l.includes('espacio') || l.includes('room') || l.includes('space')) return 'espacios'
    if (l.includes('coment') || l.includes('comment')) return 'comentarios'
    if (l.includes('pipe') || l.includes('electr') || l.includes('inst')) return 'instalaciones'
    if (l.includes('terreno') || l.includes('terrain') || l.includes('lote')) return 'terreno'
    return 'dibujo'
  }

  // ---------- 6) conversión a PlanElement ----------
  const elements: PlanElement[] = []
  let n = 0
  const nextId = () => `dxf-${++n}`
  const draw = (layer: string, name: string, geo: DrawGeo): void => {
    elements.push({ id: nextId(), type: 'dibujo', layer: mapLayer(layer), name, geo })
  }

  for (const e of expanded) {
    switch (e.type) {
      case 'LINE': {
        const x1 = pairNum(e, 10), y1 = pairNum(e, 20), x2 = pairNum(e, 11), y2 = pairNum(e, 21)
        if (![x1, y1, x2, y2].every(Number.isFinite)) { stats.others++; break }
        const a = P(toM(x1), toM(y1)), b = P(toM(x2), toM(y2))
        draw(e.layer, 'Línea DXF', { kind: 'linea', pts: [[a[0], a[1]], [b[0], b[1]]] })
        stats.lines++
        break
      }
      case 'CIRCLE': {
        const cx = pairNum(e, 10), cy = pairNum(e, 20), r = pairNum(e, 40)
        if (![cx, cy, r].every(Number.isFinite) || r <= 0) { stats.others++; break }
        const c = P(toM(cx), toM(cy))
        draw(e.layer, 'Círculo DXF', { kind: 'circulo', pts: [[c[0], c[1]]], r: toM(r) * PX_PER_M * fit })
        stats.circles++
        break
      }
      case 'ARC': {
        const cx = pairNum(e, 10), cy = pairNum(e, 20), r = pairNum(e, 40)
        const a0 = pairNum(e, 50)
        let a1 = pairNum(e, 51)
        if (![cx, cy, r, a0, a1].every(Number.isFinite) || r <= 0) { stats.others++; break }
        // DXF mide ángulos antihorario desde +X (Y-arriba); el barrido va de a0 a a1 CCW
        if (a1 < a0) a1 += 360
        const am = (a0 + a1) / 2 // punto medio angular
        const RAD = Math.PI / 180
        const pt = (deg: number): [number, number] =>
          P(toM(cx + r * Math.cos(deg * RAD)), toM(cy + r * Math.sin(deg * RAD)))
        const s = pt(a0), m = pt(am), t = pt(a1)
        draw(e.layer, 'Arco DXF', { kind: 'arco', pts: [[s[0], s[1]], [m[0], m[1]], [t[0], t[1]]] })
        stats.arcs++
        break
      }
      case 'TEXT': case 'MTEXT': {
        const x = pairNum(e, 10), y = pairNum(e, 20)
        const hRaw = pairNum(e, 40)
        const val = e.type === 'MTEXT'
          ? cleanMtext(e.pairs.filter(([c]) => c === 3 || c === 1).map(([, v]) => v).join(''))
          : pairStr(e, 1)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !val) { stats.others++; break }
        const c = P(toM(x), toM(y))
        // altura de texto: unidades DXF → m → px, acotada a 9..22 px legibles
        const hPx = Number.isFinite(hRaw) && hRaw > 0 ? toM(hRaw) * PX_PER_M * fit : 12
        const size = Math.max(9, Math.min(22, hPx))
        elements.push({
          id: nextId(), type: 'texto', layer: mapLayer(e.layer), name: 'Texto DXF',
          geo: { x: c[0], y: c[1], text: val.replace(/[\r\n]+/g, ' '), size, anchor: 'middle' } as TextGeo,
        })
        stats.texts++
        break
      }
      case 'LWPOLYLINE': {
        const pts: number[][] = []
        let px: number | null = null
        let flag = 0
        for (const [c, v] of e.pairs) {
          if (c === 10) px = Number.parseFloat(v)
          else if (c === 20 && px !== null && Number.isFinite(px)) {
            const py = Number.parseFloat(v)
            if (Number.isFinite(py)) pts.push([px, py])
            px = null
          } else if (c === 70) flag = Number.parseInt(v, 10) || 0
        }
        if (pts.length < 2) { stats.others++; break }
        if (flag & 1) pts.push(pts[0]) // cerrada: repetir el primer punto al final
        draw(e.layer, 'Polilínea DXF', { kind: 'polilinea', pts: pts.map((p) => { const q = P(toM(p[0]), toM(p[1])); return [q[0], q[1]] }) })
        stats.polylines++
        break
      }
      case 'POLYLINE': {
        const pts = e.verts
        if (pts.length < 2) { stats.others++; break }
        const flag = pairNum(e, 70)
        const closed = (Number.isFinite(flag) ? flag : 0) & 1 ? true : false
        const px2 = pts.map((p) => { const q = P(toM(p[0]), toM(p[1])); return [q[0], q[1]] })
        if (closed) px2.push(px2[0])
        draw(e.layer, 'Polilínea DXF', { kind: 'polilinea', pts: px2 })
        stats.polylines++
        break
      }
      case 'POINT': {
        const x = pairNum(e, 10), y = pairNum(e, 20)
        if (![x, y].every(Number.isFinite)) { stats.others++; break }
        const c = P(toM(x), toM(y))
        draw(e.layer, 'Punto DXF', { kind: 'punto', pts: [[c[0], c[1]]] })
        stats.others++ // puntos e insertos cuentan como "otros" en las estadísticas
        break
      }
      case 'INSERT': {
        const x = pairNum(e, 10), y = pairNum(e, 20)
        const block = pairStr(e, 2)
        if (![x, y].every(Number.isFinite)) { stats.others++; break }
        const c = P(toM(x), toM(y))
        draw(e.layer, block ? `Bloque ${block}` : 'Inserto DXF', { kind: 'punto', pts: [[c[0], c[1]]] })
        stats.others++
        break
      }
      default:
        stats.others++ // entidad desconocida: solo se cuenta
        break
    }
  }

  return {
    elements,
    stats,
    bounds: hasGeom ? { minX, minY, maxX, maxY } : null,
    unitGuess,
  }
}

/**
 * DXF → PlanElement[]: parsea, corrige unidades, invierte Y, centra en el
 * área de dibujo y asigna id (`dxf-n`), capa y nombre en español.
 */
export function dxfToPlanElements(text: string): PlanElement[] {
  return parseDxf(text).elements
}

/** Lee un File (input/drop) como texto y devuelve los elementos del plano. */
export function readDxfFile(file: File): Promise<PlanElement[]> {
  return new Promise<PlanElement[]>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      try {
        resolve(dxfToPlanElements(String(fr.result ?? '')))
      } catch (err) {
        reject(err instanceof Error ? err : new Error('DXF malformado'))
      }
    }
    fr.onerror = () => reject(fr.error ?? new Error(`No se pudo leer el archivo: ${file.name}`))
    fr.readAsText(file)
  })
}
