'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useJarumy } from '@/lib/store'
import { TOOL_CATEGORIES, TOTAL_TOOLS } from '@/lib/tools-data'
import { ToolIcon } from './ToolIcon'

export default function RibbonToolbar({ hiddenCats = [] }: { hiddenCats?: string[] }) {
  const s = useJarumy()
  const [openToolId, setOpenToolId] = useState<string | null>(null)
  const visibleCats = TOOL_CATEGORIES.filter((c) => !hiddenCats.includes(c.id))
  const cat = visibleCats.find((c) => c.id === s.activeTab) || visibleCats[0]

  return (
    <div className="jy-bg2 border-b jy-border">
      {/* pestañas */}
      <div className="flex items-center gap-0.5 px-2 pt-1.5 overflow-x-auto jy-scroll">
        {visibleCats.map((c) => {
          const active = c.id === s.activeTab
          return (
            <button
              key={c.id}
              onClick={() => s.setActiveTab(c.id)}
              className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-[11.5px] font-bold whitespace-nowrap transition-all
                ${active ? 'jy-bg2 jy-text border border-b-0 jy-border' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/4'}`}
              style={active ? { borderBottom: `2px solid ${c.color}`, boxShadow: `inset 0 2px 0 ${c.color}55` } : undefined}
            >
              <ToolIcon name={c.icon} size={13} className={active ? '' : 'opacity-70'} />
              {c.label}
            </button>
          )
        })}
        <span className="ml-auto mr-2 text-[10px] jy-muted whitespace-nowrap py-1.5 hidden sm:block">
          {TOTAL_TOOLS} herramientas · 10 apps investigadas
        </span>
      </div>

      {/* herramientas de la pestaña */}
      <div className="flex items-stretch gap-1 px-2 py-2 overflow-x-auto jy-scroll min-h-[64px]">
        {cat.tools.map((t) => {
          const isDraw = t.options.some((o) => o.action.kind === 'draw')
          return (
            <Popover key={t.id} open={openToolId === t.id} onOpenChange={(v) => setOpenToolId(v ? t.id : null)}>
              <PopoverTrigger asChild>
                <button
                  className={`group flex flex-col items-center justify-start gap-1 w-[74px] shrink-0 rounded-lg border px-1 py-1.5 transition-all
                    ${openToolId === t.id
                      ? 'border-amber-500/70 bg-amber-500/10'
                      : 'border-transparent hover:bg-white/5 hover:border-white/10'}`}
                  title={`${t.desc} — ${t.source}`}
                >
                  <span
                    className="flex items-center justify-center w-9 h-9 rounded-lg transition-transform group-hover:scale-110"
                    style={{ background: `${cat.color}1c`, color: cat.color, border: `1px solid ${cat.color}55` }}
                  >
                    <ToolIcon name={t.icon} size={17} />
                  </span>
                  <span className="text-[9.5px] font-semibold jy-text leading-tight text-center line-clamp-2">
                    {t.label}
                  </span>
                  {isDraw && <span className="absolute mt-[-52px] ml-[52px] w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="center" className="w-72 p-0 jy-bg2 jy-text border jy-border shadow-2xl">
                <div className="px-3 py-2.5 border-b jy-border">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg"
                      style={{ background: `${cat.color}22`, color: cat.color }}>
                      <ToolIcon name={t.icon} size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold jy-text leading-tight">{t.label}</p>
                      <p className="text-[10px] jy-muted">{t.source}</p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10.5px] jy-muted leading-snug">{t.desc}</p>
                </div>
                <div className="py-1 max-h-60 overflow-y-auto jy-scroll">
                  {t.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        s.executeAction(opt.action, s.selectedId)
                        if (opt.action.kind !== 'draw') setOpenToolId(null)
                      }}
                      className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-amber-500/12 border-b border-white/4 group"
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
                        style={{ background: cat.color + '99' }} />
                      <span className="min-w-0">
                        <span className="block text-[12px] font-semibold jy-text group-hover:text-amber-200 truncate">
                          {opt.label}
                        </span>
                        {opt.detail && <span className="block text-[10px] jy-muted truncate">{opt.detail}</span>}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="px-3 py-1.5 border-t jy-border text-[9.5px] jy-muted">
                  {s.selectedId
                    ? 'Se aplicará al elemento seleccionado'
                    : 'Efectos: seleccione un objeto primero (pase el cursor)'}
                </div>
              </PopoverContent>
            </Popover>
          )
        })}
      </div>
    </div>
  )
}
