import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { verifySessionToken, isAdmin, hashPassword, validatePasswordPolicy, sanitizeRole, denyAllUserSessions } from '@/lib/auth'
import { getSettings, logAudit } from '@/lib/settings'

// PATCH /api/users/:id → { role?, displayName?, disabled?, password? }
// DELETE /api/users/:id → deshabilitado blando (conserva planos/auditoría)

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

/** Protege la operación "último administrador activo": nunca debe quedar la app sin admin. */
async function lastAdminGuard(targetId: string, nextDisabled: boolean | undefined, nextRole: string | undefined) {
  const target = await db.user.findUnique({ where: { id: targetId }, select: { role: true, disabled: true } })
  if (!target) return null
  const willLoseAdmin =
    (nextDisabled === true && !target.disabled) || (nextRole !== undefined && nextRole !== 'admin')
  if (!willLoseAdmin || (target.role !== 'admin' && nextRole !== 'admin')) return { target }
  const activeAdmins = await db.user.count({ where: { role: 'admin', disabled: false } })
  if (activeAdmins <= 1) {
    return { target, error: 'No se puede dejar la aplicación sin administradores activos' }
  }
  return { target }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema()
    const guard = await requireAdmin(req)
    if (guard.error) return guard.error
    const session = guard.session!
    const { id } = await params

    const body = await req.json().catch(() => null)
    const { role, displayName, disabled, password } = (body ?? {}) as {
      role?: unknown; displayName?: unknown; disabled?: unknown; password?: unknown
    }

    const nextRole = role !== undefined ? sanitizeRole(role) : undefined
    const nextDisabled = disabled === undefined ? undefined : Boolean(disabled)

    const guardRes = await lastAdminGuard(id, nextDisabled, nextRole)
    if (!guardRes || !guardRes.target) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    if (guardRes.error) {
      return NextResponse.json({ error: guardRes.error }, { status: 409 })
    }

    const updates: {
      role?: string
      displayName?: string | null
      disabled?: boolean
      passwordHash?: string
      mustChangePassword?: boolean
    } = {}
    if (nextRole !== undefined) updates.role = nextRole
    if (displayName !== undefined) {
      updates.displayName = String(displayName).trim().slice(0, 80) || null
    }
    if (nextDisabled !== undefined) updates.disabled = nextDisabled

    if (password !== undefined) {
      const pwd = String(password)
      if (!pwd) {
        return NextResponse.json({ error: 'Contraseña vacía' }, { status: 400 })
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
      updates.passwordHash = hashPassword(pwd)
      updates.mustChangePassword = true
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const user = await db.user.update({
      where: { id },
      data: updates,
      select: { id: true, username: true, displayName: true, role: true, disabled: true, mustChangePassword: true },
    })

    // si cambió la clave o se deshabilitó → revocar todas sus sesiones
    if (updates.passwordHash || nextDisabled === true) {
      await denyAllUserSessions(id)
    }

    const changes = [
      nextRole !== undefined ? `rol=${nextRole}` : null,
      nextDisabled !== undefined ? (nextDisabled ? 'deshabilitado' : 'habilitado') : null,
      updates.passwordHash ? 'clave restablecida' : null,
      displayName !== undefined ? 'nombre actualizado' : null,
    ].filter(Boolean).join(' · ')
    await logAudit(session.username, 'usuario_actualizado', `${user.username}: ${changes}`)

    return NextResponse.json({ user })
  } catch (e) {
    console.error('user PATCH error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureSchema()
    const guard = await requireAdmin(req)
    if (guard.error) return guard.error
    const session = guard.session!
    const { id } = await params

    if (id === session.userId) {
      return NextResponse.json({ error: 'No puede deshabilitar su propia cuenta' }, { status: 409 })
    }

    const guardRes = await lastAdminGuard(id, true, undefined)
    if (!guardRes || !guardRes.target) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    if (guardRes.error) {
      return NextResponse.json({ error: guardRes.error }, { status: 409 })
    }

    const user = await db.user.update({
      where: { id },
      data: { disabled: true },
      select: { id: true, username: true, role: true },
    })
    await denyAllUserSessions(id)
    await logAudit(session.username, 'usuario_deshabilitado', user.username)

    return NextResponse.json({ ok: true, user })
  } catch (e) {
    console.error('user DELETE error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
