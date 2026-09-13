'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { useJarumy, type HoverInfo } from '@/lib/store'
import type { PlanElement, DrawGeo } from '@/lib/plan-data'
import { VIEW_W, VIEW_H, PX_PER_M, elementSummary, BLOCK_LIBRARY, roomAreaM2, type RoomGeo, sampleArc3, sampleCatmullRom, scallopPts, pathFromPts, type HatchPattern } from '@/lib/plan-data'
import { PlanElementNode, FurnShape } from './ElementRenderers'
import RadialMenu from './RadialMenu'
import HeliodonLayer from './HeliodonLayer'
import AutoDimsLayer from './AutoDimsLayer'
import SunPanel from './SunPanel'
import { ToolIcon } from './ToolIcon'
import type { ToolAction } from '@/lib/tools-data'
import { autoDimensions } from '@/lib/auto-dims'
import { registerSvg } from '@/lib/raster-export'
import type { SymKind } from '@/lib/plan-data'

const uid = () => `usr-${Math.random().toString(36).slice(2, 9)}`

// herramientas de trazo multiclic (ENTER/doble clic/Terminar cierran el trazo)
const MULTI_FAMILY = ['polilinea', 'tuberia-agua', 'tuberia-desague', 'circuito', 'terreno', 'curvanivel', 'spline', 'nube', 'hatch']

export default function PlanCanvas() {
  const s = useJarumy()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const panRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const didPanRef = useRef(false)
  // false hasta que el usuario panea/zoomea a mano: permite re-ajustar la vista
  // automáticamente cuando cambia el tamaño del lienzo (rotación, teclado móvil)
  const userNavRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [size, setSize] = useState({ w: 900, h: 600 })
  const coordsRef = useRef<HTMLSpanElement>(null)
  const moveTargetRef = useRef<string | null>(null)
  const trimTargetRef = useRef<string | null>(null)
  const extendTargetRef = useRef<string | null>(null)
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

  // registra el <svg> vivo para exportación PNG/SVG rápida
  useEffect(() => {
    registerSvg(svgRef.current)
    return () => registerSvg(null)
  }, [])

  // ---------- ajuste inicial y a petición ----------
  const fitted = useRef(false)
  useEffect(() => {
    if (size.w < 50 || size.h < 50) return
    // primer ajuste o re-ajuste automático (mientras el usuario no haya navegado)
    if (fitted.current && userNavRef.current) return
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

  // ---------- menú radial: se abre con clic y permanece hasta cerrarlo ----------
  const openRadial = useCallback((el: PlanElement) => {
    const st = useJarumy.getState()
    if (!st.radialEnabled || st.drawTool) return
    const h: HoverInfo = {
      id: el.id, type: el.type, name: el.name, layer: el.layer,
      cx: mouseRef.current.x, cy: mouseRef.current.y,
    }
    st.setHovered(h)
  }, [])

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
    // RECORTA: 1er clic = línea objetivo · 2º clic sobre la misma línea = tramo a eliminar
    if (st.drawTool === 'recorta') {
      const isLine = el.type === 'dibujo' && (el.geo as DrawGeo).kind === 'linea'
      if (!trimTargetRef.current) {
        if (!isLine) {
          st.pushConsole({ text: 'RECORTA: seleccione una LÍNEA (use EXPLOTA antes si es polilínea)', kind: 'err' })
          return
        }
        trimTargetRef.current = el.id
        st.pushConsole({ text: `RECORTA: ${el.name} — ahora clic sobre el tramo a eliminar`, kind: 'cmd' })
        return
      }
      if (el.id === trimTargetRef.current) {
        const pt = toSvg(mouseRef.current.x, mouseRef.current.y)
        st.applyEffect(el.id, 'trimAt', `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`)
        trimTargetRef.current = null
        st.armDraw(null)
        return
      }
      trimTargetRef.current = el.id
      st.pushConsole({ text: `RECORTA: objetivo cambiado a ${el.name} — clic sobre el tramo a eliminar`, kind: 'cmd' })
      return
    }
    // ALARGA: 1er clic = línea a extender · 2º clic = elemento límite
    if (st.drawTool === 'alarga') {
      if (!extendTargetRef.current) {
        const isLine = el.type === 'dibujo' && (el.geo as DrawGeo).kind === 'linea'
        if (!isLine) {
          st.pushConsole({ text: 'ALARGA: seleccione una LÍNEA a extender', kind: 'err' })
          return
        }
        extendTargetRef.current = el.id
        st.pushConsole({ text: `ALARGA: ${el.name} — ahora clic en el elemento LÍMITE`, kind: 'cmd' })
        return
      }
      if (el.id === extendTargetRef.current) {
        st.pushConsole({ text: 'ALARGA: elija un elemento límite DISTINTO de la línea', kind: 'err' })
        return
      }
      st.applyEffect(extendTargetRef.current, 'extendTo', el.id)
      extendTargetRef.current = null
      st.armDraw(null)
      return
    }
    if (st.drawTool === 'mover') {
      moveTargetRef.current = el.id
      st.pushConsole({ text: `MOVER: ${el.name} — ahora clic en el punto destino`, kind: 'cmd' })
      return
    }
    // sin herramienta activa: el clic abre el menú radial (o lo cierra si ya estaba abierto)
    if (!st.drawTool) {
      if (st.hovered?.id === el.id) st.setHovered(null)
      else openRadial(el)
    }
  }, [openRadial, toSvg])

  // ---------- clic sobre el lienzo (herramientas de dibujo) ----------
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const st = useJarumy.getState()
    // ignorar el clic que sigue a un paneo (arrastre)
    if (didPanRef.current) { didPanRef.current = false; return }
    if (!st.drawTool) {
      // sin herramienta: clic en zona vacía → cierra el menú abierto o abre el menú de la lámina
      if (st.hovered) { st.setHovered(null); return }
      if (st.radialEnabled) {
        st.setHovered({
          id: 'lamina', type: 'lamina', layer: 'textos', name: 'Lámina A-01',
          cx: mouseRef.current.x, cy: mouseRef.current.y,
        })
      }
      return
    }
    const raw = toSvg(e.clientX, e.clientY)
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

    // símbolos de instalación: un clic coloca el símbolo
    if (st.drawTool.startsWith('simbolo:')) {
      const kind = st.drawTool.slice(8) as SymKind
      const names: Record<string, string> = {
        'luz': 'Luminaria', 'tomacorriente': 'Tomacorriente', 'interruptor': 'Interruptor',
        'tablero': 'Tablero eléctrico', 'punto-agua': 'Punto de agua', 'punto-desague': 'Punto de desagüe', 'medidor-agua': 'Medidor de agua',
      }
      useJarumy.setState((prev) => ({
        undoStack: [...prev.undoStack.slice(-29), { elements: JSON.parse(JSON.stringify(prev.elements)), mods: JSON.parse(JSON.stringify(prev.mods)), gridSpacing: prev.gridSpacing }],
        elements: [...prev.elements, {
          id: uid(), type: 'simbolo', layer: 'instalaciones',
          name: names[kind] || kind, geo: { kind, x: p[0], y: p[1] },
        }],
      }))
      st.pushConsole({ text: `SÍMBOLO colocado: ${names[kind] || kind} (capa Instalaciones)`, kind: 'out' })
      st.armDraw(null)
      return
    }

    // pin de comentario: clic + texto
    if (st.drawTool === 'pin') {
      const text = typeof window !== 'undefined' ? window.prompt('Texto del comentario:', '') : null
      if (text && text.trim()) st.insertPin(p[0], p[1], text.trim())
      else st.armDraw(null)
      if (text && text.trim()) st.armDraw(null)
      return
    }

    switch (st.drawTool) {
      case 'linea':
      case 'rectangulo':
      case 'cota': {
        const pts = [...st.drawPts, p]
        if (pts.length === 2) {
          const [a, b] = [pts[0], orthoPt(pts[1] as [number, number], pts[0] as [number, number])]
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
      case 'tuberia-agua':
      case 'tuberia-desague':
      case 'circuito':
      case 'terreno':
      case 'curvanivel':
      case 'spline':
      case 'nube':
      case 'hatch':
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
      case 'punto': {
        const newEl: PlanElement = { id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Punto', geo: { kind: 'punto', pts: [[p[0], p[1]]] } }
        useJarumy.setState((prev) => ({
          undoStack: [...prev.undoStack.slice(-29), { elements: JSON.parse(JSON.stringify(prev.elements)), mods: JSON.parse(JSON.stringify(prev.mods)), gridSpacing: prev.gridSpacing }],
          elements: [...prev.elements, newEl],
          drawPts: [],
        }))
        st.pushConsole({ text: 'PUNTO colocado (marca de referencia)', kind: 'out' })
        break
      }
      case 'arco': {
        // 3 clics: inicio · punto por donde pasa el arco · fin
        const pts = [...st.drawPts, p]
        if (pts.length === 3) {
          const newEl: PlanElement = { id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Arco', geo: { kind: 'arco', pts: [[pts[0][0], pts[0][1]], [pts[1][0], pts[1][1]], [pts[2][0], pts[2][1]]] } }
          useJarumy.setState((prev) => ({
            undoStack: [...prev.undoStack.slice(-29), { elements: JSON.parse(JSON.stringify(prev.elements)), mods: JSON.parse(JSON.stringify(prev.mods)), gridSpacing: prev.gridSpacing }],
            elements: [...prev.elements, newEl],
            drawPts: [],
          }))
          st.pushConsole({ text: `ARCO creado por 3 puntos (${(Math.hypot(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1]) / PX_PER_M).toFixed(2)} m de cuerda)`, kind: 'out' })
        } else {
          st.addDrawPoint(p)
        }
        break
      }
      case 'elipse': {
        // 2 clics: centro + vértice (rx/ry independientes con ORTO desactivado)
        if (st.drawPts.length === 0) {
          st.addDrawPoint(p)
        } else {
          const [cx, cy] = st.drawPts[0]
          const rx = Math.max(6, Math.abs(p[0] - cx))
          const ry = Math.max(6, Math.abs(p[1] - cy))
          const newEl: PlanElement = { id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Elipse', geo: { kind: 'elipse', pts: [[cx, cy]], rx, ry } }
          useJarumy.setState((prev) => ({
            undoStack: [...prev.undoStack.slice(-29), { elements: JSON.parse(JSON.stringify(prev.elements)), mods: JSON.parse(JSON.stringify(prev.mods)), gridSpacing: prev.gridSpacing }],
            elements: [...prev.elements, newEl],
            drawPts: [],
          }))
          st.pushConsole({ text: `ELIPSE creada — eje mayor ${(Math.max(rx, ry) * 2 / PX_PER_M).toFixed(2)} m × eje menor ${(Math.min(rx, ry) * 2 / PX_PER_M).toFixed(2)} m`, kind: 'out' })
        }
        break
      }
      case 'directriz': {
        // 2 clics + texto: flecha → codo → rótulo
        if (st.drawPts.length === 0) {
          st.addDrawPoint(p)
        } else {
          const a = st.drawPts[0] as [number, number]
          const t = typeof window !== 'undefined' ? window.prompt('Texto de la directriz:', 'UMBRAL GRANITO NEGRO PULIDO e=0.02') : null
          if (t) {
            const newEl: PlanElement = { id: uid(), type: 'dibujo', layer: 'dibujo', name: `Directriz: ${t.slice(0, 28)}`, geo: { kind: 'directriz', pts: [[a[0], a[1]], [p[0], p[1]]], text: t } }
            useJarumy.setState((prev) => ({
              undoStack: [...prev.undoStack.slice(-29), { elements: JSON.parse(JSON.stringify(prev.elements)), mods: JSON.parse(JSON.stringify(prev.mods)), gridSpacing: prev.gridSpacing }],
              elements: [...prev.elements, newEl],
              drawPts: [],
            }))
          } else {
            useJarumy.setState({ drawPts: [] })
          }
        }
        break
      }
      case 'cota-rad': {
        // 2 clics: centro + borde
        if (st.drawPts.length === 0) {
          st.addDrawPoint(p)
        } else {
          const [cx, cy] = st.drawPts[0]
          const r = Math.max(6, Math.hypot(p[0] - cx, p[1] - cy))
          const newEl: PlanElement = { id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Cota de radio', geo: { kind: 'cota-rad', pts: [[cx, cy], [p[0], p[1]]], r } }
          useJarumy.setState((prev) => ({
            undoStack: [...prev.undoStack.slice(-29), { elements: JSON.parse(JSON.stringify(prev.elements)), mods: JSON.parse(JSON.stringify(prev.mods)), gridSpacing: prev.gridSpacing }],
            elements: [...prev.elements, newEl],
            drawPts: [],
          }))
          st.pushConsole({ text: `ACOTRAD: R ${(r / PX_PER_M).toFixed(2)} m con directriz al centro`, kind: 'out' })
        }
        break
      }
      case 'cota-ang': {
        // 3 clics: vértice · punto en el 1er lado · punto en el 2do lado
        const pts = [...st.drawPts, p]
        if (pts.length === 3) {
          const newEl: PlanElement = { id: uid(), type: 'dibujo', layer: 'dibujo', name: 'Cota angular', geo: { kind: 'cota-ang', pts: [[pts[0][0], pts[0][1]], [pts[1][0], pts[1][1]], [pts[2][0], pts[2][1]]] } }
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
      default:
        break
    }
  }, [toSvg, snapPt, orthoPt])

  // ---------- zoom y paneo ----------
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    userNavRef.current = true
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
    didPanRef.current = false
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
        // el cursor SVG solo se rastrea con una herramienta armada (evita re-render en cada mousemove)
        if (useJarumy.getState().drawTool) useJarumy.getState().setCursorSvg(sv)
        if (coordsRef.current) {
          coordsRef.current.textContent = `X ${(sv[0] / PX_PER_M).toFixed(2)}   Y ${(sv[1] / PX_PER_M).toFixed(2)} m`
        }
      }
      if (panRef.current) {
        if (Math.abs(e.clientX - panRef.current.x) + Math.abs(e.clientY - panRef.current.y) > 5) {
          didPanRef.current = true
          userNavRef.current = true
        }
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

  // ESC cancela herramienta / cierra menú · R rota el bloque pendiente de inserción · ENTER termina polilíneas/tuberías
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const st = useJarumy.getState()
        if (st.drawTool) st.armDraw(null)
        st.setHovered(null)
      }
      const polyFamily = MULTI_FAMILY
      if (e.key === 'Enter' && polyFamily.includes(useJarumy.getState().drawTool || '')) {
        useJarumy.getState().finishPolyline()
      }
      const st = useJarumy.getState()
      if ((e.key === 'r' || e.key === 'R') && st.drawTool?.startsWith('ins:')) {
        st.rotateInsert()
        st.pushConsole({ text: `Inserción rotada a ${useJarumy.getState().insertRotation}°`, kind: 'out' })
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // ---------- paneo (1 dedo) y zoom por pellizco (2 dedos) — móvil / tablet ----------
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const t: {
      mode: 'pan' | 'pinch' | null
      startX: number; startY: number; px: number; py: number
      dist0: number; zoom0: number; mx0: number; my0: number
    } = { mode: null, startX: 0, startY: 0, px: 0, py: 0, dist0: 0, zoom0: 1, mx0: 0, my0: 0 }
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    const onStart = (e: TouchEvent) => {
      const rect = el.getBoundingClientRect()
      if (e.touches.length === 1) {
        const tc = e.touches[0]
        const st = useJarumy.getState()
        // posiciona el menú radial y el fantasma de inserción en el punto del toque
        mouseRef.current = { x: tc.clientX - rect.left, y: tc.clientY - rect.top }
        if (st.drawTool) {
          st.setCursorSvg([
            (tc.clientX - rect.left - st.panX) / st.zoom,
            (tc.clientY - rect.top - st.panY) / st.zoom,
          ])
          t.mode = null
          return // taps de dibujo/inserción: los maneja el clic
        }
        t.mode = 'pan'
        t.startX = tc.clientX
        t.startY = tc.clientY
        t.px = st.panX
        t.py = st.panY
        didPanRef.current = false
        setDragging(true)
      } else if (e.touches.length >= 2) {
        const st = useJarumy.getState()
        t.mode = 'pinch'
        t.dist0 = Math.max(10, dist(e.touches[0], e.touches[1]))
        t.zoom0 = st.zoom
        t.px = st.panX
        t.py = st.panY
        t.mx0 = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        t.my0 = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        didPanRef.current = true // el pellizco nunca debe disparar un clic
        setDragging(true)
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!t.mode) return
      e.preventDefault()
      userNavRef.current = true
      if (t.mode === 'pan' && e.touches.length === 1) {
        const tc = e.touches[0]
        const dx = tc.clientX - t.startX
        const dy = tc.clientY - t.startY
        if (Math.abs(dx) + Math.abs(dy) > 5) didPanRef.current = true
        useJarumy.setState({ panX: t.px + dx, panY: t.py + dy })
      } else if (t.mode === 'pinch' && e.touches.length >= 2) {
        const rect = el.getBoundingClientRect()
        const d = Math.max(10, dist(e.touches[0], e.touches[1]))
        const zoom1 = Math.min(6, Math.max(0.25, (t.zoom0 * d) / t.dist0))
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        // mantiene bajo el punto medio el mismo punto del plano que al iniciar
        useJarumy.setState({
          zoom: zoom1,
          panX: mx - ((t.mx0 - t.px) / t.zoom0) * zoom1,
          panY: my - ((t.my0 - t.py) / t.zoom0) * zoom1,
        })
      }
    }
    const onEnd = (ev: TouchEvent) => {
      if (ev.touches.length === 0) { t.mode = null; setDragging(false) }
      else if (t.mode === 'pinch') { t.mode = null; setDragging(false) }
    }
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
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
            ref={svgRef}
            width={VIEW_W} height={VIEW_H}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className={`${s.renderMode ? 'jy-svg-render ' : ''}${geometricTool ? 'jy-geo-draw' : ''}`}
            onClick={handleCanvasClick}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (MULTI_FAMILY.includes(useJarumy.getState().drawTool || '')) useJarumy.getState().finishPolyline()
            }}
            style={{ background: 'transparent', touchAction: 'none' }}
          >
            <defs>
              <pattern id={gridId} width={s.gridSpacing} height={s.gridSpacing} patternUnits="userSpaceOnUse">
                <path d={`M ${s.gridSpacing} 0 L 0 0 0 ${s.gridSpacing}`} fill="none" stroke="rgba(245,158,11,0.13)" strokeWidth="0.7" />
              </pattern>
            </defs>

            {/* lámina (fondo; su menú se abre con clic en zona vacía) */}
            <g className="jy-el">
              <rect x="16" y="14" width="1168" height="792" fill="none" stroke="var(--jy-muted)" strokeWidth="1.2" opacity="0.55" />
              <rect x="26" y="24" width="1148" height="772" fill="none" stroke="var(--jy-muted)" strokeWidth="0.6" opacity="0.3" />
              <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="transparent" />
            </g>

            {/* rejilla */}
            {s.showGrid && <rect x="150" y="100" width="900" height="600" fill={`url(#${gridId})`} pointerEvents="none" />}

            {/* sombras del heliodón (debajo de los elementos) */}
            {s.sun.active && (
              <HeliodonLayer elements={s.elements} mods={s.mods} sun={s.sun} phase="under" />
            )}

            {/* elementos por capas (el filtro de fases atenúa lo que no corresponde) */}
            {sorted.map((el) =>
              visibleLayers.has(el.layer) ? (
                <g
                  key={el.id}
                  opacity={s.phaseFilter && ((s.mods[el.id]?.phase || (el.geo as DrawGeo).phase || 'nueva') !== s.phaseFilter) ? 0.12 : 1}
                >
                  <PlanElementNode
                    el={el}
                    mod={s.mods[el.id]}
                    handlers={{
                      onClickEl: handleClickEl, onDownEl: handleDownEl,
                    }}
                    showArea={s.areaLabels}
                  />
                </g>
              ) : null
            )}

            {/* acotación automática por ambiente (respeta la capa Cotas) */}
            {s.autoDims && visibleLayers.has('cotas') && (
              <AutoDimsLayer elements={s.elements} mods={s.mods} />
            )}

            {/* diagrama solar del heliodón (encima de los elementos, sin captura) */}
            {s.sun.active && (
              <HeliodonLayer elements={s.elements} mods={s.mods} sun={s.sun} phase="over" />
            )}

            {/* vista previa de dibujo */}
            {s.drawTool && !s.drawTool.startsWith('ins:') && !s.drawTool.startsWith('simbolo:') && (() => {
              const base = s.drawPts[s.drawPts.length - 1]
              const cur = orthoPt(snapPt(s.cursorSvg), base)
              // sin ancla todavía: solo herramientas de un clic muestran fantasma
              if (!base) {
                if (s.drawTool === 'punto') {
                  const c0 = snapPt(s.cursorSvg)
                  return <g stroke="#f59e0b" strokeWidth="1.6" opacity="0.8" pointerEvents="none">
                    <line x1={c0[0] - 5} y1={c0[1]} x2={c0[0] + 5} y2={c0[1]} />
                    <line x1={c0[0]} y1={c0[1] - 5} x2={c0[0]} y2={c0[1] + 5} />
                  </g>
                }
                return null
              }
              const polyFamily = MULTI_FAMILY
              const toolColor = s.drawTool === 'tuberia-agua' ? '#38bdf8'
                : s.drawTool === 'tuberia-desague' ? '#b45309'
                : s.drawTool === 'circuito' ? '#ef4444'
                : s.drawTool === 'terreno' || s.drawTool === 'curvanivel' ? '#84cc16'
                : s.drawTool === 'nube' ? '#fb7185'
                : s.drawTool === 'hatch' ? '#a3e635'
                : '#f59e0b'
              const dash = { stroke: toolColor, strokeWidth: 1.8, strokeDasharray: '6 4', fill: 'none' } as const
              if (s.drawTool === 'circulo') {
                return <circle cx={base[0]} cy={base[1]} r={Math.max(4, Math.hypot(cur[0] - base[0], cur[1] - base[1]))} {...dash} />
              }
              if (polyFamily.includes(s.drawTool)) {
                const all = [...s.drawPts, cur]
                if (s.drawTool === 'spline') {
                  return <path d={pathFromPts(sampleCatmullRom(all, 8))} {...dash} strokeLinecap="round" />
                }
                if (s.drawTool === 'nube' || s.drawTool === 'hatch') {
                  return <path d={pathFromPts(scallopPts(all, false, 26))} {...dash} />
                }
                return <polyline points={all.map((p) => p.join(',')).join(' ')} {...dash} />
              }
              if (s.drawTool === 'rectangulo') {
                return <rect x={Math.min(base[0], cur[0])} y={Math.min(base[1], cur[1])}
                  width={Math.abs(cur[0] - base[0])} height={Math.abs(cur[1] - base[1])} {...dash} />
              }
              if (s.drawTool === 'elipse') {
                return <ellipse cx={base[0]} cy={base[1]} rx={Math.max(4, Math.abs(cur[0] - base[0]))} ry={Math.max(4, Math.abs(cur[1] - base[1]))} {...dash} />
              }
              if (s.drawTool === 'arco') {
                // con 1 punto: cuerda; con 2: arco por 3 puntos (inicio, medio, cursor)
                if (s.drawPts.length === 1) return <line x1={base[0]} y1={base[1]} x2={cur[0]} y2={cur[1]} {...dash} />
                const a = s.drawPts[0], b = s.drawPts[1]
                return <g>
                  <path d={pathFromPts(sampleArc3(a, b, cur))} {...dash} strokeLinecap="round" />
                  <line x1={a[0]} y1={a[1]} x2={a[0]} y2={a[1]} stroke={toolColor} strokeWidth="4" strokeLinecap="round" />
                </g>
              }
              if (s.drawTool === 'directriz') {
                return <g>
                  <line x1={base[0]} y1={base[1]} x2={cur[0]} y2={cur[1]} {...dash} />
                  <circle cx={cur[0]} cy={cur[1]} r="2.5" fill={toolColor} />
                </g>
              }
              if (s.drawTool === 'cota-rad') {
                const r = Math.max(4, Math.hypot(cur[0] - base[0], cur[1] - base[1]))
                return <g>
                  <circle cx={base[0]} cy={base[1]} r={r} {...dash} />
                  <line x1={base[0]} y1={base[1]} x2={cur[0]} y2={cur[1]} {...dash} />
                  <text x={(base[0] + cur[0]) / 2} y={(base[1] + cur[1]) / 2 - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill={toolColor}>
                    R {(r / PX_PER_M).toFixed(2)} m
                  </text>
                </g>
              }
              if (s.drawTool === 'cota-ang') {
                if (s.drawPts.length === 1) return <line x1={base[0]} y1={base[1]} x2={cur[0]} y2={cur[1]} {...dash} />
                const v = s.drawPts[0], p1 = s.drawPts[1]
                const a1 = Math.atan2(p1[1] - v[1], p1[0] - v[0])
                const a2 = Math.atan2(cur[1] - v[1], cur[0] - v[0])
                const r0 = 46
                const arcPath = `M ${v[0] + r0 * Math.cos(a1)} ${v[1] + r0 * Math.sin(a1)} A ${r0} ${r0} 0 0 ${(a2 - a1 + Math.PI * 4) % (Math.PI * 2) < Math.PI ? 0 : 1} ${v[0] + r0 * Math.cos(a2)} ${v[1] + r0 * Math.sin(a2)}`
                const deg = (Math.abs((a2 - a1) * 180 / Math.PI) % 360)
                return <g>
                  <line x1={v[0]} y1={v[1]} x2={p1[0]} y2={p1[1]} {...dash} />
                  <line x1={v[0]} y1={v[1]} x2={cur[0]} y2={cur[1]} {...dash} />
                  <path d={arcPath} {...dash} />
                  <text x={v[0] + (r0 + 12) * Math.cos((a1 + a2) / 2)} y={v[1] + (r0 + 12) * Math.sin((a1 + a2) / 2)} textAnchor="middle" fontSize="12" fontWeight="700" fill={toolColor}>
                    {deg.toFixed(1)}°
                  </text>
                </g>
              }
              if (s.drawTool === 'punto') {
                const cur0 = snapPt(s.cursorSvg)
                return <g {...dash}>
                  <line x1={cur0[0] - 5} y1={cur0[1]} x2={cur0[0] + 5} y2={cur0[1]} stroke={toolColor} strokeWidth="1.6" />
                  <line x1={cur0[0]} y1={cur0[1] - 5} x2={cur0[0]} y2={cur0[1] + 5} stroke={toolColor} strokeWidth="1.6" />
                </g>
              }
              if (s.drawTool === 'cota') {
                return <g>
                  <line x1={base[0]} y1={base[1]} x2={cur[0]} y2={cur[1]} {...dash} />
                  <text x={(base[0] + cur[0]) / 2} y={Math.min(base[1], cur[1]) - 8} textAnchor="middle" fontSize="12" fill={toolColor}>
                    {(Math.hypot(cur[0] - base[0], cur[1] - base[1]) / PX_PER_M).toFixed(2)} m
                  </text>
                </g>
              }
              return <line x1={base[0]} y1={base[1]} x2={cur[0]} y2={cur[1]} {...dash} />
            })()}

            {/* fantasma del símbolo de instalación pendiente */}
            {s.drawTool?.startsWith('simbolo:') && (() => {
              const cur = snapPt(s.cursorSvg)
              const col = '#38bdf8'
              return (
                <g pointerEvents="none" opacity="0.8">
                  <circle cx={cur[0]} cy={cur[1]} r="7" fill="none" stroke={col} strokeWidth="1.6" />
                  <circle cx={cur[0]} cy={cur[1]} r="14" fill="none" stroke={col} strokeWidth="1" strokeDasharray="4 3" />
                </g>
              )
            })()}

            {/* fantasma del pin de comentario */}
            {s.drawTool === 'pin' && (() => {
              const cur = snapPt(s.cursorSvg)
              return (
                <g pointerEvents="none" opacity="0.8">
                  <circle cx={cur[0]} cy={cur[1] - 18} r="7.5" fill="rgba(251,113,133,0.5)" stroke="#fb7185" strokeWidth="1.4" />
                  <line x1={cur[0]} y1={cur[1] - 11} x2={cur[0]} y2={cur[1]} stroke="#fb7185" strokeWidth="1.4" />
                </g>
              )
            })()}

            {/* fantasma del bloque pendiente de inserción (sigue al cursor; R rota) */}
            {s.drawTool?.startsWith('ins:') && (() => {
              const kind = s.drawTool.slice(4)
              const b = BLOCK_LIBRARY.find((x) => x.kind === kind)
              if (!b) return null
              const cur = snapPt(s.cursorSvg)
              const gx = cur[0] - b.w / 2
              const gy = cur[1] - b.h / 2
              return (
                <g opacity="0.6" transform={`rotate(${s.insertRotation} ${cur[0]} ${cur[1]})`} pointerEvents="none">
                  <FurnShape g={{ kind: b.kind, x: gx, y: gy, w: b.w, h: b.h }} />
                  <rect x={gx - 3} y={gy - 3} width={b.w + 6} height={b.h + 6}
                    fill="none" stroke="#f59e0b" strokeWidth="1.4" strokeDasharray="5 4" rx="4" />
                </g>
              )
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

      {/* ---------- menú radial contextual (abierto con clic; persiste hasta cerrarlo) ---------- */}
      {s.hovered && !s.drawTool && hoverEl && (
        <RadialMenu
          hover={s.hovered}
          containerW={size.w}
          containerH={size.h}
          elementName={`${hoverEl.name} — ${elementSummary(hoverEl)}`}
          onAction={onRadialAction}
          onClose={() => s.setHovered(null)}
        />
      )}
      {s.hovered && !s.drawTool && !hoverEl && s.hovered.type === 'lamina' && (
        <RadialMenu
          hover={s.hovered}
          containerW={size.w}
          containerH={size.h}
          elementName="Lámina A-01 · Esc. 1:60 · Unidades métricas"
          onAction={onRadialAction}
          onClose={() => s.setHovered(null)}
        />
      )}

      {/* ---------- panel del heliodón (sol y sombras) ---------- */}
      {s.sun.active && <SunPanel />}

      {/* ---------- indicador de herramienta activa ---------- */}
      {s.drawTool && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full border border-amber-500/50 bg-zinc-950/90 px-4 py-1.5 shadow-lg jy-pop-in">
          <ToolIcon name="PencilRuler" className="text-amber-400" size={14} />
          <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">
            {s.drawTool.startsWith('ins:') ? `Insertar: ${s.drawTool.slice(4)}` : s.drawTool}
          </span>
          <span className="text-[10px] text-zinc-400">
            {s.drawTool.startsWith('ins:')
              ? `toque o clic para colocar${s.insertRotation ? ` · ${s.insertRotation}°` : ''}`
              : s.drawTool === 'borrar' || s.drawTool === 'copiar' || s.drawTool === 'mover'
                ? 'toque o clic en el objeto'
              : s.drawTool === 'recorta' || s.drawTool === 'alarga'
                ? '1er clic: línea · 2º clic: tramo/límite'
              : s.drawTool === 'arco'
                ? '3 clics: inicio · punto del arco · fin'
              : s.drawTool === 'cota-ang'
                ? '3 clics: vértice · lado 1 · lado 2'
              : s.drawTool === 'elipse' || s.drawTool === 'cota-rad'
                ? '2 clics: centro · borde'
              : s.drawTool === 'directriz'
                ? '2 clics: flecha · texto'
              : MULTI_FAMILY.includes(s.drawTool || '')
                ? 'clics para trazar · ENTER/Terminar cierra'
                : 'toque o clic en el plano'}
          </span>
          {MULTI_FAMILY.includes(s.drawTool || '') && (
            <button
              onClick={() => s.finishPolyline()}
              className="ml-1 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-black text-zinc-950 hover:brightness-110 active:scale-95 transition-all"
              title="Terminar trazo (ENTER o doble clic)"
            >
              <ToolIcon name="Check" size={11} />
              Terminar
            </button>
          )}
          {s.drawTool === 'polilinea' && (
            <button
              onClick={() => s.finishPolyline()}
              className="ml-1 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-black text-zinc-950 hover:brightness-110 active:scale-95 transition-all"
              title="Terminar polilínea (ENTER)"
            >
              <ToolIcon name="Check" size={11} />
              Terminar
            </button>
          )}
          {['tuberia-agua', 'tuberia-desague', 'circuito', 'terreno', 'curvanivel'].includes(s.drawTool || '') && (
            <button
              onClick={() => s.finishPolyline()}
              className="ml-1 flex items-center gap-1 rounded-full bg-sky-500 px-2.5 py-0.5 text-[10px] font-black text-zinc-950 hover:brightness-110 active:scale-95 transition-all"
              title="Terminar trazo (ENTER o doble clic)"
            >
              <ToolIcon name="Check" size={11} />
              Terminar
            </button>
          )}
          {s.drawTool.startsWith('ins:') && (
            <button
              onClick={() => {
                s.rotateInsert()
                s.pushConsole({ text: `Inserción rotada a ${useJarumy.getState().insertRotation}°`, kind: 'out' })
              }}
              className="ml-1 flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/25 active:scale-95 transition-all"
              title="Rotar 90° (tecla R)"
            >
              <ToolIcon name="RotateCw" size={11} />
              Rotar
            </button>
          )}
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
            Toque o haga clic sobre un elemento del plano — se abrirá su círculo de herramientas
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
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5 items-start">
        {(s.renderMode || s.view3D) && (
          <div className="flex gap-1.5">
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
        {s.sun.active && (
          <span className="rounded-full border border-yellow-400/50 bg-yellow-500/15 px-3 py-1 text-[10px] font-bold text-yellow-300 uppercase tracking-wider">
            Heliodón activo
          </span>
        )}
        {(() => {
          const total = s.elements
            .filter((e) => e.type === 'espacio' && !s.mods[e.id]?.deleted)
            .reduce((n, e) => n + roomAreaM2(e.geo as RoomGeo), 0)
          return (
            <button
              onClick={() => s.runGlobal('toggleAreas')}
              className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                s.areaLabels
                  ? 'border-teal-400/40 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20'
                  : 'border-zinc-600/50 bg-zinc-800/40 text-zinc-500 hover:text-zinc-300'
              }`}
              title="Rotulado de áreas: clic para mostrar/ocultar etiquetas m²"
            >
              {s.areaLabels ? `Áreas · ${total.toFixed(1)} m² techados` : 'Áreas · ocultas'}
            </button>
          )
        })()}
        {(() => {
          const n = autoDimensions(s.elements, s.mods).length
          return (
            <button
              onClick={() => s.runGlobal('toggleAutoDims')}
              className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                s.autoDims
                  ? 'border-sky-400/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
                  : 'border-zinc-600/50 bg-zinc-800/40 text-zinc-500 hover:text-zinc-300'
              }`}
              title="Acotación automática: clic para mostrar/ocultar cotas interiores por ambiente"
            >
              {s.autoDims ? `Cotas · ${n} automáticas` : 'Cotas · ocultas'}
            </button>
          )
        })()}
      </div>
    </div>
  )
}
