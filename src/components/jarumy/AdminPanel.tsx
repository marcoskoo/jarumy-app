'use client'

import { useState, useEffect, useCallback } from 'react'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useJarumy } from '@/lib/store'
import { TOOL_CATEGORIES } from '@/lib/tools-data'
import { ToolIcon } from './ToolIcon'
import type { SecuritySettings, DesignSettings } from '@/lib/settings'

interface AdminUser { username: string; displayName: string | null; role: string }

export const PRIMARY_PRESETS: Record<string, string> = {
  amber: '#f59e0b', orange: '#f97316', emerald: '#10b981', rose: '#f43f5e',
  violet: '#8b5cf6', teal: '#14b8a6', lime: '#84cc16',
}

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: 'Home' },
  { id: 'seguridad', label: 'Seguridad', icon: 'ShieldCheck' },
  { id: 'diseno', label: 'Diseño web', icon: 'Palette' },
  { id: 'cuenta', label: 'Cuenta y clave', icon: 'Users' },
  { id: 'herramientas', label: 'Herramientas', icon: 'Wrench' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function AdminPanel({ onDesignChange }: { onDesignChange: (d: DesignSettings) => void }) {
  const s = useJarumy()
  const [tab, setTab] = useState<TabId>('resumen')
  const [user, setUser] = useState<AdminUser | null>(null)
  const [checking, setChecking] = useState(true)

  // login
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [totp, setTotp] = useState<{ active: boolean; secret?: string | null } | null>(null)
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [totpBusy, setTotpBusy] = useState(false)
  const [needs2FA, setNeeds2FA] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [logging, setLogging] = useState(false)

  // settings
  const [security, setSecurity] = useState<SecuritySettings | null>(null)
  const [design, setDesign] = useState<DesignSettings | null>(null)
  const [audit, setAudit] = useState<Array<{ id: string; username: string; action: string; detail: string | null; createdAt: string }>>([])
  const [saving, setSaving] = useState(false)

  // cambio de clave
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [cf, setCf] = useState('')

  // categorías ocultas
  const [hiddenCats, setHiddenCats] = useState<string[]>([])

  useEffect(() => {
    setHiddenCats(JSON.parse(localStorage.getItem('jarumy_hidden_cats') || '[]'))
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [sess, st, aud] = await Promise.all([
        fetch('/api/auth/session').then((r) => r.json()),
        fetch('/api/settings').then((r) => r.json()),
        fetch('/api/audit').then((r) => (r.ok ? r.json() : null)),
      ])
      if (sess.authenticated) setUser(sess.user)
      setSecurity(st.security)
      setDesign(st.design)
      if (aud?.logs) setAudit(aud.logs)
    } catch { /* noop */ } finally {
      setChecking(false)
    }
  }, [])

  // estado del 2FA TOTP del usuario (pestaña cuenta)
  useEffect(() => {
    if (!user || tab !== 'cuenta') return
    fetch('/api/auth/totp')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setTotp({ active: !!d.active, secret: d.secret ?? null }) })
      .catch(() => { /* sin servidor */ })
  }, [user, tab])

  useEffect(() => { if (s.adminOpen) refresh() }, [s.adminOpen, refresh])

  const doLogin = async (e?: React.FormEvent, otpVal?: string) => {
    e?.preventDefault()
    setLogging(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, otp: otpVal }),
      })
      const data = await res.json()
      if (data.requires2FA) {
        setNeeds2FA(true)
        if (data.method === 'totp') {
          if (otpVal && data.error) setLoginError(data.error)
          else toast.info('Escriba el código de 6 dígitos de su app autenticadora')
        }
      } else if (!res.ok) {
        setLoginError(data.error || 'Error de autenticación')
      } else {
        setUser(data.user)
        toast.success(`Bienvenido, ${data.user.displayName || data.user.username}`)
        refresh()
      }
    } catch {
      setLoginError('Error de conexión con el servidor')
    } finally {
      setLogging(false)
    }
  }

  const doLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    setUsername('')
    setPassword('')
    setOtp('')
    setNeeds2FA(false)
    toast.success('Sesión cerrada')
  }

  const saveSettings = async (sec?: SecuritySettings, des?: DesignSettings) => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ security: sec ?? security, design: des ?? design }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (sec) setSecurity(sec)
      if (des) { setDesign(des); onDesignChange(des) }
      toast.success('Configuración guardada')
      const aud = await fetch('/api/audit').then((r) => (r.ok ? r.json() : null))
      if (aud?.logs) setAudit(aud.logs)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!security) return
    const errs: string[] = []
    if (nw.length < security.minPasswordLength) errs.push(`mínimo ${security.minPasswordLength} caracteres`)
    if (security.requireUpper && !/[A-ZÁÉÍÓÚÑ]/.test(nw)) errs.push('una mayúscula')
    if (security.requireDigit && !/[0-9]/.test(nw)) errs.push('un número')
    if (security.requireSymbol && !/[^A-Za-z0-9]/.test(nw)) errs.push('un símbolo')
    if (errs.length) { toast.error(`La contraseña debe incluir: ${errs.join(', ')}`); return }
    if (nw !== cf) { toast.error('Las contraseñas no coinciden'); return }
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw, confirmPassword: cf }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Contraseña actualizada correctamente')
      setCur(''); setNw(''); setCf('')
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar la clave')
    }
  }

  if (!s.adminOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-6">
      <div className="w-full max-w-5xl h-full max-h-[92vh] rounded-2xl border jy-border jy-bg shadow-2xl overflow-hidden flex flex-col jy-pop-in">
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b jy-border shrink-0"
          style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.12), transparent 60%)' }}>
          <span className="flex items-center justify-center w-9 h-9 rounded-xl jy-bg-primary text-zinc-950 font-black text-lg">
            {(design?.logoInitial) || 'J'}
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-black jy-text leading-tight truncate">
              Panel de Administración — {design?.brand || 'Jarumy app'}
            </h2>
            <p className="text-[10.5px] jy-muted">
              {user ? `Sesión: ${user.displayName || user.username} · ${user.role}` : 'Autenticación requerida'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {user && (
              <Button variant="outline" size="sm" onClick={doLogout} className="h-8 text-[11px]">
                Cerrar sesión
              </Button>
            )}
            <button onClick={() => s.setAdminOpen(false)} className="jy-muted hover:text-amber-400 p-1"
              title="Volver a la app">
              <ToolIcon name="X" size={18} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex flex-1 min-h-0">
          {/* sidebar */}
          <nav className="w-40 sm:w-48 border-r jy-border py-3 shrink-0 hidden xs:block sm:flex flex-col gap-0.5 px-2"
            style={{ display: 'flex' }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                disabled={!user}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-left transition-colors disabled:opacity-40
                  ${tab === t.id ? 'bg-amber-500/15 text-amber-300' : 'jy-muted hover:bg-white/5 hover:jy-text'}`}
              >
                <ToolIcon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto jy-scroll p-5">
            {/* ---------------- LOGIN ---------------- */}
            {!user && (
              <div className="max-w-xs mx-auto pt-6">
                {checking ? (
                  <p className="text-center jy-muted text-sm py-8">Verificando sesión…</p>
                ) : (
                  <form onSubmit={(e) => doLogin(e)} className="space-y-3.5">
                    <div className="text-center mb-4">
                      <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl jy-bg-primary text-zinc-950 mb-2 jy-pulse">
                        <ToolIcon name="ShieldCheck" size={26} />
                      </span>
                      <h3 className="text-base font-bold jy-text">Acceso administrador</h3>
                      <p className="text-[11px] jy-muted">Seguridad Jarumy · v1.0</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] jy-muted">Usuario</Label>
                      <Input value={username} onChange={(e) => setUsername(e.target.value)}
                        placeholder="Usuario" autoComplete="username" className="h-9 bg-black/20" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] jy-muted">Contraseña</Label>
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••" autoComplete="current-password" className="h-9 bg-black/20" />
                    </div>
                    {needs2FA && (
                      <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/8 p-3">
                        <Label className="text-[11px] text-amber-300">Código del autenticador (TOTP · 6 dígitos)</Label>
                        <Input value={otp} onChange={(e) => setOtp(e.target.value)}
                          placeholder="123 456" inputMode="numeric" className="h-9 bg-black/20 font-mono" />
                        <Button type="button" size="sm" className="w-full h-8"
                          onClick={() => doLogin(undefined, otp)} disabled={logging}>
                          Verificar código
                        </Button>
                      </div>
                    )}
                    {loginError && <p className="text-[11px] text-rose-400">{loginError}</p>}
                    <Button type="submit" className="w-full" disabled={logging || !username || !password}>
                      {logging ? 'Verificando…' : 'Iniciar sesión'}
                    </Button>
                    <div className="rounded-md border jy-border bg-black/15 px-3 py-2 text-[10px] jy-muted leading-relaxed">
                      <b className="jy-text">Primer acceso:</b> el usuario administrador se crea la primera vez que el
                      servidor arranca. Su contraseña inicial se imprime en el registro del servidor (variable
                      <span className="font-mono text-amber-300"> JARUMY_ADMIN_PASSWORD</span> para fijarla usted mismo).
                      Cámbiela luego desde <b>Cuenta y clave</b> y active el 2FA real (TOTP).
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ---------------- RESUMEN ---------------- */}
            {user && tab === 'resumen' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { v: '1', l: 'Usuario admin', i: 'Users' },
                    { v: String(audit.length), l: 'Eventos de auditoría', i: 'History' },
                    { v: String(security?.twoFactor ? 'Sí' : 'No'), l: '2FA activo', i: 'ShieldCheck' },
                    { v: `${security?.sessionTimeout ?? 30} min`, l: 'Timeout de sesión', i: 'Activity' },
                  ].map((c, i) => (
                    <div key={i} className="rounded-xl border jy-border jy-bg2 p-3">
                      <ToolIcon name={c.i} className="text-amber-400 mb-1.5" size={16} />
                      <p className="text-lg font-black jy-text leading-none">{c.v}</p>
                      <p className="text-[10px] jy-muted mt-1">{c.l}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border jy-border overflow-hidden">
                  <div className="px-3 py-2 border-b jy-border flex items-center gap-2">
                    <ToolIcon name="History" className="text-amber-400" size={14} />
                    <span className="text-[12px] font-bold jy-text">Registro de auditoría (últimos 30)</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto jy-scroll">
                    {audit.length === 0 && <p className="p-3 text-[11px] jy-muted">Sin eventos registrados aún.</p>}
                    {audit.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 px-3 py-1.5 border-b border-white/4 text-[11px]">
                        <span className={`font-mono shrink-0 ${
                          a.action.includes('fallido') ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {new Date(a.createdAt).toLocaleTimeString('es-PE')}
                        </span>
                        <span className="jy-muted shrink-0 w-32 truncate">{new Date(a.createdAt).toLocaleDateString('es-PE')}</span>
                        <span className="jy-text font-semibold shrink-0">{a.username}</span>
                        <span className="text-amber-300/90 shrink-0">{a.action}</span>
                        <span className="jy-muted truncate">{a.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- SEGURIDAD ---------------- */}
            {user && tab === 'seguridad' && security && (
              <div className="space-y-4 max-w-xl">
                <SectionTitle icon="ShieldCheck" title="Autenticación" desc="Control de accesos al panel de administración" />
                <div className="rounded-xl border jy-border jy-bg2 divide-y divide-white/5">
                  <SwitchRow
                    label="Autenticación en dos factores (2FA)"
                    desc="Código de 6 dígitos simulado en la app autenticadora Jarumy"
                    checked={security.twoFactor}
                    onChange={(v) => setSecurity({ ...security, twoFactor: v })}
                  />
                  <SliderRow
                    label="Timeout de sesión"
                    desc="Los administradores serán desconectados tras este tiempo de inactividad"
                    value={security.sessionTimeout} min={5} max={120} step={5}
                    fmt={(v) => `${v} minutos`}
                    onChange={(v) => setSecurity({ ...security, sessionTimeout: v })}
                  />
                  <SliderRow
                    label="Intentos máximos de inicio de sesión"
                    desc="Bloqueo temporal de la cuenta al superar los intentos fallidos"
                    value={security.maxAttempts} min={3} max={10} step={1}
                    fmt={(v) => `${v} intentos`}
                    onChange={(v) => setSecurity({ ...security, maxAttempts: v })}
                  />
                  <SliderRow
                    label="Duración del bloqueo"
                    value={security.lockMinutes} min={1} max={30} step={1}
                    fmt={(v) => `${v} minutos`}
                    onChange={(v) => setSecurity({ ...security, lockMinutes: v })}
                  />
                  <SwitchRow
                    label="Registro de auditoría"
                    desc="Guarda cada inicio de sesión, cambio de clave y configuración"
                    checked={security.auditEnabled}
                    onChange={(v) => setSecurity({ ...security, auditEnabled: v })}
                  />
                </div>

                <SectionTitle icon="Lock" title="Política de contraseñas" desc="Reglas aplicadas al crear o cambiar contraseñas" />
                <div className="rounded-xl border jy-border jy-bg2 divide-y divide-white/5">
                  <SliderRow
                    label="Longitud mínima"
                    value={security.minPasswordLength} min={6} max={20} step={1}
                    fmt={(v) => `${v} caracteres`}
                    onChange={(v) => setSecurity({ ...security, minPasswordLength: v })}
                  />
                  <SwitchRow label="Requerir mayúscula" checked={security.requireUpper}
                    onChange={(v) => setSecurity({ ...security, requireUpper: v })} />
                  <SwitchRow label="Requerir número" checked={security.requireDigit}
                    onChange={(v) => setSecurity({ ...security, requireDigit: v })} />
                  <SwitchRow label="Requerir símbolo (!@#$…)" checked={security.requireSymbol}
                    onChange={(v) => setSecurity({ ...security, requireSymbol: v })} />
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={() => saveSettings(security)} disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar seguridad'}
                  </Button>
                  <Button variant="outline" onClick={() => setSecurity(security)}>Descartar</Button>
                </div>
              </div>
            )}

            {/* ---------------- DISEÑO ---------------- */}
            {user && tab === 'diseno' && design && (
              <div className="space-y-4 max-w-xl">
                <SectionTitle icon="Palette" title="Identidad de la aplicación" desc="Personaliza el nombre y el logotipo" />
                <div className="rounded-xl border jy-border jy-bg2 divide-y divide-white/5">
                  <InputRow label="Nombre de la marca" value={design.brand}
                    onChange={(v) => { const d = { ...design, brand: v }; setDesign(d); onDesignChange(d) }} />
                  <InputRow label="Inicial del logotipo" value={design.logoInitial} max={2}
                    onChange={(v) => { const d = { ...design, logoInitial: v.slice(0, 2) }; setDesign(d); onDesignChange(d) }} />
                  <div className="flex items-center justify-between px-4 py-3">
                    <Field label="Tema de la interfaz" desc="Oscuro estilo CAD o claro estilo lámina" />
                    <div className="flex gap-1 rounded-lg border jy-border p-0.5">
                      {(['dark', 'light'] as const).map((t) => (
                        <button key={t} onClick={() => { const d = { ...design, theme: t }; setDesign(d); onDesignChange(d) }}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold ${design.theme === t ? 'jy-bg-primary text-zinc-950' : 'jy-muted'}`}>
                          {t === 'dark' ? 'Oscuro' : 'Claro'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <SectionTitle icon="Sparkles" title="Colores y forma" desc="Se aplican en vivo a toda la aplicación" />
                <div className="rounded-xl border jy-border jy-bg2 divide-y divide-white/5">
                  <div className="px-4 py-3">
                    <Field label="Color primario" />
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {Object.entries(PRIMARY_PRESETS).map(([k, c]) => (
                        <button key={k} title={k}
                          onClick={() => { const d = { ...design, primaryColor: k }; setDesign(d); onDesignChange(d) }}
                          className={`w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110 ${design.primaryColor === k ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <Field label="Color de acento" />
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {Object.entries(PRIMARY_PRESETS).map(([k, c]) => (
                        <button key={k} title={k}
                          onClick={() => { const d = { ...design, accentColor: k }; setDesign(d); onDesignChange(d) }}
                          className={`w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110 ${design.accentColor === k ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                  <SliderRow label="Radio de bordes" value={design.radius} min={4} max={24} step={1}
                    fmt={(v) => `${v} px`}
                    onChange={(v) => { const d = { ...design, radius: v }; setDesign(d); onDesignChange(d) }} />
                  <div className="flex items-center justify-between px-4 py-3">
                    <Field label="Densidad de la interfaz" />
                    <div className="flex gap-1 rounded-lg border jy-border p-0.5">
                      {(['compact', 'comfortable', 'spacious'] as const).map((t) => (
                        <button key={t} onClick={() => { const d = { ...design, density: t }; setDesign(d); onDesignChange(d) }}
                          className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold ${design.density === t ? 'jy-bg-primary text-zinc-950' : 'jy-muted'}`}>
                          {t === 'compact' ? 'Compacta' : t === 'comfortable' ? 'Media' : 'Amplia'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={() => saveSettings(undefined, design)} disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar diseño'}
                  </Button>
                </div>
              </div>
            )}

            {/* ---------------- CUENTA / CLAVE ---------------- */}
            {user && tab === 'cuenta' && security && (
              <div className="space-y-4 max-w-md">
                <SectionTitle icon="Users" title="Cuenta de administrador" desc="Datos de la cuenta actual" />
                <div className="rounded-xl border jy-border jy-bg2 p-4 space-y-2 text-[12.5px]">
                  <div className="flex justify-between"><span className="jy-muted">Usuario</span><b className="jy-text">{user.username}</b></div>
                  <div className="flex justify-between"><span className="jy-muted">Nombre</span><b className="jy-text">{user.displayName}</b></div>
                  <div className="flex justify-between"><span className="jy-muted">Rol</span><b className="text-amber-300">{user.role}</b></div>
                </div>

                <SectionTitle icon="Lock" title="Cambiar contraseña" desc={`Política actual: mín. ${security.minPasswordLength} caracteres${security.requireUpper ? ', mayúscula' : ''}${security.requireDigit ? ', número' : ''}${security.requireSymbol ? ', símbolo' : ''}`} />
                <form onSubmit={changePassword} className="rounded-xl border jy-border jy-bg2 p-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] jy-muted">Contraseña actual</Label>
                    <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="h-9 bg-black/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] jy-muted">Nueva contraseña</Label>
                    <Input type="password" value={nw} onChange={(e) => setNw(e.target.value)} className="h-9 bg-black/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] jy-muted">Confirmar nueva contraseña</Label>
                    <Input type="password" value={cf} onChange={(e) => setCf(e.target.value)} className="h-9 bg-black/20" />
                  </div>
                  <Button type="submit" disabled={!cur || !nw || !cf} className="w-full">
                    Actualizar contraseña
                  </Button>
                </form>

                {/* ---------- 2FA REAL (TOTP RFC 6238) ---------- */}
                <SectionTitle icon="ShieldCheck" title="Doble factor (TOTP real)" desc="App autenticadora: Google Authenticator, Authy, 1Password, Bitwarden…" />
                <div className="rounded-xl border jy-border jy-bg2 p-4 space-y-3">
                  {totp?.active && !totpSetup && (
                    <div className="flex items-center gap-2 text-[12px] text-emerald-400 font-bold">
                      <ToolIcon name="ShieldCheck" size={15} /> 2FA ACTIVO — el login exige el código de 6 dígitos
                      <span className="ml-auto" />
                      <Button type="button" variant="outline" size="sm" className="h-8"
                        onClick={async () => {
                          const pw = await useJarumy.getState().requestPrompt('Código actual del autenticador (para confirmar la desactivación):')
                          if (!pw || !pw.trim()) return
                          setTotpBusy(true)
                          try {
                            const r = await fetch('/api/auth/totp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disable', code: pw }) })
                            const d = await r.json()
                            if (r.ok) { setTotp({ active: false }); toast.success('2FA desactivado') } else toast.error(d.error || 'No se pudo desactivar')
                          } finally { setTotpBusy(false) }
                        }} disabled={totpBusy}>
                        Desactivar
                      </Button>
                    </div>
                  )}
                  {!totp?.active && !totpSetup && (
                    <Button type="button" className="w-full"
                      onClick={async () => {
                        setTotpBusy(true)
                        try {
                          const r = await fetch('/api/auth/totp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setup' }) })
                          const d = await r.json()
                          if (r.ok) { setTotpSetup({ secret: d.secret, uri: d.uri }); toast.success('Secreto generado — añádalo a su autenticadora') }
                          else toast.error(d.error || 'No se pudo generar el secreto')
                        } finally { setTotpBusy(false) }
                      }} disabled={totpBusy}>
                      <ToolIcon name="QrCode" size={14} className="mr-1.5" /> Configurar 2FA con app autenticadora
                    </Button>
                  )}
                  {totpSetup && (
                    <div className="space-y-2.5">
                      <p className="text-[11px] jy-muted leading-relaxed">
                        1. Añada esta cuenta en su app autenticadora (ingreso manual con la clave o el URI otpauth).
                      </p>
                      <div className="rounded-lg border jy-border bg-black/30 px-3 py-2 font-mono text-[12px] tracking-[0.18em] text-amber-300 select-all text-center">
                        {totpSetup.secret}
                      </div>
                      <p className="text-[9.5px] jy-muted break-all font-mono">{totpSetup.uri}</p>
                      <p className="text-[11px] jy-muted">2. Escriba el código de 6 dígitos que muestra la app para confirmar:</p>
                      <div className="flex gap-2">
                        <Input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123 456"
                          inputMode="numeric" className="h-9 bg-black/20 font-mono" />
                        <Button type="button" disabled={totpCode.length < 6 || totpBusy}
                          onClick={async () => {
                            setTotpBusy(true)
                            try {
                              const r = await fetch('/api/auth/totp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'verify', code: totpCode }) })
                              const d = await r.json()
                              if (r.ok) { setTotp({ active: true }); setTotpSetup(null); setTotpCode(''); toast.success('2FA activado — el login exigirá su código') }
                              else toast.error(d.error || 'Código incorrecto')
                            } finally { setTotpBusy(false) }
                          }}>
                          Confirmar
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] jy-muted leading-relaxed">
                    Estándar RFC 6238 (SHA-1, 30 s, 6 dígitos) verificado contra los vectores oficiales.
                    Sin códigos simulados: el secreto vive solo en la base de datos y en su app.
                  </p>
                </div>
              </div>
            )}

            {/* ---------------- HERRAMIENTAS ---------------- */}
            {user && tab === 'herramientas' && (
              <div className="space-y-3 max-w-lg">
                <SectionTitle icon="Wrench" title="Módulos de herramientas" desc="Activa o desactiva las pestañas de la cinta de la aplicación principal" />
                <div className="rounded-xl border jy-border jy-bg2 divide-y divide-white/5">
                  {TOOL_CATEGORIES.map((c) => {
                    const hidden = hiddenCats.includes(c.id)
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                          style={{ background: `${c.color}22`, color: c.color }}>
                          <ToolIcon name={c.icon} size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold jy-text">{c.label}</p>
                          <p className="text-[10px] jy-muted">{c.tools.length} herramientas</p>
                        </div>
                        <Switch
                          checked={!hidden}
                          onCheckedChange={(v) => {
                            const next = v ? hiddenCats.filter((h) => h !== c.id) : [...hiddenCats, c.id]
                            setHiddenCats(next)
                            localStorage.setItem('jarumy_hidden_cats', JSON.stringify(next))
                            toast.success(`${c.label}: ${v ? 'visible' : 'oculto'} en la cinta`)
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10.5px] jy-muted">
                  Nota: los módulos desactivados se ocultan de la cinta al recargar la aplicación principal.
                  El menú radial contextual siempre permanece activo sobre el plano.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------- subcomponentes del admin ----------------

function SectionTitle({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <div className="flex items-center gap-2.5 -mb-1">
      <span className="flex items-center justify-center w-8 h-8 rounded-lg jy-bg-primary/15 text-amber-400">
        <ToolIcon name={icon} size={16} />
      </span>
      <div>
        <h3 className="text-[13.5px] font-bold jy-text leading-tight">{title}</h3>
        {desc && <p className="text-[10.5px] jy-muted">{desc}</p>}
      </div>
    </div>
  )
}

function Field({ label, desc }: { label: string; desc?: string }) {
  return (
    <div>
      <p className="text-[12.5px] font-semibold jy-text">{label}</p>
      {desc && <p className="text-[10.5px] jy-muted">{desc}</p>}
    </div>
  )
}

function SwitchRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <Field label={label} desc={desc} />
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function SliderRow({ label, desc, value, min, max, step, fmt, onChange }: {
  label: string; desc?: string; value: number; min: number; max: number; step: number
  fmt: (v: number) => string; onChange: (v: number) => void
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <Field label={label} desc={desc} />
        <span className="text-[12px] font-bold text-amber-300 font-mono">{fmt(value)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step}
        onValueChange={(v) => onChange(v[0])} className="cursor-pointer" />
    </div>
  )
}

function InputRow({ label, value, onChange, max }: { label: string; value: string; onChange: (v: string) => void; max?: number }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <Field label={label} />
      <Input value={value} maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-44 bg-black/20 text-[12px]" />
    </div>
  )
}
