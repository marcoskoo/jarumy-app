'use client'

import { useMemo, useState } from 'react'
import { useJarumy } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToolIcon } from './ToolIcon'
import { computeThermalReport, type ThermalZone } from '@/lib/thermal'
import { computeAccessibility } from '@/lib/accessibility'
import { computeEvacuation } from '@/lib/evacuation'
import { computePvReport } from '@/lib/photovoltaic'

const statusColor = (st: 'ok' | 'warn' | 'fail' | 'bajo' | 'medio' | 'alto') =>
  st === 'ok' || st === 'bajo' ? 'text-emerald-400' : st === 'warn' || st === 'medio' ? 'text-amber-400' : 'text-rose-400'
const statusBg = (st: 'ok' | 'warn' | 'fail' | 'bajo' | 'medio' | 'alto') =>
  st === 'ok' || st === 'bajo' ? 'border-emerald-500/40 bg-emerald-500/10' : st === 'warn' || st === 'medio' ? 'border-amber-500/40 bg-amber-500/10' : 'border-rose-500/40 bg-rose-500/10'

// ============================================================
// TÉRMICA RNE E.020 — transmitancia U + condensación
// ============================================================
export function ThermalDialog() {
  const s = useJarumy()
  const open = s.dialog === 'thermal'
  const [zone, setZone] = useState('3')
  const report = useMemo(
    () => (open ? computeThermalReport(s.elements, s.mods, zone) : null),
    [open, s.elements, s.mods, zone],
  )
  if (!open || !report) return null
  const z: ThermalZone | undefined = report.zones.find((x) => x.zone === zone)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) s.setDialog(null) }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-2xl max-h-[85vh] overflow-y-auto jy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Thermometer" className="text-amber-400" size={18} />
            Térmica RNE E.020 — transmitancia U y condensación
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold jy-muted">Zona climática:</span>
          {report.zones.map((zz) => (
            <button
              key={zz.zone}
              onClick={() => setZone(zz.zone)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${zone === zz.zone ? 'bg-amber-500 text-zinc-950' : 'border jy-border jy-muted hover:jy-text'}`}
              title={`${zz.label} · muros U≤${zz.wallLimit} · techos U≤${zz.roofLimit} · HDD18 ${zz.hdd18}`}
            >
              Z{zz.zone}
            </button>
          ))}
          {z && <span className="text-[10.5px] jy-muted ml-1">{z.label} · {z.climate} · HDD18 {z.hdd18} °C·día</span>}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border jy-border px-2 py-2">
            <p className="text-[9.5px] jy-muted uppercase font-bold tracking-wider">U promedio</p>
            <p className="text-[16px] font-black text-amber-300 font-mono">{report.avgU.toFixed(2)}</p>
            <p className="text-[9px] jy-muted">W/m²·K</p>
          </div>
          <div className="rounded-xl border jy-border px-2 py-2">
            <p className="text-[9.5px] jy-muted uppercase font-bold tracking-wider">U peor caso</p>
            <p className={`text-[16px] font-black font-mono ${report.worstU > (z?.wallLimit ?? 1.4) ? 'text-rose-400' : 'text-emerald-400'}`}>{report.worstU.toFixed(2)}</p>
            <p className="text-[9px] jy-muted">límite muro {z?.wallLimit}</p>
          </div>
          <div className="rounded-xl border jy-border px-2 py-2">
            <p className="text-[9.5px] jy-muted uppercase font-bold tracking-wider">Elementos</p>
            <p className="text-[16px] font-black text-amber-300 font-mono">{report.rows.length}</p>
            <p className="text-[9px] jy-muted">{report.rows.filter((r) => r.status === 'fail').length} fuera de norma</p>
          </div>
        </div>

        <div className="space-y-1.5">
          {report.rows.slice(0, 14).map((r) => (
            <div key={r.elementId} className={`rounded-lg border px-3 py-2 ${statusBg(r.status)}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-bold jy-text truncate">{r.elementName}</span>
                <span className={`text-[12px] font-black font-mono ${statusColor(r.status)}`}>
                  U {r.uValue.toFixed(2)} <span className="jy-muted font-medium text-[10px]">/ ≤{r.zoneLimit}</span>
                </span>
              </div>
              <p className="text-[10px] jy-muted leading-snug mt-0.5">{r.assembly} · {r.thicknessCm.toFixed(0)} cm — {r.suggestion}</p>
            </div>
          ))}
        </div>

        {report.condensation.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10.5px] font-bold jy-muted uppercase tracking-wider pt-1">Riesgo de condensación superficial (Glaser · interior 20 °C / 60% HR)</p>
            {report.condensation.map((c, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2 ${statusBg(c.risk)}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-bold jy-text">{c.elementName}</span>
                  <span className={`text-[11px] font-black uppercase ${statusColor(c.risk)}`}>riesgo {c.risk}</span>
                </div>
                <p className="text-[10px] jy-muted leading-snug">{c.note} · punto de rocío {c.dewPointC.toFixed(1)} °C</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// ACCESIBILIDAD — RNE A.010/A.050
// ============================================================
export function AccessibilityDialog() {
  const s = useJarumy()
  const open = s.dialog === 'accesibilidad'
  const checks = useMemo(() => (open ? computeAccessibility(s.elements, s.mods) : []), [open, s.elements, s.mods])
  if (!open) return null
  const okN = checks.filter((c) => c.status === 'ok').length

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) s.setDialog(null) }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-xl max-h-[85vh] overflow-y-auto jy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Accessibility" className="text-amber-400" size={18} />
            Accesibilidad universal — RNE A.010 / A.050 · {okN}/{checks.length} conformes
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {checks.map((c) => (
            <div key={c.id} className={`rounded-lg border px-3 py-2.5 ${statusBg(c.status)}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold jy-text">{c.label}</span>
                <span className={`text-[10px] font-black uppercase tracking-wider ${statusColor(c.status)}`}>
                  {c.status === 'ok' ? 'conforme' : c.status === 'warn' ? 'observación' : 'no conforme'}
                </span>
              </div>
              <p className="text-[10.5px] jy-muted leading-snug mt-0.5">{c.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] jy-muted leading-relaxed pt-1">
          Criterios: puertas ancho libre ≥ 0.90 m (A.120) · pasillos ≥ 1.20 m · rampas pendiente ≤ 8% y ancho ≥ 0.90 m ·
          contrahuella ≤ 0.175 m y huella ≥ 0.25 m (Blondel) · baño accesible con giro de 1.20 m.
        </p>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// EVACUACIÓN — RNE A.130
// ============================================================
export function EvacuationDialog() {
  const s = useJarumy()
  const open = s.dialog === 'evacuacion'
  const rep = useMemo(() => (open ? computeEvacuation(s.elements, s.mods) : null), [open, s.elements, s.mods])
  if (!open || !rep) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) s.setDialog(null) }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-2xl max-h-[85vh] overflow-y-auto jy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="DoorOpen" className="text-amber-400" size={18} />
            Evacuación y salidas — RNE A.130
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { l: 'Ocupantes', v: String(rep.totalOccupants), d: 'aforo total A.010' },
            { l: 'Ancho salida', v: `${rep.totalExitWidthM.toFixed(2)} m`, d: 'Σ vanos de salida' },
            { l: 'Recorrido máx.', v: `${rep.maxTravelM.toFixed(1)} m`, d: '≤ 25 m vivienda' },
            { l: 'Aforo', v: rep.aflowOK ? 'OK' : 'FALLA', d: 'ancho vs ocupantes' },
          ].map((k) => (
            <div key={k.l} className="rounded-xl border jy-border px-1.5 py-2">
              <p className="text-[9px] jy-muted uppercase font-bold tracking-wider">{k.l}</p>
              <p className={`text-[15px] font-black font-mono ${k.v === 'FALLA' ? 'text-rose-400' : 'text-amber-300'}`}>{k.v}</p>
              <p className="text-[8.5px] jy-muted leading-tight">{k.d}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border jy-border">
          <table className="w-full text-[11px]">
            <thead className="jy-bg text-[9.5px] uppercase tracking-wider jy-muted">
              <tr>
                <th className="text-left px-3 py-1.5 font-bold">Ambiente</th>
                <th className="text-right px-2 py-1.5 font-bold">Área m²</th>
                <th className="text-right px-2 py-1.5 font-bold">Ocup.</th>
                <th className="text-left px-2 py-1.5 font-bold">Salida más próxima</th>
                <th className="text-right px-3 py-1.5 font-bold">Distancia</th>
              </tr>
            </thead>
            <tbody>
              {rep.rooms.map((r) => (
                <tr key={r.name} className="border-t jy-border/60">
                  <td className="px-3 py-1.5 font-semibold jy-text">{r.name}</td>
                  <td className="px-2 py-1.5 text-right font-mono jy-muted">{r.areaM2.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right font-mono jy-muted">{r.occupants}</td>
                  <td className="px-2 py-1.5 jy-muted">{r.nearestDoor}</td>
                  <td className={`px-3 py-1.5 text-right font-mono font-bold ${r.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {r.distanceM.toFixed(1)} m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5">
          {rep.checks.map((c) => (
            <div key={c.label} className={`rounded-lg border px-3 py-2 ${statusBg(c.status)}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-bold jy-text">{c.label}</span>
                <span className={`text-[10px] font-black uppercase ${statusColor(c.status)}`}>{c.status === 'ok' ? 'cumple' : c.status === 'warn' ? 'alerta' : 'no cumple'}</span>
              </div>
              <p className="text-[10.5px] jy-muted leading-snug">{c.detail}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// FOTOVOLTAICO — potencial solar de techos
// ============================================================
export function PvDialog() {
  const s = useJarumy()
  const open = s.dialog === 'fotovoltaico'
  const rep = useMemo(
    () => (open ? computePvReport(s.elements, s.mods, s.sun.lat) : null),
    [open, s.elements, s.mods, s.sun.lat],
  )
  if (!open || !rep) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) s.setDialog(null) }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-lg max-h-[85vh] overflow-y-auto jy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="SolarPower" className="text-amber-400" size={18} />
            Potencial fotovoltaico — lat {s.sun.lat.toFixed(0)}°
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {rep.rows.map((r) => (
            <div key={r.label} className="rounded-xl border jy-border px-3 py-2 flex items-baseline justify-between gap-2">
              <span className="text-[10.5px] jy-muted font-semibold">{r.label}</span>
              <span className="text-[13px] font-black font-mono text-amber-300">{r.value}</span>
            </div>
          ))}
        </div>

        <p className="text-[10.5px] jy-muted leading-relaxed">
          Cálculo con irradiancia GHI {rep.ghiAnnualKwhM2Day.toFixed(1)} kWh/m²·día para latitud {s.sun.lat.toFixed(0)}°,
          PR {rep.performanceRatio.toFixed(2)}, paneles de 550 W (1.65 m²), factor de ocupación 50% del techo y
          tarifa residencial S/ 0.52/kWh. La latitud se toma del heliodón — ajústela para otra ciudad.
        </p>

        <button
          onClick={() => { s.setDialog('normativa'); s.pushConsole({ text: 'FOTOVOLTAICO: revise también la TÉRMICA E.020 y la normativa para el expediente completo', kind: 'out' }) }}
          className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-[12px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.98] transition-all"
        >
          Ver normativa del expediente
        </button>
      </DialogContent>
    </Dialog>
  )
}
