'use client'

// ============================================================
// JARUMY APP — Biblioteca de bloques con vista previa visual
// Explorador por categorías (mobiliario, cocina, sanitarios,
// exterior). Clic en un bloque → se arma la inserción → clic
// en el plano para colocarlo (R rota 90°).
// ============================================================

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useJarumy } from '@/lib/store'
import { BLOCK_LIBRARY, BLOCK_CATS, PX_PER_M, type BlockDef, type BlockCat } from '@/lib/plan-data'
import { FurnShape } from './ElementRenderers'
import { ToolIcon } from './ToolIcon'

const PREVIEW_W = 118
const PREVIEW_H = 78

function BlockPreview({ b }: { b: BlockDef }) {
  const k = Math.min((PREVIEW_W - 14) / b.w, (PREVIEW_H - 14) / b.h, 1)
  const tx = (PREVIEW_W - b.w * k) / 2
  const ty = (PREVIEW_H - b.h * k) / 2
  return (
    <svg width={PREVIEW_W} height={PREVIEW_H} viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
      className="rounded-md" style={{ background: 'rgba(39,39,42,0.55)' }}>
      <g transform={`translate(${tx} ${ty}) scale(${k})`}>
        <FurnShape g={{ kind: b.kind, x: 0, y: 0, w: b.w, h: b.h }} />
      </g>
    </svg>
  )
}

export function BlockLibraryDialog() {
  const s = useJarumy()
  const [cat, setCat] = useState<BlockCat>('mobiliario')

  const blocks = BLOCK_LIBRARY.filter((b) => b.cat === cat)

  const pick = (b: BlockDef) => {
    s.setDialog(null)
    s.armDraw(`ins:${b.kind}`)
    s.pushConsole({
      text: `BLOQUE ${b.label} armado — clic en el plano para insertar · R rota 90° · ESC cancela`,
      kind: 'cmd',
    })
  }

  return (
    <Dialog open={s.dialog === 'blocks'} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-xl max-h-[84vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Blocks" className="text-amber-400" size={18} />
            Biblioteca de bloques — {BLOCK_LIBRARY.length} objetos con vista previa
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] jy-muted -mt-1">
          Clic en un bloque para armar la inserción, luego clic en el plano para colocarlo.
          Presione <b className="text-amber-300">R</b> para rotarlo 90° antes de colocar · <b className="text-amber-300">ESC</b> cancela.
        </p>

        {/* pestañas de categoría */}
        <div className="flex gap-1 flex-wrap">
          {BLOCK_CATS.map((c) => {
            const active = cat === c.id
            const n = BLOCK_LIBRARY.filter((b) => b.cat === c.id).length
            return (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? 'border-amber-400/80 bg-amber-500/15 text-amber-300'
                    : 'border-zinc-700/60 text-zinc-400 hover:border-amber-500/40 hover:text-amber-200'
                }`}
              >
                <ToolIcon name={c.icon} size={12} />
                {c.label}
                <span className="text-[9px] opacity-70">{n}</span>
              </button>
            )
          })}
        </div>

        {/* rejilla de bloques */}
        <div className="overflow-y-auto jy-scroll grid grid-cols-2 sm:grid-cols-3 gap-2 pr-1">
          {blocks.map((b) => (
            <button
              key={b.kind}
              onClick={() => pick(b)}
              className="group rounded-lg border border-white/8 hover:border-amber-400/70 hover:bg-amber-500/10 transition-all p-2 text-left"
              title={`Insertar: ${b.label}`}
            >
              <BlockPreview b={b} />
              <p className="mt-1.5 text-[11px] font-semibold jy-text leading-tight truncate group-hover:text-amber-200">
                {b.label}
              </p>
              <p className="text-[9px] jy-muted font-mono">
                {(b.w / PX_PER_M).toFixed(2)} × {(b.h / PX_PER_M).toFixed(2)} m
              </p>
            </button>
          ))}
        </div>

        <p className="text-[9.5px] jy-muted border-t border-white/6 pt-2 flex items-center gap-1.5">
          <ToolIcon name="MousePointerClick" size={10} />
          Los bloques insertados admiten rotar / simetría / material desde su menú radial (clic sobre ellos).
        </p>
      </DialogContent>
    </Dialog>
  )
}
