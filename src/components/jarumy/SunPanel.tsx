'use client'

// ============================================================
// JARUMY APP — Panel del heliodón (control de sol y sombras)
// Flotante sobre el lienzo: latitud, fecha, hora, altura de
// muros, presets y animación día completo.
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { useJarumy } from '@/lib/store'
import { solarPosition, sunTimes, dayLabel, dayOfYear } from '@/lib/solar'
import { ToolIcon } from './ToolIcon'

const LAT_PRESETS = [
  { label: 'Lima', v: -12 },
  { label: 'CDMX', v: 19 },
  { label: 'Madrid', v: 40 },
  { label: 'Ushuaia', v: -55 },
]

function fmtHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export default function SunPanel() {
  const s = useJarumy()
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // animación: recorre el día de amanecer a atardecer
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      return
    }
    timerRef.current = setInterval(() => {
      const st = useJarumy.getState()
      const { sunrise, sunset } = sunTimes(st.sun.lat, st.sun.day)
      const from = Math.max(5, Math.floor(sunrise) + 1)
      const to = Math.min(19, Math.ceil(sunset) - 1)
      let h = st.sun.hour + 0.25
      if (h >= to) h = from
      st.setSun({ hour: h })
    }, 220)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [playing])

  const pos = solarPosition(s.sun.lat, s.sun.day, s.sun.hour)
  const times = sunTimes(s.sun.lat, s.sun.day)
  const summer = s.sun.lat >= 0 ? dayOfYear(6, 21) : dayOfYear(12, 21)
  const winter = s.sun.lat >= 0 ? dayOfYear(12, 21) : dayOfYear(6, 21)

  const row = 'flex items-center gap-2'
  const slider = 'w-full h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-amber-500'

  return (
    <div
      className="absolute top-3 right-3 z-30 w-[238px] max-w-[calc(100vw-24px)] rounded-xl border shadow-2xl jy-pop-in overflow-hidden"
      style={{ background: 'rgba(24,24,27,0.96)', borderColor: 'rgba(245,158,11,0.45)' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* encabezado */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-zinc-800 bg-gradient-to-r from-amber-500/15 to-transparent">
        <ToolIcon name="Sun" className="text-amber-400" size={15} />
        <span className="text-[11.5px] font-bold text-zinc-100 flex-1">Heliodón · Sol y sombras</span>
        <button
          onClick={() => { setPlaying(false); s.setSun({ active: false }) }}
          className="text-zinc-400 hover:text-amber-300 transition-colors"
          title="Cerrar heliodón"
        >
          <ToolIcon name="X" size={14} />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5 max-h-[calc(100vh-320px)] overflow-y-auto jy-scroll">
        {/* readout */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-mono font-bold text-amber-300">{fmtHour(s.sun.hour)}</span>
            <span className="text-[9.5px] text-zinc-500">{dayLabel(s.sun.day)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[9.5px]">
            {pos ? (
              <span className="text-zinc-400">
                az <b className="text-zinc-200 font-mono">{Math.round(pos.azimuth)}°</b> · el{' '}
                <b className="text-zinc-200 font-mono">{Math.round(pos.elevation)}°</b>
              </span>
            ) : (
              <span className="text-blue-400/90 font-semibold">Noche — sol bajo el horizonte</span>
            )}
            <span className="text-zinc-500 font-mono">
              {fmtHour(times.sunrise)}–{fmtHour(times.sunset)}
            </span>
          </div>
        </div>

        {/* hora */}
        <div>
          <div className={row}>
            <span className="text-[10px] font-semibold text-zinc-400 w-[68px] shrink-0">Hora</span>
            <input type="range" min={4.5} max={19.5} step={0.25} value={s.sun.hour}
              className={slider} onChange={(e) => s.setSun({ hour: Number(e.target.value) })} />
            <button
              onClick={() => setPlaying(!playing)}
              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center border transition-colors"
              style={{
                borderColor: playing ? '#fbbf24' : 'rgba(228,228,231,0.25)',
                background: playing ? 'linear-gradient(145deg,#f59e0b,#f97316)' : 'transparent',
                color: playing ? '#18181b' : '#d4d4d8',
              }}
              title={playing ? 'Pausar animación' : 'Animar día completo'}
            >
              <ToolIcon name={playing ? 'Pause' : 'Play'} size={11} />
            </button>
          </div>
        </div>

        {/* fecha */}
        <div>
          <div className={row}>
            <span className="text-[10px] font-semibold text-zinc-400 w-[68px] shrink-0">Fecha</span>
            <input type="range" min={1} max={365} step={1} value={s.sun.day}
              className={slider} onChange={(e) => s.setSun({ day: Number(e.target.value) })} />
          </div>
          <div className="flex gap-1 mt-1.5">
            {[
              { l: 'Verano', d: summer },
              { l: 'Equinoccio', d: dayOfYear(3, 21) },
              { l: 'Invierno', d: winter },
            ].map((p) => (
              <button key={p.l}
                onClick={() => s.setSun({ day: p.d })}
                className={`flex-1 rounded-md border px-1 py-1 text-[9px] font-semibold transition-colors ${
                  s.sun.day === p.d
                    ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                    : 'border-zinc-700/70 text-zinc-400 hover:border-amber-500/50 hover:text-amber-200'
                }`}>
                {p.l}
              </button>
            ))}
          </div>
        </div>

        {/* latitud */}
        <div>
          <div className={row}>
            <span className="text-[10px] font-semibold text-zinc-400 w-[68px] shrink-0">Latitud</span>
            <input type="range" min={-55} max={55} step={1} value={s.sun.lat}
              className={slider} onChange={(e) => s.setSun({ lat: Number(e.target.value) })} />
            <span className="text-[9.5px] font-mono text-amber-300 w-[30px] text-right shrink-0">
              {s.sun.lat}°
            </span>
          </div>
          <div className="flex gap-1 mt-1.5">
            {LAT_PRESETS.map((p) => (
              <button key={p.label}
                onClick={() => s.setSun({ lat: p.v })}
                className={`flex-1 rounded-md border px-1 py-1 text-[9px] font-semibold transition-colors ${
                  s.sun.lat === p.v
                    ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                    : 'border-zinc-700/70 text-zinc-400 hover:border-amber-500/50 hover:text-amber-200'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* altura de muros */}
        <div>
          <div className={row}>
            <span className="text-[10px] font-semibold text-zinc-400 w-[68px] shrink-0">Alt. muros</span>
            <input type="range" min={2} max={3.5} step={0.1} value={s.sun.wallH}
              className={slider} onChange={(e) => s.setSun({ wallH: Number(e.target.value) })} />
            <span className="text-[9.5px] font-mono text-amber-300 w-[30px] text-right shrink-0">
              {s.sun.wallH.toFixed(1)}
            </span>
          </div>
        </div>

        {/* toggles */}
        <div className="flex gap-1.5 pt-0.5">
          <button
            onClick={() => s.setSun({ showPath: !s.sun.showPath })}
            className={`flex-1 rounded-md border px-2 py-1.5 text-[9.5px] font-semibold transition-colors ${
              s.sun.showPath
                ? 'border-amber-400/70 bg-amber-500/15 text-amber-300'
                : 'border-zinc-700/70 text-zinc-500 hover:text-zinc-300'
            }`}>
            Trayectorias
          </button>
          <button
            onClick={() => useJarumy.getState().runGlobal('toggleAreas')}
            className={`flex-1 rounded-md border px-2 py-1.5 text-[9.5px] font-semibold transition-colors ${
              s.areaLabels
                ? 'border-amber-400/70 bg-amber-500/15 text-amber-300'
                : 'border-zinc-700/70 text-zinc-500 hover:text-zinc-300'
            }`}>
            Áreas m²
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 border-t border-zinc-800 text-[8.5px] text-zinc-500 flex items-center gap-1">
        <ToolIcon name="Sun" size={9} />
        Convención: N arriba · sombras según elevación solar
      </div>
    </div>
  )
}
