import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { logAudit } from '@/lib/settings'

// ---------- Versiones de plano (Ola 3) ----------
// GET  /api/plans/:id/versions → lista de versiones (id/name/createdAt)
// POST /api/plans/:id/versions → crea snapshot del estado actual { name? }
//                                (máx. 20 versiones por plano, se eliminan las más antiguas)

const MAX_VERSIONS_PER_PLAN = 20

function unauthorized() {
  return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
}

function notFound() {
  return NextResponse.json({ error: 'Plano no encontrado' }, { status: 404 })
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
    const session = token ? verifySessionToken(token) : null
    if (!session) return unauthorized()

    const { id } = await params
    const plan = await getOwnedPlan(id, session.userId)
    if (!plan) return notFound()

    const versions = await db.planVersion.findMany({
      where: { planId: plan.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true },
    })
    return NextResponse.json({ versions })
  } catch (e) {
    console.error('versions GET error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? verifySessionToken(token) : null
    if (!session) return unauthorized()

    const { id } = await params
    const plan = await getOwnedPlan(id, session.userId)
    if (!plan) return notFound()

    const body = await req.json().catch(() => null)
    const rawName = body && typeof body === 'object' ? (body as { name?: unknown }).name : undefined
    const versionName =
      String(rawName ?? '').trim().slice(0, 200) ||
      `Versión ${new Date().toLocaleString('es-PE')}`

    // Snapshot del estado actual del plano
    const version = await db.planVersion.create({
      data: { planId: plan.id, name: versionName, data: plan.data },
      select: { id: true, name: true, createdAt: true },
    })

    // Retención: máximo 20 versiones por plano (se eliminan las más antiguas)
    const total = await db.planVersion.count({ where: { planId: plan.id } })
    if (total > MAX_VERSIONS_PER_PLAN) {
      const oldest = await db.planVersion.findMany({
        where: { planId: plan.id },
        orderBy: { createdAt: 'asc' },
        take: total - MAX_VERSIONS_PER_PLAN,
        select: { id: true },
      })
      if (oldest.length > 0) {
        await db.planVersion.deleteMany({
          where: { id: { in: oldest.map((v) => v.id) } },
        })
      }
    }

    await logAudit(session.username, 'plano_version_creada', `Plano: ${plan.name} — ${versionName}`)
    return NextResponse.json({ version }, { status: 201 })
  } catch (e) {
    console.error('versions POST error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
