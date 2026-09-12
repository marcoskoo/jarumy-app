'use client'

import { useState, useRef, useEffect } from 'react'
import { useJarumy } from '@/lib/store'
import { ToolIcon } from './ToolIcon'

export function CommandConsole() {
  const s = useJarumy()
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false) // en móvil el registro queda plegado por defecto
  const inputRef = useRef<HTMLInputElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [s.consoleLines.length, open])

  return (
    <div className="jy-bg2 border-t jy-border">
      {/* plegado del registro en móvil */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="md:hidden w-full flex items-center justify-between px-3 py-1 text-[9px] font-bold jy-muted uppercase tracking-wider active:text-amber-300"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <ToolIcon name="AlignLeft" size={10} />
          Consola · {s.consoleLines.length} líneas
        </span>
        <ToolIcon name={open ? 'ChevronDown' : 'ChevronUp'} size={12} />
      </button>
      <div
        ref={logRef}
        className={`${open ? 'max-h-20' : 'max-h-0 md:max-h-20'} overflow-y-auto jy-scroll px-3 py-1.5 font-mono text-[10.5px] leading-relaxed transition-all`}
      >
        {s.consoleLines.slice(-8).map((l, i) => (
          <p key={i} className={
            l.kind === 'cmd' ? 'text-amber-400' : l.kind === 'err' ? 'text-rose-400' : 'jy-muted'
          }>
            {l.kind === 'cmd' ? '> ' : ''}{l.text}
          </p>
        ))}
      </div>
      <form
        className="flex items-center gap-2 border-t jy-border px-3 py-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!value.trim()) return
          s.runCommand(value)
          setValue('')
          inputRef.current?.focus()
        }}
      >
        <span className="text-amber-400 font-mono text-xs font-bold shrink-0">Comando:</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="escriba un comando… (AYUDA)"
          spellCheck={false}
          autoCapitalize="characters"
          className="flex-1 min-w-0 bg-transparent outline-none font-mono text-[11.5px] jy-text placeholder:text-zinc-600 uppercase"
        />
        <span className="text-[9px] jy-muted shrink-0 hidden sm:block">ESC: cancelar · ENTER: ejecutar</span>
      </form>
    </div>
  )
}

export function StatusBar() {
  const s = useJarumy()
  const toggles: Array<{ label: string; on: boolean; fn: () => void }> = [
    { label: 'REJILLA', on: s.showGrid, fn: () => s.toggle('showGrid') },
    { label: 'SNAP', on: s.snap, fn: () => s.toggle('snap') },
    { label: 'ORTO', on: s.ortho, fn: () => s.toggle('ortho') },
    { label: 'RADIAL', on: s.radialEnabled, fn: () => s.toggle('radialEnabled') },
    { label: 'RENDER', on: s.renderMode, fn: () => s.toggle('renderMode') },
    { label: '3D', on: s.view3D, fn: () => s.toggle('view3D') },
  ]
  return (
    <div
      className="jy-bg border-t jy-border flex items-center gap-1 px-2 py-1 overflow-x-auto jy-scroll"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {toggles.map((t) => (
        <button
          key={t.label}
          onClick={t.fn}
          className={`rounded px-2 py-1 text-[9.5px] font-bold tracking-wider transition-colors shrink-0
            ${t.on ? 'text-amber-300 bg-amber-500/15' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          {t.label}
        </button>
      ))}
      <span className="ml-auto shrink-0 flex items-center gap-2 text-[9.5px] jy-muted pr-1">
        <span>Zoom {(s.zoom * 100).toFixed(0)}%</span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden sm:inline">Esc. 1:60</span>
        <span>·</span>
        <span>{s.elements.length} objetos</span>
        <span>·</span>
        <span className="hidden md:inline">60px = 1m</span>
      </span>
    </div>
  )
}
