// ============================================================
// JARUMY APP — Exportación rápida PNG / SVG del plano.
// Clona el <svg> del lienzo, inyecta los estilos mínimos (las
// variables CSS no existen fuera de la app) y lo serializa.
// ============================================================

let registered: SVGSVGElement | null = null

/** PlanCanvas registra aquí su <svg> para que el store pueda exportarlo. */
export function registerSvg(el: SVGSVGElement | null) {
  registered = el
}

export function getRegisteredSvg(): SVGSVGElement | null {
  return registered
}

export interface RasterResult {
  filename: string
  bytes: number
}

/** estilos mínimos para que el SVG standalone se vea como en la app */
const INLINE_STYLE = `
  :root, svg { --jy-primary: #f59e0b; --jy-muted: #a1a1aa; }
  text { font-family: Helvetica, Arial, sans-serif; }
`

/** Construye un SVG standalone (blanco) a partir del lienzo vivo. */
function buildStandaloneSvg(svgEl: SVGSVGElement, scale = 2): SVGSVGElement {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  // fondo blanco
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', '100%')
  bg.setAttribute('height', '100%')
  bg.setAttribute('fill', '#ffffff')
  clone.insertBefore(bg, clone.firstChild)
  // estilos inline (variables CSS + fuentes)
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = INLINE_STYLE
  clone.insertBefore(style, clone.firstChild)
  // dimensiones explícitas
  const vb = (svgEl.getAttribute('viewBox') || '0 0 1200 820').split(/\s+/).map(Number)
  clone.setAttribute('width', String(vb[2] * scale))
  clone.setAttribute('height', String(vb[3] * scale))
  clone.removeAttribute('class')
  clone.removeAttribute('style')
  return clone
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)

export function exportPlanSvg(svgEl: SVGSVGElement): RasterResult | null {
  try {
    const standalone = buildStandaloneSvg(svgEl, 1)
    const xml = new XMLSerializer().serializeToString(standalone)
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`
    const filename = `jarumy-plano-${stamp()}.svg`
    downloadBlob(new Blob([content], { type: 'image/svg+xml;charset=utf-8' }), filename)
    return { filename, bytes: content.length }
  } catch {
    return null
  }
}

export async function exportPlanPng(svgEl: SVGSVGElement, scale = 2): Promise<RasterResult | null> {
  try {
    const standalone = buildStandaloneSvg(svgEl, scale)
    const xml = new XMLSerializer().serializeToString(standalone)
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('raster falló'))
      img.src = svgUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || 1200 * scale
    canvas.height = img.naturalHeight || 820 * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('sin contexto 2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')
    const filename = `jarumy-plano-${stamp()}.png`
    const bin = atob(dataUrl.split(',')[1])
    const u8 = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
    downloadBlob(new Blob([u8], { type: 'image/png' }), filename)
    return { filename, bytes: u8.length }
  } catch {
    return null
  }
}
