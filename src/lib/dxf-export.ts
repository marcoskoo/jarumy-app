// ============================================================
// JARUMY APP — Exportación DXF R12 (ASCII) interoperable con
// AutoCAD / BricsCAD / ZWCAD / LibreCAD / QGIS.
// Unidades en METROS, Y invertida (DXF crece hacia arriba).
// Cada capa del plano se mapea a una capa DXF con color ACI.
// ============================================================

import type { PlanElement, LayerDef } from './plan-data'
import type {
  WallGeo, DoorGeo, WindowGeo, RoomGeo, FurnGeo, DimGeo, ColGeo, OpenGeo, DrawGeo,
  StairGeo, RoofGeo, InstGeo, SymGeo, TerrainGeo, PinGeo,
} from './plan-data'
import { PX_PER_M, roomAreaM2, polygonAreaM2 } from './plan-data'
import type { Mod } from './store'

export interface DxfResult {
  filename: string
  bytes: number
  /** contenido completo (útil para pruebas y depuración) */
  content: string
}

// colores ACI por capa (índice clásico de AutoCAD)
const ACI = [7, 2, 4, 8, 30, 3, 1, 5, 6, 9, 5, 3, 1]

interface Entity {
  type: 'LINE' | 'CIRCLE' | 'ARC' | 'TEXT'
  layer: string
  // LINE
  x1?: number; y1?: number; x2?: number; y2?: number
  // CIRCLE / ARC
  cx?: number; cy?: number; r?: number; a0?: number; a1?: number
  // TEXT
  tx?: number; ty?: number; th?: number; val?: string
}

export function exportPlanDxf(
  elements: PlanElement[],
  mods: Record<string, Mod>,
  layers: LayerDef[],
): DxfResult {
  const visible = new Set(layers.filter((l) => l.visible).map((l) => l.id))
  const drawable = elements.filter((el) => visible.has(el.layer) && !mods[el.id]?.deleted)

  // --- bbox del contenido para trasladar/invertir Y (todo positivo) ---
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  for (const el of drawable) {
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    switch (el.type) {
      case 'muro': {
        const g = el.geo as WallGeo
        const t = m?.thickness ?? g.t
        if (g.x1 === g.x2) { extend(g.x1 - t / 2 + tx, Math.min(g.y1, g.y2) + ty); extend(g.x1 + t / 2 + tx, Math.max(g.y1, g.y2) + ty) }
        else { extend(Math.min(g.x1, g.x2) + tx, g.y1 - t / 2 + ty); extend(Math.max(g.x1, g.x2) + tx, g.y1 + t / 2 + ty) }
        break
      }
      case 'espacio': { const g = el.geo as RoomGeo; extend(g.x + tx, g.y + ty); extend(g.x + g.w + tx, g.y + g.h + ty); break }
      case 'columna': { const g = el.geo as ColGeo; const s = m?.size ?? g.size; extend(g.x - s / 2, g.y - s / 2); extend(g.x + s / 2, g.y + s / 2); break }
      case 'puerta': { const g = el.geo as DoorGeo; extend(g.cx - g.r, g.cy - g.r); extend(g.cx + g.r, g.cy + g.r); break }
      case 'ventana': { const g = el.geo as WindowGeo; if (g.orient === 'h') { extend(g.x, g.y); extend(g.x + g.len, g.y) } else { extend(g.x, g.y); extend(g.x, g.y + g.len) } break }
      case 'apertura': { const g = el.geo as OpenGeo; if (g.orient === 'h') { extend(g.x, g.y); extend(g.x + g.len, g.y) } else { extend(g.x, g.y); extend(g.x, g.y + g.len) } break }
      case 'mobiliario': case 'sanitario': { const g = el.geo as FurnGeo; extend(g.x + tx, g.y + ty); extend(g.x + g.w + tx, g.y + g.h + ty); break }
      case 'cota': { const g = el.geo as DimGeo; extend(g.x1, g.y1 + g.offset); extend(g.x2, g.y2 + g.offset); break }
      case 'dibujo': { const g = el.geo as DrawGeo; (g.pts || []).forEach((p) => extend(p[0], p[1])); break }
      case 'escalera': { const g = el.geo as StairGeo; extend(g.x, g.y); extend(g.x + g.w, g.y + g.h); break }
      case 'techo': { const g = el.geo as RoofGeo; extend(g.x, g.y); extend(g.x + g.w, g.y + g.h); break }
      case 'instalacion': { const g = el.geo as InstGeo; g.pts.forEach((p) => extend(p[0], p[1])); break }
      case 'simbolo': { const g = el.geo as SymGeo; extend(g.x - 8, g.y - 8); extend(g.x + 8, g.y + 8); break }
      case 'terreno': { const g = el.geo as TerrainGeo; g.pts.forEach((p) => extend(p[0], p[1])); break }
      case 'pin': { const g = el.geo as PinGeo; extend(g.x - 8, g.y - 8); extend(g.x + 8, g.y + 8); break }
    }
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 900; maxY = 600 }
  const pad = 1 // 1 m de aire
  minX -= pad * PX_PER_M; minY -= pad * PX_PER_M

  // píxeles → metros con Y invertida y origen en 0,0
  const M = (x: number, y: number): [number, number] => [(x - minX) / PX_PER_M, (maxY - y) / PX_PER_M]

  // nombre de capa DXF (ASCII mayúsculas)
  const layerName = (id: string) => (id.toUpperCase().replace(/[^A-Z0-9_-]/g, '-') || 'CAPA-0')

  const ents: Entity[] = []
  const line = (layer: string, a: number[], b: number[]) => {
    const [x1, y1] = M(a[0], a[1]); const [x2, y2] = M(b[0], b[1])
    ents.push({ type: 'LINE', layer, x1, y1, x2, y2 })
  }
  const rect = (layer: string, x: number, y: number, w: number, h: number) => {
    line(layer, [x, y], [x + w, y])
    line(layer, [x + w, y], [x + w, y + h])
    line(layer, [x + w, y + h], [x, y + h])
    line(layer, [x, y + h], [x, y])
  }
  const text = (layer: string, p: number[], val: string, h = 0.18) => {
    const [x, y] = M(p[0], p[1])
    ents.push({ type: 'TEXT', layer, tx: x, ty: y, th: h, val })
  }

  for (const el of drawable) {
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const rot = m?.rotation ?? 0
    const L = el.layer
    switch (el.type) {
      case 'espacio': {
        const g = el.geo as RoomGeo
        rect(L, g.x + tx, g.y + ty, g.w, g.h)
        text(L, [g.x + g.w / 2 + tx, g.y + g.h / 2 + ty + 12], g.name, 0.22)
        text(L, [g.x + g.w / 2 + tx, g.y + g.h / 2 + ty - 12], `${roomAreaM2(g).toFixed(2)} m2`, 0.16)
        break
      }
      case 'muro': {
        const g = el.geo as WallGeo
        const t = m?.thickness ?? g.t
        if (g.x1 === g.x2) rect(L, g.x1 - t / 2 + tx, Math.min(g.y1, g.y2) + ty, t, Math.abs(g.y2 - g.y1))
        else rect(L, Math.min(g.x1, g.x2) + tx, g.y1 - t / 2 + ty, Math.abs(g.x2 - g.x1), t)
        break
      }
      case 'columna': { const g = el.geo as ColGeo; const s = m?.size ?? g.size; rect(L, g.x - s / 2, g.y - s / 2, s, s); break }
      case 'puerta': {
        const g = el.geo as DoorGeo
        // hoja + arco (radianes)
        const a0 = (g.a0 * Math.PI) / 180, a1 = (g.a1 * Math.PI) / 180
        const hoja = m?.swingFlip ? a0 : a1
        const [cx, cy] = M(g.cx, g.cy)
        const [lx, ly] = M(g.cx + g.r * Math.cos(hoja), g.cy + g.r * Math.sin(hoja))
        ents.push({ type: 'LINE', layer: L, x1: cx, y1: cy, x2: lx, y2: ly })
        const [c2x, c2y] = M(g.cx + g.r / 2, g.cy + g.r / 2)
        const rM = Math.hypot(c2x - cx, c2y - cy)
        ents.push({ type: 'ARC', layer: L, cx, cy, r: rM, a0: Math.min(a0, a1) * 180 / Math.PI, a1: Math.max(a0, a1) * 180 / Math.PI })
        break
      }
      case 'ventana': {
        const g = el.geo as WindowGeo
        if (g.orient === 'h') {
          rect(L, g.x, g.y - 6, g.len, 12)
          line(L, [g.x, g.y], [g.x + g.len, g.y])
        } else {
          rect(L, g.x - 6, g.y, 12, g.len)
          line(L, [g.x, g.y], [g.x, g.y + g.len])
        }
        break
      }
      case 'apertura': {
        const g = el.geo as OpenGeo
        if (g.orient === 'h') { line(L, [g.x, g.y - 6], [g.x + g.len, g.y - 6]); line(L, [g.x, g.y + 6], [g.x + g.len, g.y + 6]) }
        else { line(L, [g.x - 6, g.y], [g.x - 6, g.y + g.len]); line(L, [g.x + 6, g.y], [g.x + 6, g.y + g.len]) }
        break
      }
      case 'mobiliario':
      case 'sanitario': {
        const g = el.geo as FurnGeo
        // rotación aproximada a 0/90 (los rectángulos se dibujan derecho)
        if (rot % 180 === 90) rect(L, g.x + tx, g.y + ty, g.h, g.w)
        else rect(L, g.x + tx, g.y + ty, g.w, g.h)
        break
      }
      case 'cota': {
        const g = el.geo as DimGeo
        const horizontal = Math.abs(g.x2 - g.x1) >= Math.abs(g.y2 - g.y1)
        const val = m?.dimOverride && m.dimOverride !== '' ? m.dimOverride
          : `${(Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / PX_PER_M).toFixed(2)}`
        if (horizontal) {
          const dy = g.y1 + g.offset
          line(L, [g.x1, dy], [g.x2, dy])
          line(L, [g.x1, g.y1 + Math.sign(g.offset) * 3], [g.x1, dy])
          line(L, [g.x2, g.y2 + Math.sign(g.offset) * 3], [g.x2, dy])
          text(L, [(g.x1 + g.x2) / 2, dy - 6], `${val} m`, 0.16)
        } else {
          const dx = g.x1 + g.offset
          line(L, [dx, g.y1], [dx, g.y2])
          line(L, [g.x1 + Math.sign(g.offset) * 3, g.y1], [dx, g.y1])
          line(L, [g.x2 + Math.sign(g.offset) * 3, g.y2], [dx, g.y2])
          text(L, [dx - 6, (g.y1 + g.y2) / 2], `${val} m`, 0.16)
        }
        break
      }
      case 'escalera': {
        const g = el.geo as StairGeo
        rect(L, g.x, g.y, g.w, g.h)
        for (let i = 1; i <= g.steps; i++) {
          const y = g.y + (g.h / g.steps) * i
          line(L, [g.x, y], [g.x + g.w, y])
        }
        text(L, [g.x + g.w / 2, g.y + g.h / 2], `SUBE ${g.steps} P`, 0.16)
        break
      }
      case 'techo': {
        const g = el.geo as RoofGeo
        rect(L, g.x, g.y, g.w, g.h)
        if (g.kind === 'dos-aguas') {
          if (g.ridge === 'h') line(L, [g.x, g.y + g.h / 2], [g.x + g.w, g.y + g.h / 2])
          else line(L, [g.x + g.w / 2, g.y], [g.x + g.w / 2, g.y + g.h])
        } else if (g.kind === 'cuatro-aguas') {
          line(L, [g.x, g.y], [g.x + g.w / 2, g.y + g.h / 2])
          line(L, [g.x + g.w, g.y], [g.x + g.w / 2, g.y + g.h / 2])
          line(L, [g.x, g.y + g.h], [g.x + g.w / 2, g.y + g.h / 2])
          line(L, [g.x + g.w, g.y + g.h], [g.x + g.w / 2, g.y + g.h / 2])
        }
        text(L, [g.x + g.w / 2, g.y + g.h / 2], `PEND. ${g.slope}%`, 0.16)
        break
      }
      case 'instalacion': {
        const g = el.geo as InstGeo
        for (let i = 1; i < g.pts.length; i++) line(L, g.pts[i - 1], g.pts[i])
        const dmm = Math.round(g.diameter / PX_PER_M * 1000)
        text(L, [g.pts[0][0], g.pts[0][1] - 8], `${g.kind === 'agua' ? 'AGUA' : g.kind === 'desague' ? 'DESAGUE' : 'ELECT.'} D${dmm}`, 0.14)
        break
      }
      case 'simbolo': {
        const g = el.geo as SymGeo
        const [cx, cy] = M(g.x, g.y)
        ents.push({ type: 'CIRCLE', layer: L, cx, cy, r: 0.12 })
        break
      }
      case 'terreno': {
        const g = el.geo as TerrainGeo
        if (g.kind === 'lote') {
          for (let i = 0; i < g.pts.length; i++) {
            const a = g.pts[i], b = g.pts[(i + 1) % g.pts.length]
            line(L, a, b)
            // etiqueta de longitud de lado
            const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
            text(L, [mx, my - 6], `${(Math.hypot(b[0] - a[0], b[1] - a[1]) / PX_PER_M).toFixed(2)} m`, 0.16)
          }
          // centroide aproximado para el área
          let sx = 0, sy = 0
          g.pts.forEach((p) => { sx += p[0]; sy += p[1] })
          text(L, [sx / g.pts.length, sy / g.pts.length], `LOTE ${polygonAreaM2(g.pts).toFixed(2)} m2`, 0.2)
        } else {
          for (let i = 1; i < g.pts.length; i++) line(L, g.pts[i - 1], g.pts[i])
          text(L, [g.pts[0][0], g.pts[0][1] - 6], `COTA ${(g.elev ?? 0).toFixed(2)}`, 0.14)
        }
        break
      }
      case 'pin': {
        const g = el.geo as PinGeo
        const [cx, cy] = M(g.x, g.y)
        ents.push({ type: 'CIRCLE', layer: L, cx, cy, r: 0.15 })
        text(L, [g.x + 10, g.y], `${g.resolved ? '[OK]' : ''} ${g.text} (${g.author})`, 0.14)
        break
      }
      case 'dibujo': {
        const g = el.geo as DrawGeo
        const col = el.layer
        switch (g.kind) {
          case 'linea': line(col, g.pts[0], g.pts[1]); break
          case 'polilinea': for (let i = 1; i < g.pts.length; i++) line(col, g.pts[i - 1], g.pts[i]); break
          case 'rectangulo': {
            const [xa, ya] = g.pts[0], [xb, yb] = g.pts[1]
            rect(col, Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya)); break
          }
          case 'circulo': {
            const [cx, cy] = M(g.pts[0][0], g.pts[0][1])
            ents.push({ type: 'CIRCLE', layer: col, cx, cy, r: (g.r || 40) / PX_PER_M }); break
          }
          case 'texto': text(col, g.pts[0], g.text || '', 0.2); break
          case 'cota': {
            const [xa, ya] = g.pts[0], [xb, yb] = g.pts[1]
            line(col, [xa, ya], [xb, yb])
            const val = m?.dimOverride && m.dimOverride !== '' ? m.dimOverride
              : `${(Math.hypot(xb - xa, yb - ya) / PX_PER_M).toFixed(2)}`
            text(col, [(xa + xb) / 2, Math.min(ya, yb) - 6], `${val} m`, 0.16)
            break
          }
        }
        break
      }
    }
  }

  // --- ensamblado del DXF R12 ---
  const out: string[] = []
  const p = (v: string | number) => { out.push(String(v)) }
  const pair = (code: number, v: string | number) => { p(code); p(v) }

  // HEADER mínimo
  pair(0, 'SECTION'); pair(2, 'HEADER')
  pair(9, '$ACADVER'); pair(1, 'AC1009')
  pair(9, '$INSUNITS'); pair(70, 6) // metros
  pair(9, '$EXTMIN'); pair(10, 0); pair(20, 0)
  pair(9, '$EXTMAX'); pair(10, ((maxX + pad * PX_PER_M) - minX) / PX_PER_M); pair(20, (maxY - (minY - pad * PX_PER_M)) / PX_PER_M)
  pair(0, 'ENDSEC')

  // TABLES: capas
  pair(0, 'SECTION'); pair(2, 'TABLES')
  pair(0, 'TABLE'); pair(2, 'LTYPE'); pair(70, 1)
  pair(0, 'LTYPE'); pair(2, 'CONTINUOUS'); pair(70, 0); pair(3, 'Solid line'); pair(72, 65); pair(73, 0); pair(40, 0.0)
  pair(0, 'ENDTAB')
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, layers.length)
  layers.forEach((l, i) => {
    pair(0, 'LAYER'); pair(2, layerName(l.id)); pair(70, 0); pair(62, ACI[i % ACI.length]); pair(6, 'CONTINUOUS')
  })
  pair(0, 'ENDTAB')
  pair(0, 'ENDSEC')

  // ENTITIES
  pair(0, 'SECTION'); pair(2, 'ENTITIES')
  for (const e of ents) {
    switch (e.type) {
      case 'LINE':
        pair(0, 'LINE'); pair(8, layerName(e.layer))
        pair(10, f(e.x1!)); pair(20, f(e.y1!)); pair(30, 0)
        pair(11, f(e.x2!)); pair(21, f(e.y2!)); pair(31, 0)
        break
      case 'CIRCLE':
        pair(0, 'CIRCLE'); pair(8, layerName(e.layer))
        pair(10, f(e.cx!)); pair(20, f(e.cy!)); pair(30, 0); pair(40, f(e.r!))
        break
      case 'ARC':
        pair(0, 'ARC'); pair(8, layerName(e.layer))
        pair(10, f(e.cx!)); pair(20, f(e.cy!)); pair(30, 0); pair(40, f(e.r!))
        pair(50, f(e.a0!)); pair(51, f(e.a1!))
        break
      case 'TEXT':
        pair(0, 'TEXT'); pair(8, layerName(e.layer))
        pair(10, f(e.tx!)); pair(20, f(e.ty!)); pair(30, 0)
        pair(40, f(e.th!)); pair(1, (e.val || '').replace(/[\r\n]/g, ' '))
        break
    }
  }
  pair(0, 'ENDSEC')
  pair(0, 'EOF')

  const content = out.join('\r\n') + '\r\n'
  const filename = `jarumy-plano-${new Date().toISOString().slice(0, 10)}.dxf`

  if (typeof document !== 'undefined') {
    const blob = new Blob([content], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  return { filename, bytes: content.length, content }
}

const f = (n: number) => (Math.round(n * 1e6) / 1e6).toString()
