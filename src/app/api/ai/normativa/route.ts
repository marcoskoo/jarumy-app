import { NextRequest, NextResponse } from 'next/server'

// ============================================================
// Ola 7 — IA · Revisor de normativa RNE: recibe los checks
// REALES calculados sobre el plano y devuelve interpretación
// con correcciones de diseño concretas.
// ============================================================

export const runtime = 'nodejs'

interface CheckIn { code: string; title: string; status: 'ok' | 'warn' | 'fail'; detail: string }

const SYSTEM = `Eres un revisor urbano-arquitectónico peruano (municipalidad / ININV) experto en RNE:
A.010 Condiciones Generales de Diseño, A.040 Educación, A.050 Promoción del Acceso a Personas con Movilidad Restringida,
A.120 Comercio, A.130 Requisitos de Seguridad Humana, E.020 Tehrmica.
El sistema te entrega los checks automáticos calculados sobre un plano real de vivienda con sus números exactos.
Tu trabajo:
1. Interpreta CADA check en lenguaje de arquitecto (máximo 2 líneas cada uno; prioriza fails y warns).
2. Propón correcciones de diseño CONCRETAS y dimensionadas (ej. "reduzca el baño a 1.50 m y gane 0.30 m en el pasillo a 1.20 m").
3. Cierra con un veredicto de viabilidad para expediente de licencia (2-3 líneas) y los 3 arreglos prioritarios.
Formato de salida: texto plano en español con viñetas "·" y subtítulos en MAYÚSCULAS. Sin markdown de encabezados (#), sin tablas. Máximo 320 palabras.`

export async function POST(req: NextRequest) {
  try {
    const { checks, summary, stats } = await req.json()
    if (!Array.isArray(checks)) {
      return NextResponse.json({ error: 'Faltan los checks del plano' }, { status: 400 })
    }

    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `CHECKS DEL PLANO (estado real calculado):
${(checks as CheckIn[]).map((c) => `[${c.status.toUpperCase()}] ${c.code} — ${c.title}: ${c.detail}`).join('\n')}

RESUMEN: ${summary?.ok ?? 0} conformes · ${summary?.warn ?? 0} observaciones · ${summary?.fail ?? 0} incumplimientos.
AMBIENTES: ${(stats?.ambientes as string[] | undefined)?.join(' · ') ?? '—'} (total ${stats?.totalM2 ?? '—'} m²).

Emite tu revisión.`,
        },
      ],
      temperature: 0.5,
    })
    const analysis = completion.choices?.[0]?.message?.content?.trim() ?? ''
    if (!analysis) {
      return NextResponse.json({ error: 'La IA no devolvió análisis' }, { status: 502 })
    }
    return NextResponse.json({ analysis })
  } catch (e) {
    console.error('ai/normativa error', e)
    return NextResponse.json({ error: 'El servicio de IA no está disponible en este momento' }, { status: 502 })
  }
}
