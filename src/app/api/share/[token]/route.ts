import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { logAudit } from '@/lib/settings'
import { rateLimit } from '@/lib/rate-limit'

// ---------- Acceso público por enlace (Ola 4) ----------
// GET /api/share/:token → { permission, plan: {id,name,projectName,updatedAt}, data }
//                          (sin datos del propietario; actualiza lastAccessAt)
// PUT /api/share/:token → solo con permiso 'edit': guarda data + revision++

const MAX_DATA_BYTES = 900 * 1024 // 900 KB

const TOKEN_RE = /^[a-zA-Z0-9_-]{1,128}$/

function gone(message: string) {
  return NextResponse.json({ error: message }, { status: 404 })
}

function byteSize(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

async function findActiveShare(token: string) {
  if (!TOKEN_RE.test(token)) return null
  const share = await db.sharedLink.findUnique({ where: { token } })
  if (!share || share.revoked) return null
  // expiración del enlace (Ola 8): caducado = no disponible
  if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) return null
  const plan = await db.plan.findUnique({ where: { id: share.planId } })
  if (!plan || plan.deletedAt) return null
  return { share, plan }
}

/** Rate-limit por IP para rutas públicas por token (anti-fuerza bruta de tokens). */
async function shareRateLimit(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const rl = await rateLimit(`share:${ip}`, 60, 60_000)
  if (rl.ok) return null
  return NextResponse.json(
    { error: `Demasiadas solicitudes. Espere ${rl.retryAfterS} s.` },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterS) } }
  )
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    await ensureSchema()
    const limited = await shareRateLimit(req)
    if (limited) return limited
    const { token } = await params
    const found = await findActiveShare(token)
    if (!found) return gone('Enlace no disponible')

    const { share, plan } = found
    await db.sharedLink.update({ where: { id: share.id }, data: { lastAccessAt: new Date() } })

    return NextResponse.json({
      permission: share.permission,
      plan: {
        id: plan.id,
        name: plan.name,
        projectName: plan.projectName,
        updatedAt: plan.updatedAt,
      },
      data: plan.data,
    })
  } catch (e) {
    console.error('share token GET error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    await ensureSchema()
    const limited = await shareRateLimit(req)
    if (limited) return limited
    const { token } = await params
    const found = await findActiveShare(token)
    if (!found) return gone('Enlace no disponible')

    const { share, plan } = found
    if (share.permission !== 'edit') {
      return NextResponse.json(
        { error: 'Este enlace es de solo lectura' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => null)
    const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : undefined
    if (typeof data !== 'string' || data.length === 0) {
      return NextResponse.json({ error: 'Los datos del plano son requeridos' }, { status: 400 })
    }
    if (byteSize(data) > MAX_DATA_BYTES) {
      return NextResponse.json(
        { error: 'El plano excede el tamaño máximo de 900 KB' },
        { status: 413 }
      )
    }

    const updated = await db.plan.update({
      where: { id: plan.id },
      data: { data, revision: { increment: 1 } },
      select: { revision: true, updatedAt: true },
    })
    await db.sharedLink.update({ where: { id: share.id }, data: { lastAccessAt: new Date() } })

    await logAudit(
      share.createdBy,
      'plano_editado_enlace',
      `Plano: ${plan.name} (r${updated.revision}) vía enlace compartido`
    )
    return NextResponse.json({ ok: true, revision: updated.revision, updatedAt: updated.updatedAt })
  } catch (e) {
    console.error('share token PUT error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
