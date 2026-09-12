'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { RADIAL_TOOLS, type ToolAction, type RadialTool } from '@/lib/tools-data'
import { ToolIcon, TYPE_ICON, TYPE_LABEL } from './ToolIcon'
import type { HoverInfo } from '@/lib/store'

interface RadialMenuProps {
  hover: HoverInfo
  containerW: number
  containerH: number
  elementName: string
  onAction: (action: ToolAction) => void
  onClose: () => void
}

const RING_R = 62

export default function RadialMenu({ hover, containerW, containerH, elementName, onAction, onClose }: RadialMenuProps) {
  const [openTool, setOpenTool] = useState<RadialTool | null>(null)

  const tools = RADIAL_TOOLS[hover.type] || []

  // Posición del centro del menú, contenida dentro del lienzo
  const center = useMemo(() => {
    const margin = 92
    const x = Math.min(Math.max(hover.cx, margin), Math.max(containerW - margin, margin))
    const y = Math.min(Math.max(hover.cy, margin), Math.max(containerH - margin, margin))
    return { x, y }
  }, [hover.cx, hover.cy, containerW, containerH])

  // Panel de opciones a la derecha o izquierda según espacio
  const panelSide = center.x < containerW / 2 ? 'right' : 'left'
  const panelTop = Math.min(Math.max(center.y - 95, 10), Math.max(containerH - 310, 10))

  if (tools.length === 0) return null

  return (
    <div
      className="absolute z-40 jy-radial-in"
      style={{ left: center.x, top: center.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ---------- anillo + botones circulares ---------- */}
      <div className="relative" style={{ width: 0, height: 0 }}>
        {/* halo */}
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="absolute rounded-full"
          style={{
            width: 178, height: 178, left: -89, top: -89,
            background: 'radial-gradient(circle, rgba(24,24,27,0.88) 0%, rgba(24,24,27,0.72) 55%, rgba(24,24,27,0.0) 72%)',
            backdropFilter: 'blur(3px)',
            border: '1px solid rgba(245,158,11,0.35)',
          }}
        />
        {/* círculos guía */}
        <div className="absolute rounded-full border border-dashed pointer-events-none"
          style={{ width: 178, height: 178, left: -89, top: -89, borderColor: 'rgba(245,158,11,0.35)' }} />
        <div className="absolute rounded-full border pointer-events-none"
          style={{ width: 126, height: 126, left: -63, top: -63, borderColor: 'rgba(228,228,231,0.18)' }} />

        {/* centro: tipo de elemento */}
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.05, type: 'spring', stiffness: 380, damping: 20 }}
          onClick={onClose}
          title="Cerrar menú"
          className="absolute z-20 rounded-full flex flex-col items-center justify-center cursor-pointer group"
          style={{
            width: 58, height: 58, left: -29, top: -29,
            background: 'linear-gradient(145deg, #f59e0b, #f97316)',
            boxShadow: '0 4px 22px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}
        >
          <ToolIcon name={TYPE_ICON[hover.type] || 'Info'} className="text-zinc-950" size={18} />
          <span className="text-[8px] font-black tracking-wider text-zinc-950 mt-0.5">
            {TYPE_LABEL[hover.type] || hover.type.toUpperCase()}
          </span>
        </motion.button>

        {/* botones de herramientas alrededor del círculo */}
        {tools.map((t, i) => {
          const n = tools.length
          const angle = (2 * Math.PI * i) / n - Math.PI / 2
          const bx = Math.cos(angle) * RING_R
          const by = Math.sin(angle) * RING_R
          const active = openTool?.id === t.id
          return (
            <motion.button
              key={t.id}
              initial={{ scale: 0, x: 0, y: 0, opacity: 0 }}
              animate={{ scale: 1, x: bx, y: by, opacity: 1 }}
              transition={{ delay: 0.06 + i * 0.045, type: 'spring', stiffness: 360, damping: 20 }}
              onClick={() => setOpenTool(t)}
              onMouseEnter={() => setOpenTool(t)}
              title={t.label}
              className="absolute z-20 rounded-full flex flex-col items-center justify-center cursor-pointer"
              style={{
                width: 46, height: 46, left: -23, top: -23,
                background: active
                  ? 'linear-gradient(145deg, #f59e0b, #fb923c)'
                  : 'linear-gradient(145deg, #27272a, #18181b)',
                border: active ? '1px solid #fbbf24' : '1px solid rgba(228,228,231,0.25)',
                boxShadow: active ? '0 0 18px rgba(245,158,11,0.55)' : '0 3px 10px rgba(0,0,0,0.45)',
              }}
            >
              <ToolIcon name={t.icon} className={active ? 'text-zinc-950' : 'text-amber-400'} size={15} />
              <span className={`text-[7.5px] font-bold mt-0.5 px-1 text-center leading-none ${active ? 'text-zinc-950' : 'text-zinc-300'}`}>
                {t.label}
              </span>
            </motion.button>
          )
        })}

        {/* etiqueta del elemento */}
        <div className="absolute z-10 whitespace-nowrap text-center pointer-events-none"
          style={{ top: 94, left: -95, width: 190 }}>
          <span className="text-[9px] font-semibold text-zinc-300/90 bg-zinc-950/70 rounded-full px-3 py-1 border border-zinc-700/50">
            {elementName}
          </span>
        </div>
      </div>

      {/* ---------- panel de opciones de la herramienta elegida ---------- */}
      {openTool && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, x: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 340, damping: 24 }}
          className="absolute z-50 jy-pop-in"
          style={{
            [panelSide === 'right' ? 'left' : 'right']: 104,
            top: panelTop,
            width: 252,
          }}
        >
          <div className="rounded-xl border overflow-hidden shadow-2xl"
            style={{ background: 'rgba(24,24,27,0.97)', borderColor: 'rgba(245,158,11,0.5)' }}>
            <div className="px-3 py-2 flex items-center gap-2 border-b border-zinc-800 bg-gradient-to-r from-amber-500/15 to-transparent">
              <ToolIcon name={openTool.icon} className="text-amber-400" size={15} />
              <span className="text-xs font-bold text-zinc-100 flex-1">{openTool.label}</span>
              <button
                onClick={() => setOpenTool(null)}
                className="text-zinc-400 hover:text-amber-300 transition-colors"
                title="Volver"
              >
                <ToolIcon name="ChevronLeft" size={15} />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto jy-scroll py-1">
              {openTool.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => { onAction(opt.action); setOpenTool(null); onClose() }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-amber-500/15 border-b border-zinc-800/60 group transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70 group-hover:bg-amber-400 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-zinc-200 group-hover:text-amber-200 truncate">
                      {opt.label}
                    </span>
                    {opt.detail && (
                      <span className="block text-[10px] text-zinc-500 group-hover:text-zinc-400 truncate">
                        {opt.detail}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="px-3 py-1.5 border-t border-zinc-800 text-[9px] text-zinc-500 flex items-center gap-1">
              <ToolIcon name="MousePointerClick" size={10} />
              {openTool.options.length} opciones — clic para ejecutar
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
