'use client'

// ============================================================
// JARUMY APP — Diálogo de exportación PDF a escala
// Elige papel (A4/A3/A2, horiz./vert.), escala real (1:25 a
// 1:250 o automática) y contenido (cotas automáticas, áreas,
// mobiliario). Muestra el encaje del plano en el papel con
// vista previa y genera el PDF vectorial con cartela.
// ============================================================

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useJarumy } from '@/lib/store'
import { PAPERS, PDF_SCALES, fitInfo, exportPlanPdf, type PaperId } from '@/lib/pdf-export'
import { ToolIcon } from './ToolIcon'
import { toast } from 'sonner'

const PREVIEW_W = 168

export function ExportPdfDialog() {
  const s = useJarumy()
  const [paper, setPaper] = useState<PaperId>('a3')
  const [landscape, setLandscape] = useState(true)
  const [scale, setScale] = useState<number | 'auto'>('auto')
  const [includeAutoDims, setIncludeAutoDims] = useState(true)
  const [includeAreas, setIncludeAreas] = useState(true)
  const [includeFurniture, setIncludeFurniture] = useState(true)
  const [title, setTitle] = useState('VIVIENDA UNIFAMILIAR')
  const [busy, setBusy] = useState(false)

  const info = useMemo(
    () => fitInfo(s.elements, s.mods, s.layers, paper, landscape, includeFurniture),
    [s.elements, s.mods, s.layers, paper, landscape, includeFurniture],
  )

  const effScale = scale === 'auto' ? (info.autoScale ?? 250) : scale
  const fits = info.fitAt[effScale] ?? false
  const mmPerM = 1000 / effScale
  const planWmm = info.planW * mmPerM
  const planHmm = info.planH * mmPerM

  // vista previa: papel con el plano encajado
  const p = PAPERS[paper]
  const pw = landscape ? p.h : p.w
  const ph = landscape ? p.w : p.h
  const kPrev = Math.min((PREVIEW_W - 20) / pw, 110 / ph)
  const prevW = pw * kPrev, prevH = ph * kPrev
  const mx = 12 * kPrev          // margen interior
  const cartH = 24 * kPrev       // cartela
  const dX = mx, dY = mx
  const dW = prevW - 2 * mx, dH = prevH - 2 * mx - cartH
  const boxW = Math.min(planWmm * kPrev, dW)
  const boxH = Math.min(planHmm * kPrev, dH)
  const boxX = dX + (dW - planWmm * kPrev) / 2
  const boxY = dY + (dH - planHmm * kPrev) / 2
  const clipped = planWmm * kPrev > dW + 0.5 || planHmm * kPrev > dH + 0.5

  const doExport = async () => {
    setBusy(true)
    try {
      const res = await exportPlanPdf(s.elements, s.mods, s.layers, {
        scale: effScale, paper, landscape, includeAutoDims, includeAreas, includeFurniture, title,
      })
      s.pushConsole({
        text: `PDF GENERADO: ${res.filename} — ${res.pageW.toFixed(0)}×${res.pageH.toFixed(0)} mm · escala 1:${effScale} · plano ${res.planW.toFixed(2)}×${res.planH.toFixed(2)} m · ${(res.bytes / 1024).toFixed(1)} KB`,
        kind: 'out',
      })
      toast.success(`PDF a escala 1:${effScale} generado`, {
        description: `${res.filename} · ${PAPERS[paper].label} ${landscape ? 'horizontal' : 'vertical'} · ${(res.bytes / 1024).toFixed(0)} KB`,
      })
      s.setDialog(null)
    } catch (err) {
      console.error(err)
      toast.error('No se pudo generar el PDF', { description: String(err) })
    } finally {
      setBusy(false)
    }
  }

  const chip = (active: boolean) =>
    `rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
      active
        ? 'border-amber-400/80 bg-amber-500/15 text-amber-300'
        : 'border-zinc-700/60 text-zinc-400 hover:border-amber-500/40 hover:text-amber-200'
    }`

  return (
    <Dialog open={s.dialog === 'pdf'} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-2xl max-h-[88vh] overflow-y-auto jy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="FileDown" className="text-amber-400" size={18} />
            Exportar PDF a escala — lámina vectorial
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] jy-muted -mt-1">
          PDF vectorial con escala real (1 m = {(mmPerM).toFixed(1)} mm en papel), cartela, rosa de los vientos
          y barra de escala gráfica. Imprima al 100% (sin ajustar a página) para conservar la escala.
        </p>

        <div className="grid sm:grid-cols-[1fr_auto] gap-4">
          {/* ---------- opciones ---------- */}
          <div className="space-y-3 min-w-0">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Papel</p>
              <div className="flex gap-1.5 flex-wrap">
                {(Object.keys(PAPERS) as PaperId[]).map((id) => (
                  <button key={id} onClick={() => setPaper(id)} className={chip(paper === id)}>
                    {PAPERS[id].label}
                    <span className="text-[9px] opacity-60 ml-1">{PAPERS[id].w}×{PAPERS[id].h}</span>
                  </button>
                ))}
                <button onClick={() => setLandscape(!landscape)} className={chip(landscape)}>
                  {landscape ? 'Horizontal' : 'Vertical'}
                </button>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Escala</p>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setScale('auto')}
                  className={chip(scale === 'auto')}
                  title="La mayor escala estándar en la que el plano cabe completo"
                >
                  Auto{info.autoScale ? ` · 1:${info.autoScale}` : ''}
                </button>
                {PDF_SCALES.map((sc) => (
                  <button key={sc} onClick={() => setScale(sc)} className={chip(scale === sc)}>
                    1:{sc}
                    {!info.fitAt[sc] && <span className="text-rose-400 ml-1" title="No cabe en el papel">⚠</span>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Contenido</p>
              <div className="flex gap-1.5 flex-wrap">
                {([
                  ['Cotas automáticas', includeAutoDims, setIncludeAutoDims],
                  ['Áreas m²', includeAreas, setIncludeAreas],
                  ['Mobiliario', includeFurniture, setIncludeFurniture],
                ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
                  <button key={label} onClick={() => set(!val)} className={chip(val)}>
                    {val ? '✓ ' : ''}{label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Proyecto (cartela)</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={34}
                className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-1.5 text-[12px] jy-text outline-none focus:border-amber-400/70"
                placeholder="Nombre del proyecto"
              />
            </div>

            {/* estado de encaje */}
            <div className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
              fits ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            }`}>
              {fits ? '✓' : '⚠'} Plano de <b>{info.planW.toFixed(2)} × {info.planH.toFixed(2)} m</b> →
              ocupa <b>{planWmm.toFixed(0)} × {planHmm.toFixed(0)} mm</b> a 1:{effScale} en{' '}
              {PAPERS[paper].label} {landscape ? 'horizontal' : 'vertical'} (útil {info.drawW.toFixed(0)} × {info.drawH.toFixed(0)} mm)
              {fits ? '' : ' — excede el papel: elija Auto, una escala menor o un papel mayor'}
            </div>

            <button
              onClick={doExport}
              disabled={busy}
              className="w-full rounded-lg jy-bg-primary px-4 py-2.5 text-[13px] font-bold text-zinc-950 hover:brightness-110 active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <ToolIcon name="FileDown" size={15} />
              {busy ? 'Generando PDF…' : `Exportar PDF a escala 1:${effScale}`}
            </button>
          </div>

          {/* ---------- vista previa ---------- */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Vista previa</p>
            <svg
              width={Math.max(prevW + 16, 150)} height={prevH + 16}
              viewBox={`0 0 ${Math.max(prevW + 16, 150)} ${prevH + 16}`}
              className="rounded-md border border-white/10"
              style={{ background: 'rgba(39,39,42,0.45)' }}
            >
              <g transform={`translate(8 8)`}>
                {/* papel */}
                <rect x="0" y="0" width={prevW} height={prevH} fill="#fafaf9" rx="1.5" />
                <rect x="0" y="0" width={prevW} height={prevH} fill="none" stroke="#52525b" strokeWidth="0.8" rx="1.5" />
                {/* área útil */}
                <rect
                  x={dX} y={dY} width={dW} height={dH}
                  fill="none" stroke="#a1a1aa" strokeWidth="0.5" strokeDasharray="2 2"
                />
                {/* cartela */}
                <rect
                  x={dX} y={dY + dH} width={dW} height={cartH}
                  fill="none" stroke="#71717a" strokeWidth="0.5"
                />
                <line x1={dX + 46 * kPrev} y1={dY + dH} x2={dX + 46 * kPrev} y2={dY + dH + cartH} stroke="#71717a" strokeWidth="0.4" />
                {/* plano encajado (recortado si no cabe) */}
                <rect
                  x={Math.max(boxX, dX)} y={Math.max(boxY, dY)}
                  width={boxW} height={boxH}
                  fill="rgba(245,158,11,0.16)"
                  stroke={clipped ? '#f43f5e' : '#f59e0b'} strokeWidth="0.9"
                />
                <text x={prevW / 2} y={prevH - 3} textAnchor="middle" fontSize="5.5"
                  fill={clipped ? '#f43f5e' : '#f59e0b'} fontWeight="700">
                  1:{effScale} · {PAPERS[paper].label}{clipped ? ' · recortado' : ''}
                </text>
              </g>
            </svg>
            <p className="text-[9.5px] jy-muted text-center max-w-[180px]">
              Cartela con proyecto, fecha, escala, dibujó y lámina A-01 incluida.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
