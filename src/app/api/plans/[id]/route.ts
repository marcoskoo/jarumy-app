import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { verifySessionToken, canEdit } from '@/lib/auth'
import { logAudit } from '@/lib/settings'

// ---------- Plano individual (Ola 3) ----------
// GET    /api/plans/:id → plano completo (incluye data) — solo propietario
// PUT    /api/plans/:id → actualiza name/projectName/data/thumbnail + revision++
//                        → requiere rol editor o admin
// DELETE /api/plans/:id → borrado lógico (deletedAt = now)

const MAX_DATA_BYTES = 900 * 1024 // 900 KB

function unauthorized() {
  return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
}

function notFound() {
  return NextResponse.json({ error: 'Plano no encontrado' }, { status: 404 })
}

function byteSize(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

async function getOwnedPlan(id: string, userId: string) {
  return db.plan.findFirst({
    where: { id, ownerId: userId, deletedAt: null },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) return unauthorized()

    const { id } = await params
    const plan = await getOwnedPlan(id, session.userId)
    if (!plan) return notFound()

    return NextResponse.json({ plan })
  } catch (e) {
    console.error('plan GET error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) return unauthorized()
    if (!canEdit(session.role)) {
      await logAudit(session.username, 'plano_edicion_denegada', 'Rol visor no puede modificar planos')
      return NextResponse.json({ error: 'Su rol es de solo lectura — no puede modificar planos' }, { status: 403 })
    }

    const { id } = await params
    const plan = await getOwnedPlan(id, session.userId)
    if (!plan) return notFound()

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

    // Solo se actualizan los campos presentes en el cuerpo
    const updates: {
      name?: string
      projectName?: string
      data?: string
      thumbnail?: string | null
    } = {}

    if (name !== undefined) {
      const n = String(name).trim()
      if (!n) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 })
      updates.name = n.slice(0, 200)
    }
    if (projectName !== undefined) {
      const p = String(projectName).trim()
      updates.projectName = (p || 'Proyecto sin nombre').slice(0, 200)
    }
    if (data !== undefined) {
      if (typeof data !== 'string' || data.length === 0) {
        return NextResponse.json({ error: 'Los datos del plano son requeridos' }, { status: 400 })
      }
      if (byteSize(data) > MAX_DATA_BYTES) {
        return NextResponse.json(
          { error: 'El plano excede el tamaño máximo de 900 KB' },
          { status: 413 }
        )
      }
      updates.data = data
    }
    if (thumbnail !== undefined) {
      if (thumbnail !== null && typeof thumbnail !== 'string') {
        return NextResponse.json({ error: 'Miniatura inválida' }, { status: 400 })
      }
      if (typeof thumbnail === 'string' && byteSize(thumbnail) > MAX_DATA_BYTES) {
        return NextResponse.json(
          { error: 'La miniatura excede el tamaño máximo de 900 KB' },
          { status: 413 }
        )
      }
      updates.thumbnail = thumbnail === null || thumbnail.length === 0 ? null : thumbnail
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const updated = await db.plan.update({
      where: { id: plan.id },
      data: { ...updates, revision: { increment: 1 } },
      select: {
        id: true,
        name: true,
        projectName: true,
        revision: true,
        thumbnail: true,
        updatedAt: true,
      },
    })

    await logAudit(session.username, 'plano_actualizado', `Plano: ${updated.name} (r${updated.revision})`)
    return NextResponse.json({ plan: updated })
  } catch (e) {
    console.error('plan PUT error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) return unauthorized()
    if (!canEdit(session.role)) {
      await logAudit(session.username, 'plano_borrado_denegado', 'Rol visor no puede borrar planos')
      return NextResponse.json({ error: 'Su rol es de solo lectura — no puede borrar planos' }, { status: 403 })
    }

    const { id } = await params
    const plan = await getOwnedPlan(id, session.userId)
    if (!plan) return notFound()

    await db.plan.update({ where: { id: plan.id }, data: { deletedAt: new Date() } })

    await logAudit(session.username, 'plano_eliminado', `Plano: ${plan.name}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('plan DELETE error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
