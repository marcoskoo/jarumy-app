'use client'

// ============================================================
// JARUMY APP — Capa de heliodón (sombras + trayectoria solar)
// Fase 'under': polígonos de sombra (debajo de los elementos)
// Fase 'over': diagrama solar + disco del sol (encima, sin captura)
// Norte = arriba (-y) · Este = derecha (+x), como en la lámina.
// ============================================================

import React from 'react'
import type { PlanElement } from '@/lib/plan-data'
import type { WallGeo, ColGeo } from '@/lib/plan-data'
import type { Mod, SunSettings } from '@/lib/store'
import {
  solarPosition, sunTimes, sunPathForDay, shadowVector, convexHull, dayOfYear, dayLabel,
} from '@/lib/solar'

const CX = 600          // centro del plano (150..1050)
const CY = 400          // (100..700)
const CHART_R = 335     // radio del diagrama de trayectorias
const SHADOW_CAP = 300  // longitud máxima de sombra dibujada (px)

interface Props {
  elements: PlanElement[]
  mods: Record<string, Mod>
  sun: SunSettings
  phase: 'under' | 'over'
}

/** Rectángulo (x1,y1,x2,y2) de un muro según su línea media y espesor. */
function wallRect(g: WallGeo, mod?: Mod): [number, number, number, number] {
  const t = mod?.thickness ?? g.t
  if (g.x1 === g.x2) {
    return [g.x1 - t / 2, Math.min(g.y1, g.y2), g.x1 + t / 2, Math.max(g.y1, g.y2)]
  }
  return [Math.min(g.x1, g.x2), g.y1 - t / 2, Math.max(g.x1, g.x2), g.y1 + t / 2]
}

/** Polígono de sombra: envoltura convexa del rect y su proyección desplazada. */
function shadowPolygon(x1: number, y1: number, x2: number, y2: number, dx: number, dy: number): string {
  const pts: Array<[number, number]> = [
    [x1, y1], [x2, y1], [x2, y2], [x1, y2],
    [x1 + dx, y1 + dy], [x2 + dx, y1 + dy], [x2 + dx, y2 + dy], [x1 + dx, y2 + dy],
  ]
  return convexHull(pts).map((p) => p.join(',')).join(' ')
}

/** Proyección del cielo: posición del sol sobre el plano (r = R·cos(elev)). */
function skyPoint(az: number, el: number, r = CHART_R): [number, number] {
  const rad = (az * Math.PI) / 180
  const elR = (el * Math.PI) / 180
  const d = r * Math.cos(elR)
  return [CX + d * Math.sin(rad), CY - d * Math.cos(rad)]
}

function hourToLabel(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export default function HeliodonLayer({ elements, mods, sun, phase }: Props) {
  const pos = solarPosition(sun.lat, sun.day, sun.hour)
  const times = sunTimes(sun.lat, sun.day)

  // ---------- fase UNDER: sombras proyectadas ----------
  if (phase === 'under') {
    if (!pos) return null // sol bajo el horizonte: sin sombras
    const hPx = sun.wallH * 60 // altura de muros en px del plano
    let [dx, dy] = shadowVector(pos.azimuth, pos.elevation, hPx)
    const len = Math.hypot(dx, dy)
    if (len > SHADOW_CAP) { dx = (dx / len) * SHADOW_CAP; dy = (dy / len) * SHADOW_CAP }

    const polys: React.ReactNode[] = []
    elements.forEach((el, i) => {
      if (mods[el.id]?.deleted) return
      if (el.type === 'muro') {
        const [x1, y1, x2, y2] = wallRect(el.geo as WallGeo, mods[el.id])
        polys.push(<polygon key={`w${i}`} points={shadowPolygon(x1, y1, x2, y2, dx, dy)} />)
      } else if (el.type === 'columna') {
        const g = el.geo as ColGeo
        const s = mods[el.id]?.size ?? g.size
        polys.push(<polygon key={`c${i}`}
          points={shadowPolygon(g.x - s / 2, g.y - s / 2, g.x + s / 2, g.y + s / 2, dx, dy)} />)
      }
    })

    return (
      <g style={{ mixBlendMode: 'multiply' }} pointerEvents="none">
        {polys.map((p, i) => (
          <g key={i} fill="rgba(10,12,20,0.34)">{p}</g>
        ))}
        {/* vector de dirección solar en el centro (guía visual) */}
        <g opacity="0.5">
          <line x1={CX} y1={CY} x2={CX + dx * 0.9} y2={CY + dy * 0.9}
            stroke="rgba(120,113,108,0.55)" strokeWidth="1" strokeDasharray="3 5" />
          <circle cx={CX + dx * 0.9} cy={CY + dy * 0.9} r="2.5" fill="rgba(120,113,108,0.8)" />
        </g>
      </g>
    )
  }

  // ---------- fase OVER: diagrama solar ----------
  const summer = sun.lat >= 0 ? dayOfYear(6, 21) : dayOfYear(12, 21)
  const winter = sun.lat >= 0 ? dayOfYear(12, 21) : dayOfYear(6, 21)
  const equinox = dayOfYear(3, 21)
  const days = [
    { day: summer, label: 'Verano', color: 'rgba(251,191,36,0.85)' },
    { day: equinox, label: 'Equinoccio', color: 'rgba(148,163,184,0.6)' },
    { day: winter, label: 'Invierno', color: 'rgba(96,165,250,0.6)' },
  ]

  return (
    <g pointerEvents="none" className="jy-heliodon">
      {/* aro del diagrama + cardinales */}
      <circle cx={CX} cy={CY} r={CHART_R} fill="none" stroke="rgba(245,158,11,0.16)" strokeWidth="1" strokeDasharray="2 6" />
      <circle cx={CX} cy={CY} r={CHART_R * 0.5} fill="none" stroke="rgba(245,158,11,0.10)" strokeWidth="0.8" strokeDasharray="2 6" />
      {[
        { l: 'N', x: CX, y: CY - CHART_R - 10 },
        { l: 'E', x: CX + CHART_R + 16, y: CY + 4 },
        { l: 'S', x: CX, y: CY + CHART_R + 22 },
        { l: 'O', x: CX - CHART_R - 16, y: CY + 4 },
      ].map((c) => (
        <text key={c.l} x={c.x} y={c.y} textAnchor="middle" fontSize="12" fontWeight="800"
          style={{ fill: 'rgba(245,158,11,0.55)' }}>{c.l}</text>
      ))}

      {/* trayectorias de las 3 fechas clave */}
      {sun.showPath && days.map(({ day, label, color }) => {
        const pts = sunPathForDay(sun.lat, day, 0.5)
        if (pts.length < 2) return null
        const isCurrent = Math.abs(day - sun.day) < 8
        const d = pts.map(({ pos: p }) => skyPoint(p.azimuth, p.elevation).join(',')).join(' ')
        return (
          <g key={day} opacity={isCurrent ? 1 : 0.66}>
            <polyline points={d} fill="none" stroke={color}
              strokeWidth={isCurrent ? 1.8 : 1.1} strokeDasharray={isCurrent ? undefined : '5 4'} />
            {pts.filter(({ h }) => Math.abs(h - Math.round(h)) < 0.01 && Math.round(h) % 3 === 0).map(({ h, pos: p }) => {
              const [x, y] = skyPoint(p.azimuth, p.elevation)
              return (
                <g key={h}>
                  <circle cx={x} cy={y} r={isCurrent ? 2.6 : 1.8} fill={color} />
                  {isCurrent && Math.round(h) % 6 === 0 && (
                    <text x={x} y={y - 6} textAnchor="middle" fontSize="8.5" fontWeight="700"
                      style={{ fill: 'rgba(251,191,36,0.9)' }}>{h}h</text>
                  )}
                </g>
              )
            })}
            {(() => {
              // etiqueta de fecha al inicio de la curva
              const [x, y] = skyPoint(pts[0].pos.azimuth, pts[0].pos.elevation)
              return (
                <text x={x - 6} y={y - 5} textAnchor="end" fontSize="8.5" fontWeight="700"
                  style={{ fill: color }}>{label}</text>
              )
            })()}
          </g>
        )
      })}

      {/* disco del sol en su posición actual */}
      {pos && (() => {
        const [sx, sy] = skyPoint(pos.azimuth, pos.elevation)
        return (
          <g>
            {/* rayo hacia el centro del plano */}
            <line x1={sx} y1={sy} x2={CX} y2={CY} stroke="rgba(251,191,36,0.5)"
              strokeWidth="1.1" strokeDasharray="4 5" />
            <circle cx={sx} cy={sy} r="13" fill="rgba(251,191,36,0.18)" />
            <circle cx={sx} cy={sy} r="8.5" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.4" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
              const rad = (a * Math.PI) / 180
              return (
                <line key={a} x1={sx + Math.cos(rad) * 10} y1={sy + Math.sin(rad) * 10}
                  x2={sx + Math.cos(rad) * 14} y2={sy + Math.sin(rad) * 14}
                  stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" />
              )
            })}
            <text x={sx} y={sy - 18} textAnchor="middle" fontSize="10" fontWeight="800" style={{ fill: '#fbbf24' }}>
              {hourToLabel(sun.hour)}
            </text>
            <text x={sx} y={sy + 27} textAnchor="middle" fontSize="8.5" fontWeight="600"
              style={{ fill: 'rgba(251,191,36,0.8)' }}>
              az {Math.round(pos.azimuth)}° · el {Math.round(pos.elevation)}°
            </text>
          </g>
        )
      })()}

      {/* leyenda compacta */}
      <g>
        <rect x={24} y={118} width="150" height={pos ? 46 : 26} rx="6"
          fill="rgba(24,24,27,0.82)" stroke="rgba(245,158,11,0.3)" strokeWidth="0.8" />
        <text x="34" y="134" fontSize="9.5" fontWeight="800" style={{ fill: '#fbbf24' }}>
          HELIODÓN · {dayLabel(sun.day)}
        </text>
        <text x="34" y="146" fontSize="8" style={{ fill: 'rgba(228,228,231,0.75)' }}>
          lat {sun.lat}° · muros {sun.wallH.toFixed(1)} m
        </text>
        {pos && (
          <text x="34" y="158" fontSize="8" style={{ fill: 'rgba(228,228,231,0.75)' }}>
            sombra {(sun.wallH / Math.tan((pos.elevation * Math.PI) / 180)).toFixed(1)} m
          </text>
        )}
      </g>
    </g>
  )
}
