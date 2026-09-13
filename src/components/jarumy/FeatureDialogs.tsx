'use client'

// ============================================================
// JARUMY APP — Diálogos de los módulos paramétricos y análisis:
// escalera (Blondel/RNE), techo, normativa RNE, metrados S10.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useJarumy } from '@/lib/store'
import { PX_PER_M, WALL_TYPES, BLOCK_LIBRARY, BLOCK_CATS, type StairGeo, type RoofGeo } from '@/lib/plan-data'
import { checkNormativa } from '@/lib/normativa'
import { computeMetrados, downloadS10Workbook } from '@/lib/metrados'
import { buildElevation, ELEV_LABELS, type ElevDir } from '@/lib/elevation'
import { getRegisteredSvg, exportPlanSvg } from '@/lib/raster-export'
import { buildIsoScene } from '@/lib/iso3d'
import { listVersions } from '@/lib/plan-files'
import { ToolIcon } from './ToolIcon'

// ---------------- ESCALERA PARAMÉTRICA ----------------

export function StairDialog() {
  const s = useJarumy()
  const open = s.dialog === 'escalera'
  const [alt, setAlt] = useState(2.5)
  const [ancho, setAncho] = useState(1.0)
  const [dir, setDir] = useState<StairGeo['dir']>('up')

  const design = useMemo(() => {
    // regla de Blondel: 2c + p ≈ 0.61–0.65 m (RNE: contrahuella ≤ 0.175)
    const steps = Math.max(2, Math.ceil(alt / 0.175))
    const riser = alt / steps
    const tread = Math.max(0.22, Math.min(0.32, 0.63 - 2 * riser))
    const len = tread * steps
    const blondel = 2 * riser + tread
    const ok = riser <= 0.1751 && blondel >= 0.59 && blondel <= 0.66
    return { steps, riser, tread, len, blondel, ok }
  }, [alt])

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="ArrowUpNarrowWide" className="text-amber-400" size={18} />
            Escalera paramétrica — reglamento RNE
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <label className="space-y-1">
            <span className="jy-muted font-semibold">Altura a vencer (m)</span>
            <input type="number" step="0.05" min="0.5" max="6" value={alt}
              onChange={(e) => setAlt(Math.max(0.5, Math.min(6, Number(e.target.value) || 2.5)))}
              className="w-full rounded-lg border jy-border bg-black/25 px-2.5 py-1.5 jy-text font-mono" />
          </label>
          <label className="space-y-1">
            <span className="jy-muted font-semibold">Ancho (m)</span>
            <input type="number" step="0.05" min="0.8" max="2.5" value={ancho}
              onChange={(e) => setAncho(Math.max(0.8, Math.min(2.5, Number(e.target.value) || 1)))}
              className="w-full rounded-lg border jy-border bg-black/25 px-2.5 py-1.5 jy-text font-mono" />
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          {(['up', 'down', 'left', 'right'] as const).map((d) => (
            <button key={d} onClick={() => setDir(d)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                dir === d ? 'bg-amber-500 text-zinc-950' : 'border jy-border jy-text hover:border-amber-500/50'}`}>
              {d === 'up' ? 'Sube ↑' : d === 'down' ? 'Baja ↓' : d === 'left' ? 'Izq ←' : 'Der →'}
            </button>
          ))}
        </div>

        {/* resultados calculados */}
        <div className="rounded-xl border jy-border bg-black/20 p-3 text-[12px] space-y-1">
          <div className="flex justify-between"><span className="jy-muted">Pasos</span><span className="font-mono font-bold text-amber-300">{design.steps}</span></div>
          <div className="flex justify-between"><span className="jy-muted">Contrahuella</span><span className="font-mono font-bold text-amber-300">{(design.riser * 100).toFixed(1)} cm {design.riser <= 0.1751 ? '✓ ≤ 17.5' : '✗ > 17.5'}</span></div>
          <div className="flex justify-between"><span className="jy-muted">Huella</span><span className="font-mono font-bold text-amber-300">{(design.tread * 100).toFixed(1)} cm</span></div>
          <div className="flex justify-between"><span className="jy-muted">2c + p (Blondel)</span><span className="font-mono font-bold text-amber-300">{design.blondel.toFixed(3)} m</span></div>
          <div className="flex justify-between"><span className="jy-muted">Longitud del tramo</span><span className="font-mono font-bold text-amber-300">{design.len.toFixed(2)} m</span></div>
          <div className={`rounded-lg px-2 py-1 text-[10.5px] font-bold ${design.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
            {design.ok
              ? 'CUMPLE RNE A.010: contrahuella ≤ 17.5 cm · Blondel 0.61–0.65 m'
              : 'REVISAR: fuera del rango normativo (ajuste la altura o divida en tramos con descanso)'}
          </div>
        </div>

        {/* miniatura de planta */}
        <svg viewBox="0 0 90 130" className="w-[90px] h-[130px] mx-auto rounded-lg border jy-border bg-black/25">
          {Array.from({ length: design.steps + 1 }).map((_, i) => (
            <line key={i} x1="8" y1={8 + (114 / design.steps) * i} x2="82" y2={8 + (114 / design.steps) * i} stroke="#a1a1aa" strokeWidth="0.8" />
          ))}
          <rect x="8" y="8" width="74" height="114" fill="none" stroke="#d4d4d8" strokeWidth="1.2" />
          <line x1="45" y1="14" x2="45" y2="116" stroke="#f59e0b" strokeWidth="1.4" />
          <circle cx="45" cy="116" r="2" fill="#f59e0b" />
          <text x="45" y="6" textAnchor="middle" fontSize="6" fill="#f59e0b">{design.steps}P</text>
        </svg>

        <button
          onClick={() => s.insertStair({
            x: 0, y: 0, w: ancho * PX_PER_M, h: design.len * PX_PER_M,
            steps: design.steps, riser: design.riser, tread: design.tread, dir,
          })}
          className="w-full rounded-xl bg-amber-500 py-2.5 text-[13px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.99] transition-all"
        >
          Insertar escalera en el plano
        </button>
        <p className="text-[10px] jy-muted text-center">Se inserta al centro de la lámina — use MOVER (clic sobre la escalera) para recolocarla y el menú radial para rotarla.</p>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- TECHO PARAMÉTRICO ----------------

export function RoofDialog() {
  const s = useJarumy()
  const open = s.dialog === 'techo'
  const [w, setW] = useState(8)
  const [h, setH] = useState(10)
  const [slope, setSlope] = useState(30)
  const [kind, setKind] = useState<RoofGeo['kind']>('dos-aguas')
  const [ridge, setRidge] = useState<'h' | 'v'>('h')

  if (!open) return null
  const rise = kind === 'plano' ? 0 : (ridge === 'h' ? h : w) / 2 * (slope / 100)
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Layers" className="text-lime-400" size={18} />
            Techo paramétrico con pendiente
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2.5 text-[12px]">
          <label className="space-y-1">
            <span className="jy-muted font-semibold">Ancho (m)</span>
            <input type="number" step="0.5" min="2" max="30" value={w}
              onChange={(e) => setW(Math.max(2, Math.min(30, Number(e.target.value) || 8)))}
              className="w-full rounded-lg border jy-border bg-black/25 px-2 py-1.5 jy-text font-mono" />
          </label>
          <label className="space-y-1">
            <span className="jy-muted font-semibold">Fondo (m)</span>
            <input type="number" step="0.5" min="2" max="30" value={h}
              onChange={(e) => setH(Math.max(2, Math.min(30, Number(e.target.value) || 10)))}
              className="w-full rounded-lg border jy-border bg-black/25 px-2 py-1.5 jy-text font-mono" />
          </label>
          <label className="space-y-1">
            <span className="jy-muted font-semibold">Pendiente (%)</span>
            <input type="number" step="1" min="1" max="100" value={slope}
              onChange={(e) => setSlope(Math.max(1, Math.min(100, Number(e.target.value) || 30)))}
              className="w-full rounded-lg border jy-border bg-black/25 px-2 py-1.5 jy-text font-mono" />
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          {([['dos-aguas', 'Dos aguas'], ['cuatro-aguas', 'Cuatro aguas'], ['plano', 'Plano']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setKind(k)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                kind === k ? 'bg-lime-500 text-zinc-950' : 'border jy-border jy-text hover:border-lime-500/50'}`}>
              {label}
            </button>
          ))}
          {kind === 'dos-aguas' && (
            <button onClick={() => setRidge(ridge === 'h' ? 'v' : 'h')}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold border jy-border jy-text hover:border-lime-500/50">
              Cumbrera {ridge === 'h' ? '↔' : '↕'}
            </button>
          )}
        </div>

        {/* miniaturas: planta + alzado */}
        <div className="flex items-center justify-center gap-4">
          <svg viewBox="0 0 120 90" className="w-[150px] h-[112px] rounded-lg border jy-border bg-black/25">
            <rect x="18" y="12" width="84" height="66" fill="rgba(132,204,22,0.08)" stroke="#84cc16" strokeWidth="1.2" strokeDasharray="5 3" />
            {kind === 'dos-aguas' && (ridge === 'h'
              ? <line x1="18" y1="45" x2="102" y2="45" stroke="#e4e4e7" strokeWidth="1.4" strokeDasharray="8 3" />
              : <line x1="60" y1="12" x2="60" y2="78" stroke="#e4e4e7" strokeWidth="1.4" strokeDasharray="8 3" />)}
            {kind === 'cuatro-aguas' && <g>
              <line x1="18" y1="12" x2="60" y2="45" stroke="#e4e4e7" strokeWidth="1" strokeDasharray="5 3" />
              <line x1="102" y1="12" x2="60" y2="45" stroke="#e4e4e7" strokeWidth="1" strokeDasharray="5 3" />
              <line x1="18" y1="78" x2="60" y2="45" stroke="#e4e4e7" strokeWidth="1" strokeDasharray="5 3" />
              <line x1="102" y1="78" x2="60" y2="45" stroke="#e4e4e7" strokeWidth="1" strokeDasharray="5 3" />
            </g>}
            <text x="60" y="88" textAnchor="middle" fontSize="8" fill="#84cc16">PLANTA · {w}×{h} m</text>
          </svg>
          <svg viewBox="0 0 120 90" className="w-[150px] h-[112px] rounded-lg border jy-border bg-black/25">
            <line x1="12" y1="78" x2="108" y2="78" stroke="#a1a1aa" strokeWidth="1.4" />
            <line x1="12" y1="48" x2="12" y2="78" stroke="#d4d4d8" strokeWidth="1.2" />
            <line x1="108" y1="48" x2="108" y2="78" stroke="#d4d4d8" strokeWidth="1.2" />
            <line x1="12" y1="48" x2="108" y2="48" stroke="#d4d4d8" strokeWidth="1.2" />
            <path d={`M 12 48 L ${60 - Math.min(40, rise * 4)} ${48 - Math.min(30, rise * 3)} L 60 ${48 - Math.min(32, rise * 3.2)} L ${60 + Math.min(40, rise * 4)} ${48 - Math.min(30, rise * 3)} L 108 48`}
              fill="none" stroke="#84cc16" strokeWidth="2" />
            <text x="60" y="88" textAnchor="middle" fontSize="8" fill="#84cc16">{kind === 'plano' ? `PLANO ${slope}%` : `ALZADO · SUBE ${rise.toFixed(2)} m`}</text>
          </svg>
        </div>

        <div className="rounded-xl border jy-border bg-black/20 p-3 text-[12px] space-y-1">
          <div className="flex justify-between"><span className="jy-muted">Área de techo (proyección)</span><span className="font-mono font-bold text-lime-300">{(w * h).toFixed(1)} m²</span></div>
          <div className="flex justify-between"><span className="jy-muted">Área real con pendiente</span><span className="font-mono font-bold text-lime-300">{(w * h / Math.cos(Math.atan(slope / 100))).toFixed(1)} m²</span></div>
          <div className="flex justify-between"><span className="jy-muted">Altura de cumbrera</span><span className="font-mono font-bold text-lime-300">{(2.5 + rise).toFixed(2)} m</span></div>
        </div>

        <button
          onClick={() => s.insertRoof({ x: 0, y: 0, w: w * PX_PER_M, h: h * PX_PER_M, slope, kind, ridge })}
          className="w-full rounded-xl bg-lime-500 py-2.5 text-[13px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.99] transition-all"
        >
          Insertar techo en el plano
        </button>
        <p className="text-[10px] jy-muted text-center">También se dibuja en la vista 3D y en las elevaciones automáticas.</p>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- NORMATIVA RNE ----------------

export function NormativaDialog() {
  const s = useJarumy()
  const open = s.dialog === 'normativa'
  const report = useMemo(
    () => (open ? checkNormativa(s.elements, s.mods) : null),
    [open, s.elements, s.mods],
  )
  if (!open || !report) return null
  const badge = (st: string) =>
    st === 'ok' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : st === 'warn' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
        : 'bg-red-500/15 text-red-300 border-red-500/40'
  const icon = (st: string) => st === 'ok' ? 'CheckCircle2' : st === 'warn' ? 'AlertTriangle' : 'XCircle'
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-2xl max-h-[82vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Scale" className="text-lime-400" size={18} />
            Verificación normativa RNE — Perú
            <span className="ml-auto flex gap-1.5 text-[10px] font-bold">
              <span className="rounded-full border px-2 py-0.5 border-emerald-500/40 bg-emerald-500/15 text-emerald-300">{report.summary.ok} OK</span>
              <span className="rounded-full border px-2 py-0.5 border-amber-500/40 bg-amber-500/15 text-amber-300">{report.summary.warn} aviso</span>
              <span className="rounded-full border px-2 py-0.5 border-red-500/40 bg-red-500/15 text-red-300">{report.summary.fail} fallo</span>
            </span>
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] jy-muted -mt-1">
          Chequeos automáticos sobre el modelo: A.010 (condiciones generales de diseño, higiene y accesibilidad),
          A.040 (vivienda) y A.130 (requerimientos de evacuación). Los resultados se recalculan al editar el plano.
        </p>
        <div className="overflow-y-auto jy-scroll space-y-1.5 pr-1">
          {report.checks.map((c, i) => (
            <button key={i}
              onClick={() => { if (c.elId) { s.setSelected(c.elId); s.setDialog(null) } }}
              className={`w-full text-left rounded-xl border px-3 py-2 flex items-start gap-2.5 transition-all hover:brightness-125 ${badge(c.status)} ${c.elId ? 'cursor-pointer' : 'cursor-default'}`}>
              <ToolIcon name={icon(c.status)} size={15} className="shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-[12.5px] font-bold">{c.title}</span>
                  <span className="text-[9px] font-mono opacity-70">{c.code}</span>
                  {c.elId && <span className="text-[9px] opacity-60">· ver en plano →</span>}
                </span>
                <span className="block text-[11px] leading-snug opacity-90">{c.detail}</span>
                <span className="block text-[9px] opacity-60 mt-0.5">{c.norm}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- METRADOS S10 ----------------

export function MetradosDialog() {
  const s = useJarumy()
  const open = s.dialog === 'metrados'
  const [project, setProject] = useState('VIVIENDA UNIFAMILIAR')
  const report = useMemo(
    () => (open ? computeMetrados(s.elements, s.mods) : null),
    [open, s.elements, s.mods],
  )
  if (!open || !report) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-2xl max-h-[82vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Calculator" className="text-lime-400" size={18} />
            Metrados y presupuesto — formato S10
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <input value={project} onChange={(e) => setProject(e.target.value)}
            className="flex-1 rounded-lg border jy-border bg-black/25 px-2.5 py-1.5 text-[12px] jy-text"
            placeholder="Nombre del proyecto" />
          <button
            onClick={() => {
              const r = downloadS10Workbook(report, project)
              s.pushConsole({ text: `S10 EXPORTADO: ${r.filename} · ${(r.bytes / 1024).toFixed(1)} KB — ábralo en Excel y complete los precios unitarios`, kind: 'out' })
            }}
            className="flex items-center gap-1.5 rounded-xl bg-lime-500 px-3.5 py-2 text-[12px] font-black text-zinc-950 hover:brightness-110 active:scale-95 transition-all"
          >
            <ToolIcon name="FileSpreadsheet" size={14} />
            Excel (.xls)
          </button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
          {[
            ['Techado', report.resumen.techadoM2, 'm²'],
            ['Muros', report.resumen.murosM2, 'm²'],
            ['Pisos', report.resumen.pisosM2, 'm²'],
            ['Zócalos', report.resumen.zocalosM, 'm'],
            ['Ventanas', report.resumen.ventanasM2, 'm²'],
            ['Puertas', report.resumen.puertasUnd, 'und'],
          ].map(([label, val, und]) => (
            <div key={String(label)} className="rounded-lg border jy-border bg-black/20 px-1.5 py-1.5">
              <div className="text-[9px] jy-muted uppercase tracking-wide">{label}</div>
              <div className="text-[13px] font-mono font-bold text-lime-300">{val}<span className="text-[9px] jy-muted ml-0.5">{und}</span></div>
            </div>
          ))}
        </div>
        <div className="overflow-y-auto jy-scroll">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="jy-muted text-left border-b jy-border">
                <th className="py-1.5 pr-2">N°</th>
                <th className="py-1.5 pr-2">Partida</th>
                <th className="py-1.5 pr-2 text-center">Und</th>
                <th className="py-1.5 text-right">Metrado</th>
              </tr>
            </thead>
            <tbody>
              {report.partidas.map((p) => (
                <tr key={p.n} className="border-b border-white/5">
                  <td className="py-1.5 pr-2 font-mono jy-muted">{p.n}</td>
                  <td className="py-1.5 pr-2 jy-text">{p.desc}</td>
                  <td className="py-1.5 pr-2 text-center jy-muted">{p.und}</td>
                  <td className="py-1.5 text-right font-mono text-lime-300">{p.metrado.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="font-bold border-t jy-border">
                <td colSpan={3} className="py-2 jy-text">{report.partidas.length} partidas</td>
                <td className="py-2 text-right font-mono text-lime-400">
                  {report.partidas.reduce((n, p) => n + p.metrado, 0).toFixed(0)} <span className="text-[9px] jy-muted">total und.</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] jy-muted">
          El Excel incluye columna de P.U. editable y fórmulas de parcial + costo directo. Ventanas metradas con alto nominal 1.20 m;
          altura de muros 2.50 m. Compatible con Excel, LibreOffice y Google Sheets.
        </p>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- ELEVACIONES Y SECCIÓN ----------------

const ELEV_DIRS: Array<[ElevDir, string]> = [
  ['sur', 'Sur ↑'], ['norte', 'Norte ↓'], ['este', 'Este →'], ['oeste', 'Oeste ←'], ['seccion', 'Sección ✂'],
]

export function ElevationsDialog() {
  const s = useJarumy()
  const open = s.dialog === 'elevations'
  const [dir, setDir] = useState<ElevDir>('sur')
  const [cutX, setCutX] = useState(600)

  const elev = useMemo(
    () => (open ? buildElevation(s.elements, s.mods, dir, { wallH: s.sun.wallH, cutX }) : null),
    [open, s.elements, s.mods, dir, cutX, s.sun.wallH],
  )

  if (!open || !elev) return null
  const W = 560, H = 260, pad = 26
  const sc = Math.min((W - 2 * pad) / elev.width, (H - 2 * pad) / elev.height)
  const X = (m: number) => pad + m * sc
  const Y = (m: number) => H - pad - m * sc // metros con Y arriba → SVG invertido

  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, 297, 210, 'F')
    // escala: el dibujo ocupa 240 mm de ancho útil
    const usable = 240
    const k = usable / elev.width
    const ox = (297 - elev.width * k) / 2
    const oy = 178 // baseline
    doc.setDrawColor(24, 24, 28); doc.setTextColor(24, 24, 28)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text(ELEV_LABELS[dir], 14.85, 24)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(124, 124, 132)
    doc.text(`VIVIENDA UNIFAMILIAR · ESC ~1:${Math.round((elev.width * 1000) / usable)} · COTA EN METROS · JARUMY APP`, 14.85, 30)
    doc.setLineWidth(0.2)
    for (const l of elev.lines) {
      doc.setLineWidth(Math.max(0.1, l.w * k * 2.2))
      if (l.dash) doc.setLineDashPattern([1.2, 0.9], 0)
      doc.line(ox + l.x1 * k, oy - l.y1 * k, ox + l.x2 * k, oy - l.y2 * k)
      if (l.dash) doc.setLineDashPattern([], 0)
    }
    for (const o of elev.opens) {
      doc.setLineWidth(0.25)
      if (o.kind === 'window') {
        doc.setFillColor(245, 250, 252)
        doc.rect(ox + o.x * k, oy - (o.y0 + o.h) * k, o.w * k, o.h * k, 'FD')
        doc.setDrawColor(120, 126, 136)
        doc.line(ox + o.x * k, oy - (o.y0 + o.h / 2) * k, ox + (o.x + o.w) * k, oy - (o.y0 + o.h / 2) * k)
      } else {
        doc.rect(ox + o.x * k, oy - o.h * k, o.w * k, o.h * k)
        // diagonal de la hoja (proyección de apertura)
        doc.setLineDashPattern([0.6, 0.5], 0)
        doc.line(ox + o.x * k, oy, ox + (o.x + o.w) * k, oy - o.h * k)
        doc.setLineDashPattern([], 0)
      }
    }
    // nivel de piso + cotas verticales
    doc.setFontSize(7); doc.setTextColor(100, 100, 108)
    doc.text('N.P.T. +0.00', 12, oy + 2)
    doc.text(`+${(2.5).toFixed(2)}`, 12, oy - 2.5 * k)
    doc.setDrawColor(180, 83, 9)
    doc.line(10, oy - 2.5 * k, 20, oy - 2.5 * k)
    doc.setDrawColor(24, 24, 28); doc.setLineWidth(0.5)
    doc.line(14.85, oy, 297 - 14.85, oy) // línea de tierra gruesa
    const fname = `jarumy-elevacion-${dir}-${new Date().toISOString().slice(0, 10)}.pdf`
    doc.save(fname)
    s.pushConsole({ text: `ELEVACIÓN ${dir.toUpperCase()} exportada a PDF (${fname})`, kind: 'out' })
  }

  const exportSvgFile = () => {
    // pequeño SVG standalone de la elevación
    const parts: string[] = []
    for (const l of elev.lines) {
      parts.push(`<line x1="${X(l.x1).toFixed(1)}" y1="${Y(l.y1).toFixed(1)}" x2="${X(l.x2).toFixed(1)}" y2="${Y(l.y2).toFixed(1)}" stroke="#18181b" stroke-width="${Math.max(0.7, l.w * sc * 2.4).toFixed(2)}"${l.dash ? ' stroke-dasharray="6 4"' : ''} />`)
    }
    for (const o of elev.opens) {
      parts.push(`<rect x="${X(o.x).toFixed(1)}" y="${Y(o.y0 + o.h).toFixed(1)}" width="${(o.w * sc).toFixed(1)}" height="${(o.h * sc).toFixed(1)}" fill="${o.kind === 'window' ? '#eef7fb' : 'none'}" stroke="#18181b" stroke-width="1.1" />`)
      if (o.kind === 'window') parts.push(`<line x1="${X(o.x).toFixed(1)}" y1="${Y(o.y0 + o.h / 2).toFixed(1)}" x2="${X(o.x + o.w).toFixed(1)}" y2="${Y(o.y0 + o.h / 2).toFixed(1)}" stroke="#78828a" stroke-width="0.9" />`)
    }
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">\n<rect width="${W}" height="${H}" fill="#ffffff"/>\n<text x="14" y="20" font-family="Helvetica" font-size="13" font-weight="bold" fill="#18181b">${ELEV_LABELS[dir]}</text>\n${parts.join('\n')}\n</svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jarumy-elevacion-${dir}.svg`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    s.pushConsole({ text: `ELEVACIÓN ${dir.toUpperCase()} exportada a SVG`, kind: 'out' })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Landmark" className="text-amber-400" size={18} />
            Elevaciones y sección automáticas — derivadas del modelo
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5">
          {ELEV_DIRS.map(([d, label]) => (
            <button key={d} onClick={() => setDir(d)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                dir === d ? 'bg-amber-500 text-zinc-950' : 'border jy-border jy-text hover:border-amber-500/50'}`}>
              {label}
            </button>
          ))}
          {dir === 'seccion' && (
            <label className="flex items-center gap-2 ml-1 text-[10.5px] jy-muted">
              Corte X: <span className="font-mono text-amber-300">{(cutX / PX_PER_M).toFixed(1)} m</span>
              <input type="range" min="100" max="1100" step="10" value={cutX}
                onChange={(e) => setCutX(Number(e.target.value))} className="w-36 accent-amber-500" />
            </label>
          )}
        </div>
        <div className="rounded-xl border jy-border bg-white p-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: '#fff' }}>
            <text x="14" y="20" fontSize="13" fontWeight="700" fill="#18181b" fontFamily="Helvetica">{ELEV_LABELS[dir]}</text>
            {elev.lines.map((l, i) => (
              <line key={i} x1={X(l.x1)} y1={Y(l.y1)} x2={X(l.x2)} y2={Y(l.y2)}
                stroke="#18181b" strokeWidth={Math.max(0.7, l.w * sc * 2.4)} strokeDasharray={l.dash ? '6 4' : undefined} />
            ))}
            {elev.opens.map((o, i) => (
              <g key={i}>
                <rect x={X(o.x)} y={Y(o.y0 + o.h)} width={o.w * sc} height={o.h * sc}
                  fill={o.kind === 'window' ? '#eef7fb' : 'none'} stroke="#18181b" strokeWidth="1.1" />
                {o.kind === 'window' && (
                  <line x1={X(o.x)} y1={Y(o.y0 + o.h / 2)} x2={X(o.x + o.w)} y2={Y(o.y0 + o.h / 2)} stroke="#78828a" strokeWidth="0.9" />
                )}
              </g>
            ))}
            <text x="12" y={Y(0) + 12} fontSize="8" fill="#64646c">N.P.T. +0.00</text>
            <text x="12" y={Y(2.5) - 2} fontSize="8" fill="#64646c">+2.50</text>
            <text x={W - 12} y={H - 10} textAnchor="end" fontSize="8" fill="#64646c">
              ancho {elev.width.toFixed(2)} m · alt. {(s.sun.wallH).toFixed(2)} m
            </text>
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportPdf}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-[12px] font-black text-zinc-950 hover:brightness-110 active:scale-95 transition-all">
            <ToolIcon name="FileDown" size={14} /> PDF A4 horizontal
          </button>
          <button onClick={exportSvgFile}
            className="flex items-center gap-1.5 rounded-xl border jy-border px-4 py-2 text-[12px] font-bold jy-text hover:border-amber-500/50 transition-all">
            <ToolIcon name="FileCode" size={14} /> SVG
          </button>
          <p className="text-[10px] jy-muted ml-auto max-w-[220px] leading-snug">
            Vanos: ventana con antepecho 0.90 m · puerta hasta 2.10 m. La sección desliza el corte sobre el eje X.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- VISTA 3D ISOMÉTRICA INTERACTIVA ----------------

export function Iso3DDialog() {
  const s = useJarumy()
  const open = s.dialog === 'iso3d'
  const [yaw, setYaw] = useState(35)
  const [pitch, setPitch] = useState(30)
  const [zoomF, setZoomF] = useState(1)
  const [furniture, setFurniture] = useState(false)

  const scene = useMemo(
    () => (open ? buildIsoScene(s.elements, s.mods, { yaw, pitch }, { includeFurniture: furniture }) : null),
    [open, s.elements, s.mods, yaw, pitch, furniture],
  )

  if (!open || !scene) return null
  const W = 640, H = 400
  const base = Math.min(W / (scene.spanW || 1), H / (scene.spanH || 1)) * 0.85 * zoomF
  const X = (p: [number, number]) => W / 2 + (p[0] - scene.cx) * base
  const Y = (p: [number, number]) => H / 2 + (p[1] - scene.cy) * base

  const exportPng3d = async () => {
    const svgEl = getRegisteredSvg()
    void svgEl
    // rasteriza el SVG del propio diálogo: lo construimos inline
    const parts = scene.quads.map((q) => {
      const pts = q.pts.map((p) => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(' ')
      return `<polygon points="${pts}" fill="${q.fill}"${q.stroke ? ` stroke="${q.stroke}" stroke-width="0.5"` : ''} />`
    }).join('\n')
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">\n<rect width="${W}" height="${H}" fill="#101014"/>\n${parts}\n</svg>`
    try {
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('raster'))
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      })
      const canvas = document.createElement('canvas')
      canvas.width = W * 2; canvas.height = H * 2
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      const u8 = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([u8], { type: 'image/png' }))
      const a = document.createElement('a')
      a.href = url; a.download = `jarumy-3d-yaw${yaw}-pitch${pitch}.png`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      s.pushConsole({ text: `VISTA 3D exportada a PNG (yaw ${yaw}° · pitch ${pitch}°)`, kind: 'out' })
    } catch {
      s.pushConsole({ text: 'Error rasterizando la vista 3D', kind: 'err' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Box" className="text-amber-400" size={18} />
            Vista 3D interactiva — órbita con extrusión del modelo
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-xl border jy-border overflow-hidden" style={{ background: 'linear-gradient(180deg, #17171c 0%, #101014 100%)' }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {scene.quads.map((q, i) => {
              const pts = q.pts.map((p) => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join(' ')
              return <polygon key={i} points={pts} fill={q.fill} stroke={q.stroke} strokeWidth="0.5" />
            })}
            <text x="12" y="18" fontSize="10" fill="#a1a1aa" fontFamily="Helvetica">
              AXONOMETRÍA · yaw {yaw}° · pitch {pitch}° · {scene.quads.length} caras · muros h={(s.sun.wallH).toFixed(2)} m
            </text>
          </svg>
        </div>
        <div className="grid grid-cols-3 gap-3 text-[11px]">
          <label className="space-y-1">
            <span className="jy-muted font-semibold flex justify-between">Órbita (azimut) <span className="font-mono text-amber-300">{yaw}°</span></span>
            <input type="range" min="0" max="360" value={yaw} onChange={(e) => setYaw(Number(e.target.value))} className="w-full accent-amber-500" />
          </label>
          <label className="space-y-1">
            <span className="jy-muted font-semibold flex justify-between">Altura cámara <span className="font-mono text-amber-300">{pitch}°</span></span>
            <input type="range" min="8" max="85" value={pitch} onChange={(e) => setPitch(Number(e.target.value))} className="w-full accent-amber-500" />
          </label>
          <label className="space-y-1">
            <span className="jy-muted font-semibold flex justify-between">Zoom <span className="font-mono text-amber-300">{zoomF.toFixed(1)}×</span></span>
            <input type="range" min="0.5" max="2.5" step="0.1" value={zoomF} onChange={(e) => setZoomF(Number(e.target.value))} className="w-full accent-amber-500" />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFurniture(!furniture)}
            className={`rounded-xl px-3.5 py-2 text-[11px] font-bold transition-all ${furniture ? 'bg-amber-500 text-zinc-950' : 'border jy-border jy-text hover:border-amber-500/50'}`}>
            Mobiliario {furniture ? 'sí' : 'no'}
          </button>
          <button onClick={exportPng3d}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-[12px] font-black text-zinc-950 hover:brightness-110 active:scale-95 transition-all">
            <ToolIcon name="Camera" size={14} /> PNG
          </button>
          <p className="text-[10px] jy-muted ml-auto max-w-[230px] leading-snug">
            Cámara ortográfica tipo SketchUp/Rhino. Los techos paramétricos se levantan con su pendiente real.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- COMPARTIR PLANO + HISTORIAL DE VERSIONES ----------------

export function ShareDialog() {
  const s = useJarumy()
  const open = s.dialog === 'share' || s.dialog === 'versions'
  const [tab, setTab] = useState<'compartir' | 'versiones'>('compartir')
  const [versions, setVersions] = useState(() => listVersions())
  const [vname, setVname] = useState('')

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Share2" className="text-amber-400" size={18} />
            Compartir plano e historial
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1.5">
          {(['compartir', 'versiones'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setVersions(listVersions()) }}
              className={`rounded-lg px-3.5 py-1.5 text-[11px] font-bold transition-all ${
                tab === t ? 'bg-amber-500 text-zinc-950' : 'border jy-border jy-text hover:border-amber-500/50'}`}>
              {t === 'compartir' ? 'Compartir (.json)' : `Versiones (${versions.length})`}
            </button>
          ))}
        </div>

        {tab === 'compartir' ? (
          <div className="space-y-2.5">
            <button
              onClick={() => s.exportShareFile()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-[13px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.99] transition-all">
              <ToolIcon name="Download" size={15} />
              Exportar plano actual (.jarumy.json)
            </button>
            <label className="block rounded-xl border border-dashed jy-border hover:border-amber-500/60 transition-all cursor-pointer px-4 py-5 text-center">
              <input type="file" accept=".json,.jarumy.json,application/json" className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    const json = JSON.parse(await f.text())
                    s.importShareFile(json)
                  } catch {
                    s.pushConsole({ text: 'IMPORTAR: el archivo no es un JSON válido', kind: 'err' })
                  }
                  e.target.value = ''
                }} />
              <ToolIcon name="Upload" className="mx-auto text-amber-400 mb-1" size={20} />
              <span className="block text-[12px] font-bold jy-text">Importar plano compartido</span>
              <span className="block text-[10px] jy-muted mt-0.5">Restaura elementos, capas y propiedades (con deshacer disponible)</span>
            </label>
            <p className="text-[10px] jy-muted leading-relaxed">
              El archivo contiene el modelo completo (elementos, capas, modificaciones). Envíelo por WhatsApp/correo:
              su colega lo importa en su Jarumy y sigue editando. Los pines de comentario viajan incluidos.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input value={vname} onChange={(e) => setVname(e.target.value)}
                placeholder="Nombre de la versión (opcional)"
                className="flex-1 rounded-lg border jy-border bg-black/25 px-2.5 py-2 text-[12px] jy-text" />
              <button
                onClick={() => { s.savePlanVersion(vname); setVname(''); setVersions(listVersions()) }}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-[12px] font-black text-zinc-950 hover:brightness-110 active:scale-95 transition-all">
                <ToolIcon name="Save" size={14} /> Guardar
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto jy-scroll space-y-1.5 pr-1">
              {versions.length === 0 && (
                <p className="text-[11px] jy-muted text-center py-6">
                  Aún no hay versiones guardadas — capture el estado actual antes de hacer cambios grandes.
                </p>
              )}
              {versions.map((v) => (
                <div key={v.id} className="rounded-xl border jy-border bg-black/20 px-3 py-2 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                    <ToolIcon name="History" size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-bold jy-text truncate">{v.name}</span>
                    <span className="block text-[9.5px] jy-muted">
                      {new Date(v.savedAt).toLocaleString('es-PE')} · {v.data.elements.length} elementos · {v.data.layers.length} capas
                    </span>
                  </span>
                  <button onClick={() => { s.restorePlanVersion(v.data); s.setDialog(null) }}
                    className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-[10px] font-black text-zinc-950 hover:brightness-110 transition-all">
                    Restaurar
                  </button>
                  <button onClick={() => { s.deletePlanVersion(v.id); setVersions(listVersions()) }}
                    className="rounded-lg border border-red-500/40 text-red-300 px-2 py-1.5 text-[10px] font-bold hover:bg-red-500/10 transition-all">
                    <ToolIcon name="Trash2" size={12} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[10px] jy-muted">
              Las versiones se guardan en este navegador (localStorage, últimas 30). Para archivarlas o pasarlas a otro equipo, use Compartir (.json).
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------- QUICK SELECT (filtro de selección) ----------------

export function QuickSelectDialog() {
  const s = useJarumy()
  const open = s.dialog === 'quickselect'
  const [fType, setFType] = useState('todos')
  const [fLayer, setFLayer] = useState('todas')
  const [fPhase, setFPhase] = useState('todas')

  const alive = s.elements.filter((e) => !s.mods[e.id]?.deleted)
  const types = Array.from(new Set(alive.map((e) => e.type)))
  const layers = Array.from(new Set(alive.map((e) => e.layer)))

  const results = useMemo(() => alive.filter((e) => {
    if (fType !== 'todos' && e.type !== fType) return false
    if (fLayer !== 'todas' && e.layer !== fLayer) return false
    if (fPhase !== 'todas') {
      const ph = s.mods[e.id]?.phase || (e.geo as { phase?: string }).phase || 'nueva'
      if (ph !== fPhase) return false
    }
    return true
  }), [alive, fType, fLayer, fPhase, s.mods])

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="ListFilter" className="text-amber-400" size={18} />
            Quick Select — selección por filtros
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <label className="space-y-1">
            <span className="jy-muted font-semibold">Tipo</span>
            <select value={fType} onChange={(e) => setFType(e.target.value)}
              className="w-full rounded-lg border jy-border bg-black/25 px-2 py-1.5 jy-text">
              <option value="todos">Todos ({alive.length})</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="jy-muted font-semibold">Capa</span>
            <select value={fLayer} onChange={(e) => setFLayer(e.target.value)}
              className="w-full rounded-lg border jy-border bg-black/25 px-2 py-1.5 jy-text">
              <option value="todas">Todas</option>
              {layers.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="jy-muted font-semibold">Fase</span>
            <select value={fPhase} onChange={(e) => setFPhase(e.target.value)}
              className="w-full rounded-lg border jy-border bg-black/25 px-2 py-1.5 jy-text">
              <option value="todas">Todas</option>
              <option value="existente">Existente</option>
              <option value="demolicion">Demolición</option>
              <option value="nueva">Nueva</option>
            </select>
          </label>
        </div>

        <div className="rounded-xl border jy-border bg-black/20 p-2.5 max-h-64 overflow-y-auto space-y-1">
          {results.length === 0 && <p className="text-[11px] jy-muted text-center py-6">Ningún elemento coincide con el filtro.</p>}
          {results.slice(0, 80).map((e) => (
            <button key={e.id}
              onClick={() => { s.setSelected(e.id); s.pushConsole({ text: `QUICK SELECT: ${e.name} (${e.type} · capa ${e.layer}) seleccionado — ${results.length} coincidencias en total`, kind: 'out' }) }}
              className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${
                s.selectedId === e.id ? 'bg-amber-500/20 border border-amber-500/40' : 'hover:bg-zinc-800/60 border border-transparent'}`}>
              <span className="font-bold jy-text truncate">{e.name}</span>
              <span className="jy-muted shrink-0 ml-2">{e.type} · {e.layer}</span>
            </button>
          ))}
          {results.length > 80 && <p className="text-[10px] jy-muted text-center pt-1">…y {results.length - 80} más (afine el filtro)</p>}
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="jy-muted">{results.length} elemento{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => {
              if (results[0]) { s.setSelected(results[0].id) }
              s.pushConsole({ text: `QUICK SELECT: ${results.length} coincidencias — primero seleccionado (selección múltiple en desarrollo)`, kind: 'out' })
            }}
            className="rounded-lg bg-amber-500 px-3 py-1.5 font-black text-zinc-950 hover:brightness-110 transition-all">
            Seleccionar primero
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- ILUMINACIÓN (lux por ambiente) ----------------

const LUX_REQ: Array<{ match: RegExp; label: string; lux: number }> = [
  { match: /COCINA/i, label: 'Cocina (tarea)', lux: 300 },
  { match: /BAÑO|BANO/i, label: 'Baño', lux: 250 },
  { match: /DORM/i, label: 'Dormitorio', lux: 150 },
  { match: /VEST/i, label: 'Vestidor', lux: 150 },
  { match: /SALA|ESTAR|COMEDOR/i, label: 'Estar / comedor', lux: 150 },
]

export function LightingDialog() {
  const s = useJarumy()
  const open = s.dialog === 'lighting'
  // luminaria de referencia: panel LED 9 W ≈ 810 lm · factor de utilización 0.65 · mantenimiento 0.8
  const LM = 810, UF = 0.65, MF = 0.8

  const rows = useMemo(() => {
    return s.elements
      .filter((e) => e.type === 'espacio' && !s.mods[e.id]?.deleted)
      .map((e) => {
        const g = e.geo as { w: number; h: number; name: string }
        const area = (g.w / PX_PER_M) * (g.h / PX_PER_M)
        const req = LUX_REQ.find((r) => r.match.test(g.name || e.name))?.lux ?? 150
        const n = Math.max(1, Math.ceil((req * area) / (LM * UF * MF)))
        const avg = (n * LM * UF * MF) / area
        const label = LUX_REQ.find((r) => r.match.test(g.name || e.name))?.label ?? 'Ambiente general'
        return { name: g.name || e.name, area, req, n, avg, label, ok: avg >= req - 0.5 }
      })
  }, [s.elements, s.mods])

  const totalFix = rows.reduce((a, r) => a + r.n, 0)
  const totalW = totalFix * 9

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Sun" className="text-amber-400" size={18} />
            Iluminación artificial — cálculo de lux por ambiente
          </DialogTitle>
        </DialogHeader>

        <p className="text-[10.5px] jy-muted">
          Método de los lúmenes: N = E·A / (Φ·UF·MF) · panel LED 9 W = 810 lm · UF 0.65 · MF 0.8 · niveles según EN 12464-1.
        </p>

        <div className="rounded-xl border jy-border overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-black/30 jy-muted">
              <tr>
                <th className="text-left px-2.5 py-1.5 font-bold">Ambiente</th>
                <th className="text-right px-2 py-1.5 font-bold">Área m²</th>
                <th className="text-right px-2 py-1.5 font-bold">E req.</th>
                <th className="text-right px-2 py-1.5 font-bold">Luminarias</th>
                <th className="text-right px-2 py-1.5 font-bold">E medio</th>
                <th className="text-center px-2 py-1.5 font-bold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t jy-border/50">
                  <td className="px-2.5 py-1.5 font-bold">{r.name}<span className="block text-[9px] jy-muted font-normal">{r.label}</span></td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.area.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.req} lx</td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-300">{r.n} × 9 W</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.avg.toFixed(0)} lx</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-black ${r.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                      {r.ok ? 'CUMPLE' : 'BAJO'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border jy-border bg-black/20 py-2">
            <div className="text-lg font-black font-mono text-amber-300">{totalFix}</div>
            <div className="text-[9.5px] jy-muted">luminarias totales</div>
          </div>
          <div className="rounded-xl border jy-border bg-black/20 py-2">
            <div className="text-lg font-black font-mono text-amber-300">{totalW} W</div>
            <div className="text-[9.5px] jy-muted">potencia instalada</div>
          </div>
          <div className="rounded-xl border jy-border bg-black/20 py-2">
            <div className="text-lg font-black font-mono text-amber-300">{(totalW / Math.max(1, rows.reduce((a, r) => a + r.area, 0))).toFixed(1)}</div>
            <div className="text-[9.5px] jy-muted">W/m² instalados</div>
          </div>
        </div>

        <button
          onClick={() => {
            s.armDraw('simbolo:luz')
            s.setDialog(null)
            s.pushConsole({ text: `ILUMINACIÓN: ${totalFix} luminarias LED 9 W — colóquelas con el símbolo LUMINARIA (${rows.filter((r) => !r.ok).length} ambiente(s) por debajo del nivel requerido)`, kind: 'out' })
          }}
          className="w-full rounded-xl bg-amber-500 py-2.5 text-[13px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.99] transition-all">
          Colocar luminarias en el plano
        </button>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- ACÚSTICA (Rw por muro) ----------------

const RW_BY_TYPE: Record<string, number> = {
  l140: 42, l230: 46, c175: 47, dw100: 52,
}

export function AcousticDialog() {
  const s = useJarumy()
  const open = s.dialog === 'acoustic'
  const REQ = 45 // criterio habitacional: ≥ 45 dB en particiones de dormitorios

  const rows = useMemo(() => {
    const rooms = s.elements.filter((e) => e.type === 'espacio' && !s.mods[e.id]?.deleted)
    const dorms = rooms.filter((e) => /DORM/i.test((e.geo as { name: string }).name || e.name))
    const walls = s.elements.filter((e) => (e.type === 'muro' || e.type === 'dibujo') && !s.mods[e.id]?.deleted)
    return walls.map((w) => {
      const wg = w.geo as { x1: number; y1: number; x2: number; y2: number; t?: number }
      const wtId = s.mods[w.id]?.wallType
      const tcm = wtId ? undefined : ((wg.t || 12) / PX_PER_M) * 100
      const rw = wtId ? RW_BY_TYPE[wtId] ?? 45 : 36 + (tcm ? tcm * 0.35 : 0)
      const wx0 = Math.min(wg.x1, wg.x2), wx1 = Math.max(wg.x1, wg.x2)
      const wy0 = Math.min(wg.y1, wg.y2), wy1 = Math.max(wg.y1, wg.y2)
      const touching = dorms.filter((d) => {
        const dg = d.geo as { x: number; y: number; w: number; h: number }
        const ox = Math.max(wx0 - 10, dg.x) <= Math.min(wx1 + 10, dg.x + dg.w)
        const oy = Math.max(wy0 - 10, dg.y) <= Math.min(wy1 + 10, dg.y + dg.h)
        return ox && oy
      })
      return { id: w.id, name: w.name, type: wtId ? (WALL_TYPES[wtId]?.label || wtId) : `Espesor ${(((wg.t || 12) / PX_PER_M) * 100).toFixed(1)} cm`, rw, isDorm: touching.length > 0, dorms: touching.map((d) => (d.geo as { name: string }).name) }
    }).filter((r) => r.isDorm)
  }, [s.elements, s.mods])

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="AudioWaveform" className="text-amber-400" size={18} />
            Acústica — aislamiento Rw de muros de dormitorios
          </DialogTitle>
        </DialogHeader>

        <p className="text-[10.5px] jy-muted">
          Estimación simplificada ISO 12354: Rw por tipo constructivo · criterio habitacional ≥ {REQ} dB entre dormitorios y ambientes ruidosos.
        </p>

        <div className="rounded-xl border jy-border overflow-hidden max-h-72 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-black/30 jy-muted sticky top-0">
              <tr>
                <th className="text-left px-2.5 py-1.5 font-bold">Muro</th>
                <th className="text-left px-2 py-1.5 font-bold">Tipo</th>
                <th className="text-left px-2 py-1.5 font-bold">Colinda con</th>
                <th className="text-right px-2 py-1.5 font-bold">Rw est.</th>
                <th className="text-center px-2 py-1.5 font-bold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t jy-border/50">
                  <td className="px-2.5 py-1.5 font-bold">{r.name}</td>
                  <td className="px-2 py-1.5">{r.type}</td>
                  <td className="px-2 py-1.5 jy-muted">{r.dorms.join(', ')}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-300">{r.rw.toFixed(0)} dB</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-black ${r.rw >= REQ ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                      {r.rw >= REQ ? 'CUMPLE' : `FALTAN ${(REQ - r.rw).toFixed(0)} dB`}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="text-center jy-muted py-6">No se detectaron muros colindantes a dormitorios.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl border jy-border bg-black/20 p-2.5">
            <div className="font-bold text-amber-300 mb-1">Recomendaciones</div>
            <ul className="jy-muted space-y-1 list-disc pl-4">
              <li>Muro doble con lana de roca (drywall + aislante): Rw 52 dB</li>
              <li>Ladrillo 230 asentado con mortero completo: Rw 46 dB</li>
              <li>Sellar juntas y cajas eléctricales con masilla acústica</li>
            </ul>
          </div>
          <div className="rounded-xl border jy-border bg-black/20 p-2.5 flex flex-col justify-center">
            <div className="flex justify-between py-0.5"><span className="jy-muted">Muros evaluados</span><span className="font-mono font-bold">{rows.length}</span></div>
            <div className="flex justify-between py-0.5"><span className="jy-muted">Cumplen ≥ 45 dB</span><span className="font-mono font-bold text-emerald-400">{rows.filter((r) => r.rw >= REQ).length}</span></div>
            <div className="flex justify-between py-0.5"><span className="jy-muted">Por mejorar</span><span className="font-mono font-bold text-red-400">{rows.filter((r) => r.rw < REQ).length}</span></div>
          </div>
        </div>

        <button
          onClick={() => {
            const mejorado = rows.filter((r) => r.rw < REQ)
            s.pushConsole({ text: `ACÚSTICA: ${rows.length} muros de dormitorio evaluados — ${mejorado.length} por debajo de ${REQ} dB. Sugerencia: muro doble drywall+lana (Rw 52) o ladrillo 230 (Rw 46). Cambie el tipo con MURO MULTICAPA en el menú radial.`, kind: 'out' })
            s.setDialog(null)
          }}
          className="w-full rounded-xl bg-amber-500 py-2.5 text-[13px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.99] transition-all">
          Ver resumen en consola
        </button>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- FASES BIM (existente / demolición / nueva) ----------------

export function PhasesDialog() {
  const s = useJarumy()
  const open = s.dialog === 'phases'

  const counts = useMemo(() => {
    const c = { existente: 0, demolicion: 0, nueva: 0 } as Record<string, number>
    s.elements.forEach((e) => {
      if (s.mods[e.id]?.deleted) return
      const ph = s.mods[e.id]?.phase || (e.geo as { phase?: string }).phase || 'nueva'
      c[ph] = (c[ph] || 0) + 1
    })
    return c
  }, [s.elements, s.mods])

  const selected = s.elements.find((e) => e.id === s.selectedId)

  const setPhase = (ph: 'existente' | 'demolicion' | 'nueva') => {
    if (!selected) {
      s.pushConsole({ text: 'FASES: primero seleccione un elemento del plano', kind: 'err' })
      return
    }
    s.applyEffect(selected.id, 'phase', ph)
  }

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Layers" className="text-amber-400" size={18} />
            Fases de obra — existente · demolición · nueva
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'existente', label: 'Existente', color: '#71717a', note: 'Gris tenue — se conserva' },
            { id: 'demolicion', label: 'Demolición', color: '#ef4444', note: 'Rojo punteado + aspas' },
            { id: 'nueva', label: 'Nueva', color: '#22c55e', note: 'Trazo normal' },
          ] as const).map((p) => (
            <button key={p.id} onClick={() => setPhase(p.id)}
              className="rounded-xl border jy-border bg-black/20 p-2.5 text-center hover:border-amber-500/50 transition-colors">
              <span className="block text-2xl font-black font-mono" style={{ color: p.color }}>{counts[p.id] || 0}</span>
              <span className="block text-[11px] font-bold">{p.label}</span>
              <span className="block text-[9px] jy-muted mt-0.5">{p.note}</span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border jy-border bg-black/20 p-2.5 text-[11px] space-y-2">
          <div className="font-bold jy-text">Asignar fase al elemento seleccionado</div>
          <div className="jy-muted">
            {selected
              ? <span>Selección actual: <span className="font-bold text-amber-300">{selected.name}</span> ({selected.type} · capa {selected.layer}) — clic en una fase de arriba para asignarla.</span>
              : 'Ningún elemento seleccionado. Cierre el diálogo, haga clic en un muro o mueble del plano y vuelva a abrir FASES.'}
          </div>
        </div>

        <div className="rounded-xl border jy-border bg-black/20 p-2.5 space-y-2">
          <div className="text-[11px] font-bold jy-text">Filtro de visualización</div>
          <div className="flex flex-wrap gap-1.5">
            {([
              { id: null, label: 'Ver todo' },
              { id: 'existente', label: 'Solo existente' },
              { id: 'demolicion', label: 'Solo demolición' },
              { id: 'nueva', label: 'Solo nueva' },
            ] as const).map((f) => (
              <button key={f.label} onClick={() => {
                s.setPhaseFilter(f.id)
                s.pushConsole({ text: `FASES: vista filtrada — ${f.label}`, kind: 'out' })
              }}
                className={`rounded-lg px-3 py-1.5 text-[10.5px] font-bold transition-all ${
                  s.phaseFilter === f.id ? 'bg-amber-500 text-zinc-950' : 'border jy-border jy-text hover:border-amber-500/50'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-[9.5px] jy-muted">Al filtrar, las demás fases se atenúan (12% de opacidad) para revisar la demolición o la obra nueva por separado. El plano de demolición queda listo para imprimir con el filtro activo.</p>
        </div>

        <div className="text-[10px] jy-muted text-center">
          Comando rápido: FASE existente|demolicion|nueva (sobre la selección) · DEMOLICION abre este panel.
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- ESTRUCTURAL (cargas reales del plano — ETABS/Robot simplificado) ----------------

export function StructuralDialog() {
  const s = useJarumy()
  const open = s.dialog === 'structural'
  const [floors, setFloors] = useState(1)

  const calc = useMemo(() => {
    const alive = s.elements.filter((e) => !s.mods[e.id]?.deleted)
    const rooms = alive.filter((e) => e.type === 'espacio')
    const walls = alive.filter((e) => e.type === 'muro')
    const cols = alive.filter((e) => e.type === 'columna')
    const roofs = alive.filter((e) => e.type === 'techo')
    const stairs = alive.filter((e) => e.type === 'escalera')

    // áreas reales
    const area = rooms.reduce((n, e) => {
      const g = e.geo as { w: number; h: number }
      return n + (g.w * g.h) / (PX_PER_M * PX_PER_M)
    }, 0)

    // muros: longitud, volumen y peso (ladrillo 1.8 t/m³)
    let wallLen = 0, wallVol = 0
    walls.forEach((w) => {
      const g = w.geo as { x1: number; y1: number; x2: number; y2: number; t: number }
      const mod = s.mods[w.id] || {}
      const th = (mod.thickness ?? g.t) / PX_PER_M
      const H = mod.wallHeight || 2.5
      const L = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) / PX_PER_M
      wallLen += L
      wallVol += L * H * th
    })
    const wallWeight = wallVol * 1.8 // t

    // techos reales
    let roofArea = 0
    roofs.forEach((r) => {
      const g = r.geo as { w: number; h: number }
      roofArea += (g.w * g.h) / (PX_PER_M * PX_PER_M)
    })
    const slabArea = roofArea > 0 ? roofArea : area

    // cargas normadas (kg/m²) — E.020 vivienda
    const D_slab = 200 + 100   // losa aligerada + acabados
    const L_live = 200         // sobrecarga vivienda
    const D_roof = slabArea * D_slab / 1000 // t
    const L_roof = slabArea * L_live / 1000
    const D_walls = wallWeight
    const W = (D_roof + D_walls + L_roof * 0.25) * floors // peso sísmico (25% de sobrecarga E.030)

    // columna promedio
    const nCols = Math.max(cols.length, Math.max(1, Math.round(area / 20))) // mínimo 1 col/20 m²
    const colLoad = ((D_roof + D_walls + L_roof) * floors) / nCols // t por columna
    // capacidad de columna 30×30 f'c210 ρ=2%: φPn ≈ 163 t
    const colCap = 163
    const colRatio = colLoad / colCap

    // densidad de muros (control de deriva E.030 práctica)
    const density = (wallLen * 0.15) / Math.max(1, area) // m² de muro / m² de piso
    const driftOk = density >= 0.01 && density <= 0.04

    // cortante basal E.030 (Lima: Z=0.35, T<T0 → C=2.5, R=8, U=1)
    const V = 0.35 * 1 * 2.5 / 8 * W
    const driftEst = Math.min(0.012, V / (Math.max(0.004, density) * W * 250)) // estimación indicativa

    return {
      area, wallLen, wallVol, wallWeight, slabArea, nCols: cols.length || nCols,
      D_roof, D_walls, L_roof, W, V, colLoad, colCap, colRatio,
      density, driftOk, driftEst, stairs: stairs.length, floors,
    }
  }, [s.elements, s.mods, floors])

  if (!open) return null
  const fmt = (t: number) => `${t.toFixed(1)} t`
  const items = [
    { k: 'Área techada (por piso)', v: `${calc.area.toFixed(1)} m²`, ok: true },
    { k: 'Carga muerta D — losa + acabados', v: fmt(calc.D_roof), ok: true },
    { k: 'Carga muerta D — albañilería', v: `${fmt(calc.D_walls)} (${calc.wallLen.toFixed(1)} ml · ${calc.wallVol.toFixed(1)} m³)`, ok: true },
    { k: 'Carga viva L — sobrecarga (200 kg/m²)', v: fmt(calc.L_roof), ok: true },
    { k: 'Peso sísmico W (D + 0.25L)', v: fmt(calc.W), ok: true },
    { k: 'Cortante basal V (E.030 · Z=0.35 · R=8)', v: fmt(calc.V), ok: calc.V < calc.W * 0.15 },
    { k: `Carga por columna (${calc.nCols} und · φPn=${calc.colCap} t)`, v: `${fmt(calc.colLoad)} · ${Math.round(calc.colRatio * 100)}% de capacidad`, ok: calc.colRatio < 0.5 },
    { k: 'Densidad de muros (m² muro/m² piso)', v: `${(calc.density * 100).toFixed(2)} %`, ok: calc.driftOk },
    { k: 'Deriva estimada de entrepiso', v: `${(calc.driftEst * 100).toFixed(2)} % (máx. 1%)`, ok: calc.driftEst < 0.01 },
  ]
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Landmark" className="text-amber-400" size={18} />
            Estructural — cargas y reacciones reales (ETABS / Robot)
          </DialogTitle>
        </DialogHeader>

        <label className="flex items-center justify-between gap-3 text-[12px] rounded-lg border jy-border bg-black/20 px-3 py-2">
          <span className="jy-muted font-semibold">N° de pisos</span>
          <input type="number" min={1} max={5} value={floors}
            onChange={(e) => setFloors(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
            className="w-16 rounded border jy-border bg-black/25 px-2 py-1 jy-text font-mono text-right" />
        </label>

        <div className="space-y-1.5">
          {items.map((i) => (
            <div key={i.k} className="flex items-center justify-between gap-3 text-[12px] border-b border-white/5 pb-1.5">
              <span className="jy-muted">{i.k}</span>
              <span className={`font-mono font-semibold ${i.ok ? 'text-emerald-400' : 'text-orange-400'}`}>{i.v}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] jy-muted">
          Cálculo derivado de la geometría real: {calc.wallLen.toFixed(1)} ml de muros, {calc.slabArea.toFixed(1)} m² de losa
          y columnas de 30×30 cm f&apos;c 210 con ρ=2%. Verificación indicativa — el diseño definitivo requiere modelado en ETABS.
        </p>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- COLABORACIÓN (estado real de la sesión) ----------------

export function CollabDialog() {
  const s = useJarumy()
  const open = s.dialog === 'collab'
  const since = useMemo(() => Date.now(), [open])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [open])
  const elapsed = Math.floor((Date.now() - since) / 1000)
  void tick

  const alive = s.elements.filter((e) => !s.mods[e.id]?.deleted)
  const byDiscipline = {
    'Arquitectura (J. Burga)': alive.filter((e) => ['muro', 'puerta', 'ventana', 'espacio', 'apertura', 'techo', 'escalera'].includes(e.type)).length,
    'MEP — instalaciones': alive.filter((e) => ['instalacion', 'simbolo'].includes(e.type)).length,
    'Estructura': alive.filter((e) => ['columna'].includes(e.type)).length,
    'Interiorismo': alive.filter((e) => ['mobiliario', 'sanitario'].includes(e.type)).length,
    'Contexto / sitio': alive.filter((e) => ['terreno'].includes(e.type)).length,
  }
  const edits = s.undoStack.length
  const versions = typeof window !== 'undefined' ? listVersions().length : 0

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Users" className="text-amber-400" size={18} />
            Colaboración — Worksharing (Revit / BIM 360)
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border jy-border bg-black/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-[12px] font-bold jy-text">Modelo central activo — sesión local sincronizada</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-white/8 px-2.5 py-1.5">
              <span className="jy-muted block">Usuario local</span>
              <span className="font-bold jy-text">J. Burga · arquitectura</span>
            </div>
            <div className="rounded-lg border border-white/8 px-2.5 py-1.5">
              <span className="jy-muted block">Tiempo de sesión</span>
              <span className="font-bold font-mono jy-text">{Math.floor(elapsed / 60)}m {elapsed % 60}s</span>
            </div>
            <div className="rounded-lg border border-white/8 px-2.5 py-1.5">
              <span className="jy-muted block">Ediciones en la sesión</span>
              <span className="font-bold font-mono jy-text">{edits} (DESHACER disponibles)</span>
            </div>
            <div className="rounded-lg border border-white/8 px-2.5 py-1.5">
              <span className="jy-muted block">Versiones guardadas</span>
              <span className="font-bold font-mono jy-text">{versions} en el historial</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-bold jy-text">Elementos por disciplina (en vivo)</div>
          {Object.entries(byDiscipline).map(([k, n]) => (
            <div key={k} className="flex items-center justify-between gap-3 text-[12px] border-b border-white/5 pb-1.5">
              <span className="jy-muted">{k}</span>
              <span className="font-mono font-semibold text-amber-300">{n} elementos</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={() => s.runGlobal('saveNow')}
            className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[11px] py-2 transition-colors">
            Sincronizar con el central
          </button>
          <button onClick={() => s.setDialog('share')}
            className="flex-1 rounded-lg border jy-border hover:border-amber-500/50 font-bold text-[11px] py-2 transition-colors">
            Compartir plano
          </button>
        </div>
        <p className="text-[10px] jy-muted">
          "Sincronizar" guarda una versión real en el historial local (localStorage). Los conteos por disciplina
          se recalculan con los elementos vivos del modelo.
        </p>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- FAMILIAS / OBJETOS (explorador real de la biblioteca) ----------------

export function FamiliasDialog() {
  const s = useJarumy()
  const open = s.dialog === 'familias'
  const [cat, setCat] = useState<string>('todas')

  const cats = useMemo(() => {
    const groups: Record<string, number> = {}
    BLOCK_LIBRARY.forEach((b) => { groups[b.cat] = (groups[b.cat] || 0) + 1 })
    return groups
  }, [])

  const placed = useMemo(() => {
    const alive = s.elements.filter((e) => !s.mods[e.id]?.deleted)
    return alive.filter((e) => e.type === 'mobiliario' || e.type === 'sanitario').length
  }, [s.elements, s.mods])

  const list = cat === 'todas' ? BLOCK_LIBRARY : BLOCK_LIBRARY.filter((b) => b.cat === cat)

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Component" className="text-amber-400" size={18} />
            Familias / Objetos — {BLOCK_LIBRARY.length} cargadas ({placed} colocadas en el plano)
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 flex-wrap mb-2">
          <button onClick={() => setCat('todas')}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
              cat === 'todas' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'jy-muted border border-white/10 hover:border-white/25'}`}>
            Todas · {BLOCK_LIBRARY.length}
          </button>
          {BLOCK_CATS.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                cat === c.id ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'jy-muted border border-white/10 hover:border-white/25'}`}>
              {c.label} · {cats[c.id] || 0}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto jy-scroll pr-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {list.map((b) => (
              <button key={b.kind} onClick={() => { s.setDialog('blocks'); s.armDraw(`ins:${b.kind}`) }}
                className="text-left rounded-lg border border-white/8 px-2.5 py-2 hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors">
                <div className="flex items-center gap-1.5">
                  <ToolIcon name={b.sanitary ? 'Bath' : b.cat === 'cocina' ? 'CookingPot' : b.cat === 'exterior' ? 'TreePine' : 'Armchair'} size={13} className="text-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold jy-text leading-tight truncate">{b.label}</span>
                </div>
                <span className="text-[9.5px] jy-muted block mt-0.5">
                  {(b.w / PX_PER_M).toFixed(2)} × {(b.h / PX_PER_M).toFixed(2)} m · {b.cat}
                </span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] jy-muted mt-1">
          Clic en una familia para armarla como bloque de inserción — clic en el plano para colocarla (R rota 90°).
          Conteos calculados en vivo desde la biblioteca y el modelo.
        </p>
      </DialogContent>
    </Dialog>
  )
}

// ---------------- EDITOR DE BLOQUES DINÁMICOS (parámetros en vivo) ----------------

export function BlockEditorDialog() {
  const s = useJarumy()
  const open = s.dialog === 'blockeditor'
  const el = s.elements.find((e) => e.id === (s.selectedId || '')) || null
  const mod = el ? (s.mods[el.id] || {}) : {}

  if (!open) return null
  return (
    <Dialog open={open} onOpenChange={(v) => !v && s.setDialog(null)}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Shapes" className="text-amber-400" size={18} />
            Editor de bloques dinámicos
          </DialogTitle>
        </DialogHeader>

        {!el ? (
          <p className="text-[12px] jy-muted">
            Ningún elemento seleccionado. Cierre el diálogo, haga clic sobre un bloque del plano
            (mueble, sanitario, columna…) y vuelva a abrirlo desde BLOQUE DINÁMICO.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border jy-border bg-black/20 px-3 py-2 text-[11px]">
              <span className="font-bold jy-text">{el.name}</span>
              <span className="jy-muted block">{el.type} · capa {el.layer} · id {el.id}</span>
            </div>

            <label className="block space-y-1">
              <span className="flex justify-between text-[11px] jy-muted font-semibold">
                <span>Rotación</span><span className="font-mono text-amber-300">{(mod.rotation || 0) % 360}°</span>
              </span>
              <input type="range" min={-180} max={180} step={15} value={(mod.rotation || 0) % 360}
                onChange={(e) => s.applyEffect(el.id, 'rotate', Number(e.target.value) - ((mod.rotation || 0) % 360))}
                className="w-full accent-amber-400" />
            </label>

            <label className="block space-y-1">
              <span className="flex justify-between text-[11px] jy-muted font-semibold">
                <span>Escala</span><span className="font-mono text-amber-300">{((mod.scale || 1) * 100).toFixed(0)}%</span>
              </span>
              <input type="range" min={50} max={220} step={5} value={Math.round((mod.scale || 1) * 100)}
                onChange={(e) => s.applyEffect(el.id, 'scale', Number(e.target.value) / 100 / (mod.scale || 1))}
                className="w-full accent-amber-400" />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => s.applyEffect(el.id, 'mirror', 'h')}
                className="rounded-lg border jy-border hover:border-amber-500/50 text-[11px] font-bold py-2 transition-colors">
                Voltear H
              </button>
              <button onClick={() => s.applyEffect(el.id, 'mirror', 'v')}
                className="rounded-lg border jy-border hover:border-amber-500/50 text-[11px] font-bold py-2 transition-colors">
                Voltear V
              </button>
              <button onClick={() => s.applyEffect(el.id, 'scale', 'reset')}
                className="rounded-lg border jy-border hover:border-amber-500/50 text-[11px] font-bold py-2 transition-colors">
                Restablecer 100%
              </button>
              <button onClick={() => s.applyEffect(el.id, 'duplicate')}
                className="rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[11px] font-bold py-2 transition-colors">
                Duplicar
              </button>
            </div>

            <p className="text-[10px] jy-muted">
              Parámetros aplicados en vivo sobre la selección con historial de deshacer — igual que las
              acciones de parámetros de un bloque dinámico de AutoCAD.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
