import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { verifySessionToken, canEdit } from '@/lib/auth'
import { logAudit } from '@/lib/settings'

// ---------- Planos en la nube (Ola 3) ----------
// GET  /api/plans        → lista de planos del usuario (sin data, ligera)
// POST /api/plans        → crea un plano { name, projectName?, data, thumbnail? }
//                        → requiere rol editor o admin (visor = solo lectura)

const MAX_DATA_BYTES = 900 * 1024 // 900 KB

function unauthorized() {
  return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
}

function byteSize(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) return unauthorized()

    const plans = await db.plan.findMany({
      where: { ownerId: session.userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        projectName: true,
        updatedAt: true,
        revision: true,
        thumbnail: true,
      },
    })
    return NextResponse.json({ plans })
  } catch (e) {
    console.error('plans GET error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) return unauthorized()
    if (!canEdit(session.role)) {
      await logAudit(session.username, 'plano_creacion_denegada', 'Rol visor no puede crear planos')
      return NextResponse.json({ error: 'Su rol es de solo lectura — un editor debe guardar el plano' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
    }
    const { name, projectName, data, thumbnail } = body as {
      name?: unknown
      projectName?: unknown
      data?: unknown
      thumbnail?: unknown
    }

    const planName = String(name ?? '').trim()
    if (!planName) {
      return NextResponse.json({ error: 'El nombre del plano es requerido' }, { status: 400 })
    }
    if (typeof data !== 'string' || data.length === 0) {
      return NextResponse.json({ error: 'Los datos del plano son requeridos' }, { status: 400 })
    }
    if (byteSize(data) > MAX_DATA_BYTES) {
      return NextResponse.json(
        { error: 'El plano excede el tamaño máximo de 900 KB' },
        { status: 413 }
      )
    }
    if (thumbnail !== undefined && thumbnail !== null && typeof thumbnail !== 'string') {
      return NextResponse.json({ error: 'Miniatura inválida' }, { status: 400 })
    }
    if (typeof thumbnail === 'string' && byteSize(thumbnail) > MAX_DATA_BYTES) {
      return NextResponse.json(
        { error: 'La miniatura excede el tamaño máximo de 900 KB' },
        { status: 413 }
      )
    }

    const projName = String(projectName ?? '').trim() || 'Proyecto sin nombre'

    // techo de planos por usuario: evita inundar la BD con creaciones
    // automatizadas (cada plano lleva data + versiones + miniatura)
    const ownedCount = await db.plan.count({ where: { ownerId: session.userId } })
    if (ownedCount >= 300) {
      await logAudit(session.username, 'plano_creacion_denegada', `Límite de 300 planos por usuario alcanzado (${ownedCount})`)
      return NextResponse.json(
        { error: 'Límite de planos por usuario alcanzado (300). Elimine planos de la papelera para continuar.' },
        { status: 409 }
      )
    }

    const plan = await db.plan.create({
      data: {
        ownerId: session.userId,
        name: planName.slice(0, 200),
        projectName: projName.slice(0, 200),
        data,
        thumbnail: typeof thumbnail === 'string' && thumbnail.length > 0 ? thumbnail : null,
        revision: 0,
      },
      select: {
        id: true,
        name: true,
        projectName: true,
        revision: true,
        thumbnail: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await logAudit(session.username, 'plano_guardado_nube', `Plano: ${plan.name}`)
    return NextResponse.json({ plan }, { status: 201 })
  } catch (e) {
    console.error('plans POST error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
