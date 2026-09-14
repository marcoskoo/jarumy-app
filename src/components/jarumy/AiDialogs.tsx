'use client'

import { useState } from 'react'
import { useJarumy } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToolIcon } from './ToolIcon'
import { checkNormativa } from '@/lib/normativa'
import type { PlanElement } from '@/lib/plan-data'

const EXAMPLES = [
  'Departamento de 2 dormitorios en lote de 8×12 m: sala-comedor, cocina, baño y lavandería',
  'Casa de playa de 3 dormitorios con terraza en lote de 12×15 m',
  'Mini depa de 1 dormitorio de 6×9 m con kitchenette y baño',
]

/**
 * Ola 7 — IA · Generador de plantas esquemáticas desde texto:
 * envía el prompt a /api/ai/plan (servidor con z-ai-web-dev-sdk),
 * recibe elementos de muros/puertas/ventanas/espacios en formato del
 * plano y los inserta como capa nueva lista para editar.
 */
export function AiPlanDialog() {
  const s = useJarumy()
  const open = s.dialog === 'aiplan'
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ count: number; preview: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const generate = async () => {
    if (!prompt.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const els = (data.elements || []) as PlanElement[]
      if (!Array.isArray(els) || els.length === 0) throw new Error('la IA no devolvió geometría')
      setResult({
        count: els.length,
        preview: data.summary || `${els.length} elementos`,
      })
      s.importElements(els, 'IA', data.mods || {})
      s.pushConsole({ text: `IA: planta esquemática generada — ${els.length} elementos insertados (muros/espacios/puertas/ventanas). Revise dimensiones y ajuste con las herramientas de edición.`, kind: 'out' })
    } catch (e) {
      setError(`No se pudo generar el plano (${(e as Error).message}). Verifique su conexión e intente de nuevo.`)
      s.pushConsole({ text: `IA: error al generar (${(e as Error).message})`, kind: 'err' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) s.setDialog(null) }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-lg max-h-[88vh] overflow-y-auto jy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Sparkles" className="text-amber-400" size={18} />
            Generar plano con IA — de la descripción a la planta
          </DialogTitle>
        </DialogHeader>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Describa el proyecto: ambientes, dimensiones del lote, estilo…"
          className="w-full rounded-xl border jy-border jy-bg px-3.5 py-3 text-[13px] jy-text outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all resize-none"
        />

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="rounded-full border jy-border px-2.5 py-1 text-[10px] jy-muted hover:jy-text hover:border-amber-500/50 transition-colors text-left max-w-full truncate"
            >
              {ex.slice(0, 48)}…
            </button>
          ))}
        </div>

        <button
          onClick={() => void generate()}
          disabled={busy || !prompt.trim()}
          className="w-full rounded-xl bg-amber-500 px-4 py-3 text-[13px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy
            ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-950/30 border-t-zinc-950 animate-spin" /> Generando planta…</>
            : <><ToolIcon name="Sparkles" size={15} /> Generar planta esquemática</>}
        </button>

        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300 leading-snug">{error}</p>
        )}
        {result && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-[11.5px] text-emerald-300 leading-relaxed">
            <b>Planta generada:</b> {result.count} elementos insertados en el plano ({result.preview}).
            Ajuste muros con los <b>grips</b>, edite usos en el panel de propiedades y verifique la <b>normativa RNE</b>.
          </div>
        )}

        <p className="text-[10px] jy-muted leading-relaxed">
          La IA produce un esquema normado (muros con espesor, espacios con usos RNE, puertas 0.90 m y ventanas)
          sobre el área de dibujo actual. Es un punto de partida profesional — no un plano final.
        </p>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Ola 7 — IA · Revisor de normativa: toma los checks reales del RNE
 * calculados sobre el plano actual y pide a la IA una interpretación
 * con correcciones concretas.
 */
export function AiNormaDialog() {
  const s = useJarumy()
  const open = s.dialog === 'ainorma'
  const [busy, setBusy] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const analyze = async () => {
    setBusy(true)
    setError(null)
    setAnalysis(null)
    try {
      // revisión por planta (nivel activo), consistente con el verificador local
      const levelEls = s.elements.filter((e) => (e.level ?? 0) === s.activeLevel)
      const rep = checkNormativa(levelEls, s.mods)
      const rooms = levelEls.filter((e) => e.type === 'espacio' && !s.mods[e.id]?.deleted)
      const stats = {
        ambientes: rooms.map((r) => {
          const g = r.geo as { name: string; w: number; h: number }
          return `${g.name} ${((g.w / 60) * (g.h / 60)).toFixed(1)} m²`
        }),
        totalM2: rooms.reduce((n, r) => {
          const g = r.geo as { w: number; h: number }
          return n + (g.w / 60) * (g.h / 60)
        }, 0).toFixed(1),
      }
      const r = await fetch('/api/ai/normativa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checks: rep.checks.map((c) => ({ code: c.code, title: c.title, status: c.status, detail: c.detail })),
          summary: rep.summary,
          stats,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setAnalysis(data.analysis || '')
      s.pushConsole({ text: 'IA NORMATIVA: análisis del revisor generado — revise el diálogo completo', kind: 'out' })
    } catch (e) {
      setError(`No se pudo analizar (${(e as Error).message}).`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) s.setDialog(null) }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-lg max-h-[88vh] overflow-y-auto jy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Scale" className="text-amber-400" size={18} />
            Revisor IA de normativa RNE
          </DialogTitle>
        </DialogHeader>

        {!analysis && !busy && !error && (
          <p className="text-[11.5px] jy-muted leading-relaxed">
            Se enviarán al revisor los <b className="jy-text">checks reales</b> calculados sobre su plano
            (A.010/A.040/A.130) junto con las áreas de cada ambiente. La IA interpretará cada observación y
            propondrá correcciones concretas de diseño.
          </p>
        )}

        <button
          onClick={() => void analyze()}
          disabled={busy}
          className="w-full rounded-xl bg-amber-500 px-4 py-3 text-[13px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy
            ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-950/30 border-t-zinc-950 animate-spin" /> Analizando plano…</>
            : <><ToolIcon name="Sparkles" size={15} /> Analizar con IA</>}
        </button>

        {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300 leading-snug">{error}</p>}

        {analysis && (
          <div className="rounded-xl border jy-border jy-bg px-4 py-3 text-[12px] jy-text leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto jy-scroll">
            {analysis}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
