import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'

// ---------- Versión individual (Ola 3) ----------
// GET /api/plans/:id/versions/:versionId → datos de una versión (solo propietario)

function unauthorized() {
  return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
}

function notFound() {
  return NextResponse.json({ error: 'Versión no encontrada' }, { status: 404 })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    await ensureSchema()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? await verifySessionToken(token) : null
    if (!session) return unauthorized()

    const { id, versionId } = await params

    // La versión debe pertenecer a un plano propio (no eliminado)
    const plan = await db.plan.findFirst({
      where: { id, ownerId: session.userId, deletedAt: null },
      select: { id: true },
    })
    if (!plan) return notFound()

    const version = await db.planVersion.findFirst({
      where: { id: versionId, planId: plan.id },
      select: { id: true, name: true, data: true, createdAt: true },
    })
    if (!version) return notFound()

    return NextResponse.json({ version })
  } catch (e) {
    console.error('version GET error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
