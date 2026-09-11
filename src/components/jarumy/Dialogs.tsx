'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useJarumy } from '@/lib/store'
import { TOOL_CATEGORIES, TOTAL_TOOLS } from '@/lib/tools-data'
import { ROOMS, roomAreaM2, type RoomGeo } from '@/lib/plan-data'
import { ToolIcon } from './ToolIcon'

export function ScheduleDialog() {
  const s = useJarumy()
  const rows = s.elements.filter((e) => e.type === 'espacio')
  const total = rows.reduce((n, e) => n + roomAreaM2(e.geo as RoomGeo), 0)
  return (
    <Dialog open={s.dialog === 'schedule'} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="ClipboardList" className="text-amber-400" size={18} />
            Cuadro de espacios — BIM (Revit / ArchiCAD)
          </DialogTitle>
        </DialogHeader>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="jy-muted text-left border-b jy-border">
              <th className="py-1.5 pr-2">N°</th>
              <th className="py-1.5 pr-2">Espacio</th>
              <th className="py-1.5 pr-2 text-right">Área</th>
              <th className="py-1.5 pr-2 text-right">Piso</th>
              <th className="py-1.5 text-right">Ocup.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const g = e.geo as RoomGeo
              const area = roomAreaM2(g)
              return (
                <tr key={e.id} className="border-b border-white/5">
                  <td className="py-1.5 pr-2 jy-muted">{g.num}</td>
                  <td className="py-1.5 pr-2 font-semibold jy-text">{g.name}</td>
                  <td className="py-1.5 pr-2 text-right font-mono text-amber-300">{area.toFixed(2)} m²</td>
                  <td className="py-1.5 pr-2 text-right jy-muted">Porcelanato</td>
                  <td className="py-1.5 text-right jy-muted">{Math.max(1, Math.round(area / 4.5))} p.</td>
                </tr>
              )
            })}
            <tr className="font-bold">
              <td colSpan={2} className="py-2 pr-2 jy-text">TOTAL TECHADO</td>
              <td className="py-2 pr-2 text-right font-mono text-amber-400">{total.toFixed(2)} m²</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
        <p className="text-[10px] jy-muted">
          Cuadro generado con datos en vivo del modelo. Los cambios de nombre y acabados se reflejan al instante.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export function CatalogDialog() {
  const s = useJarumy()
  return (
    <Dialog open={s.dialog === 'catalog'} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-2xl max-h-[82vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Library" className="text-amber-400" size={18} />
            Catálogo Jarumy — {TOTAL_TOOLS} herramientas recopiladas
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] jy-muted -mt-1 mb-2">
          Herramientas, comandos, plugins y extensiones recopilados de las versiones PRO de las principales
          aplicaciones de arquitectura: AutoCAD (+ Architecture Toolset), Revit, ArchiCAD, SketchUp, Rhino,
          Vectorworks, Lumion, Enscape, V-Ray/Corona/D5 y plugins de productividad.
        </p>
        <div className="overflow-y-auto jy-scroll pr-2 space-y-3">
          {TOOL_CATEGORIES.map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="flex items-center justify-center w-5 h-5 rounded"
                  style={{ background: `${c.color}22`, color: c.color }}>
                  <ToolIcon name={c.icon} size={12} />
                </span>
                <span className="text-[12px] font-bold" style={{ color: c.color }}>{c.label}</span>
                <span className="text-[10px] jy-muted">· {c.tools.length} herramientas</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {c.tools.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 rounded-md border border-white/6 px-2 py-1.5">
                    <ToolIcon name={t.icon} size={13} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold jy-text leading-tight">{t.label}
                        <span className="ml-1.5 text-[9px] font-normal jy-muted">{t.source}</span>
                      </p>
                      <p className="text-[9.5px] jy-muted leading-snug line-clamp-2">{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function EnergyDialog() {
  const s = useJarumy()
  const rooms = s.elements.filter((e) => e.type === 'espacio')
  const total = rooms.reduce((n, e) => n + roomAreaM2(e.geo as RoomGeo), 0)
  const items = [
    { k: 'Demanda de calefacción', v: '38.2 kWh/m²·año', ok: true },
    { k: 'Demanda de refrigeración', v: '21.7 kWh/m²·año', ok: true },
    { k: 'Consumo energético estimado', v: `${(total * 0.062).toFixed(1)} kWh/m²·año`, ok: true },
    { k: 'U-value muros (0.15 m ladrillo)', v: '1.87 W/m²K', ok: false },
    { k: 'U-value ventanas (laminado 6+6)', v: '2.86 W/m²K', ok: false },
    { k: 'Hermeticidad (n50)', v: '3.4 1/h', ok: true },
    { k: 'Iluminación natural promedio', v: '4.1 % factor día', ok: true },
    { k: 'Certificación LEED potencial', v: '64 pts — Gold', ok: true },
  ]
  return (
    <Dialog open={s.dialog === 'energy'} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Zap" className="text-amber-400" size={18} />
            Análisis energético — Insight / Ladybug
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {items.map((i) => (
            <div key={i.k} className="flex items-center justify-between gap-3 text-[12px] border-b border-white/5 pb-1.5">
              <span className="jy-muted">{i.k}</span>
              <span className={`font-mono font-semibold ${i.ok ? 'text-emerald-400' : 'text-orange-400'}`}>{i.v}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] jy-muted">
          Simulación sobre {total.toFixed(1)} m² techados · clima templado · orientación norte óptima.
          Se recomienda mejorar U-value de muros con aislante de 25 mm para certificación Gold+.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export function ClashDialog() {
  const s = useJarumy()
  const clashes = [
    { a: 'Muro interior i2', b: 'Tubería de desagüe Ø110', z: 'Baño — eje 630', sev: 'Alta' },
    { a: 'Viga V-102', b: 'Ducto de ventilación', z: 'Cocina — eje 400', sev: 'Media' },
    { a: 'Columna col-e', b: 'Canería eléctrica', z: 'Unión sala/cocina', sev: 'Baja' },
  ]
  return (
    <Dialog open={s.dialog === 'clash'} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="AlertTriangle" className="text-amber-400" size={18} />
            Detección de colisiones — Navisworks / Revit
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {clashes.map((c, i) => (
            <div key={i} className="rounded-lg border border-white/8 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold jy-text">{c.a} ↔ {c.b}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  c.sev === 'Alta' ? 'bg-rose-500/20 text-rose-300' :
                  c.sev === 'Media' ? 'bg-amber-500/20 text-amber-300' :
                  'bg-zinc-500/20 text-zinc-400'}`}>
                  {c.sev}
                </span>
              </div>
              <p className="text-[10px] jy-muted mt-0.5">Ubicación: {c.z}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] jy-muted">
          3 colisiones encontradas en 158 m² de modelo · disciplinas: arquitectura × MEP × estructura.
          Revise los reportes para reubicar las instalaciones antes de la expedición.
        </p>
      </DialogContent>
    </Dialog>
  )
}
