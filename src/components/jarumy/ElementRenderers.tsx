'use client'

import React from 'react'
import type { PlanElement } from '@/lib/plan-data'
import type { WallGeo, DoorGeo, WindowGeo, RoomGeo, FurnGeo, DimGeo, TextGeo, ColGeo, OpenGeo, DrawGeo } from '@/lib/plan-data'
import { roomAreaM2 } from '@/lib/plan-data'
import type { Mod } from '@/lib/store'

export interface ElHandlers {
  onClickEl: (el: PlanElement) => void
  onDownEl: (e: React.MouseEvent) => void
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
  switch (el.type) {
    case 'muro': { const g = el.geo as WallGeo; return [(g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2] }
    case 'puerta': { const g = el.geo as DoorGeo; const [px, py] = polar(g.cx, g.cy, g.r, g.a0); return [(g.cx + px) / 2, (g.cy + py) / 2] }
    case 'ventana': { const g = el.geo as WindowGeo; return g.orient === 'h' ? [g.x + g.len / 2, g.y] : [g.x, g.y + g.len / 2] }
    case 'espacio': { const g = el.geo as RoomGeo; return [g.x + g.w / 2, g.y + g.h / 2] }
    case 'columna': { const g = el.geo as ColGeo; return [g.x, g.y] }
    case 'cota': { const g = el.geo as DimGeo; return [(g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2] }
    case 'texto': { const g = el.geo as TextGeo; return [g.x, g.y] }
    case 'apertura': { const g = el.geo as OpenGeo; return g.orient === 'h' ? [g.x + g.len / 2, g.y] : [g.x, g.y + g.len / 2] }
    default: {
      const g = el.geo as FurnGeo & DrawGeo
      if (g.pts && g.pts.length) {
        const xs = g.pts.map((p) => p[0]), ys = g.pts.map((p) => p[1])
        let cx = (Math.min(...xs) + Math.max(...xs)) / 2
        let cy = (Math.min(...ys) + Math.max(...ys)) / 2
        if (g.kind === 'circulo') { cx = g.pts[0][0]; cy = g.pts[0][1] }
        return [cx, cy]
      }
      return [g.x + (g.w || 0) / 2, g.y + (g.h || 0) / 2]
    }
  }
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
    onMouseDown: (e: React.MouseEvent) => { e.stopPropagation(); handlers.onDownEl(e) },
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
    default: content = <DibujoNode el={el} mod={mod} />; break
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
    <g>
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

// ---------------- MURO ----------------

function Wall({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as WallGeo
  const t = mod?.thickness ?? g.t
  const fill = mod?.material || '#3f3f46'
  const x = Math.min(g.x1, g.x2), y = Math.min(g.y1, g.y2)
  const w = g.x1 === g.x2 ? t : Math.abs(g.x2 - g.x1)
  const h = g.y1 === g.y2 ? t : Math.abs(g.y2 - g.y1)
  const vertical = g.x1 === g.x2
  const rx = Math.min(g.x1, g.x2) - (vertical ? t / 2 : 0)
  const ry = Math.min(g.y1, g.y2) - (vertical ? 0 : t / 2)
  return (
    <g className="jy-wall-face">
      <rect x={rx} y={ry} width={w} height={h} fill={fill} stroke="rgba(0,0,0,0.5)" strokeWidth="0.6" />
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

  // hoja y arco según giro
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
  const g = el.geo as DimGeo
  const horizontal = Math.abs(g.x2 - g.x1) >= Math.abs(g.y2 - g.y1)
  const prec = mod?.precision ?? 2
  const value = (mod?.dimOverride && mod.dimOverride !== '') ? mod.dimOverride
    : `${(Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / 60).toFixed(prec)}`
  const stroke = 'var(--jy-primary)'
  const tick = (x: number, y: number, dx: number, dy: number) => (
    <line x1={x - 4 * dx} y1={y - 4 * dy} x2={x + 4 * dx} y2={y + 4 * dy} stroke={stroke} strokeWidth="1.6" />
  )

  if (horizontal) {
    const dy = g.y1 + g.offset
    const ext = g.offset < 0 ? -1 : 1
    return (
      <g>
        <line x1={g.x1} y1={g.y1 + ext * 3} x2={g.x1} y2={dy - ext * 3} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
        <line x1={g.x2} y1={g.y2 + ext * 3} x2={g.x2} y2={dy - ext * 3} stroke={stroke} strokeWidth="0.8" opacity="0.6" />
        <line x1={g.x1} y1={dy} x2={g.x2} y2={dy} stroke={stroke} strokeWidth="1.1" />
        {tick(g.x1, dy, 1, 0.55)}{tick(g.x2, dy, 1, 0.55)}
        <text x={(g.x1 + g.x2) / 2} y={dy - 5} textAnchor="middle" fontSize="12" fontWeight="700"
          style={{ fill: stroke }}>
          {value} m
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
      <text x={dx - 5} y={(g.y1 + g.y2) / 2} textAnchor="middle" fontSize="12" fontWeight="700"
        style={{ fill: stroke }} transform={`rotate(-90 ${dx - 5} ${(g.y1 + g.y2) / 2})`}>
        {value} m
      </text>
      <rect className="jy-hover-ring" x={Math.min(dx, g.x1) - 14} y={g.y1}
        width={Math.abs(dx - g.x1) + 26} height={g.y2 - g.y1} fill="none" stroke="var(--jy-primary)" strokeWidth="1.6" />
    </g>
  )
}

// ---------------- TEXTO ----------------

function TextNode({ el, mod }: { el: PlanElement; mod?: Mod }) {
  const g = el.geo as TextGeo
  return (
    <g>
      <text x={g.x} y={g.y} textAnchor={mod?.justify || g.anchor} fontSize={mod?.textHeight || g.size}
        fontWeight="600" style={{ fill: 'var(--jy-muted)', letterSpacing: '0.5px' }}>
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
          default:
            return <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="3" {...S} />
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
    default:
      return <g>{ring}</g>
  }
}
