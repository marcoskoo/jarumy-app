'use client'

import { useState } from 'react'
import { useJarumy } from '@/lib/store'
import { ToolIcon } from './ToolIcon'
import { PX_PER_M } from '@/lib/plan-data'

// ============================================================
// Ola 8 — Selector multinivel flotante sobre el lienzo.
// Cambia la planta activa, crea/duplica/elimina niveles y edita
// nombre/cota/altura. Los objetos nuevos se dibujan en el nivel
// activo; MOVER A NIVEL reasigna la selección.
// ============================================================

export default function LevelSelector() {
  const s = useJarumy()
  const [open, setOpen] = useState(false)
  const active = s.levels.find((l) => l.id === s.activeLevel)
  const countByLevel = s.levels.map((l) => ({
    ...l,
    n: s.elements.filter((e) => !s.mods[e.id]?.deleted && (e.level ?? 0) === l.id).length,
  }))

  const addLevel = () => {
    void s.requestPrompt('Nombre del nivel (PB · P1 · P2 · AZOTEA…):', `P${s.levels.length}`).then((name) => {
      if (name === null) return
      s.addLevel(name.trim() || undefined)
    })
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border jy-border jy-bg2/95 px-2 py-1.5 shadow-lg backdrop-blur">
        <ToolIcon name="Layers" size={14} className="text-amber-400 shrink-0" />
        <div className="flex items-center gap-1">
          {countByLevel.map((l) => (
            <button
              key={l.id}
              onClick={() => s.setActiveLevel(l.id)}
              title={`${l.name} · cota +${l.elev.toFixed(2)} m · altura ${l.height.toFixed(2)} m · ${l.n} objetos`}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                l.id === s.activeLevel
                  ? 'bg-amber-500 text-zinc-950'
                  : 'border jy-border jy-muted hover:jy-text hover:border-amber-500/40'
              }`}
            >
              {l.name}
              <span className={`ml-1 font-mono text-[9px] ${l.id === s.activeLevel ? 'text-zinc-700' : 'text-zinc-500'}`}>{l.n}</span>
            </button>
          ))}
        </div>
        <button
          onClick={addLevel}
          title="Añadir nivel (planta alta)"
          className="flex h-6 w-6 items-center justify-center rounded-lg border jy-border jy-muted hover:jy-text hover:border-amber-500/40 text-[14px] leading-none"
        >
          +
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Administrar niveles"
          className={`flex h-6 w-6 items-center justify-center rounded-lg border transition-colors ${
            open ? 'border-amber-500/60 text-amber-300' : 'jy-border jy-muted hover:jy-text'
          }`}
        >
          <ToolIcon name="Settings2" size={12} />
        </button>
        {active && s.levels.length > 0 && (
          <span className="ml-1 hidden sm:inline text-[9.5px] jy-muted font-mono whitespace-nowrap">
            +{(active.elev).toFixed(2)} m · {active.height.toFixed(2)} m
          </span>
        )}
      </div>

      {open && (
        <div className="pointer-events-auto absolute bottom-11 left-1/2 -translate-x-1/2 w-[min(92vw,420px)] rounded-xl border jy-border jy-bg2 p-3 shadow-xl">
          <p className="text-[11px] font-bold jy-text mb-2 flex items-center gap-1.5">
            <ToolIcon name="Building" size={13} className="text-amber-400" />
            Niveles del edificio ({s.levels.length})
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto jy-scroll pr-1">
            {countByLevel.map((l) => (
              <div key={l.id} className="flex items-center gap-1.5 rounded-lg border jy-border px-2 py-1.5">
                <input
                  value={l.name}
                  onChange={(e) => s.updateLevel(l.id, { name: e.target.value.slice(0, 12) })}
                  className="w-16 rounded-md border jy-border jy-bg1 px-1.5 py-1 text-[11px] font-bold jy-text focus:outline-none focus:border-amber-500/60"
                  aria-label={`Nombre del nivel ${l.id}`}
                />
                <label className="flex items-center gap-1 text-[9.5px] jy-muted">
                  cota
                  <input
                    type="number" step="0.05" value={l.elev}
                    onChange={(e) => s.updateLevel(l.id, { elev: Number(e.target.value) || 0 })}
                    className="w-14 rounded-md border jy-border jy-bg1 px-1 py-0.5 text-[10px] font-mono jy-text focus:outline-none focus:border-amber-500/60"
                    aria-label={`Cota del nivel ${l.name} en metros`}
                  /> m
                </label>
                <label className="flex items-center gap-1 text-[9.5px] jy-muted">
                  alt.
                  <input
                    type="number" step="0.05" min="1.8" max="6" value={l.height}
                    onChange={(e) => s.updateLevel(l.id, { height: Math.max(1.8, Number(e.target.value) || 2.5) })}
                    className="w-12 rounded-md border jy-border jy-bg1 px-1 py-0.5 text-[10px] font-mono jy-text focus:outline-none focus:border-amber-500/60"
                    aria-label={`Altura del nivel ${l.name} en metros`}
                  /> m
                </label>
                <span className="ml-auto text-[9.5px] jy-muted font-mono">{l.n} obj.</span>
                <button
                  onClick={() => s.duplicateLevel(l.id)}
                  title="Duplicar nivel (copia muros/vanos/espacios al nuevo piso)"
                  className="flex h-6 w-6 items-center justify-center rounded-lg border jy-border jy-muted hover:jy-text hover:border-amber-500/40"
                >
                  <ToolIcon name="Copy" size={11} />
                </button>
                <button
                  onClick={() => s.setActiveLevel(l.id)}
                  title="Ver esta planta"
                  className={`flex h-6 w-6 items-center justify-center rounded-lg border ${
                    l.id === s.activeLevel ? 'border-amber-500/60 text-amber-300' : 'jy-border jy-muted hover:jy-text'
                  }`}
                >
                  <ToolIcon name="Eye" size={11} />
                </button>
                <button
                  onClick={() => s.deleteLevel(l.id)}
                  disabled={l.id === 0}
                  title={l.id === 0 ? 'La planta base no se elimina' : 'Eliminar nivel (objetos pasan a PB)'}
                  className="flex h-6 w-6 items-center justify-center rounded-lg border jy-border text-rose-400/80 hover:text-rose-300 hover:border-rose-500/40 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ToolIcon name="Trash2" size={11} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={() => {
                const ids = s.selectedIds.length ? s.selectedIds : (s.selectedId ? [s.selectedId] : [])
                if (!ids.length) { s.pushConsole({ text: 'MOVER A NIVEL: seleccione objetos primero', kind: 'err' }); return }
                const target = s.levels.find((l) => l.id !== s.activeLevel)
                if (target) s.moveSelectionToLevel(target.id)
              }}
              className="rounded-lg border jy-border px-2.5 py-1 text-[10.5px] jy-muted hover:jy-text hover:border-amber-500/40"
            >
              Mover selección a {s.levels.find((l) => l.id !== s.activeLevel)?.name ?? '—'}
            </button>
            <span className="text-[9px] jy-muted">
              1 m = {PX_PER_M} px · IFC exporta {s.levels.length} IfcBuildingStorey
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
