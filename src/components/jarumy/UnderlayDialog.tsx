'use client'

import { useRef, useState } from 'react'
import { useJarumy } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToolIcon } from './ToolIcon'

/**
 * Underlay de referencia: importa PNG/JPG (dataURL) o un PDF
 * (rasteriza su 1ª página con pdfjs-dist) y lo coloca como
 * elemento 'imagen' en la capa Referencias para calcar encima.
 */
export function UnderlayDialog() {
  const s = useJarumy()
  const open = s.dialog === 'underlay'
  const imgRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (!open) return null

  const handleImage = (file: File) => {
    if (!/^image\//.test(file.type)) {
      s.pushConsole({ text: 'UNDERLAY IMAGEN: formato no soportado — use PNG, JPG o WebP', kind: 'err' })
      return
    }
    setBusy(`Rasterizando ${file.name}…`)
    const rd = new FileReader()
    rd.onload = () => {
      const src = String(rd.result)
      const probe = new Image()
      probe.onload = () => {
        s.insertUnderlay(src, probe.width, probe.height, file.name, 'imagen')
        setBusy(null)
      }
      probe.onerror = () => {
        s.pushConsole({ text: 'UNDERLAY IMAGEN: no se pudo decodificar la imagen', kind: 'err' })
        setBusy(null)
      }
      probe.src = src
    }
    rd.onerror = () => { setBusy(null); s.pushConsole({ text: 'UNDERLAY IMAGEN: error de lectura del archivo', kind: 'err' }) }
    rd.readAsDataURL(file)
  }

  const handlePdf = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      s.pushConsole({ text: 'UNDERLAY PDF: el archivo no es un PDF', kind: 'err' })
      return
    }
    setBusy(`Rasterizando página 1 de ${file.name}…`)
    try {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      const data = await file.arrayBuffer()
      const pdf = await pdfjs.getDocument({ data }).promise
      const page = await pdf.getPage(1)
      // escala para ~1400 px de ancho máximo
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(2, Math.max(0.4, 1400 / base.width))
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vp.width)
      canvas.height = Math.round(vp.height)
      const ctx = canvas.getContext('2d')!
      await page.render({ canvas, canvasContext: ctx, viewport: vp } as unknown as Parameters<typeof page.render>[0]).promise
      const src = canvas.toDataURL('image/png')
      s.insertUnderlay(src, canvas.width, canvas.height, file.name, 'pdf', 1)
      setBusy(null)
    } catch (e) {
      console.error('pdf underlay', e)
      s.pushConsole({ text: `UNDERLAY PDF: no se pudo rasterizar (${(e as Error).message?.slice(0, 60) ?? 'error'}) — intente exportar la página como PNG`, kind: 'err' })
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) s.setDialog(null) }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="ImagePlus" className="text-amber-400" size={18} />
            Underlay de referencia — calque sobre una imagen o PDF
          </DialogTitle>
        </DialogHeader>

        {busy && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] font-semibold text-amber-300 animate-pulse">
            {busy}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => imgRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl border jy-border px-4 py-6 text-center hover:border-amber-500/60 hover:bg-amber-500/5 transition-all active:scale-[0.98]"
          >
            <ToolIcon name="Image" size={26} className="text-amber-400" />
            <span className="text-[13px] font-bold jy-text">Imagen (PNG / JPG)</span>
            <span className="text-[10.5px] jy-muted leading-snug">Fotografía del terreno, plano escaneado o boceto</span>
          </button>
          <button
            onClick={() => pdfRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl border jy-border px-4 py-6 text-center hover:border-amber-500/60 hover:bg-amber-500/5 transition-all active:scale-[0.98]"
          >
            <ToolIcon name="FileText" size={26} className="text-rose-400" />
            <span className="text-[13px] font-bold jy-text">PDF (página 1)</span>
            <span className="text-[10.5px] jy-muted leading-snug">Lámina de referencia rasterizada a 1400 px</span>
          </button>
        </div>

        <input
          ref={imgRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = '' }}
        />
        <input
          ref={pdfRef} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePdf(f); e.target.value = '' }}
        />

        <p className="text-[10.5px] jy-muted leading-relaxed">
          El underlay se inserta en la capa <b className="jy-text">Referencias</b> con opacidad 85%: dibuje encima,
          ajuste la opacidad desde el menú radial y apáguela desde el panel de capas al terminar de calcar.
        </p>
      </DialogContent>
    </Dialog>
  )
}
