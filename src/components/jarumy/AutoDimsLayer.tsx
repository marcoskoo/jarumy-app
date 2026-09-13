'use client'

// ============================================================
// JARUMY APP — Capa de acotación automática (SVG)
// Dibuja las cotas interiores de cada ambiente encima de los
// elementos, sin capturar el cursor. Color azul cielo para
// diferenciarlas de las cotas manuales (ámbar).
// ============================================================

import React from 'react'
import { autoDimensions, autoDimText, type AutoDim } from '@/lib/auto-dims'
import type { PlanElement } from '@/lib/plan-data'
import type { Mod } from '@/lib/store'

const STROKE = '#38bdf8'

function SingleDim({ d }: { d: AutoDim }) {
  const fs = d.small ? 9 : 10.5
  const tick = (x: number, y: number) => (
    <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} stroke={STROKE} strokeWidth="1.4" />
  )

  if (!d.vert) {
    // cota horizontal (ancho): línea de cota por debajo de la arista superior
    const dy = d.y1 + d.off
    return (
      <g>
        <line x1={d.x1} y1={d.y1 + 3} x2={d.x1} y2={dy - 3} stroke={STROKE} strokeWidth="0.7" opacity="0.55" />
        <line x1={d.x2} y1={d.y2 + 3} x2={d.x2} y2={dy - 3} stroke={STROKE} strokeWidth="0.7" opacity="0.55" />
        <line x1={d.x1} y1={dy} x2={d.x2} y2={dy} stroke={STROKE} strokeWidth="0.9" />
        {tick(d.x1, dy)}
        {tick(d.x2, dy)}
        <text x={(d.x1 + d.x2) / 2} y={dy + fs + 1} textAnchor="middle" fontSize={fs} fontWeight="700"
          style={{ fill: STROKE }}>
          {autoDimText(d)}
        </text>
      </g>
    )
  }

  // cota vertical (alto): línea de cota a la derecha de la arista izquierda
  const dx = d.x1 + d.off
  const my = (d.y1 + d.y2) / 2
  return (
    <g>
      <line x1={d.x1 + 3} y1={d.y1} x2={dx - 3} y2={d.y1} stroke={STROKE} strokeWidth="0.7" opacity="0.55" />
      <line x1={d.x2 + 3} y1={d.y2} x2={dx - 3} y2={d.y2} stroke={STROKE} strokeWidth="0.7" opacity="0.55" />
      <line x1={dx} y1={d.y1} x2={dx} y2={d.y2} stroke={STROKE} strokeWidth="0.9" />
      {tick(dx, d.y1)}
      {tick(dx, d.y2)}
      <text x={dx + fs + 1} y={my} textAnchor="middle" fontSize={fs} fontWeight="700"
        style={{ fill: STROKE }} transform={`rotate(-90 ${dx + fs + 1} ${my})`}>
        {autoDimText(d)}
      </text>
    </g>
  )
}

interface Props {
  elements: PlanElement[]
  mods: Record<string, Mod>
}

export default function AutoDimsLayer({ elements, mods }: Props) {
  const dims = autoDimensions(elements, mods)
  if (dims.length === 0) return null
  return (
    <g pointerEvents="none" className="jy-autodims">
      {dims.map((d, i) => <SingleDim key={i} d={d} />)}
    </g>
  )
}
