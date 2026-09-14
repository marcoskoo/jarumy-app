'use client'

import React from 'react'
import type { PlanElement } from '@/lib/plan-data'
import type {
  WallGeo, DoorGeo, WindowGeo, RoomGeo, FurnGeo, DimGeo, TextGeo, ColGeo, OpenGeo, DrawGeo,
  StairGeo, RoofGeo, InstGeo, SymGeo, TerrainGeo, PinGeo, ImageGeo,
} from '@/lib/plan-data'
import { roomAreaM2, polygonAreaM2, polygonPerimeterM, WALL_TYPES, sampleArc3, sampleCatmullRom, scallopPts, pathFromPts } from '@/lib/plan-data'
import type { Phase } from '@/lib/plan-data'
import type { Mod } from '@/lib/store'
import { useJarumy } from '@/lib/store'

export interface ElHandlers {
  onClickEl: (el: PlanElement) => void
  onDownEl: (e: React.MouseEvent, el: PlanElement) => void
}

const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

const norm = (d: number) => {
  let x = ((d % 360) + 360) % 360
  if (x > 180) x -= 360
  return x
}

function elementCenter(el: PlanElement): [number, number] {
  const [x, y] = elementBBox(el)
  return [x[0] + (x[1] - x[0]) / 2, y[0] + (y[1] - y[0]) / 2]
}

function elementBBoxLocal(el: PlanElement): [[number, number], [number, number]] {
  const inf = 1e9
  let x0 = inf, y0 = inf, x1 = -inf, y1 = -inf
  const acc = (px: number, py: number) => { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py) }
  const g = el.geo as unknown as Record<string, unknown>
  if (Array.isArray(g.pts)) {
    const pts = g.pts as number[][]
    pts.forEach((p) => acc(p[0], p[1]))
    if (g.kind === 'circulo' || g.kind === 'elipse') {
      const [cx, cy] = pts[0]
      const r = (g.r as number) || Math.max(g.rx as number || 40, g.ry as number || 40)
      acc(cx - r, cy - r); acc(cx + r, cy + r)
    }
    if (g.kind === 'cota-rad' && g.r) { const [cx, cy] = pts[0]; const rr = g.r as number; acc(cx - rr, cy - rr); acc(cx + rr, cy + rr) }
  } else {
    if (g.x1 !== undefined) { acc(g.x1 as number, g.y1 as number); acc(g.x2 as number, g.y2 as number) }
    else if (g.cx !== undefined) {
      const r = (g.r as number) || 40
      acc((g.cx as number) - r, (g.cy as number) - r); acc((g.cx as number) + r, (g.cy as number) + r)
    } else if (g.x !== undefined) {
      const x = g.x as number, y = g.y as number
      const w = (g.w as number) || (g.len as number) || 20
      const h = (g.h as number) || (g.len as number) || 20
      acc(x, y); acc(x + w, y + h)
    }
  }
  if (x0 === inf) { x0 = 0; y0 = 0; x1 = 60; y1 = 60 }
  return [[x0, y0], [x1, y1]]
}

export function elementBBox(el: PlanElement): [[number, number], [number, number]] {
  return elementBBoxLocal(el)
}

function buildTransform(el: PlanElement, m?: Mod): string | undefined {
  if (!m) return undefined
  const [cx, cy] = elementCenter(el)
  const parts: string[] = []
  if (m.translate) parts.push(`translate(${m.translate[0]} ${m.translate[1]})`)
  if (m.rotation) parts.push(`rotate(${m.rotation} ${cx} ${cy})`)
  if (m.flipX) parts.push(`translate(${2 * cx} 0) scale(-1 1)`)
  if (m.flipY) parts.push(`translate(0 ${2 * cy}) scale(1 -1)`)
  if (m.scale && m.scale !== 1) parts.push(`translate(${cx} ${cy}) scale(${m.scale}) translate(${-cx} ${-cy})`)
  return parts.length ? parts.join(' ') : undefined
}

export function PlanElementNode({ el, mod, handlers, showArea }: { el: PlanElement; mod?: Mod; handlers: ElHandlers; showArea?: boolean }) {
  if (mod?.deleted) return null
  const transform = buildTransform(el, mod)
  const gProps = {
    className: 'jy-el',
    onMouseDown: (e: React.MouseEvent) => { e.stopPropagation(); handlers.onDownEl(e, el) },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); handlers.onClickEl(el) },
  }

  let content: React.ReactNode = null
  switch (el.type) {
    case 'espacio': content = <Room el={el} mod={mod} showArea={showArea} />; break
    case 'muro': content = <Wall el={el} mod={mod} />; break
    case 'puerta': content = <Door el={el} mod={mod} />; break
    case 'ventana': content = <WindowNode el={el} mod={mod} />; break
    case 'apertura': content = <Opening el={el} />; break
    case 'columna': content = <ColumnNode el={el} mod={mod} />; break
    case 'cota': content = <DimNode el={el} mod={mod} />; break
    case 'texto': content = <TextNode el={el} mod={mod} />; break
    case 'mobiliario': content = <FurnNode el={el} mod={mod} />; break
    case 'sanitario': content = <FurnNode el={el} mod={mod} />; break
    case 'escalera': content = <StairNode el={el} />; break
    case 'techo': content = <RoofNode el={el} />; break
    case 'instalacion': content = <InstNode el={el} mod={mod} />; break
    case 'simbolo': content = <SymNode el={el} />; break
    case 'terreno': content = <TerrainNode el={el} />; break
    case 'pin': content = <PinNode el={el} />; break
    case 'imagen': content = <ImageNode el={el} mod={mod} />; break
    default: content = <DibujoNode el={el} mod={mod} />; break
  }

  // superposición de fase BIM: existente (gris tenue) · demolición (rojo punteado + aspas)
  const phase: Phase | undefined = mod?.phase || (el.geo as DrawGeo).phase
  if (phase && phase !== 'nueva') {
    const [[bx, by], [bx1, by1]] = elementBBox(el)
    if (phase === 'existente') {
      return <g {...gProps} transform={transform} opacity="0.45" style={{ filter: 'grayscale(0.9)' }}>{content}</g>
    }
    const bw = bx1 - bx, bh = by1 - by
    return (
      <g {...gProps} transform={transform}>
        {content}
        <rect x={bx} y={by} width={bw} height={bh} fill="none" stroke="#ef4444" strokeWidth="1.1" strokeDasharray="7 4" />
        <line x1={bx} y1={by} x2={bx1} y2={by1} stroke="#ef4444" strokeWidth="0.9" strokeDasharray="4 3" />
        <line x1={bx1} y1={by} x2={bx} y2={by1} stroke="#ef4444" strokeWidth="0.9" strokeDasharray="4 3" />
      </g>
    )
  }

  return <g {...gProps} transform={transform}>{content}</g>
}

// ---------------- ESPACIO / HABITACIÓN ----------------

function Room({ el, mod, showArea = true }: { el: PlanElement; mod?: Mod; showArea?: boolean }) {
  const g = el.geo as RoomGeo
  const area = roomAreaM2(g)
  // tamaños adaptativos según el tamaño del ambiente (rotulado automático)
  const minSide = Math.min(g.w, g.h)
  const nameSize = minSide < 120 ? 11 : minSide < 170 ? 12.5 : 15
  const subSize = minSide < 120 ? 9 : minSide < 170 ? 10 : 11.5
  const cy = g.y + g.h / 2
  return (
    <g className="jy-room">
      <rect
        x={g.x} y={g.y} width={g.w} height={g.h}
        fill={mod?.fill || 'rgba(245,158,11,0.035)'}
        stroke="rgba(140,140,150,0.12)" strokeWidth="1"
      />
      <rect className="jy-hover-ring" x={g.x + 4} y={g.y + 4} width={g.w - 8} height={g.h - 8}
        fill="none" stroke="var(--jy-primary)" strokeWidth="2" strokeDasharray="7 5" rx="3" />
      <text
        x={g.x + g.w / 2} y={showArea ? cy - 6 : cy + nameSize * 0.36}
        textAnchor="middle" fontSize={nameSize} fontWeight="800"
        style={{ fill: 'var(--jy-muted)', letterSpacing: '1.5px' }}
      >
        {g.name}
      </text>
      {showArea && (
        <text
          x={g.x + g.w / 2} y={cy + 13}
          textAnchor="middle" fontSize={subSize} fontWeight="500"
          style={{ fill: 'var(--jy-muted)', opacity: 0.72 }}
        >
          {area.toFixed(2)} m² · {g.num}
        </text>
      )}
    </g>
  )
}

// ---------------- MURO (soporta multicapa con patrón de material) ----------------

function Wall({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as WallGeo
  const t = mod?.thickness ?? g.t
  const wdef = mod?.wallType ? WALL_TYPES[mod.wallType] : undefined
  const fill = wdef ? wdef.color : (mod?.material || '#3f3f46')
  const w = g.x1 === g.x2 ? t : Math.abs(g.x2 - g.x1)
  const h = g.y1 === g.y2 ? t : Math.abs(g.y2 - g.y1)
  const vertical = g.x1 === g.x2
  const rx = Math.min(g.x1, g.x2) - (vertical ? t / 2 : 0)
  const ry = Math.min(g.y1, g.y2) - (vertical ? 0 : t / 2)

  // muro multicapa: caras + hatch según material (ladrillo/concreto/drywall/sillería)
  let hatch: React.ReactNode = null
  if (wdef) {
    const lines: React.ReactNode[] = []
    if (wdef.hatch === 'ladrillo' || wdef.hatch === 'silleria') {
      // diagonales a 45° cada 6 px dentro del rectángulo
      const step = wdef.hatch === 'ladrillo' ? 6 : 9
      const len = Math.max(w, h)
      for (let d = -len; d < w + h; d += step) {
        if (vertical) {
          const y0 = Math.max(0, d), y1 = Math.min(h, d + t)
          if (y1 > y0) lines.push(<line key={d} x1={rx} y1={ry + y0} x2={rx + t} y2={ry + y1}
            stroke="rgba(228,228,231,0.35)" strokeWidth="0.5" />)
        } else {
          const x0 = Math.max(0, d), x1 = Math.min(w, d + t)
          if (x1 > x0) lines.push(<line key={d} x1={rx + x0} y1={ry} x2={rx + x1} y2={ry + t}
            stroke="rgba(228,228,231,0.35)" strokeWidth="0.5" />)
        }
      }
    } else if (wdef.hatch === 'concreto') {
      // retícula punteada (hormigón)
      for (let ix = 2; ix < w; ix += 5) for (let iy = 2; iy < h; iy += 5) {
        lines.push(<circle key={`${ix}-${iy}`} cx={rx + ix} cy={ry + iy} r="0.55" fill="rgba(228,228,231,0.45)" />)
      }
    } else if (wdef.hatch === 'drywall') {
      // dos caras con alma vacía: solo líneas de caras (el fill es claro)
      lines.push(<line key="f1" x1={rx + 1.2} y1={ry} x2={rx + 1.2} y2={ry + h} stroke="rgba(24,24,27,0.5)" strokeWidth="0.5" />)
      lines.push(<line key="f2" x1={rx + t - 1.2} y1={ry} x2={rx + t - 1.2} y2={ry + h} stroke="rgba(24,24,27,0.5)" strokeWidth="0.5" />)
    }
    hatch = <g pointerEvents="none">{lines}</g>
  }

  return (
    <g className="jy-wall-face">
      <rect x={rx} y={ry} width={w} height={h} fill={fill} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
      {hatch}
      <rect className="jy-hover-ring" x={rx - 2} y={ry - 2} width={w + 4} height={h + 4}
        fill="none" stroke="var(--jy-primary)" strokeWidth="2.5" />
    </g>
  )
}

// ---------------- PUERTA ----------------

function Door({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as DoorGeo
  const P0 = polar(g.cx, g.cy, g.r, g.a0)
  const P1 = polar(g.cx, g.cy, g.r, g.a1)
  const mid: [number, number] = [(g.cx + P0[0]) / 2, (g.cy + P0[1]) / 2]
  const flip = !!mod?.hingeFlip
  const swingFlip = !!mod?.swingFlip

  // CORREDIZA: dos paneles desplazados sobre riel, sin arco de giro
  if (mod?.doorKind === 'corrediza') {
    const h = g.axis === 'h'
    const w = g.r
    const panelW = w / 2
    return (
      <g>
        {h ? (
          <g>
            <rect x={g.cx} y={g.cy - 7} width={panelW} height={5} fill="#d6d6dc" stroke="var(--jy-muted)" strokeWidth="0.8" />
            <rect x={g.cx + panelW} y={g.cy + 2} width={panelW} height={5} fill="#c8c8cf" stroke="var(--jy-muted)" strokeWidth="0.8" />
            <line x1={g.cx} y1={g.cy - 9} x2={g.cx + w} y2={g.cy - 9} stroke="var(--jy-muted)" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
          </g>
        ) : (
          <g>
            <rect x={g.cx - 7} y={g.cy} width={5} height={panelW} fill="#d6d6dc" stroke="var(--jy-muted)" strokeWidth="0.8" />
            <rect x={g.cx + 2} y={g.cy + panelW} width={5} height={panelW} fill="#c8c8cf" stroke="var(--jy-muted)" strokeWidth="0.8" />
            <line x1={g.cx - 9} y1={g.cy} x2={g.cx - 9} y2={g.cy + w} stroke="var(--jy-muted)" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
          </g>
        )}
        <rect className="jy-hover-ring" x={h ? g.cx - 3 : g.cx - 10} y={h ? g.cy - 10 : g.cy - 3}
          width={h ? w + 6 : 20} height={h ? 20 : w + 6} fill="rgba(245,158,11,0.06)" stroke="transparent" />
      </g>
    )
  }

  const leafEnd = swingFlip ? P0 : P1
  const arcFrom = swingFlip ? P1 : P0
  const arcTo = swingFlip ? P0 : P1
  const rawSweep = norm((arcTo[0] === P0[0] && arcTo[1] === P0[1] ? g.a0 : g.a1) - (arcFrom[0] === P0[0] && arcFrom[1] === P0[1] ? g.a0 : g.a1))
  const sweep = rawSweep > 0 ? 1 : 0

  const hingeT = flip
    ? g.axis === 'v' ? `translate(0 ${2 * mid[1]}) scale(1 -1)` : `translate(${2 * mid[0]} 0) scale(-1 1)`
    : undefined

  return (
    <g transform={hingeT}>
      {/* zona de captura amplia */}
      <path
        d={`M ${g.cx} ${g.cy} L ${leafEnd[0]} ${leafEnd[1]} A ${g.r} ${g.r} 0 0 ${sweep ? 0 : 1} ${arcFrom[0]} ${arcFrom[1]} Z`}
        fill="rgba(245,158,11,0.06)" stroke="none"
      />
      {/* hoja */}
      <line x1={g.cx} y1={g.cy} x2={leafEnd[0]} y2={leafEnd[1]}
        stroke="#d6d6dc" strokeWidth="3" strokeLinecap="round" />
      {/* arco de giro */}
      <path
        d={`M ${arcFrom[0]} ${arcFrom[1]} A ${g.r} ${g.r} 0 0 ${sweep} ${arcTo[0]} ${arcTo[1]}`}
        fill="none" stroke="var(--jy-muted)" strokeWidth="1" strokeDasharray="4 3" opacity="0.85"
      />
      <circle className="jy-hover-ring" cx={g.cx} cy={g.cy} r="6"
        fill="var(--jy-primary)" stroke="none" />
    </g>
  )
}

// ---------------- VENTANA ----------------

function WindowNode({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as WindowGeo
  const t = 14
  const type = mod?.windowType || 0
  const h = g.orient === 'h'
  const len = g.len
  const rx = h ? g.x : g.x - t / 2
  const ry = h ? g.y - t / 2 : g.y
  const w = h ? len : t
  const hh = h ? t : len
  const lines: React.ReactNode[] = []
  if (type === 2) {
    // fija: línea central única
    lines.push(h
      ? <line key="l" x1={g.x} y1={g.y} x2={g.x + len} y2={g.y} stroke="#cfd4dc" strokeWidth="1.6" />
      : <line key="l" x1={g.x} y1={g.y} x2={g.x} y2={g.y + len} stroke="#cfd4dc" strokeWidth="1.6" />)
  } else if (type === 3) {
    // abatible: línea discontinua + doble tick
    lines.push(h
      ? <line key="l" x1={g.x} y1={g.y} x2={g.x + len} y2={g.y} stroke="#cfd4dc" strokeWidth="1.2" strokeDasharray="6 4" />
      : <line key="l" x1={g.x} y1={g.y} x2={g.x} y2={g.y + len} stroke="#cfd4dc" strokeWidth="1.2" strokeDasharray="6 4" />)
  } else {
    // estándar / corrediza: dos líneas de vidrio (+ divisor central en corrediza)
    lines.push(h
      ? <g key="g">
          <line x1={g.x} y1={g.y - 3} x2={g.x + len} y2={g.y - 3} stroke="#cfd4dc" strokeWidth="1.3" />
          <line x1={g.x} y1={g.y + 3} x2={g.x + len} y2={g.y + 3} stroke="#cfd4dc" strokeWidth="1.3" />
        </g>
      : <g key="g">
          <line x1={g.x - 3} y1={g.y} x2={g.x - 3} y2={g.y + len} stroke="#cfd4dc" strokeWidth="1.3" />
          <line x1={g.x + 3} y1={g.y} x2={g.x + 3} y2={g.y + len} stroke="#cfd4dc" strokeWidth="1.3" />
        </g>)
    if (type === 1) {
      lines.push(h
        ? <line key="m" x1={g.x + len / 2} y1={g.y - t / 2} x2={g.x + len / 2} y2={g.y + t / 2} stroke="#cfd4dc" strokeWidth="2.4" />
        : <line key="m" x1={g.x - t / 2} y1={g.y + len / 2} x2={g.x + t / 2} y2={g.y + len / 2} stroke="#cfd4dc" strokeWidth="2.4" />)
    }
  }
  return (
    <g>
      <rect x={rx} y={ry} width={w} height={hh} fill="rgba(207,212,220,0.10)" stroke="#9aa0ab" strokeWidth="1" />
      {lines}
      <rect className="jy-hover-ring" x={rx - 2} y={ry - 2} width={w + 4} height={hh + 4}
        fill="none" stroke="var(--jy-primary)" strokeWidth="2" />
    </g>
  )
}

// ---------------- VANO / APERTURA ----------------

function Opening({ el }: { el: PlanElement }) {
  const g = el.geo as OpenGeo
  const h = g.orient === 'h'
  return (
    <g>
      {h ? (
        <>
          <line x1={g.x} y1={g.y - 6} x2={g.x + g.len} y2={g.y - 6} stroke="var(--jy-muted)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={g.x} y1={g.y + 6} x2={g.x + g.len} y2={g.y + 6} stroke="var(--jy-muted)" strokeWidth="1" strokeDasharray="3 3" />
          <rect x={g.x - 2} y={g.y - 8} width={g.len + 4} height={16} fill="rgba(245,158,11,0.05)" />
        </>
      ) : (
        <>
          <line x1={g.x - 6} y1={g.y} x2={g.x - 6} y2={g.y + g.len} stroke="var(--jy-muted)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={g.x + 6} y1={g.y} x2={g.x + 6} y2={g.y + g.len} stroke="var(--jy-muted)" strokeWidth="1" strokeDasharray="3 3" />
          <rect x={g.x - 8} y={g.y - 2} width={16} height={g.len + 4} fill="rgba(245,158,11,0.05)" />
        </>
      )}
    </g>
  )
}

// ---------------- COLUMNA ----------------

function ColumnNode({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as ColGeo
  const s = mod?.size ?? g.size
  const fill = mod?.material || '#52525b'
  return (
    <g>
      <rect x={g.x - s / 2} y={g.y - s / 2} width={s} height={s} fill={fill} stroke="rgba(0,0,0,0.55)" strokeWidth="0.8" />
      <line x1={g.x - s / 2} y1={g.y - s / 2} x2={g.x + s / 2} y2={g.y + s / 2} stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" />
      <rect className="jy-hover-ring" x={g.x - s / 2 - 5} y={g.y - s / 2 - 5} width={s + 10} height={s + 10}
        fill="none" stroke="var(--jy-primary)" strokeWidth="2" rx="3" />
    </g>
  )
}

// ---------------- COTA ----------------

function DimNode({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const units = useJarumy((st) => st.units)
  const dimStyle = useJarumy((st) => st.dimStyle)
  const planScale = useJarumy((st) => st.planScale)
  const g = el.geo as DimGeo
  const horizontal = Math.abs(g.x2 - g.x1) >= Math.abs(g.y2 - g.y1)
  const prec = mod?.precision ?? 2
  const meters = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / 60
  // unidades del documento: métrico o pies-pulgadas
  const fmtVal = () => {
    if (mod?.dimOverride && mod.dimOverride !== '') return mod.dimOverride
    if (units === 'ft') {
      const totalIn = meters * 39.3701
      const ft = Math.floor(totalIn / 12)
      const inch = Math.round(totalIn - ft * 12)
      return `${ft}'-${inch}"`
    }
    return meters.toFixed(prec)
  }
  const value = fmtVal()
  const unitLabel = (mod?.dimOverride && mod.dimOverride !== '') ? '' : units === 'ft' ? '' : ' m'
  const stroke = 'var(--jy-primary)'
  // estilo ARQ-60: marcas oblicuas a 45° · LINEAL: flechas
  const annot = planScale / 75
  const tick = (x: number, y: number, dx: number, dy: number) => (
    dimStyle === 'arq60'
      ? <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke={stroke} strokeWidth={1.8} />
      : <line x1={x - 4 * dx} y1={y - 4 * dy} x2={x + 4 * dx} y2={y + 4 * dy} stroke={stroke} strokeWidth="1.6" />
  )
  const fontSize = (12 * annot).toFixed(1)

  if (horizontal) {
    const dy = g.y1 + g.offset
    const ext = g.offset < 0 ? -1 : 1
    return (
      <g>
        <line x1={g.x1} y1={g.y1 + ext * 3} x2={g.x1} y2={dy - ext * 3} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
        <line x1={g.x2} y1={g.y2 + ext * 3} x2={g.x2} y2={dy - ext * 3} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
        <line x1={g.x1} y1={dy} x2={g.x2} y2={dy} stroke={stroke} strokeWidth="1.1" />
        {tick(g.x1, dy, 1, 0.55)}{tick(g.x2, dy, 1, 0.55)}
        <text x={(g.x1 + g.x2) / 2} y={dy - 5} textAnchor="middle" fontSize={fontSize} fontWeight="700"
          style={{ fill: stroke }}>
          {value}{unitLabel}
        </text>
        <rect className="jy-hover-ring" x={g.x1} y={Math.min(dy, g.y1) - 14} width={g.x2 - g.x1}
          height={Math.abs(dy - g.y1) + 26} fill="none" stroke="var(--jy-primary)" strokeWidth="1.6" />
      </g>
    )
  }
  const dx = g.x1 + g.offset
  const ext = g.offset < 0 ? -1 : 1
  return (
    <g>
      <line x1={g.x1 + ext * 3} y1={g.y1} x2={dx - ext * 3} y2={g.y1} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
      <line x1={g.x2 + ext * 3} y1={g.y2} x2={dx - ext * 3} y2={g.y2} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
      <line x1={dx} y1={g.y1} x2={dx} y2={g.y2} stroke={stroke} strokeWidth="1.1" />
      {tick(dx, g.y1, 0.55, 1)}{tick(dx, g.y2, 0.55, 1)}
      <text x={dx - 5} y={(g.y1 + g.y2) / 2} textAnchor="middle" fontSize={fontSize} fontWeight="700"
        style={{ fill: stroke }} transform={`rotate(-90 ${dx - 5} ${(g.y1 + g.y2) / 2})`}>
        {value}{unitLabel}
      </text>
      <rect className="jy-hover-ring" x={Math.min(dx, g.x1) - 14} y={g.y1}
        width={Math.abs(dx - g.x1) + 26} height={g.y2 - g.y1} fill="none" stroke="var(--jy-primary)" strokeWidth="1.6" />
    </g>
  )
}

// ---------------- TEXTO ----------------

function TextNode({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const textStyle = useJarumy((st) => st.textStyle)
  const g = el.geo as TextGeo
  const styleProp: React.CSSProperties = {
    fill: 'var(--jy-muted)',
    letterSpacing: textStyle === 'arquitectural' ? '0.3px' : '0.5px',
    fontFamily: textStyle === 'romans'
      ? '"Times New Roman", "Tinos", serif'
      : textStyle === 'arquitectural'
        ? 'Georgia, "Times New Roman", serif'
        : undefined,
    transform: textStyle === 'romans' ? 'skewX(-15)' : undefined,
  }
  return (
    <g>
      <text x={g.x} y={g.y} textAnchor={mod?.justify || g.anchor} fontSize={mod?.textHeight || g.size}
        fontWeight="600" style={styleProp}>
        {g.text}
      </text>
      <rect className="jy-hover-ring" x={g.x - 4} y={g.y - (mod?.textHeight || g.size) - 4}
        width={(mod?.textHeight || g.size) * 0.62 * g.text.length + 8}
        height={(mod?.textHeight || g.size) + 8} fill="none" stroke="var(--jy-primary)" strokeWidth="1.6" rx="3" opacity="0.85" />
    </g>
  )
}

// ---------------- MOBILIARIO / SANITARIOS ----------------

// Forma reutilizable: se usa en el plano Y en la vista previa de la biblioteca de bloques
export function FurnShape({ g, material }: { g: FurnGeo; material?: string }) {
  const fill = material || 'rgba(168,162,158,0.16)'
  const S = { stroke: 'var(--jy-muted)', strokeWidth: 1.4, fill } as const
  const L = { stroke: 'var(--jy-muted)', strokeWidth: 1, fill: 'none' } as const
  return (
    <g className="jy-furn">
      {(() => {
        switch (g.kind) {
          case 'sofa':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="7" {...S} />
                <rect x={g.x} y={g.y} width={g.w} height={13} rx="4" {...S} />
                <rect x={g.x} y={g.y} width={11} height={g.h} rx="4" {...S} />
                <rect x={g.x + g.w - 11} y={g.y} width={11} height={g.h} rx="4" {...S} />
                <line x1={g.x + g.w / 3} y1={g.y + 16} x2={g.x + g.w / 3} y2={g.y + g.h - 3} {...L} />
                <line x1={g.x + (2 * g.w) / 3} y1={g.y + 16} x2={g.x + (2 * g.w) / 3} y2={g.y + g.h - 3} {...L} />
              </g>
            )
          case 'sillon':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="6" {...S} />
                <rect x={g.x} y={g.y} width={g.w} height={10} rx="3" {...S} />
                <rect x={g.x} y={g.y} width={9} height={g.h} rx="3" {...S} />
                <rect x={g.x + g.w - 9} y={g.y} width={9} height={g.h} rx="3" {...S} />
              </g>
            )
          case 'mesacentro':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="4" {...S} />
                <rect x={g.x + 7} y={g.y + 6} width={g.w - 14} height={g.h - 12} rx="3" {...L} />
              </g>
            )
          case 'tv':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2" {...S} />
                <line x1={g.x + g.w * 0.3} y1={g.y + g.h / 2} x2={g.x + g.w * 0.7} y2={g.y + g.h / 2} {...L} />
              </g>
            )
          case 'alfombra':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2" fill="none"
                  stroke="var(--jy-muted)" strokeWidth="1" strokeDasharray="6 4" opacity="0.75" />
                <rect x={g.x + 10} y={g.y + 10} width={g.w - 20} height={g.h - 20} rx="2" fill="none"
                  stroke="var(--jy-muted)" strokeWidth="0.7" strokeDasharray="4 4" opacity="0.45" />
              </g>
            )
          case 'counter':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                <line x1={g.x} y1={g.y + 4} x2={g.x + g.w} y2={g.y + 4} {...L} />
                <line x1={g.x + 4} y1={g.y} x2={g.x + 4} y2={g.y + g.h} {...L} />
              </g>
            )
          case 'stove':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                {[[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]].map(([fx, fy], i) => (
                  <circle key={i} cx={g.x + g.w * fx} cy={g.y + g.h * fy} r={Math.min(g.w, g.h) * 0.16} {...L} />
                ))}
              </g>
            )
          case 'sinkk':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <rect x={g.x + 6} y={g.y + 7} width={g.w - 12} height={g.h - 14} rx="4" {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r="2.4" {...L} />
                <line x1={g.x + g.w / 2} y1={g.y + 2} x2={g.x + g.w / 2} y2={g.y + 8} {...L} />
              </g>
            )
          case 'refri':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="4" {...S} />
                <line x1={g.x} y1={g.y + g.h * 0.38} x2={g.x + g.w} y2={g.y + g.h * 0.38} {...L} />
                <line x1={g.x + g.w * 0.3} y1={g.y + g.h * 0.48} x2={g.x + g.w * 0.7} y2={g.y + g.h * 0.48} {...L} />
                <line x1={g.x + g.w * 0.3} y1={g.y + g.h * 0.82} x2={g.x + g.w * 0.7} y2={g.y + g.h * 0.82} {...L} />
              </g>
            )
          case 'isla':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="5" {...S} />
                <rect x={g.x + 8} y={g.y + 8} width={g.w - 16} height={g.h - 16} rx="4" {...L} />
              </g>
            )
          case 'mesacomedor':
            return (
              <g>
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 2} {...S} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 2 - 7} {...L} />
                {[[0.5, -0.16], [0.5, 1.16], [-0.16, 0.5], [1.16, 0.5]].map(([fx, fy], i) => (
                  <rect key={i} x={g.x + g.w * fx - 9} y={g.y + g.h * fy - 9} width="18" height="18" rx="4" {...L} />
                ))}
              </g>
            )
          case 'cama':
          case 'camaking':
          case 'camaindividual':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <rect x={g.x + 6} y={g.y + 6} width={g.w * 0.36} height={g.h * 0.14} rx="3" {...L} />
                <rect x={g.x + g.w * 0.55} y={g.y + 6} width={g.w * 0.36} height={g.h * 0.14} rx="3" {...L} />
                <line x1={g.x} y1={g.y + g.h * 0.3} x2={g.x + g.w} y2={g.y + g.h * 0.3} {...L} />
                <line x1={g.x} y1={g.y + g.h * 0.72} x2={g.x + g.w} y2={g.y + g.h * 0.72} {...L} />
              </g>
            )
          case 'mesitanoche':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) * 0.24} {...L} />
              </g>
            )
          case 'ropero':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                <line x1={g.x} y1={g.y + g.h * 0.18} x2={g.x + g.w} y2={g.y + g.h * 0.18} {...L} />
                {Array.from({ length: 4 }).map((_, i) => (
                  <line key={i} x1={g.x + (g.w / 4) * (i + 1)} y1={g.y + g.h * 0.18}
                    x2={g.x + (g.w / 4) * (i + 1)} y2={g.y + g.h} {...L} />
                ))}
              </g>
            )
          case 'ducha':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                <line x1={g.x} y1={g.y} x2={g.x + g.w} y2={g.y + g.h} {...L} />
                <line x1={g.x + g.w} y1={g.y} x2={g.x} y2={g.y + g.h} {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r="3" {...L} />
                <line x1={g.x + g.w * 0.2} y1={g.y} x2={g.x + g.w * 0.8} y2={g.y} stroke="var(--jy-muted)"
                  strokeWidth="1" strokeDasharray="4 3" />
              </g>
            )
          case 'inodoro':
            return (
              <g>
                <rect x={g.x + g.w * 0.12} y={g.y} width={g.w * 0.76} height={g.h * 0.3} rx="2" {...S} />
                <ellipse cx={g.x + g.w / 2} cy={g.y + g.h * 0.66} rx={g.w * 0.36} ry={g.h * 0.34} {...S} />
                <ellipse cx={g.x + g.w / 2} cy={g.y + g.h * 0.66} rx={g.w * 0.2} ry={g.h * 0.19} {...L} />
              </g>
            )
          case 'lavatorio':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="4" {...S} />
                <ellipse cx={g.x + g.w / 2} cy={g.y + g.h * 0.55} rx={g.w * 0.34} ry={g.h * 0.3} {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h * 0.28} r="2.2" {...L} />
              </g>
            )
          case 'estante':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                <line x1={g.x} y1={g.y + g.h / 3} x2={g.x + g.w} y2={g.y + g.h / 3} {...L} />
                <line x1={g.x} y1={g.y + (2 * g.h) / 3} x2={g.x + g.w} y2={g.y + (2 * g.h) / 3} {...L} />
              </g>
            )
          case 'islav':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="4" {...S} />
                <line x1={g.x} y1={g.y + g.h / 2} x2={g.x + g.w} y2={g.y + g.h / 2} {...L} />
              </g>
            )
          case 'escritorio':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <rect x={g.x + g.w - 18} y={g.y + 5} width="13" height={g.h - 10} rx="2" {...L} />
                <line x1={g.x + 6} y1={g.y + 5} x2={g.x + g.w - 24} y2={g.y + 5} {...L} />
              </g>
            )
          case 'sillaescritorio':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="6" {...S} />
                <rect x={g.x + 4} y={g.y + 4} width={g.w - 8} height={g.h - 8} rx="4" {...L} />
              </g>
            )
          case 'arbol':
            return (
              <g>
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 2}
                  fill="rgba(16,185,129,0.16)" stroke="rgba(16,185,129,0.75)" strokeWidth="1.4" strokeDasharray="5 3" />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 3.2}
                  fill="none" stroke="rgba(16,185,129,0.5)" strokeWidth="1" />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r="2.6" fill="rgba(16,185,129,0.85)" />
                {[0, 45, 90, 135].map((a) => (
                  <line key={a} x1={g.x + g.w / 2} y1={g.y + g.h / 2}
                    x2={g.x + g.w / 2 + Math.cos((a * Math.PI) / 180) * (Math.min(g.w, g.h) / 2)}
                    y2={g.y + g.h / 2 + Math.sin((a * Math.PI) / 180) * (Math.min(g.w, g.h) / 2)}
                    stroke="rgba(16,185,129,0.35)" strokeWidth="0.8" />
                ))}
              </g>
            )
          case 'arbusto':
            return (
              <g>
                <circle cx={g.x + g.w * 0.32} cy={g.y + g.h * 0.4} r={Math.min(g.w, g.h) * 0.3}
                  fill="rgba(16,185,129,0.22)" stroke="rgba(16,185,129,0.7)" strokeWidth="1.1" />
                <circle cx={g.x + g.w * 0.68} cy={g.y + g.h * 0.45} r={Math.min(g.w, g.h) * 0.33}
                  fill="rgba(16,185,129,0.22)" stroke="rgba(16,185,129,0.7)" strokeWidth="1.1" />
                <circle cx={g.x + g.w * 0.5} cy={g.y + g.h * 0.68} r={Math.min(g.w, g.h) * 0.28}
                  fill="rgba(16,185,129,0.22)" stroke="rgba(16,185,129,0.7)" strokeWidth="1.1" />
              </g>
            )
          case 'auto':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={Math.min(g.w, g.h) * 0.22} {...S} />
                <rect x={g.x + g.w * 0.28} y={g.y + 5} width={g.w * 0.2} height={g.h - 10} rx="6" {...L} />
                <rect x={g.x + g.w * 0.62} y={g.y + 5} width={g.w * 0.18} height={g.h - 10} rx="6" {...L} />
                <line x1={g.x + g.w * 0.5} y1={g.y + 4} x2={g.x + g.w * 0.5} y2={g.y + g.h - 4} {...L} />
                {[0.18, 0.82].map((fx, i) => (
                  <g key={i}>
                    <rect x={g.x + g.w * fx - 12} y={g.y - 2} width="24" height="5" rx="2" fill="#3f3f46" />
                    <rect x={g.x + g.w * fx - 12} y={g.y + g.h - 3} width="24" height="5" rx="2" fill="#3f3f46" />
                  </g>
                ))}
              </g>
            )
          case 'sofados':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="7" {...S} />
                <rect x={g.x} y={g.y} width={g.w} height={12} rx="4" {...S} />
                <rect x={g.x} y={g.y} width={10} height={g.h} rx="4" {...S} />
                <rect x={g.x + g.w - 10} y={g.y} width={10} height={g.h} rx="4" {...S} />
                <line x1={g.x + g.w / 2} y1={g.y + 15} x2={g.x + g.w / 2} y2={g.y + g.h - 3} {...L} />
              </g>
            )
          case 'sofal':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h * 0.42} rx="6" {...S} />
                <rect x={g.x} y={g.y} width={g.w} height={11} rx="4" {...S} />
                <rect x={g.x} y={g.y} width={g.w * 0.36} height={g.h} rx="6" {...S} />
                <rect x={g.x} y={g.y} width={10} height={g.h} rx="4" {...S} />
                <line x1={g.x + g.w * 0.62} y1={g.y + 14} x2={g.x + g.w * 0.62} y2={g.y + g.h * 0.42 - 3} {...L} />
                <line x1={g.x + 13} y1={g.y + g.h * 0.64} x2={g.x + g.w * 0.36 - 3} y2={g.y + g.h * 0.64} {...L} />
              </g>
            )
          case 'puff':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.w * 0.3} {...S} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) * 0.22} {...L} />
              </g>
            )
          case 'silla':
            return (
              <g>
                <rect x={g.x} y={g.y + 4} width={g.w} height={g.h - 4} rx="3" {...S} />
                <rect x={g.x} y={g.y} width={g.w} height={4} rx="2" {...S} />
              </g>
            )
          case 'taburete':
            return (
              <g>
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 2} {...S} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 4} {...L} />
              </g>
            )
          case 'mesacomedor6':
            return (
              <g>
                <rect x={g.x + g.w * 0.14} y={g.y + g.h * 0.1} width={g.w * 0.72} height={g.h * 0.8} rx="3" {...S} />
                {[[0.3, -0.14], [0.7, -0.14], [0.3, 1.14], [0.7, 1.14]].map(([fx, fy], i) => (
                  <rect key={i} x={g.x + g.w * fx - 8} y={g.y + g.h * fy - 6} width="16" height="12" rx="3" {...L} />
                ))}
                {[[-0.16, 0.5], [1.16, 0.5]].map(([fx, fy], i) => (
                  <rect key={`l${i}`} x={g.x + g.w * fx - 6} y={g.y + g.h * fy - 8} width="12" height="16" rx="3" {...L} />
                ))}
              </g>
            )
          case 'muebletv':
            return (
              <g>
                <rect x={g.x} y={g.y + 5} width={g.w} height={g.h - 5} rx="3" {...S} />
                <rect x={g.x + g.w * 0.08} y={g.y} width={g.w * 0.84} height={4} rx="1.5" {...S} />
              </g>
            )
          case 'librero':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                {[1, 2, 3].map((i) => (
                  <line key={i} x1={g.x + (g.w / 4) * i} y1={g.y} x2={g.x + (g.w / 4) * i} y2={g.y + g.h} {...L} />
                ))}
              </g>
            )
          case 'comoda':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2" {...S} />
                <line x1={g.x + g.w / 2} y1={g.y} x2={g.x + g.w / 2} y2={g.y + g.h} {...L} />
                <line x1={g.x} y1={g.y + g.h / 2} x2={g.x + g.w} y2={g.y + g.h / 2} {...L} />
                {[[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([fx, fy], i) => (
                  <circle key={i} cx={g.x + g.w * fx} cy={g.y + g.h * fy} r="1.4" {...L} />
                ))}
              </g>
            )
          case 'cuna':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="4" {...S} />
                <rect x={g.x + 5} y={g.y + g.h * 0.13} width={g.w - 10} height={g.h * 0.28} rx="3" {...L} />
                {Array.from({ length: 3 }).map((_, i) => (
                  <line key={i} x1={g.x + 8 + (i * (g.w - 16)) / 2} y1={g.y + g.h * 0.48}
                    x2={g.x + 8 + (i * (g.w - 16)) / 2} y2={g.y + g.h - 4} {...L} />
                ))}
              </g>
            )
          case 'esquinero':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h * 0.38} {...S} />
                <rect x={g.x} y={g.y} width={g.w * 0.38} height={g.h} {...S} />
                <line x1={g.x + 4} y1={g.y + g.h * 0.38} x2={g.x + 4} y2={g.y + g.h} {...L} />
              </g>
            )
          case 'despensa':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1={g.x} y1={g.y + g.h * f} x2={g.x + g.w} y2={g.y + g.h * f} {...L} />
                ))}
              </g>
            )
          case 'campana':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) * 0.3} {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) * 0.12} {...L} />
              </g>
            )
          case 'horno':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <rect x={g.x + 5} y={g.y + 5} width={g.w - 10} height={g.h - 10} rx="2" {...L} />
                <line x1={g.x + 5} y1={g.y + g.h * 0.3} x2={g.x + g.w - 5} y2={g.y + g.h * 0.3} {...L} />
              </g>
            )
          case 'fregadero1':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <rect x={g.x + 5} y={g.y + 5} width={g.w - 10} height={g.h - 10} rx="4" {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r="2" {...L} />
              </g>
            )
          case 'lavavajillas':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) * 0.34} {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) * 0.14} {...L} />
                <line x1={g.x + 4} y1={g.y + 3} x2={g.x + g.w - 4} y2={g.y + 3} {...L} />
              </g>
            )
          case 'refri2':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="4" {...S} />
                <line x1={g.x + g.w / 2} y1={g.y} x2={g.x + g.w / 2} y2={g.y + g.h} {...L} />
                <line x1={g.x + 5} y1={g.y + g.h * 0.5} x2={g.x + g.w / 2 - 5} y2={g.y + g.h * 0.5} {...L} />
                <line x1={g.x + g.w / 2 + 5} y1={g.y + g.h * 0.5} x2={g.x + g.w - 5} y2={g.y + g.h * 0.5} {...L} />
              </g>
            )
          case 'barra':
            return (
              <g>
                <rect x={g.x} y={g.y + 6} width={g.w} height={g.h - 6} rx="5" {...S} />
                <rect x={g.x + 3} y={g.y} width={g.w - 6} height={g.h - 8} rx="3" fill="none"
                  stroke="var(--jy-muted)" strokeWidth="0.9" strokeDasharray="5 3" opacity="0.8" />
              </g>
            )
          case 'inodoropared':
            return (
              <g>
                <rect x={g.x + g.w * 0.1} y={g.y} width={g.w * 0.8} height={g.h * 0.16} rx="1.5" {...S} />
                <ellipse cx={g.x + g.w / 2} cy={g.y + g.h * 0.62} rx={g.w * 0.4} ry={g.h * 0.36} {...S} />
                <ellipse cx={g.x + g.w / 2} cy={g.y + g.h * 0.62} rx={g.w * 0.24} ry={g.h * 0.2} {...L} />
              </g>
            )
          case 'lavatoriodoble':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="4" {...S} />
                <ellipse cx={g.x + g.w * 0.28} cy={g.y + g.h * 0.55} rx={g.w * 0.18} ry={g.h * 0.28} {...L} />
                <ellipse cx={g.x + g.w * 0.72} cy={g.y + g.h * 0.55} rx={g.w * 0.18} ry={g.h * 0.28} {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h * 0.3} r="2" {...L} />
              </g>
            )
          case 'bidet':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.w * 0.22} {...S} />
                <ellipse cx={g.x + g.w / 2} cy={g.y + g.h * 0.62} rx={g.w * 0.32} ry={g.h * 0.3} {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h * 0.16} r="2" {...L} />
              </g>
            )
          case 'urinario':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.w * 0.18} {...S} />
                <ellipse cx={g.x + g.w / 2} cy={g.y + g.h * 0.55} rx={g.w * 0.3} ry={g.h * 0.33} {...L} />
                <line x1={g.x + g.w * 0.2} y1={g.y + 3} x2={g.x + g.w * 0.8} y2={g.y + 3} {...L} />
              </g>
            )
          case 'banera':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="4" {...S} />
                <rect x={g.x + 7} y={g.y + 6} width={g.w - 14} height={g.h - 12} rx={Math.min(g.w, g.h) * 0.18} {...L} />
                <circle cx={g.x + g.w * 0.18} cy={g.y + g.h / 2} r="2.6" {...L} />
              </g>
            )
          case 'jacuzzi':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="10" {...S} />
                <rect x={g.x + 9} y={g.y + 9} width={g.w - 18} height={g.h - 18} rx="14" {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) * 0.16} {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r="2.2" {...L} />
              </g>
            )
          case 'lavadora':
          case 'secadora':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h * 0.56} r={Math.min(g.w, g.h) * 0.34} {...L} />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h * 0.56} r={Math.min(g.w, g.h) * 0.16} {...L} />
                <line x1={g.x + 4} y1={g.y + 4} x2={g.x + g.w - 4} y2={g.y + 4} {...L} />
                <circle cx={g.x + g.w - 6} cy={g.y + 8} r="1.6" {...L} />
              </g>
            )
          case 'palmera':
            return (
              <g>
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 2}
                  fill="rgba(16,185,129,0.10)" stroke="rgba(16,185,129,0.75)" strokeWidth="1.4" strokeDasharray="5 3" />
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => (
                  <line key={a} x1={g.x + g.w / 2} y1={g.y + g.h / 2}
                    x2={g.x + g.w / 2 + Math.cos((a * Math.PI) / 180) * (Math.min(g.w, g.h) / 2.6)}
                    y2={g.y + g.h / 2 + Math.sin((a * Math.PI) / 180) * (Math.min(g.w, g.h) / 2.6)}
                    stroke="rgba(16,185,129,0.55)" strokeWidth="1" />
                ))}
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) * 0.14}
                  fill="none" stroke="rgba(16,185,129,0.7)" strokeWidth="1.2" />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r="2.6" fill="rgba(16,185,129,0.9)" />
              </g>
            )
          case 'maceta':
            return (
              <g>
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 2}
                  fill="rgba(16,185,129,0.18)" stroke="rgba(16,185,129,0.7)" strokeWidth="1.2" />
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 3}
                  fill="none" stroke="rgba(16,185,129,0.5)" strokeWidth="0.9" strokeDasharray="3 2" />
              </g>
            )
          case 'grama':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="4" fill="rgba(16,185,129,0.07)"
                  stroke="rgba(16,185,129,0.55)" strokeWidth="1" strokeDasharray="7 4" />
                {Array.from({ length: 5 }).map((_, r) =>
                  Array.from({ length: 5 }).map((_, c) => {
                    const px = g.x + (g.w / 6) * (c + 1) + (r % 2 === 0 ? g.w / 12 : 0)
                    const py = g.y + (g.h / 6) * (r + 1)
                    return <circle key={`${r}-${c}`} cx={px} cy={py} r="2.4" fill="none" stroke="rgba(16,185,129,0.45)" strokeWidth="0.9" />
                  })
                )}
              </g>
            )
          case 'bancojardin':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                {[0.28, 0.5, 0.72].map((f) => (
                  <line key={f} x1={g.x + 3} y1={g.y + g.h * f} x2={g.x + g.w - 3} y2={g.y + g.h * f} {...L} />
                ))}
                <rect x={g.x + 2} y={g.y + 1} width={5} height={g.h - 2} rx="1.5" {...L} />
                <rect x={g.x + g.w - 7} y={g.y + 1} width={5} height={g.h - 2} rx="1.5" {...L} />
              </g>
            )
          case 'pergola':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="none"
                  stroke="rgba(168,162,158,0.8)" strokeWidth="1.4" />
                <rect x={g.x + 4} y={g.y + 4} width={g.w - 8} height={g.h - 8} rx="2" fill="none"
                  stroke="rgba(168,162,158,0.4)" strokeWidth="0.8" strokeDasharray="4 3" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <line key={i} x1={g.x + (g.w / 5) * (i + 0.5)} y1={g.y} x2={g.x + (g.w / 5) * (i + 0.5)} y2={g.y + g.h}
                    stroke="rgba(168,162,158,0.4)" strokeWidth="0.7" />
                ))}
                {Array.from({ length: 5 }).map((_, i) => (
                  <line key={`h${i}`} x1={g.x} y1={g.y + (g.h / 5) * (i + 0.5)} x2={g.x + g.w} y2={g.y + (g.h / 5) * (i + 0.5)}
                    stroke="rgba(168,162,158,0.4)" strokeWidth="0.7" />
                ))}
              </g>
            )
          case 'parrilla':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
                <rect x={g.x + 6} y={g.y + 5} width={g.w * 0.7 - 8} height={g.h - 10} rx="2" {...L} />
                {Array.from({ length: 4 }).map((_, i) => (
                  <line key={i} x1={g.x + 8} y1={g.y + 8 + (i * (g.h - 16)) / 3} x2={g.x + g.w * 0.7 - 6} y2={g.y + 8 + (i * (g.h - 16)) / 3} {...L} />
                ))}
                <rect x={g.x + g.w * 0.72} y={g.y + 3} width={g.w * 0.28 - 3} height={g.h - 6} rx="2" {...L} />
              </g>
            )
          case 'piscina':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="6" {...S} />
                <rect x={g.x + 6} y={g.y + 6} width={g.w - 12} height={g.h - 12} rx="4" {...L} />
                <line x1={g.x + g.w * 0.12} y1={g.y + g.h * 0.28} x2={g.x + g.w * 0.12} y2={g.y + g.h * 0.72}
                  stroke="var(--jy-muted)" strokeWidth="1.6" />
                <line x1={g.x + g.w * 0.12 + 6} y1={g.y + g.h * 0.28} x2={g.x + g.w * 0.12 + 6} y2={g.y + g.h * 0.72}
                  stroke="var(--jy-muted)" strokeWidth="1.6" />
                <path d={`M ${g.x + g.w - 6} ${g.y + 6} L ${g.x + g.w - 34} ${g.y + 6} L ${g.x + g.w - 34} ${g.y + 40}`}
                  fill="none" stroke="var(--jy-muted)" strokeWidth="1" />
                <path d={`M ${g.x + g.w - 10} ${g.y + 10} L ${g.x + g.w - 28} ${g.y + 10} L ${g.x + g.w - 28} ${g.y + 32}`}
                  fill="none" stroke="var(--jy-muted)" strokeWidth="0.8" />
              </g>
            )
          case 'camioneta':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={Math.min(g.w, g.h) * 0.18} {...S} />
                <rect x={g.x + g.w * 0.24} y={g.y + 4} width={g.w * 0.2} height={g.h - 8} rx="5" {...L} />
                <rect x={g.x + g.w * 0.6} y={g.y + 5} width={g.w * 0.16} height={g.h - 10} rx="5" {...L} />
                <line x1={g.x + g.w * 0.5} y1={g.y + 3} x2={g.x + g.w * 0.5} y2={g.y + g.h - 3} {...L} />
                {[0.14, 0.86].map((fx, i) => (
                  <g key={i}>
                    <rect x={g.x + g.w * fx - 14} y={g.y - 2} width="28" height="6" rx="2.5" fill="#3f3f46" />
                    <rect x={g.x + g.w * fx - 14} y={g.y + g.h - 4} width="28" height="6" rx="2.5" fill="#3f3f46" />
                  </g>
                ))}
              </g>
            )
          case 'escalera':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                {Array.from({ length: 7 }).map((_, i) => (
                  <line key={i} x1={g.x} y1={g.y + ((g.h - 8) / 7) * (i + 1) + 4} x2={g.x + g.w} y2={g.y + ((g.h - 8) / 7) * (i + 1) + 4} {...L} />
                ))}
                <line x1={g.x + g.w / 2} y1={g.y + g.h - 12} x2={g.x + g.w / 2} y2={g.y + 14}
                  stroke="var(--jy-primary)" strokeWidth="1.6" />
                <path d={`M ${g.x + g.w / 2 - 5} ${g.y + 20} L ${g.x + g.w / 2} ${g.y + 12} L ${g.x + g.w / 2 + 5} ${g.y + 20}`}
                  fill="none" stroke="var(--jy-primary)" strokeWidth="1.6" />
                <text x={g.x + g.w / 2 + 8} y={g.y + g.h / 2} fontSize="8" fontWeight="700" style={{ fill: 'var(--jy-primary)' }}>SUBE</text>
              </g>
            )
          case 'ascensor':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                <line x1={g.x} y1={g.y} x2={g.x + g.w} y2={g.y + g.h} {...L} />
                <line x1={g.x + g.w} y1={g.y} x2={g.x} y2={g.y + g.h} {...L} />
                <line x1={g.x + g.w * 0.4} y1={g.y} x2={g.x + g.w * 0.6} y2={g.y} stroke="var(--jy-bg, #18181b)" strokeWidth="4" />
              </g>
            )
          case 'rampa':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1={g.x + 4} y1={g.y + g.h * f} x2={g.x + g.w - 4} y2={g.y + g.h * f}
                    stroke="var(--jy-muted)" strokeWidth="0.7" strokeDasharray="4 3" />
                ))}
                <line x1={g.x + g.w / 2} y1={g.y + g.h - 12} x2={g.x + g.w / 2} y2={g.y + 14}
                  stroke="var(--jy-primary)" strokeWidth="1.6" />
                <path d={`M ${g.x + g.w / 2 - 5} ${g.y + 20} L ${g.x + g.w / 2} ${g.y + 12} L ${g.x + g.w / 2 + 5} ${g.y + 20}`}
                  fill="none" stroke="var(--jy-primary)" strokeWidth="1.6" />
                <text x={g.x + g.w / 2 + 7} y={g.y + g.h / 2} fontSize="8" fontWeight="700" style={{ fill: 'var(--jy-primary)' }}>8%</text>
              </g>
            )
          case 'chimenea':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} {...S} />
                <rect x={g.x + 8} y={g.y + 8} width={g.w * 0.55} height={g.h * 0.55} rx="2" {...L} />
                <rect x={g.x + g.w * 0.72} y={g.y + g.h * 0.2} width={g.w * 0.2} height={g.h * 0.2} {...L} />
              </g>
            )
          case 'extintor':
            return (
              <g>
                <circle cx={g.x + g.w / 2} cy={g.y + g.h / 2} r={Math.min(g.w, g.h) / 2 - 1}
                  fill="rgba(239,68,68,0.14)" stroke="rgba(239,68,68,0.85)" strokeWidth="1.4" />
                <text x={g.x + g.w / 2} y={g.y + g.h / 2 + 2.6} textAnchor="middle" fontSize="7" fontWeight="800" fill="rgba(239,68,68,0.95)">EXT</text>
              </g>
            )
          case 'tablero':
            return (
              <g>
                <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="2"
                  fill="rgba(168,162,158,0.16)" stroke="rgba(250,204,21,0.85)" strokeWidth="1.3" />
                <path d={`M ${g.x + g.w * 0.5} ${g.y + 2.5} L ${g.x + g.w * 0.28} ${g.y + g.h * 0.55} L ${g.x + g.w * 0.5} ${g.y + g.h * 0.55} L ${g.x + g.w * 0.72} ${g.y + g.h - 2.5}`}
                  fill="none" stroke="rgba(250,204,21,0.9)" strokeWidth="1.2" strokeLinejoin="round" />
              </g>
            )
          default: {
            // --- detalles constructivos (det-*): miniaturas de sección ---
            if (g.kind.startsWith('det-')) return <DetailShape g={g} />
            return <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
          }
        }
      })()}
    </g>
  )
}

function FurnNode({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as FurnGeo
  return (
    <g>
      <FurnShape g={g} material={mod?.material} />
      <rect className="jy-hover-ring" x={g.x - 4} y={g.y - 4} width={g.w + 8} height={g.h + 8}
        fill="none" stroke="var(--jy-primary)" strokeWidth="2" rx="5" />
    </g>
  )
}

// ---------------- DIBUJO (elementos creados por el usuario) ----------------

function DibujoNode({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as DrawGeo
  const color = mod?.colorLine || '#f59e0b'
  const weight = mod?.weight || 2
  const ring: React.ReactNode = null
  switch (g.kind) {
    case 'linea':
      return (
        <g>
          <line x1={g.pts[0][0]} y1={g.pts[0][1]} x2={g.pts[1][0]} y2={g.pts[1][1]}
            stroke={color} strokeWidth={weight} strokeLinecap="round" />
          <line x1={g.pts[0][0]} y1={g.pts[0][1]} x2={g.pts[1][0]} y2={g.pts[1][1]}
            stroke="transparent" strokeWidth="14" />
        </g>
      )
    case 'polilinea':
      return (
        <g>
          <polyline points={g.pts.map((p) => p.join(',')).join(' ')} fill="none"
            stroke={color} strokeWidth={weight} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={g.pts.map((p) => p.join(',')).join(' ')} fill="none"
            stroke="transparent" strokeWidth="14" />
        </g>
      )
    case 'rectangulo': {
      const [x1, y1] = g.pts[0], [x2, y2] = g.pts[1]
      return (
        <g>
          <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
            fill="none" stroke={color} strokeWidth={weight} rx="1" />
          <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
            fill="none" stroke="transparent" strokeWidth="14" />
        </g>
      )
    }
    case 'circulo':
      return (
        <g>
          <circle cx={g.pts[0][0]} cy={g.pts[0][1]} r={g.r || 40} fill="none" stroke={color} strokeWidth={weight} />
          <circle cx={g.pts[0][0]} cy={g.pts[0][1]} r={g.r || 40} fill="none" stroke="transparent" strokeWidth="14" />
        </g>
      )
    case 'texto':
      return (
        <g>
          <text x={g.pts[0][0]} y={g.pts[0][1]} fontSize={mod?.textHeight || 16} fontWeight="600" fill={color}>
            {g.text || 'texto'}
          </text>
        </g>
      )
    case 'cota': {
      const [x1, y1] = g.pts[0], [x2, y2] = g.pts[1]
      const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1)
      const val = (mod?.dimOverride && mod.dimOverride !== '') ? mod.dimOverride
        : `${(Math.hypot(x2 - x1, y2 - y1) / 60).toFixed(mod?.precision ?? 2)}`
      const stroke = color
      if (horizontal) {
        const dy = Math.min(y1, y2) - 26
        return (
          <g>
            <line x1={x1} y1={y1 - 3} x2={x1} y2={dy + 3} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
            <line x1={x2} y1={y2 - 3} x2={x2} y2={dy + 3} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
            <line x1={x1} y1={dy} x2={x2} y2={dy} stroke={stroke} strokeWidth="1.1" />
            <text x={(x1 + x2) / 2} y={dy - 5} textAnchor="middle" fontSize="12" fontWeight="700" fill={stroke}>
              {val} m
            </text>
            <line x1={x1 - 4} y1={dy - 4} x2={x1 + 4} y2={dy + 4} stroke={stroke} strokeWidth="1.6" />
            <line x1={x2 - 4} y1={dy - 4} x2={x2 + 4} y2={dy + 4} stroke={stroke} strokeWidth="1.6" />
          </g>
        )
      }
      const dx = Math.min(x1, x2) - 26
      return (
        <g>
          <line x1={x1 - 3} y1={y1} x2={dx + 3} y2={y1} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
          <line x1={x2 - 3} y1={y2} x2={dx + 3} y2={y2} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
          <line x1={dx} y1={y1} x2={dx} y2={y2} stroke={stroke} strokeWidth="1.1" />
          <text x={dx - 5} y={(y1 + y2) / 2} textAnchor="middle" fontSize="12" fontWeight="700" fill={stroke}
            transform={`rotate(-90 ${dx - 5} ${(y1 + y2) / 2})`}>
            {val} m
          </text>
        </g>
      )
    }
    case 'punto':
      return (
        <g>
          <line x1={g.pts[0][0] - 5} y1={g.pts[0][1]} x2={g.pts[0][0] + 5} y2={g.pts[0][1]} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <line x1={g.pts[0][0]} y1={g.pts[0][1] - 5} x2={g.pts[0][0]} y2={g.pts[0][1] + 5} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx={g.pts[0][0]} cy={g.pts[0][1]} r="12" fill="transparent" stroke="transparent" />
        </g>
      )
    case 'arco': {
      const d = pathFromPts(sampleArc3(g.pts[0], g.pts[1], g.pts[2]))
      return (
        <g>
          <path d={d} fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" />
          <path d={d} fill="none" stroke="transparent" strokeWidth="14" />
        </g>
      )
    }
    case 'elipse':
      return (
        <g>
          <ellipse cx={g.pts[0][0]} cy={g.pts[0][1]} rx={g.rx || 40} ry={g.ry || (g.rx || 40)}
            fill="none" stroke={color} strokeWidth={weight} />
          <ellipse cx={g.pts[0][0]} cy={g.pts[0][1]} rx={g.rx || 40} ry={g.ry || (g.rx || 40)}
            fill="none" stroke="transparent" strokeWidth="14" />
        </g>
      )
    case 'spline': {
      const d = pathFromPts(sampleCatmullRom(g.pts, 10))
      return (
        <g>
          <path d={d} fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" />
          <path d={d} fill="none" stroke="transparent" strokeWidth="14" />
        </g>
      )
    }
    case 'directriz': {
      // flecha en el punto de anclaje +horizontal con el rótulo
      const [ax, ay] = g.pts[0], [ex, ey] = g.pts[1]
      const ang = Math.atan2(ay - ey, ax - ex)
      const hd = 7
      const lx = ex + (ex >= ax ? 6 : -6)
      const anchor: 'start' | 'end' = ex >= ax ? 'start' : 'end'
      return (
        <g>
          <line x1={ax} y1={ay} x2={ex} y2={ey} stroke={color} strokeWidth={weight} />
          <line x1={ex} y1={ey} x2={lx} y2={ey} stroke={color} strokeWidth={weight} />
          <path d={`M ${ax} ${ay} L ${ax - hd * Math.cos(ang - 0.4)} ${ay - hd * Math.sin(ang - 0.4)} L ${ax - hd * Math.cos(ang + 0.4)} ${ay - hd * Math.sin(ang + 0.4)} Z`} fill={color} />
          <text x={lx} y={ey - 5} textAnchor={anchor} fontSize={mod?.textHeight || 11.5} fontWeight="700" fill={color}>
            {g.text || 'nota'}
          </text>
          <line x1={ax} y1={ay} x2={ex} y2={ey} stroke="transparent" strokeWidth="14" />
        </g>
      )
    }
    case 'nube': {
      const d = pathFromPts(scallopPts(g.pts, false, 26)) + ' Z'
      return (
        <g>
          <path d={d} fill="none" stroke="#fb7185" strokeWidth={weight} strokeLinejoin="round" />
          <path d={d} fill="none" stroke="transparent" strokeWidth="14" />
        </g>
      )
    }
    case 'hatch': {
      const id = `jy-hatch-${g.pattern || 'ar-b816'}`
      const d = pathFromPts(g.pts) + ' Z'
      return (
        <g>
          <defs>
            {g.pattern === 'ansi31' && (
              <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="9" stroke="#71717a" strokeWidth="0.9" />
              </pattern>
            )}
            {g.pattern === 'ar-b816' && (
              <pattern id={id} width="30" height="16" patternUnits="userSpaceOnUse">
                <rect width="30" height="16" fill="none" />
                <line x1="0" y1="0" x2="30" y2="0" stroke="#71717a" strokeWidth="0.7" />
                <line x1="0" y1="8" x2="30" y2="8" stroke="#71717a" strokeWidth="0.7" />
                <line x1="15" y1="0" x2="15" y2="8" stroke="#71717a" strokeWidth="0.7" />
                <line x1="0" y1="8" x2="0" y2="16" stroke="#71717a" strokeWidth="0.7" />
                <line x1="30" y1="8" x2="30" y2="16" stroke="#71717a" strokeWidth="0.7" />
              </pattern>
            )}
            {g.pattern === 'gravel' && (
              <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="3" cy="3" r="1.1" fill="#71717a" />
                <circle cx="9" cy="7" r="0.8" fill="#71717a" />
                <circle cx="5" cy="11" r="1" fill="#71717a" />
                <circle cx="12" cy="12" r="0.7" fill="#71717a" />
              </pattern>
            )}
            {(g.pattern === 'ar-conc' || !g.pattern) && (
              <pattern id={id} width="18" height="18" patternUnits="userSpaceOnUse">
                <rect width="18" height="18" fill="none" />
                <path d="M 0 0 H 18 M 0 18 H 18 M 0 0 V 18 M 18 0 V 18" stroke="#71717a" strokeWidth="0.6" fill="none" />
              </pattern>
            )}
          </defs>
          <path d={d} fill={`url(#${id})`} stroke={color} strokeWidth={Math.max(1, weight - 0.6)} strokeLinejoin="round" />
          <path d={d} fill="none" stroke="transparent" strokeWidth="14" />
        </g>
      )
    }
    case 'cota-rad': {
      const [cx, cy] = g.pts[0], [ex, ey] = g.pts[1]
      const r = g.r || Math.hypot(ex - cx, ey - cy)
      const ang = Math.atan2(cy - ey, cx - ex)
      const val = (mod?.dimOverride && mod.dimOverride !== '') ? mod.dimOverride : (r / 60).toFixed(2)
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="0.9" opacity="0.55" />
          <line x1={cx} y1={cy} x2={ex} y2={ey} stroke={color} strokeWidth="1" />
          <path d={`M ${ex} ${ey} L ${ex - 8 * Math.cos(ang - 0.35)} ${ey - 8 * Math.sin(ang - 0.35)} L ${ex - 8 * Math.cos(ang + 0.35)} ${ey - 8 * Math.sin(ang + 0.35)} Z`} fill={color} />
          <text x={(cx + ex) / 2 + 6} y={(cy + ey) / 2 - 6} fontSize="11.5" fontWeight="700" fill={color}>R {val} m</text>
          <circle cx={cx} cy={cy} r="2.4" fill={color} />
        </g>
      )
    }
    case 'cota-ang': {
      const [vx, vy] = g.pts[0], p1 = g.pts[1], p2 = g.pts[2]
      const a1 = Math.atan2(p1[1] - vy, p1[0] - vx)
      const a2 = Math.atan2(p2[1] - vy, p2[0] - vx)
      let sweep = (a2 - a1) % (Math.PI * 2)
      if (sweep < 0) sweep += Math.PI * 2
      const deg = sweep * 180 / Math.PI
      const r0 = Math.min(64, Math.max(34, Math.hypot(p1[0] - vx, p1[1] - vy) * 0.5))
      const large = sweep > Math.PI ? 1 : 0
      const arcPath = `M ${vx + r0 * Math.cos(a1)} ${vy + r0 * Math.sin(a1)} A ${r0} ${r0} 0 ${large} 0 ${vx + r0 * Math.cos(a2)} ${vy + r0 * Math.sin(a2)}`
      const mid = a1 + sweep / 2
      const tX = vx + (r0 + 13) * Math.cos(mid), tY = vy + (r0 + 13) * Math.sin(mid)
      return (
        <g>
          <line x1={vx} y1={vy} x2={vx + r0 * Math.cos(a1)} y2={vy + r0 * Math.sin(a1)} stroke={color} strokeWidth="0.8" opacity="0.6" />
          <line x1={vx} y1={vy} x2={vx + r0 * Math.cos(a2)} y2={vy + r0 * Math.sin(a2)} stroke={color} strokeWidth="0.8" opacity="0.6" />
          <path d={arcPath} fill="none" stroke={color} strokeWidth="1.2" />
          <circle cx={vx + r0 * Math.cos(a1)} cy={vy + r0 * Math.sin(a1)} r="1.8" fill={color} />
          <circle cx={vx + r0 * Math.cos(a2)} cy={vy + r0 * Math.sin(a2)} r="1.8" fill={color} />
          <text x={tX} y={tY} textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>
            {(mod?.dimOverride && mod.dimOverride !== '') ? mod.dimOverride : `${deg.toFixed(1)}°`}
          </text>
        </g>
      )
    }
    default:
      return <g>{ring}</g>
  }
}

// ---------------- ESCALERA PARAMÉTRICA ----------------

function StairNode({ el }: { el: PlanElement }) {
  const g = el.geo as StairGeo
  const cx = g.x + g.w / 2
  const cy = g.y + g.h / 2
  const run = g.h / g.steps
  // los pasos corren a lo largo de h (la rotación 90° la aplica el transform del elemento)
  const steps: React.ReactNode[] = []
  for (let i = 0; i <= g.steps; i++) {
    const yy = g.y + run * i
    steps.push(<line key={i} x1={g.x} y1={yy} x2={g.x + g.w} y2={yy} stroke="#a1a1aa" strokeWidth="1" />)
  }
  // línea de zanca + flecha de sentido (up/down vertical, left/right horizontal)
  const horizontal = g.dir === 'left' || g.dir === 'right'
  const label = `SUBE ${g.steps}P · H ${(g.tread * 100).toFixed(0)}`
  return (
    <g>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="rgba(161,161,170,0.10)" stroke="#d4d4d8" strokeWidth="1.4" />
      {steps}
      {horizontal ? (
        <g>
          <line x1={g.x + 6} y1={cy} x2={g.x + g.w - 6} y2={cy} stroke="#f59e0b" strokeWidth="1.6" />
          <circle cx={g.dir === 'right' ? g.x + g.w - 6 : g.x + 6} cy={cy} r="2.4" fill="#f59e0b" />
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="#f59e0b">{label}</text>
        </g>
      ) : (
        <g>
          <line x1={cx} y1={g.y + 6} x2={cx} y2={g.y + g.h - 6} stroke="#f59e0b" strokeWidth="1.6" />
          <circle cx={cx} cy={g.dir === 'down' ? g.y + g.h - 6 : g.y + 6} r="2.4" fill="#f59e0b" />
          <text x={cx + 8} y={cy} fontSize="9" fontWeight="700" fill="#f59e0b"
            transform={`rotate(-90 ${cx + 8} ${cy})`}>{label}</text>
        </g>
      )}
      <rect className="jy-hover-ring" x={g.x - 3} y={g.y - 3} width={g.w + 6} height={g.h + 6}
        fill="none" stroke="var(--jy-primary)" strokeWidth="2" rx="3" />
    </g>
  )
}

// ---------------- TECHO PARAMÉTRICO ----------------

function RoofNode({ el }: { el: PlanElement }) {
  const g = el.geo as RoofGeo
  const cx = g.x + g.w / 2
  const cy = g.y + g.h / 2
  const slopeLabel = `PEND. ${g.slope}%`
  let inner: React.ReactNode = null
  if (g.kind === 'dos-aguas') {
    const ridge = g.ridge === 'h'
      ? <line x1={g.x} y1={cy} x2={g.x + g.w} y2={cy} stroke="#e4e4e7" strokeWidth="1.6" strokeDasharray="10 4" />
      : <line x1={cx} y1={g.y} x2={cx} y2={g.y + g.h} stroke="#e4e4e7" strokeWidth="1.6" strokeDasharray="10 4" />
    // flechas de pendiente hacia la cumbrera
    const arrows = g.ridge === 'h'
      ? [
        <g key="a1"><line x1={cx} y1={g.y + 8} x2={cx} y2={cy - 6} stroke="#84cc16" strokeWidth="1.3" /><path d={`M ${cx - 3.5} ${cy - 9} L ${cx} ${cy - 5} L ${cx + 3.5} ${cy - 9}`} fill="none" stroke="#84cc16" strokeWidth="1.3" /></g>,
        <g key="a2"><line x1={cx} y1={g.y + g.h - 8} x2={cx} y2={cy + 6} stroke="#84cc16" strokeWidth="1.3" /><path d={`M ${cx - 3.5} ${cy + 9} L ${cx} ${cy + 5} L ${cx + 3.5} ${cy + 9}`} fill="none" stroke="#84cc16" strokeWidth="1.3" /></g>,
      ]
      : [
        <g key="a1"><line x1={g.x + 8} y1={cy} x2={cx - 6} y2={cy} stroke="#84cc16" strokeWidth="1.3" /><path d={`M ${cx - 9} ${cy - 3.5} L ${cx - 5} ${cy} L ${cx - 9} ${cy + 3.5}`} fill="none" stroke="#84cc16" strokeWidth="1.3" /></g>,
        <g key="a2"><line x1={g.x + g.w - 8} y1={cy} x2={cx + 6} y2={cy} stroke="#84cc16" strokeWidth="1.3" /><path d={`M ${cx + 9} ${cy - 3.5} L ${cx + 5} ${cy} L ${cx + 9} ${cy + 3.5}`} fill="none" stroke="#84cc16" strokeWidth="1.3" /></g>,
      ]
    inner = <g>{ridge}{arrows}</g>
  } else if (g.kind === 'cuatro-aguas') {
    inner = (
      <g>
        <line x1={g.x} y1={g.y} x2={cx} y2={cy} stroke="#e4e4e7" strokeWidth="1.1" strokeDasharray="7 4" />
        <line x1={g.x + g.w} y1={g.y} x2={cx} y2={cy} stroke="#e4e4e7" strokeWidth="1.1" strokeDasharray="7 4" />
        <line x1={g.x} y1={g.y + g.h} x2={cx} y2={cy} stroke="#e4e4e7" strokeWidth="1.1" strokeDasharray="7 4" />
        <line x1={g.x + g.w} y1={g.y + g.h} x2={cx} y2={cy} stroke="#e4e4e7" strokeWidth="1.1" strokeDasharray="7 4" />
        <circle cx={cx} cy={cy} r="3" fill="#84cc16" />
      </g>
    )
  } else {
    // plano: flecha única de pendiente
    inner = (
      <g>
        <line x1={g.x + 10} y1={cy} x2={g.x + g.w - 10} y2={cy} stroke="#84cc16" strokeWidth="1.3" />
        <path d={`M ${g.x + g.w - 14} ${cy - 3.5} L ${g.x + g.w - 9} ${cy} L ${g.x + g.w - 14} ${cy + 3.5}`} fill="none" stroke="#84cc16" strokeWidth="1.3" />
      </g>
    )
  }
  return (
    <g>
      <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="rgba(132,204,22,0.05)" stroke="#84cc16" strokeWidth="1.4" strokeDasharray="6 3" />
      {inner}
      <text x={cx} y={g.y - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill="#84cc16">{slopeLabel}</text>
      <rect className="jy-hover-ring" x={g.x - 3} y={g.y - 3} width={g.w + 6} height={g.h + 6}
        fill="none" stroke="var(--jy-primary)" strokeWidth="2" rx="3" />
    </g>
  )
}

// ---------------- INSTALACIÓN (tubería / circuito) ----------------

const INST_STYLE: Record<string, { color: string; dash?: string; label: string }> = {
  agua: { color: '#38bdf8', label: 'AGUA' },
  desague: { color: '#b45309', dash: '8 4', label: 'DESAGÜE' },
  electrico: { color: '#ef4444', dash: '3 3', label: 'ELÉCTRICO' },
}

function InstNode({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as InstGeo
  const st = INST_STYLE[g.kind] || INST_STYLE.agua
  const color = mod?.colorLine || st.color
  const tx = mod?.translate?.[0] ?? 0
  const ty = mod?.translate?.[1] ?? 0
  const pts = g.pts.map((p) => `${p[0] + tx},${p[1] + ty}`).join(' ')
  const dia = mod?.pipeDia ?? g.diameter
  const dmm = Math.max(6, Math.round(dia))
  // grosor de trazo proporcional al Ø real (Ø6mm → 1.2px · Ø50mm → 3.8px)
  const sw = Math.max(1.2, Math.min(4.2, dmm / 13))
  const [x0, y0] = [g.pts[0][0] + tx, g.pts[0][1] + ty]
  const [xe, ye] = [g.pts[g.pts.length - 1][0] + tx, g.pts[g.pts.length - 1][1] + ty]
  return (
    <g>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={st.dash} strokeLinejoin="round" strokeLinecap="round" />
      {/* codos */}
      {g.pts.map((p, i) => (
        <circle key={i} cx={p[0] + tx} cy={p[1] + ty} r={Math.max(2, sw * 0.9)} fill={color} />
      ))}
      {/* etiqueta de diámetro al inicio */}
      <g>
        <rect x={x0 - 26} y={y0 - 20} width="52" height="12" rx="2.5" fill="rgba(24,24,27,0.85)" />
        <text x={x0} y={y0 - 11} textAnchor="middle" fontSize="7.5" fontWeight="700" fill={color}>
          {st.label} Ø{dmm}mm
        </text>
      </g>
      {/* terminal */}
      <circle cx={xe} cy={ye} r="3.4" fill="none" stroke={color} strokeWidth="1.6" />
      <rect className="jy-hover-ring" x={Math.min(...g.pts.map((p) => p[0] + tx)) - 4} y={Math.min(...g.pts.map((p) => p[1] + ty)) - 4}
        width={Math.max(...g.pts.map((p) => p[0] + tx)) - Math.min(...g.pts.map((p) => p[0] + tx)) + 8}
        height={Math.max(...g.pts.map((p) => p[1] + ty)) - Math.min(...g.pts.map((p) => p[1] + ty)) + 8}
        fill="none" stroke="var(--jy-primary)" strokeWidth="2" rx="4" />
    </g>
  )
}

// ---------------- SÍMBOLO DE INSTALACIÓN ----------------

function SymNode({ el }: { el: PlanElement }) {
  const g = el.geo as SymGeo
  const { x, y } = g
  const stroke = '#38bdf8'
  let glyph: React.ReactNode = null
  switch (g.kind) {
    case 'luz':
      glyph = (
        <g>
          <circle cx={x} cy={y} r="7" fill="none" stroke={stroke} strokeWidth="1.6" />
          <line x1={x - 10} y1={y} x2={x - 7} y2={y} stroke={stroke} strokeWidth="1.6" />
          <line x1={x + 7} y1={y} x2={x + 10} y2={y} stroke={stroke} strokeWidth="1.6" />
          <line x1={x} y1={y - 10} x2={x} y2={y - 7} stroke={stroke} strokeWidth="1.6" />
          <line x1={x} y1={y + 7} x2={x} y2={y + 10} stroke={stroke} strokeWidth="1.6" />
        </g>
      )
      break
    case 'tomacorriente':
      glyph = (
        <g>
          <circle cx={x} cy={y} r="5.5" fill="none" stroke={stroke} strokeWidth="1.6" />
          <line x1={x - 5} y1={y - 5} x2={x - 9} y2={y - 9} stroke={stroke} strokeWidth="1.6" />
          <line x1={x - 9} y1={y - 9} x2={x - 9} y2={y - 4} stroke={stroke} strokeWidth="1.6" />
          <line x1={x + 5} y1={y - 5} x2={x + 9} y2={y - 9} stroke={stroke} strokeWidth="1.6" />
          <line x1={x + 9} y1={y - 9} x2={x + 9} y2={y - 4} stroke={stroke} strokeWidth="1.6" />
        </g>
      )
      break
    case 'interruptor':
      glyph = (
        <g>
          <circle cx={x} cy={y} r="4.5" fill="none" stroke={stroke} strokeWidth="1.6" />
          <line x1={x + 3} y1={y - 3} x2={x + 11} y2={y - 11} stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )
      break
    case 'tablero':
      glyph = (
        <g>
          <rect x={x - 9} y={y - 7} width="18" height="14" rx="1.5" fill="rgba(56,189,248,0.15)" stroke="#facc15" strokeWidth="1.6" />
          <line x1={x - 9} y1={y} x2={x + 9} y2={y} stroke="#facc15" strokeWidth="1.1" />
          <text x={x} y={y + 11.5} textAnchor="middle" fontSize="7" fontWeight="800" fill="#facc15">TB</text>
        </g>
      )
      break
    case 'punto-agua':
      glyph = (
        <g>
          <circle cx={x} cy={y} r="6.5" fill="none" stroke="#38bdf8" strokeWidth="1.6" />
          <path d={`M ${x - 4} ${y - 3.5} L ${x + 4} ${y + 3.5} M ${x + 4} ${y - 3.5} L ${x - 4} ${y + 3.5}`} stroke="#38bdf8" strokeWidth="1.3" />
        </g>
      )
      break
    case 'punto-desague':
      glyph = (
        <g>
          <circle cx={x} cy={y} r="6.5" fill="none" stroke="#b45309" strokeWidth="1.6" />
          <circle cx={x} cy={y} r="2.2" fill="#b45309" />
        </g>
      )
      break
    case 'medidor-agua':
      glyph = (
        <g>
          <circle cx={x} cy={y} r="7.5" fill="none" stroke="#38bdf8" strokeWidth="1.6" />
          <text x={x} y={y + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#38bdf8">M</text>
        </g>
      )
      break
    default:
      glyph = <circle cx={x} cy={y} r="5" fill="none" stroke={stroke} strokeWidth="1.5" />
  }
  return (
    <g>
      {glyph}
      <circle className="jy-hover-ring" cx={x} cy={y} r="14" fill="none" stroke="var(--jy-primary)" strokeWidth="1.8" />
    </g>
  )
}

// ---------------- TERRENO (lote / curva de nivel) ----------------

function TerrainNode({ el }: { el: PlanElement }) {
  const g = el.geo as TerrainGeo
  if (g.kind === 'curva') {
    const pts = g.pts.map((p) => p.join(',')).join(' ')
    const mid = g.pts[Math.floor(g.pts.length / 2)]
    return (
      <g>
        <polyline points={pts} fill="none" stroke="#84cc16" strokeWidth="1.6" strokeDasharray="12 3" />
        <text x={mid[0]} y={mid[1] - 7} textAnchor="middle" fontSize="10" fontWeight="700" fill="#84cc16">
          {(g.elev ?? 0).toFixed(2)}
        </text>
        <rect className="jy-hover-ring" x={Math.min(...g.pts.map((p) => p[0])) - 4} y={Math.min(...g.pts.map((p) => p[1])) - 4}
          width={Math.max(...g.pts.map((p) => p[0])) - Math.min(...g.pts.map((p) => p[0])) + 8}
          height={Math.max(...g.pts.map((p) => p[1])) - Math.min(...g.pts.map((p) => p[1])) + 8}
          fill="none" stroke="var(--jy-primary)" strokeWidth="2" rx="3" />
      </g>
    )
  }
  const pts = g.pts.map((p) => p.join(',')).join(' ')
  const area = polygonAreaM2(g.pts)
  const per = polygonPerimeterM(g.pts)
  let sx = 0, sy = 0
  g.pts.forEach((p) => { sx += p[0]; sy += p[1] })
  const cx = sx / g.pts.length, cy = sy / g.pts.length
  // lados con etiqueta de longitud + ticks de vértice
  const sides: React.ReactNode[] = []
  for (let i = 0; i < g.pts.length; i++) {
    const a = g.pts[i], b = g.pts[(i + 1) % g.pts.length]
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) / 60
    const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
    const rot = ang > 90 || ang < -90 ? ang + 180 : ang
    sides.push(
      <g key={i}>
        <circle cx={a[0]} cy={a[1]} r="3" fill="#84cc16" />
        <rect x={mx - 18} y={my - 14} width="36" height="11" rx="2" fill="rgba(24,24,27,0.9)" />
        <text x={mx} y={my - 5.5} textAnchor="middle" fontSize="8" fontWeight="700" fill="#a3e635"
          transform={`rotate(${rot} ${mx} ${my})`}>
          {len.toFixed(2)} m
        </text>
      </g>,
    )
  }
  return (
    <g>
      <polygon points={pts} fill="rgba(132,204,22,0.07)" stroke="#84cc16" strokeWidth="2" strokeDasharray="14 5" />
      {sides}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="15" fontWeight="800" fill="#a3e635">
        {g.name || 'LOTE'}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#84cc16">
        {area.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m² · {per.toFixed(2)} m
      </text>
    </g>
  )
}

// ---------------- PIN DE COMENTARIO ----------------

function PinNode({ el }: { el: PlanElement }) {
  const g = el.geo as PinGeo
  const idx = parseInt((el.name.match(/\d+/) || ['1'])[0], 10)
  const color = g.resolved ? '#10b981' : '#fb7185'
  const replies = g.replies || []
  return (
    <g>
      {/* marcador tipo chincheta */}
      <path d={`M ${g.x} ${g.y} C ${g.x - 13} ${g.y - 16}, ${g.x - 8} ${g.y - 26}, ${g.x} ${g.y - 26} C ${g.x + 8} ${g.y - 26}, ${g.x + 13} ${g.y - 16}, ${g.x} ${g.y} Z`}
        fill={color} stroke="rgba(24,24,27,0.5)" strokeWidth="0.8" />
      <circle cx={g.x} cy={g.y - 18} r="7.5" fill="rgba(24,24,27,0.85)" />
      <text x={g.x} y={g.y - 15} textAnchor="middle" fontSize="9" fontWeight="800" fill={color}>{idx}</text>
      <circle cx={g.x} cy={g.y} r="2" fill={color} />
      {/* burbuja de texto al hover (title nativo + texto bajo el pin) */}
      <g>
        <rect x={g.x + 8} y={g.y + 2} width={Math.min(190, 8 + g.text.length * 5.6)} height="14" rx="3" fill="rgba(24,24,27,0.88)" />
        <text x={g.x + 13} y={g.y + 12} fontSize="8.5" fill={color} fontWeight="600">
          {g.resolved ? '✓ ' : ''}{g.text.length > 34 ? `${g.text.slice(0, 33)}…` : g.text}
        </text>
      </g>
      {/* hilo de respuestas (conversación del pin) */}
      {replies.length > 0 && (
        <g>
          {replies.slice(-3).map((r, i) => {
            const yy = g.y + 18 + i * 12
            const line = `${i === 0 && replies.length > 3 ? '… ' : ''}${r.author}: ${r.text}`
            return (
              <g key={r.at + i}>
                <rect x={g.x + 8} y={yy - 9} width={Math.min(210, 10 + line.length * 4.6)} height="11.5" rx="3" fill="rgba(56,189,248,0.16)" stroke="rgba(56,189,248,0.45)" strokeWidth="0.6" />
                <text x={g.x + 13} y={yy - 1} fontSize="8" fill="#7dd3fc" fontWeight="600">
                  {line.length > 42 ? `${line.slice(0, 41)}…` : line}
                </text>
              </g>
            )
          })}
          <circle cx={g.x + 5} cy={g.y - 27} r="6.5" fill="#0ea5e9" stroke="rgba(24,24,27,0.6)" strokeWidth="0.8" />
          <text x={g.x + 5} y={g.y - 24} textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#e0f2fe">{replies.length}</text>
        </g>
      )}
      <circle className="jy-hover-ring" cx={g.x} cy={g.y - 18} r="12" fill="none" stroke="var(--jy-primary)" strokeWidth="1.8" />
    </g>
  )
}

// ---------------- UNDERLAY DE REFERENCIA (imagen / PDF) ----------------

function ImageNode({ el }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as ImageGeo
  const op = Math.min(1, Math.max(0.1, g.opacity ?? 0.85))
  return (
    <g>
      {/* la imagen vive debajo de los elementos: rectángulo con <image> + marco punteado */}
      <image
        href={g.src}
        x={g.x} y={g.y} width={g.w} height={g.h}
        opacity={op}
        preserveAspectRatio="none"
        style={{ imageRendering: 'auto' }}
      />
      <rect
        x={g.x} y={g.y} width={g.w} height={g.h}
        fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="8 5"
      />
      <text x={g.x + 6} y={g.y + 14} fontSize="9.5" fontWeight="700" fill="#64748b">
        {g.kind === 'pdf' ? `PDF ref. pág. ${g.page ?? 1}` : 'imagen de referencia'} · {(g.w / 60).toFixed(1)}×{(g.h / 60).toFixed(1)} m
      </text>
      <rect className="jy-hover-ring" x={g.x + 4} y={g.y + 4} width={Math.max(0, g.w - 8)} height={Math.max(0, g.h - 8)} fill="none" stroke="var(--jy-primary)" strokeWidth="1.6" rx="4" />
    </g>
  )
}

// ---------------- DETALLES CONSTRUCTIVOS (miniaturas de sección) ----------------

function DetailShape({ g }: { g: FurnGeo }) {
  const stroke = 'rgba(212,212,216,0.9)'
  const fill = 'rgba(161,161,170,0.16)'
  const hatch = 'rgba(161,161,170,0.5)'
  const { x, y, w, h } = g
  const L: React.ReactNode[] = []
  const line = (x1: number, y1: number, x2: number, y2: number, st = stroke, sw = 1.2, dash?: string) =>
    L.push(<line key={L.length} x1={x1} y1={y1} x2={x2} y2={y2} stroke={st} strokeWidth={sw} strokeDasharray={dash} />)
  const rect = (rx: number, ry: number, rw: number, rh: number, f = fill) =>
    L.push(<rect key={L.length} x={rx} y={ry} width={rw} height={rh} fill={f} stroke={stroke} strokeWidth="1.1" />)
  const txt = (tx: number, ty: number, t: string, size = 6.5) =>
    L.push(<text key={L.length} x={tx} y={ty} fontSize={size} fill="var(--jy-muted)" fontWeight="700" textAnchor="middle">{t}</text>)
  // hatch diagonal en un rect
  const hat = (rx: number, ry: number, rw: number, rh: number) => {
    for (let d = 0; d < rw + rh; d += 5) {
      const x0 = Math.max(rx, rx + d - rh), x1 = Math.min(rx + rw, rx + d)
      const y0 = Math.max(ry, ry + rw + rh - d - rh), y1 = Math.min(ry + rh, ry + rw + rh - d)
      if (x1 > x0 && y1 > y0) line(x0, y1, x1, y0, hatch, 0.7)
    }
  }
  const mid = x + w / 2
  switch (g.kind) {
    case 'det-cimiento': { // zapata corrida: T invertido + suelo
      const wallW = w * 0.32
      rect(mid - wallW / 2, y, wallW, h * 0.55); hat(mid - wallW / 2, y, wallW, h * 0.55)
      rect(x + w * 0.08, y + h * 0.55, w * 0.84, h * 0.3)
      line(x, y + h * 0.55, x + w, y + h * 0.55, stroke, 1.4)
      line(x, y + h * 0.9, x + w, y + h * 0.9, stroke, 1, '6 3') // N.P.T.
      txt(mid, y + h * 0.5, '0.40', 6)
      txt(mid, y + h - 3, 'N.P.T.', 5.5)
      break
    }
    case 'det-sobrecimiento': { // sobrecimiento con refuerzo
      rect(x + w * 0.25, y, w * 0.5, h * 0.5)
      rect(x + w * 0.12, y + h * 0.5, w * 0.76, h * 0.32)
      line(mid - w * 0.06, y + h * 0.18, mid + w * 0.06, y + h * 0.18, '#f59e0b', 1.6) // varilla
      circle: {
        L.push(<circle key={L.length} cx={mid} cy={y + h * 0.18} r="2.2" fill="none" stroke="#f59e0b" strokeWidth="1" />)
      }
      line(x, y + h * 0.82, x + w, y + h * 0.82, stroke, 1, '6 3')
      break
    }
    case 'det-muro-soga': { // elevación de aparejo a soga
      rect(x, y, w, h, 'rgba(180,83,9,0.14)')
      const bh = h / 6, bw = w / 4
      for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
        const off = r % 2 === 0 ? 0 : bw / 2
        L.push(<rect key={`b${r}-${c}`} x={x + c * bw + off} y={y + r * bh} width={bw} height={bh}
          fill="none" stroke="rgba(180,83,9,0.65)" strokeWidth="0.9" />)
      }
      txt(mid, y - 3, 'APAREJO A SOGA', 6)
      break
    }
    case 'det-muro-cabeza': {
      rect(x, y, w, h, 'rgba(180,83,9,0.14)')
      const bh = h / 4, bw = w / 6
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
        L.push(<rect key={`c${r}-${c}`} x={x + c * bw} y={y + r * bh} width={bw} height={bh}
          fill="none" stroke="rgba(180,83,9,0.65)" strokeWidth="0.9" />)
      }
      txt(mid, y - 3, 'APAREJO A CABEZA', 6)
      break
    }
    case 'det-junta': { // junta de dilatación con relleno
      rect(x, y + h * 0.2, w, h * 0.6, 'rgba(180,83,9,0.10)')
      line(mid, y + h * 0.2, mid, y + h * 0.8, '#ef4444', 2)
      line(mid - 5, y + h * 0.2, mid - 5, y + h * 0.8, hatch, 1, '3 2')
      line(mid + 5, y + h * 0.2, mid + 5, y + h * 0.8, hatch, 1, '3 2')
      txt(mid, y + 12, 'JUNTA', 6)
      txt(mid, y + h - 4, 'SELLO ELÁSTICO', 5)
      break
    }
    case 'det-derrame': { // derrame de ventana: marco + inclinación
      rect(x + w * 0.15, y + h * 0.15, w * 0.7, h * 0.7, 'rgba(56,189,248,0.10)')
      line(x + w * 0.15, y + h * 0.85, x + w * 0.85, y + h * 0.72, stroke, 2) // derrame inclinado
      line(x + w * 0.05, y + h * 0.9, x + w * 0.95, y + h * 0.9, stroke, 1, '4 3')
      txt(mid, y + h * 0.55, 'VIDRIO', 5.5)
      txt(mid, y + h - 6, 'PEND. 8%', 5.5)
      break
    }
    case 'det-losa': { // losa aligerada: viguetas + ladrillitos
      rect(x, y, w, h * 0.4, 'rgba(82,82,91,0.2)') // losa superior
      const nv = 5
      for (let i = 0; i < nv; i++) {
        const vx = x + (w / nv) * (i + 0.5)
        rect(x + (w / nv) * i + 3, y + h * 0.4, w / nv - 6, h * 0.35, 'rgba(180,83,9,0.16)') // ladrillo techo
        line(vx, y + h * 0.4, vx, y + h * 0.75, stroke, 1) // vigueta
      }
      rect(x, y + h * 0.75, w, h * 0.15, 'rgba(82,82,91,0.2)') // losa inferior
      txt(mid, y + h * 0.3, 'e=0.20', 6)
      break
    }
    case 'det-escalera': { // sección de escalera: peldaños
      const n = 7
      for (let i = 0; i < n; i++) {
        const sx = x + (w / n) * i, sy = y + h - (h / n) * i
        line(sx, sy, sx + w / n, sy, stroke, 1.6)
        line(sx + w / n, sy, sx + w / n, sy - h / n, stroke, 1.6)
      }
      line(x, y + h, x + w, y + h, hatch, 1, '6 3')
      txt(x + w * 0.2, y + 8, 'CH 0.17', 6)
      txt(x + w * 0.72, y + 8, 'H 0.29', 6)
      break
    }
    case 'det-tuboagua': { // detalle tubería de agua
      L.push(<circle key="t1" cx={mid} cy={y + h / 2} r={Math.min(w, h) * 0.32} fill="rgba(56,189,248,0.12)" stroke="#38bdf8" strokeWidth="1.6" />)
      L.push(<circle key="t2" cx={mid} cy={y + h / 2} r={Math.min(w, h) * 0.18} fill="none" stroke="#38bdf8" strokeWidth="1.2" />)
      txt(mid, y + h - 4, 'Ø 1/2"', 6)
      break
    }
    case 'det-tubodesague': {
      L.push(<circle key="d1" cx={mid} cy={y + h / 2} r={Math.min(w, h) * 0.32} fill="rgba(180,83,9,0.14)" stroke="#b45309" strokeWidth="1.6" />)
      line(mid - Math.min(w, h) * 0.14, y + h / 2 - Math.min(w, h) * 0.14, mid + Math.min(w, h) * 0.14, y + h / 2 + Math.min(w, h) * 0.14, '#b45309', 1.2)
      line(mid + Math.min(w, h) * 0.14, y + h / 2 - Math.min(w, h) * 0.14, mid - Math.min(w, h) * 0.14, y + h / 2 + Math.min(w, h) * 0.14, '#b45309', 1.2)
      txt(mid, y + h - 4, 'Ø 2" 1.5%', 6)
      break
    }
    default:
      rect(x, y, w, h)
  }
  return (
    <g>
      {L}
      <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} fill="none" stroke="rgba(212,212,216,0.25)" strokeWidth="0.8" rx="3" />
    </g>
  )
}
