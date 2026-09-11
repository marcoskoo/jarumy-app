'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useJarumy, type HoverInfo } from '@/lib/store'
import type { PlanElement } from '@/lib/plan-data'
import { VIEW_W, VIEW_H, PX_PER_M, elementSummary } from '@/lib/plan-data'
import { PlanElementNode } from './ElementRenderers'
import RadialMenu from './RadialMenu'
import { ToolIcon } from './ToolIcon'
import type { ToolAction } from '@/lib/tools-data'

const uid = () => `usr-${Math.random().toString(36).slice(2, 9)}`

export default function PlanCanvas() {
  const s = useJarumy()
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [size, setSize] = useState({ w: 900, h: 600 })
  const coordsRef = useRef<HTMLSpanElement>(null)
  const moveTargetRef = useRef<string | null>(null)
  const [hint, setHint] = useState(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    const t = setTimeout(() => setHint(false), 6000)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [])

  // ---------- ajuste inicial y a petición ----------
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || size.w < 50 || size.h < 50) return
    fitted.current = true
    const z = Math.min(size.w / VIEW_W, size.h / VIEW_H) * 0.97
    useJarumy.setState({
      zoom: z,
      panX: (size.w - VIEW_W * z) / 2,
      panY: (size.h - VIEW_H * z) / 2,
    })
  }, [size])

  useEffect(() => {
    if (!fitted.current || s.fitTick === 0) return
    const z = Math.min(size.w / VIEW_W, size.h / VIEW_H) * 0.97
    useJarumy.setState({
      zoom: z,
      panX: (size.w - VIEW_W * z) / 2,
      panY: (size.h - VIEW_H * z) / 2,
    })
  }, [s.fitTick])

  // ---------- conversión de coordenadas ----------
  const toSvg = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return [0, 0]
    const x = (clientX - rect.left - s.panX) / s.zoom
    const y = (clientY - rect.top - s.panY) / s.zoom
    return [x, y]
  }, [s.panX, s.panY, s.zoom])

  const snapPt = useCallback((p: [number, number]): [number, number] => {
    if (!s.snap) return p
    const g = s.gridSpacing
    return [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g]
  }, [s.snap, s.gridSpacing])

  const orthoPt = useCallback((p: [number, number], basePt?: number[]): [number, number] => {
    if (!s.ortho || !basePt || basePt.length < 2) return p
    const [bx, by] = basePt
    return Math.abs(p[0] - bx) >= Math.abs(p[1] - by) ? [p[0], by] : [bx, p[1]]
  }, [s.ortho])

  // ---------- hover del menú radial ----------
  const requestHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => useJarumy.getState().setHovered(null), 300)
  }, [])

  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  const handleEnter = useCallback((el: PlanElement) => {
    const st = useJarumy.getState()
    cancelHide()
    if (!st.radialEnabled || st.drawTool) return
    const h: HoverInfo = {
      id: el.id, type: el.type, name: el.name, layer: el.layer,
      cx: mouseRef.current.x, cy: mouseRef.current.y,
    }
    st.setHovered(h)
  }, [cancelHide])

  const handleLeave = useCallback(() => {
    if (useJarumy.getState().drawTool) return
    requestHide()
  }, [requestHide])

  const handleDownEl = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // ---------- clic sobre un elemento ----------
  const handleClickEl = useCallback((el: PlanElement) => {
    const st = useJarumy.getState()
    st.setSelected(el.id)
    if (st.drawTool === 'borrar') {
      st.applyEffect(el.id, 'delete')
      return
    }
    if (st.drawTool === 'copiar') {
      st.applyEffect(el.id, 'duplicate')
      return
    }
    if (st.drawTool === 'mover') {
      moveTargetRef.current = el.id
      st.pushConsole({ text: `MOVER: ${el.name} — ahora clic en el punto destino`, kind: 'cmd' })
      return
    }
    // móvil: mostrar menú radial al tocar
    if (!st.hovered || st.hovered.id !== el.id) {
      handleEnter(el)
    }
  }, [handleEnter])

  // ---------- clic sobre el lienzo (herramientas de dibujo) ----------
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const st = useJarumy.getState()
    const raw = toSvg(e.clientX, e.clientY)
    if (!st.drawTool) { st.setHovered(null); return }
    const p = snapPt(raw)

    if (st.drawTool === 'mover') {
      if (moveTargetRef.current) {
        const el = st.elements.find((x) => x.id === moveTargetRef.current)
        if (el) {
          const g = el.geo as { x?: number; y?: number; pts?: number[][]; cx?: number; cy?: number }
          let ox = 0, oy = 0
          if (g.pts?.length) { ox = g.pts[0][0]; oy = g.pts[0][1] }
          else if (g.cx !== undefined) { ox = g.cx; oy = g.cy || 0 }
          else { ox = g.x || 0; oy = g.y || 0 }
          st.applyEffect(el.id, 'translate', `${p[0] - ox},${p[1] - oy}`)
          st.pushConsole({ text: `MOVER: ${el.name} desplazado`, kind: 'out' })
        }
        moveTargetRef.current = null
        st.armDraw(null)
      }
      return
    }

    if (st.drawTool.startsWith('ins:')) {
      st.insertBlock(st.drawTool.slice(4), p[0], p[1])
      st.armDraw(null)
      return
    }

    switch (st.drawTool) {
      case 'linea':
      case 'rectangulo':
      case 'cota': {
        const pts = [...st.drawPts, p]
        if (pts.length === 2) {
          const [a, b] = [pts[0], orthoPt(pts[1], pts[0])]
          const newEl: PlanElement = st.drawTool === 'cota'
            ? { id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Cota', geo: { kind: 'cota', pts: [a, b] } }
            : { id: uid(), type: 'dibujo', layer: 'dibujo', name: st.drawTool === 'linea' ? 'Línea' : 'Rectángulo', geo: { kind: st.drawTool, pts: [a, b] } }
          useJarumy.setState((prev) => ({
            undoStack: [...prev.undoStack.slice(-29), { elements: JSON.parse(JSON.stringify(prev.elements)), mods: JSON.parse(JSON.stringify(prev.mods)), gridSpacing: prev.gridSpacing }],
            elements: [...prev.elements, newEl],
            drawPts: [],
          }))
        } else {
          st.addDrawPoint(p)
        }
        break
      }
      case 'circulo': {
        if (st.drawPts.length === 0) {
          st.addDrawPoint(p)
        } else {
          const [cx, cy] = st.drawPts[0]
          const r = Math.max(6, Math.hypot(p[0] - cx, p[1] - cy))
          const newEl: PlanElement = { id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Círculo', geo: { kind: 'circulo', pts: [[cx, cy]], r } }
          useJarumy.setState((prev) => ({
            undoStack: [...prev.undoStack.slice(-29), { elements: JSON.parse(JSON.stringify(prev.elements)), mods: JSON.parse(JSON.stringify(prev.mods)), gridSpacing: prev.gridSpacing }],
            elements: [...prev.elements, newEl],
            drawPts: [],
          }))
        }
        break
      }
      case 'polilinea':
        st.addDrawPoint(p)
        break
      case 'texto': {
        if (typeof window !== 'undefined') {
          const t = window.prompt('Texto a insertar:')
          if (t) {
            const newEl: PlanElement = { id: uid(), type: 'dibujo', layer: 'dibujo', name: `Texto: ${t}`, geo: { kind: 'texto', pts: [p], text: t } }
            useJarumy.setState((prev) => ({ elements: [...prev.elements, newEl] }))
          }
        }
        st.armDraw(null)
        break
      }
      default:
        break
    }
  }, [toSvg, snapPt, orthoPt])

  // ---------- zoom y paneo ----------
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const st = useJarumy.getState()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.12 : 0.89
    const newZoom = Math.min(6, Math.max(0.25, st.zoom * factor))
    const k = newZoom / st.zoom
    useJarumy.setState({
      zoom: newZoom,
      panX: cx - (cx - st.panX) * k,
      panY: cy - (cy - st.panY) * k,
    })
  }, [])

  const onBgDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const st = useJarumy.getState()
    if (st.drawTool) return
    panRef.current = { x: e.clientX, y: e.clientY, px: s.panX, py: s.panY }
    setDragging(true)
  }, [s.panX, s.panY])

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        const sv = toSvg(e.clientX, e.clientY)
        if (coordsRef.current) {
          coordsRef.current.textContent = `X ${(sv[0] / PX_PER_M).toFixed(2)}   Y ${(sv[1] / PX_PER_M).toFixed(2)} m`
        }
      }
      if (panRef.current) {
        useJarumy.setState({
          panX: panRef.current.px + (e.clientX - panRef.current.x),
          panY: panRef.current.py + (e.clientY - panRef.current.y),
        })
      }
    }
    const up = () => { panRef.current = null; setDragging(false) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [toSvg])

  // ESC cancela herramienta / cierra menú
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const st = useJarumy.getState()
        if (st.drawTool) st.armDraw(null)
        st.setHovered(null)
      }
      if (e.key === 'Enter' && useJarumy.getState().drawTool === 'polilinea') {
        useJarumy.getState().finishPolyline()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // ---------- render de capas ----------
  const visibleLayers = new Set(s.layers.filter((l) => l.visible).map((l) => l.id))
  const zOrder: Record<string, number> = {
    espacio: 0, muro: 1, columna: 2, apertura: 3, puerta: 4, ventana: 5,
    mobiliario: 6, sanitario: 6, cota: 7, texto: 8, dibujo: 9,
  }
  const sorted = [...s.elements].sort((a, b) => (zOrder[a.type] ?? 5) - (zOrder[b.type] ?? 5))

  const hoverEl = s.hovered ? s.elements.find((e) => e.id === s.hovered!.id) : null

  const onRadialAction = useCallback((action: ToolAction) => {
    const st = useJarumy.getState()
    st.executeAction(action, st.hovered?.id || null)
  }, [])

  const gridId = 'jygrid'
  const cursorStyle = s.drawTool ? 'crosshair' : dragging ? 'grabbing' : 'default'
  const geometricTool = !!s.drawTool &&
    !['borrar', 'copiar', 'mover'].includes(s.drawTool)

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden jy-viewport jy-3d-stage select-none"
      onWheel={onWheel}
      onMouseDown={onBgDown}
      style={{ cursor: cursorStyle }}
    >
      {/* ---------- transformación de vista ---------- */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate(${s.panX}px, ${s.panY}px) scale(${s.zoom})`,
          transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div className={s.view3D ? 'jy-3d' : 'jy-3d-off'}>
          <svg
            width={VIEW_W} height={VIEW_H}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className={`${s.renderMode ? 'jy-svg-render ' : ''}${geometricTool ? 'jy-geo-draw' : ''}`}
            onClick={handleCanvasClick}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (useJarumy.getState().drawTool === 'polilinea') useJarumy.getState().finishPolyline()
            }}
            style={{ background: 'transparent' }}
          >
            <defs>
              <pattern id={gridId} width={s.gridSpacing} height={s.gridSpacing} patternUnits="userSpaceOnUse">
                <path d={`M ${s.gridSpacing} 0 L 0 0 0 ${s.gridSpacing}`} fill="none" stroke="rgba(245,158,11,0.13)" strokeWidth="0.7" />
              </pattern>
            </defs>

            {/* lámina (fondo interactivo) */}
            <g className="jy-el" onMouseEnter={() => handleEnter({ id: 'lamina', type: 'lamina', layer: 'textos', name: 'Lámina A-01', geo: {} })} onMouseLeave={handleLeave}>
              <rect x="16" y="14" width="1168" height="792" fill="none" stroke="var(--jy-muted)" strokeWidth="1.2" opacity="0.55" />
              <rect x="26" y="24" width="1148" height="772" fill="none" stroke="var(--jy-muted)" strokeWidth="0.6" opacity="0.3" />
              <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="transparent" />
            </g>

            {/* rejilla */}
            {s.showGrid && <rect x="150" y="100" width="900" height="600" fill={`url(#${gridId})`} pointerEvents="none" />}

            {/* elementos por capas */}
            {sorted.map((el) =>
              visibleLayers.has(el.layer) ? (
                <PlanElementNode
                  key={el.id}
                  el={el}
                  mod={s.mods[el.id]}
                  handlers={{
                    onEnter: handleEnter, onLeave: handleLeave,
                    onClickEl: handleClickEl, onDownEl: handleDownEl,
                  }}
                />
              ) : null
            )}

            {/* vista previa de dibujo */}
            {s.drawTool && s.drawPts.length > 0 && (() => {
              const base = s.drawPts[s.drawPts.length - 1]
              const cur = orthoPt(snapPt(s.cursorSvg), base)
              const dash = { stroke: '#f59e0b', strokeWidth: 1.6, strokeDasharray: '6 4', fill: 'none' } as const
              if (s.drawTool === 'circulo') {
                return <circle cx={base[0]} cy={base[1]} r={Math.max(4, Math.hypot(cur[0] - base[0], cur[1] - base[1]))} {...dash} />
              }
              if (s.drawTool === 'polilinea') {
                return <polyline points={[...s.drawPts, cur].map((p) => p.join(',')).join(' ')} {...dash} />
              }
              if (s.drawTool === 'rectangulo') {
                return <rect x={Math.min(base[0], cur[0])} y={Math.min(base[1], cur[1])}
                  width={Math.abs(cur[0] - base[0])} height={Math.abs(cur[1] - base[1])} {...dash} />
              }
              if (s.drawTool === 'cota') {
                return <g>
                  <line x1={base[0]} y1={base[1]} x2={cur[0]} y2={cur[1]} {...dash} />
                  <text x={(base[0] + cur[0]) / 2} y={Math.min(base[1], cur[1]) - 8} textAnchor="middle" fontSize="12" fill="#f59e0b">
                    {(Math.hypot(cur[0] - base[0], cur[1] - base[1]) / PX_PER_M).toFixed(2)} m
                  </text>
                </g>
              }
              return <line x1={base[0]} y1={base[1]} x2={cur[0]} y2={cur[1]} {...dash} />
            })()}

            {/* rosa de los vientos + escala */}
            <g pointerEvents="none" opacity="0.9">
              <circle cx="1128" cy="150" r="27" fill="none" stroke="var(--jy-muted)" strokeWidth="1.2" />
              <path d="M 1128 126 L 1136 154 L 1128 148 L 1120 154 Z" fill="var(--jy-muted)" />
              <text x="1128" y="118" textAnchor="middle" fontSize="13" fontWeight="800" style={{ fill: 'var(--jy-muted)' }}>N</text>
              <g>
                <rect x="940" y="748" width="180" height="10" fill="none" stroke="var(--jy-muted)" strokeWidth="1" />
                {[0, 1, 2, 3].map((i) => (
                  <rect key={i} x={940 + i * 45} y="748" width={i % 2 === 0 ? 45 : 45} height="10"
                    fill={i % 2 === 0 ? 'var(--jy-muted)' : 'none'} stroke="var(--jy-muted)" strokeWidth="1" />
                ))}
                <text x="940" y="742" fontSize="9" style={{ fill: 'var(--jy-muted)' }}>0</text>
                <text x="1120" y="742" fontSize="9" style={{ fill: 'var(--jy-muted)' }}>3 m</text>
              </g>
              {/* cajetín */}
              <g>
                <rect x="920" y="770" width="264" height="34" fill="none" stroke="var(--jy-muted)" strokeWidth="1" opacity="0.7" />
                <line x1="920" y1="787" x2="1184" y2="787" stroke="var(--jy-muted)" strokeWidth="0.6" opacity="0.5" />
                <text x="928" y="782" fontSize="10" fontWeight="700" style={{ fill: 'var(--jy-muted)' }}>JARUMY APP</text>
                <text x="928" y="798" fontSize="8.5" style={{ fill: 'var(--jy-muted)' }}>PROY.: VIVIENDA UNIFAMILIAR · J. BURGA</text>
                <text x="1176" y="798" fontSize="8.5" textAnchor="end" style={{ fill: 'var(--jy-muted)' }}>A-01</text>
              </g>
            </g>
          </svg>
        </div>
      </div>

      {/* ---------- menú radial contextual ---------- */}
      {s.hovered && !s.drawTool && hoverEl && (
        <div
          onMouseEnter={cancelHide}
          onMouseLeave={requestHide}
        >
          <RadialMenu
            hover={s.hovered}
            containerW={size.w}
            containerH={size.h}
            elementName={`${hoverEl.name} — ${elementSummary(hoverEl)}`}
            onAction={onRadialAction}
            onClose={() => s.setHovered(null)}
          />
        </div>
      )}
      {s.hovered && !s.drawTool && !hoverEl && s.hovered.type === 'lamina' && (
        <div onMouseEnter={cancelHide} onMouseLeave={requestHide}>
          <RadialMenu
            hover={s.hovered}
            containerW={size.w}
            containerH={size.h}
            elementName="Lámina A-01 · Esc. 1:60 · Unidades métricas"
            onAction={onRadialAction}
            onClose={() => s.setHovered(null)}
          />
        </div>
      )}

      {/* ---------- indicador de herramienta activa ---------- */}
      {s.drawTool && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full border border-amber-500/50 bg-zinc-950/90 px-4 py-1.5 shadow-lg jy-pop-in">
          <ToolIcon name="PencilRuler" className="text-amber-400" size={14} />
          <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">
            {s.drawTool.startsWith('ins:') ? `Insertar: ${s.drawTool.slice(4)}` : s.drawTool}
          </span>
          <span className="text-[10px] text-zinc-400">
            {s.drawTool === 'borrar' || s.drawTool === 'copiar' || s.drawTool === 'mover'
              ? 'clic en el objeto' : 'clic en el plano'}
          </span>
          <button
            onClick={() => s.armDraw(null)}
            className="ml-1 rounded-full p-0.5 text-zinc-400 hover:text-amber-300"
            title="Salir (ESC)"
          >
            <ToolIcon name="X" size={13} />
          </button>
        </div>
      )}

      {/* ---------- pista inicial ---------- */}
      {hint && !s.drawTool && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 jy-pulse rounded-full border border-amber-500/40 bg-zinc-950/85 px-5 py-2 text-center jy-pop-in">
          <span className="text-[11.5px] font-semibold text-amber-200">
            Pase el cursor sobre cualquier parte del plano — aparecerá el círculo de herramientas
          </span>
        </div>
      )}

      {/* ---------- controles de zoom ---------- */}
      <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1">
        {[
          { icon: 'Maximize2', title: 'Acercar', fn: () => s.zoomBy(1.25) },
          { icon: 'Minimize', title: 'Alejar', fn: () => s.zoomBy(0.8) },
          { icon: 'Frame', title: 'Ajustar a lámina', fn: () => s.fitView() },
        ].map((b) => (
          <button key={b.title} title={b.title} onClick={b.fn}
            className="w-9 h-9 rounded-lg border jy-border jy-bg2 jy-text hover:border-amber-500/60 hover:text-amber-300 flex items-center justify-center transition-colors shadow-lg">
            <ToolIcon name={b.icon} size={15} />
          </button>
        ))}
      </div>

      {/* ---------- lectura de coordenadas ---------- */}
      <div className="absolute bottom-3 left-3 z-20 rounded-md border jy-border jy-bg2 px-2.5 py-1 shadow-lg">
        <span ref={coordsRef} className="text-[10.5px] font-mono jy-muted">X 0.00 Y 0.00 m</span>
      </div>

      {/* ---------- modo ---------- */}
      {(s.renderMode || s.view3D) && (
        <div className="absolute top-3 left-3 z-20 flex gap-1.5">
          {s.renderMode && (
            <span className="rounded-full border border-orange-400/50 bg-orange-500/15 px-3 py-1 text-[10px] font-bold text-orange-300 uppercase tracking-wider">
              Render V-Ray
            </span>
          )}
          {s.view3D && (
            <span className="rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
              Vista 3D
            </span>
          )}
        </div>
      )}
    </div>
  )
}
