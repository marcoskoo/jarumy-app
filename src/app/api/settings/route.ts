import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'
import { ensureSeed, getSettings, saveSettings, logAudit } from '@/lib/settings'

export async function GET() {
  try {
    await ensureSeed()
    const settings = await getSettings()
    return NextResponse.json(settings)
  } catch (e) {
    console.error('settings GET error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureSeed()
    const token = req.cookies.get('jarumy_session')?.value
    const session = token ? verifySessionToken(token) : null
    if (!session) {
      return NextResponse.json({ error: 'No autorizado — inicie sesión como administrador' }, { status: 401 })
    }

    const body = await req.json()
    const { security, design } = body as { security?: object; design?: object }
    if (security) await saveSettings('security', security)
    if (design) await saveSettings('design', design)
    await logAudit(session.username, 'configuracion_actualizada', `${security ? 'seguridad ' : ''}${design ? 'diseño ' : ''}`.trim())

    const settings = await getSettings()
    return NextResponse.json({ ok: true, ...settings })
  } catch (e) {
    console.error('settings PUT error', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
