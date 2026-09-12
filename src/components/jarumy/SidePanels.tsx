'use client'

import { useJarumy } from '@/lib/store'
import { BLOCK_LIBRARY, elementSummary } from '@/lib/plan-data'
import { ToolIcon } from './ToolIcon'

export function LayersPanel() {
  const s = useJarumy()
  return (
    <div className="w-52 shrink-0 jy-bg2 border-r jy-border flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b jy-border flex items-center justify-between">
        <span className="text-[11px] font-bold jy-text uppercase tracking-wider">Capas</span>
        <button
          title="Restaurar todas"
          onClick={() => s.layers.forEach((l) => s.setLayerVisible(l.id, true))}
          className="text-zinc-500 hover:text-amber-400"
        >
          <ToolIcon name="Eye" size={13} />
        </button>
      </div>
      <div className="overflow-y-auto jy-scroll py-1">
        {s.layers.map((l) => {
          const count = s.elements.filter((e) => e.layer === l.id && !s.mods[e.id]?.deleted).length
          return (
            <div key={l.id}
              className={`flex items-center gap-2 px-3 py-1.5 hover:bg-white/4 transition-colors ${!l.visible ? 'opacity-45' : ''}`}>
              <button
                onClick={() => s.setLayerVisible(l.id, !l.visible)}
                className="shrink-0 text-zinc-400 hover:text-amber-400"
                title={l.visible ? 'Ocultar capa' : 'Mostrar capa'}
              >
                <ToolIcon name={l.visible ? 'Eye' : 'EyeOff'} size={13} />
              </button>
              <span className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/40" style={{ background: l.color }} />
              <span className="text-[11px] jy-text font-medium truncate flex-1">{l.name}</span>
              <span className="text-[9px] jy-muted">{count}</span>
              <button
                onClick={() => s.isolateLayer(l.id)}
                className="shrink-0 text-zinc-500 hover:text-amber-400 opacity-0 group-hover:opacity-100"
                title="Aislar capa"
                style={{ opacity: 0.6 }}
              >
                <ToolIcon name="Lock" size={11} />
              </button>
            </div>
          )
        })}
      </div>

      {/* biblioteca de bloques */}
      <div className="border-t jy-border mt-auto">
        <div className="px-3 py-2 border-b jy-border">
          <span className="text-[11px] font-bold jy-text uppercase tracking-wider">Biblioteca</span>
        </div>
        <div className="p-2 grid grid-cols-2 gap-1 max-h-44 overflow-y-auto jy-scroll">
          {BLOCK_LIBRARY.map((b) => (
            <button
              key={b.kind}
              onClick={() => s.armDraw(`ins:${b.kind}`)}
              title={`Insertar: ${b.label}`}
              className="flex flex-col items-center gap-1 rounded-lg border border-transparent hover:border-amber-500/50 hover:bg-amber-500/8 px-1 py-2 transition-all group"
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-md bg-zinc-800/80 group-hover:bg-amber-500/15 group-hover:text-amber-300 text-zinc-400">
                <ToolIcon name={b.sanitary ? 'Bath' : 'Armchair'} size={15} />
              </span>
              <span className="text-[8.5px] jy-muted text-center leading-tight line-clamp-2">{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PropertiesPanel() {
  const s = useJarumy()
  const el = s.elements.find((e) => e.id === s.selectedId)
  const mod = el ? s.mods[el.id] : undefined
  const layer = el ? s.layers.find((l) => l.id === el.layer) : null

  return (
    <div className="w-60 shrink-0 jy-bg2 border-l jy-border flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b jy-border flex items-center justify-between">
        <span className="text-[11px] font-bold jy-text uppercase tracking-wider">Propiedades</span>
        <ToolIcon name="PanelRight" className="jy-muted" size={13} />
      </div>
      {!el ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <ToolIcon name="MousePointerClick" className="jy-muted" size={26} />
          <p className="text-[11px] jy-muted leading-relaxed">
            Haga clic sobre un objeto del plano y elíjalo en el menú radial para ver sus propiedades.
          </p>
        </div>
      ) : (
        <div className="overflow-y-auto jy-scroll py-2 text-[11.5px]">
          <div className="px-3 py-2">
            <p className="font-bold jy-text text-[13px] leading-tight">{el.name}</p>
            <p className="text-[10px] jy-muted uppercase tracking-wide">{el.type}</p>
          </div>
          <div className="px-3 space-y-1.5">
            <Row k="Capa" v={layer?.name || el.layer} dot={layer?.color} />
            <Row k="ID" v={el.id.slice(0, 14)} />
            <Row k="Resumen" v={elementSummary(el)} />
            {mod?.thickness !== undefined && <Row k="Espesor mod." v={`${(mod.thickness * 100 / 60).toFixed(0)} cm`} />}
            {mod?.material && <Row k="Material" v={mod.material} />}
            {mod?.scale !== undefined && mod.scale !== 1 && <Row k="Escala" v={`×${mod.scale.toFixed(2)}`} />}
            {mod?.rotation ? <Row k="Rotación" v={`${mod.rotation}°`} /> : null}
            {mod?.fill && mod.fill !== 'transparent' && <Row k="Acabado" v="aplicado" />}
            {mod?.translate && <Row k="Traslado" v={`${mod.translate[0]}, ${mod.translate[1]}`} />}
          </div>
          <div className="px-3 mt-3 space-y-1">
            <p className="text-[10px] font-bold jy-muted uppercase tracking-wider mb-1">Acciones rápidas</p>
            {[
              { label: 'Duplicar', icon: 'Copy', fn: () => s.applyEffect(el.id, 'duplicate') },
              { label: 'Rotar 90°', icon: 'RotateCw', fn: () => s.applyEffect(el.id, 'rotate', 90) },
              { label: 'Eliminar', icon: 'Trash2', fn: () => s.applyEffect(el.id, 'delete') },
            ].map((a) => (
              <button key={a.label} onClick={a.fn}
                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-amber-500/12 jy-text font-medium transition-colors">
                <ToolIcon name={a.icon} size={13} className="text-amber-400" />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ k, v, dot }: { k: string; v: string; dot?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/4 pb-1">
      <span className="jy-muted shrink-0">{k}</span>
      <span className="jy-text font-medium text-right truncate flex items-center gap-1.5">
        {dot && <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ background: dot }} />}
        {v}
      </span>
    </div>
  )
}
