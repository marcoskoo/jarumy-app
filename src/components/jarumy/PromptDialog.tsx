'use client'

import { useEffect, useRef, useState } from 'react'
import { useJarumy } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToolIcon } from './ToolIcon'

/**
 * Prompt in-app: reemplaza todos los window.prompt nativos (texto, pines,
 * directrices, MATRIZ, EQUISDIST, etc.) por un diálogo de la aplicación
 * con auto-focus, ENTER para aceptar y ESC para cancelar.
 */
export function PromptDialog() {
  const promptState = useJarumy((s) => s.promptState)
  if (!promptState) return null
  // la clave reinicia el estado interno en cada nuevo prompt
  return <PromptForm key={`${promptState.label}|${promptState.def}`} label={promptState.label} def={promptState.def} />
}

function PromptForm({ label, def }: { label: string; def: string }) {
  const answerPrompt = useJarumy((s) => s.answerPrompt)
  const [value, setValue] = useState(def)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // auto-focus + selecciona el contenido para reemplazarlo de un teclazo
    const t = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 60)
    return () => clearTimeout(t)
  }, [])

  const submit = () => answerPrompt(value ?? '')
  const cancel = () => answerPrompt(null)

  return (
    <Dialog open onOpenChange={(v) => { if (!v) cancel() }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ToolIcon name="Keyboard" className="text-amber-400" size={16} />
            Entrada de datos
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); submit() }}
        >
          <label className="block space-y-1.5">
            <span className="text-[11.5px] font-semibold jy-text leading-snug block">{label}</span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              spellCheck={false}
              className="w-full rounded-lg border jy-border jy-bg px-3 py-2.5 text-[13px] font-mono jy-text outline-none focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/20 transition-all"
              placeholder="escriba el valor…"
            />
          </label>
          <div className="flex items-center justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={cancel}
              className="rounded-lg border jy-border px-3.5 py-2 text-[11.5px] font-bold jy-muted hover:jy-text hover:border-amber-500/50 transition-colors"
            >
              Cancelar (ESC)
            </button>
            <button
              type="submit"
              className="rounded-lg bg-amber-500 px-4 py-2 text-[11.5px] font-black text-zinc-950 hover:brightness-110 active:scale-95 transition-all"
            >
              Aceptar (ENTER)
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
