import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { logAudit } from '@/lib/settings'

// ---------- Enlaces compartidos (Ola 4) ----------
// GET    /api/plans/:id/share            → lista de enlaces activos
// POST   /api/plans/:id/share            → crea enlace { permission: 'view' | 'edit' }
//                                         → { token, url: '/api/share/:token' }
// DELETE /api/plans/:id/share?shareId=…  → revoca el enlace (body {shareId} también válido)

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

    const shares = await db.sharedLink.findMany({
      where: { planId: plan.id, revoked: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        permission: true,
        createdAt: true,
        lastAccessAt: true,
      },
    })
    return NextResponse.json({
      shares: shares.map((s) => ({ ...s, url: `/api/share/${s.token}` })),
    })
  } catch (e) {
    console.error('share GET error', e)
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
    const permission =
      body && typeof body === 'object' && typeof (body as { permission?: unknown }).permission === 'string'
        ? (body as { permission: string }).permission
        : 'view'
    if (permission !== 'view' && permission !== 'edit') {
      return NextResponse.json({ error: 'Permiso inválido (view | edit)' }, { status: 400 })
    }

    const shareToken = crypto.randomBytes(12).toString('hex') // 24 caracteres hex
    const share = await db.sharedLink.create({
      data: {
        token: shareToken,
        planId: plan.id,
        permission,
        createdBy: session.username,
      },
      select: { id: true, token: true, permission: true, createdAt: true },
    })

    await logAudit(
      session.username,
      'plano_enlace_creado',
      `Plano: ${plan.name} — permiso ${permission}`
    )
    return NextResponse.json(
      { share, token: share.token, url: `/api/share/${share.token}` },
      { status: 201 }
    )
  } catch (e) {
    console.error('share POST error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? verifySessionToken(token) : null
    if (!session) return unauthorized()

    const { id } = await params
    const plan = await getOwnedPlan(id, session.userId)
    if (!plan) return notFound()

    // shareId vía query (?shareId=…) o body { shareId }
    let shareId = req.nextUrl.searchParams.get('shareId') ?? undefined
    if (!shareId) {
      const body = await req.json().catch(() => null)
      if (body && typeof body === 'object') {
        const sid = (body as { shareId?: unknown }).shareId
        if (typeof sid === 'string' && sid.length > 0) shareId = sid
      }
    }
    if (!shareId) {
      return NextResponse.json({ error: 'shareId requerido' }, { status: 400 })
    }

    const share = await db.sharedLink.findFirst({
      where: { id: shareId, planId: plan.id },
    })
    if (!share) {
      return NextResponse.json({ error: 'Enlace no encontrado' }, { status: 404 })
    }

    await db.sharedLink.update({ where: { id: share.id }, data: { revoked: true } })

    await logAudit(
      session.username,
      'plano_enlace_revocado',
      `Plano: ${plan.name} — enlace ${share.token.slice(0, 8)}…`
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('share DELETE error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
