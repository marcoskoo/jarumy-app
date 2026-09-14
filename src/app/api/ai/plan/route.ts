import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

// ============================================================
// Ola 7 — IA · Generador de plantas esquemáticas desde texto.
// El modelo devuelve un JSON normado (metros) que se convierte a
// la geometría real del plano (px, capa correcta, usos RNE).
// Requiere sesión iniciada + rate-limit por usuario (10/min).
// ============================================================

export const runtime = 'nodejs'

const PX_PER_M = 60
const ORIGIN_X = 150
const ORIGIN_Y = 100

interface AiRoom { name: string; num?: string; x: number; y: number; w: number; h: number; usage?: string }
interface AiWall { x1: number; y1: number; x2: number; y2: number; t?: number }
interface AiDoor { x: number; y: number; w: number; axis?: 'h' | 'v' }
interface AiWindow { x: number; y: number; len: number; orient?: 'h' | 'v' }
interface AiPlanJson { rooms?: AiRoom[]; walls?: AiWall[]; doors?: AiDoor[]; windows?: AiWindow[] }

const SYSTEM = `Eres un arquitecto peruano experto en vivienda y normativa RNE (A.010, A.040, A.130).
Tu tarea: dado el programa del usuario, generar la PLANTA ARQUITECTÓNICA ESQUEMÁTICA de UNA planta en un lote rectangular, en 2D, con coordenadas en METROS (sistema métrico decimal, eje Y hacia abajo).

Responde EXCLUSIVAMENTE con un objeto JSON válido (sin markdown, sin explicaciones) con esta estructura exacta:
{
  "rooms": [ { "name": "SALA", "num": "01", "x": 0, "y": 0, "w": 4, "h": 3.5, "usage": "estar" } ],
  "walls": [ { "x1": 0, "y1": 0, "x2": 4, "y2": 0, "t": 0.15 } ],
  "doors": [ { "x": 1, "y": 0, "w": 0.9, "axis": "v" } ],
  "windows": [ { "x": 2, "y": 0, "len": 1.5, "orient": "h" } ]
}
Reglas:
- Origen (0,0) = esquina superior izquierda del lote; lote con ORIGEN en 0 y dimensiones máximas 15×10 m.
- rooms: cada ambiente como rectángulo [x, y, w, h] en metros SIN SOLAPARSE, cubriendo el interior; usage uno de: estar, dormitorio, cocina, bano, lavanderia, comedor, estudio, garaje, pasillo, escalera, deposito. num correlativo "01", "02"…
- walls: muros del contorno e interiores como segmentos por sus EXTREMOS (x1,y1,x2,y2) en metros; t = espesor en metros (0.15 muros de ladrillo, 0.10 interiores). Trazos rectos ortogonales solamente.
- doors: bisagra (x, y) en metros sobre un muro, w = ancho de puerta (0.90 m accesible, 0.70 m baños), axis "v" si el muro es vertical o "h" si es horizontal.
- windows: (x, y) = extremo izquierdo/superior sobre muro, len en metros, orient "h" (muro horizontal) o "v".
- Incluye puertas a cada ambiente, ventanas en dormitorios/sala/cocina (área iluminante ≥ 15% del piso), y respeta dimensiones mínimas RNE (dormitorio ≥ 9 m², baño ≥ 1.5 m² con lado ≥ 1.20 m).
- Nada de texto fuera del JSON.`

function extractJson(text: string): AiPlanJson | null {
  const cleaned = text.replace(/```json/gi, '```').split('```').filter(Boolean)
  const candidates = [text, ...cleaned]
  for (const c of candidates) {
    const i = c.indexOf('{')
    const j = c.lastIndexOf('}')
    if (i === -1 || j <= i) continue
    try {
      return JSON.parse(c.slice(i, j + 1)) as AiPlanJson
    } catch { /* intenta el siguiente candidato */ }
  }
  return null
}

const uid = (p: string) => `ia-${p}-${Math.random().toString(36).slice(2, 8)}`

export async function POST(req: NextRequest) {
  try {
    // ---- autenticación + rate-limit (protege el consumo del SDK) ----
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) {
      return NextResponse.json({ error: 'Inicie sesión para usar el generador IA' }, { status: 401 })
    }
    const rl = await rateLimit(`ai:${session.userId}`, 10, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Límite de solicitudes IA alcanzado — espere ${rl.retryAfterS} s` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterS) } }
      )
    }

    const { prompt } = await req.json()
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
      return NextResponse.json({ error: 'Describa el proyecto (mínimo 5 caracteres)' }, { status: 400 })
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Programa del proyecto: ${prompt.trim()}\nGenera el JSON de la planta.` },
      ],
      temperature: 0.4,
    })
    const raw = completion.choices?.[0]?.message?.content ?? ''
    const plan = extractJson(raw)
    if (!plan || (!plan.rooms?.length && !plan.walls?.length)) {
      return NextResponse.json({ error: 'La IA no devolvió una geometría válida — intente describir el proyecto con más detalle' }, { status: 502 })
    }

    // ---- conversión metros → geometría del plano (px) ----
    const M = (v: number) => (Number.isFinite(v) ? v * PX_PER_M : 0)
    const elements: Array<Record<string, unknown>> = []
    const mods: Record<string, Record<string, unknown>> = {}

    for (const w of plan.walls || []) {
      elements.push({
        id: uid('muro'), type: 'muro', layer: 'muros',
        name: `Muro IA ${((w.t ?? 0.15) * 100).toFixed(0)} cm`,
        geo: {
          x1: ORIGIN_X + M(w.x1), y1: ORIGIN_Y + M(w.y1),
          x2: ORIGIN_X + M(w.x2), y2: ORIGIN_Y + M(w.y2),
          t: Math.max(4, M(w.t ?? 0.15)),
        },
      })
    }
    for (const r of plan.rooms || []) {
      const id = uid('esp')
      elements.push({
        id, type: 'espacio', layer: 'espacios',
        name: r.name,
        geo: {
          x: ORIGIN_X + M(r.x), y: ORIGIN_Y + M(r.y), w: M(r.w), h: M(r.h),
          name: String(r.name || 'AMBIENTE').toUpperCase(), num: r.num || '01',
        },
      })
      mods[id] = { usage: r.usage || 'estar' }
    }
    for (const d of plan.doors || []) {
      const axis = d.axis === 'h' ? 'h' : 'v'
      elements.push({
        id: uid('pt'), type: 'puerta', layer: 'puertas',
        name: `Puerta IA ${(d.w ?? 0.9).toFixed(2)} m`,
        geo: axis === 'v'
          ? { cx: ORIGIN_X + M(d.x), cy: ORIGIN_Y + M(d.y), r: M(d.w ?? 0.9), a0: -90, a1: 0, axis: 'v' }
          : { cx: ORIGIN_X + M(d.x), cy: ORIGIN_Y + M(d.y), r: M(d.w ?? 0.9), a0: 180, a1: 90, axis: 'h' },
      })
    }
    for (const wn of plan.windows || []) {
      elements.push({
        id: uid('vn'), type: 'ventana', layer: 'ventanas',
        name: `Ventana IA ${(wn.len ?? 1.5).toFixed(2)} m`,
        geo: { x: ORIGIN_X + M(wn.x), y: ORIGIN_Y + M(wn.y), len: M(wn.len ?? 1.5), orient: wn.orient === 'v' ? 'v' : 'h', t: 12 },
      })
    }

    const summary = `${plan.rooms?.length ?? 0} ambientes · ${plan.walls?.length ?? 0} muros · ${plan.doors?.length ?? 0} puertas · ${plan.windows?.length ?? 0} ventanas`
    return NextResponse.json({ elements, mods, summary, raw: raw.slice(0, 400) })
  } catch (e) {
    console.error('ai/plan error', e)
    return NextResponse.json({ error: 'El servicio de IA no está disponible en este momento' }, { status: 502 })
  }
}
