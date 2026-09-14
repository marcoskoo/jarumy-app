import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { verifySessionToken, isAdmin, hashPassword, validatePasswordPolicy, sanitizeRole, denyAllUserSessions } from '@/lib/auth'
import { getSettings, logAudit } from '@/lib/settings'
import { rateLimit } from '@/lib/rate-limit'

// ============================================================
// Ola 8 — Gestión de usuarios (solo administradores).
// GET  /api/users        → lista (sin hashes ni secretos)
// POST /api/users        → crea usuario { username, password, displayName?, role }
// PATCH /api/users/:id   → { role?, displayName?, disabled?, password? }
// DELETE /api/users/:id  → deshabilita (blando; conserva planos y auditoría)
// ============================================================

function unauthorized() {
  return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'Requiere rol de administrador' }, { status: 403 })
}

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get('jarumy_session')?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) return { error: unauthorized() }
  if (!isAdmin(session.role)) return { error: forbidden() }
  return { session }
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema()
    const guard = await requireAdmin(req)
    if (guard.error) return guard.error
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        disabled: true,
        mustChangePassword: true,
        totpSecret: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { plans: { where: { deletedAt: null } } } },
      },
    })
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        disabled: u.disabled,
        mustChangePassword: u.mustChangePassword,
        twoFactor: !!u.totpSecret,
        planCount: u._count.plans,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    })
  } catch (e) {
    console.error('users GET error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema()
    const guard = await requireAdmin(req)
    if (guard.error) return guard.error
    const session = guard.session!

    // anti-abuso de creación masiva
    const rl = await rateLimit(`users-create:${session.userId}`, 20, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: `Espere ${rl.retryAfterS} s antes de crear más usuarios` }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    const { username, password, displayName, role } = (body ?? {}) as {
      username?: unknown; password?: unknown; displayName?: unknown; role?: unknown
    }

    const uname = String(username ?? '').trim()
    if (!uname || uname.length < 3 || uname.length > 60) {
      return NextResponse.json({ error: 'Usuario de 3 a 60 caracteres' }, { status: 400 })
    }
    const pwd = String(password ?? '')
    if (!pwd) {
      return NextResponse.json({ error: 'Contraseña inicial requerida' }, { status: 400 })
    }

    const { security } = await getSettings()
    const check = validatePasswordPolicy(pwd, {
      minLength: security.minPasswordLength,
      requireUpper: security.requireUpper,
      requireDigit: security.requireDigit,
      requireSymbol: security.requireSymbol,
    })
    if (!check.ok) {
      return NextResponse.json({ error: check.errors.join(' · ') }, { status: 400 })
    }

    const exists = await db.user.findUnique({ where: { username: uname } })
    if (exists) {
      return NextResponse.json({ error: `El usuario "${uname}" ya existe` }, { status: 409 })
    }

    const user = await db.user.create({
      data: {
        username: uname,
        passwordHash: hashPassword(pwd),
        displayName: String(displayName ?? '').trim().slice(0, 80) || null,
        role: sanitizeRole(role),
        mustChangePassword: true, // debe cambiarla en su primer acceso
      },
      select: { id: true, username: true, displayName: true, role: true, mustChangePassword: true, createdAt: true },
    })

    await logAudit(session.username, 'usuario_creado', `${user.username} · rol ${user.role}`)
    return NextResponse.json({ user }, { status: 201 })
  } catch (e) {
    console.error('users POST error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
