'use client'

import { useCallback, useEffect, useState } from 'react'
import { useJarumy } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToolIcon } from './ToolIcon'
import { startCollabSession, stopCollabSession, sendCollabChat, collabConnected } from '@/lib/collab-client'

interface PlanRow { id: string; name: string; projectName: string; updatedAt: string; revision: number; thumbnail?: string | null }
interface ShareRow { id: string; token: string; permission: string; createdAt: string; lastAccessAt?: string | null; url: string }
interface VersionRow { id: string; name: string; createdAt: string }

type Tab = 'planos' | 'versiones' | 'compartir' | 'vivo'

const planPayload = () => {
  const s = useJarumy.getState()
  return { elements: s.elements, mods: s.mods, layers: s.layers, gridSpacing: s.gridSpacing, savedAt: Date.now() }
}

/**
 * Gestor de planos en la nube (Ola 3 + 4): CRUD de planos por usuario,
 * versionado en base de datos, enlaces para compartir con permisos y
 * sesión colaborativa en vivo (socket.io).
 */
export function CloudDialog() {
  const s = useJarumy()
  const open = s.dialog === 'cloud'
  const [tab, setTab] = useState<Tab>('planos')
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [shares, setShares] = useState<ShareRow[]>([])
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [chatText, setChatText] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setAuthError(null)
    try {
      const r = await fetch('/api/plans')
      if (r.status === 401) { setAuthError('login'); setPlans([]); return }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setPlans(data.plans || [])
    } catch {
      setAuthError('server')
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && tab === 'planos') void refresh()
    if (open && tab === 'compartir' && s.cloud.planId) void refreshShares()
    if (open && tab === 'versiones' && s.cloud.planId) void refreshVersions()
  }, [open, tab])

  const refreshShares = async () => {
    try {
      const r = await fetch(`/api/plans/${s.cloud.planId}/share`)
      if (r.ok) setShares((await r.json()).shares || [])
    } catch { /* sin servidor */ }
  }
  const refreshVersions = async () => {
    try {
      const r = await fetch(`/api/plans/${s.cloud.planId}/versions`)
      if (r.ok) setVersions((await r.json()).versions || [])
    } catch { /* sin servidor */ }
  }

  if (!open) return null

  // ---------- acciones de la nube ----------
  const saveToCloud = async (asNew: boolean) => {
    const name = await s.requestPrompt('Nombre del plano en la nube:', s.cloud.planName || 'Plano Jarumy')
    if (name === null) return
    setBusy('Guardando en la nube…')
    s.setCloud({ status: 'saving' })
    try {
      const body = { name: name.trim(), projectName: s.cloud.projectName, data: JSON.stringify(planPayload()) }
      const r = asNew || !s.cloud.planId
        ? await fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(`/api/plans/${s.cloud.planId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.status === 401) { setAuthError('login'); s.setCloud({ status: 'error' }); setBusy(null); return }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { plan } = await r.json()
      s.setCloud({ planId: plan.id, planName: plan.name, status: 'saved', lastSyncAt: Date.now(), revision: plan.revision ?? 0, dirty: false })
      s.pushConsole({ text: `NUBE: "${plan.name}" guardado (rev ${plan.revision ?? 0}) — disponible desde cualquier dispositivo con su sesión`, kind: 'out' })
      void refresh()
    } catch {
      s.setCloud({ status: 'error' })
      s.pushConsole({ text: 'NUBE: no se pudo guardar (servidor o base de datos no disponible)', kind: 'err' })
    } finally {
      setBusy(null)
    }
  }

  const openFromCloud = async (id: string, name: string) => {
    setBusy(`Abriendo "${name}"…`)
    try {
      const r = await fetch(`/api/plans/${id}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { plan } = await r.json()
      let data: { elements?: unknown; mods?: unknown; layers?: unknown; gridSpacing?: number } = {}
      try { data = JSON.parse(plan.data) } catch { /* plano corrupto */ }
      if (!Array.isArray(data.elements)) throw new Error('plano corrupto')
      s.setDialog(null)
      s.setSelection([])
      useJarumy.setState({
        elements: data.elements as never,
        mods: (data.mods || {}) as never,
        layers: Array.isArray(data.layers) && data.layers.length ? data.layers as never : useJarumy.getState().layers,
        gridSpacing: typeof data.gridSpacing === 'number' ? data.gridSpacing : useJarumy.getState().gridSpacing,
        undoStack: [], redoStack: [],
      })
      s.setCloud({ planId: plan.id, planName: plan.name, projectName: plan.projectName, status: 'saved', lastSyncAt: Date.now(), revision: plan.revision ?? 0, dirty: false })
      s.pushConsole({ text: `NUBE: "${plan.name}" abierto — ${(data.elements as unknown[]).length} elementos restaurados`, kind: 'out' })
    } catch (e) {
      s.pushConsole({ text: `NUBE: no se pudo abrir el plano (${(e as Error).message})`, kind: 'err' })
    } finally {
      setBusy(null)
    }
  }

  const deleteFromCloud = async (id: string, name: string) => {
    setBusy(`Eliminando "${name}"…`)
    try {
      const r = await fetch(`/api/plans/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      if (s.cloud.planId === id) s.setCloud({ planId: null, planName: '', status: 'off' })
      s.pushConsole({ text: `NUBE: "${name}" enviado a la papelera (borrado lógico)`, kind: 'out' })
      void refresh()
    } catch {
      s.pushConsole({ text: 'NUBE: no se pudo eliminar el plano', kind: 'err' })
    } finally {
      setBusy(null)
    }
  }

  const createShare = async (permission: 'view' | 'edit') => {
    if (!s.cloud.planId) {
      s.pushConsole({ text: 'COMPARTIR: primero guarde el plano en la nube (pestaña Mis planos)', kind: 'err' })
      return
    }
    setBusy('Creando enlace…')
    try {
      const r = await fetch(`/api/plans/${s.cloud.planId}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { share } = await r.json()
      void refreshShares()
      const url = `${window.location.origin}/?plano=${share.token}`
      try { await navigator.clipboard.writeText(url) } catch { /* sin portapapeles */ }
      s.pushConsole({ text: `ENLACE CREADO (${permission === 'edit' ? 'EDICIÓN' : 'VISTA'}): ${url} — copiado al portapapeles`, kind: 'out' })
    } catch {
      s.pushConsole({ text: 'COMPARTIR: no se pudo crear el enlace', kind: 'err' })
    } finally {
      setBusy(null)
    }
  }

  const revokeShare = async (shareId: string) => {
    try {
      await fetch(`/api/plans/${s.cloud.planId}/share?shareId=${shareId}`, { method: 'DELETE' })
      void refreshShares()
      s.pushConsole({ text: 'ENLACE revocado — ya nadie puede abrirlo', kind: 'out' })
    } catch { /* sin servidor */ }
  }

  const saveVersion = async () => {
    if (!s.cloud.planId) return
    const name = await s.requestPrompt('Nombre de la versión:', `Versión ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`)
    if (name === null) return
    setBusy('Creando versión…')
    try {
      const r = await fetch(`/api/plans/${s.cloud.planId}/versions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      void refreshVersions()
      s.pushConsole({ text: `VERSIÓN NUBE guardada: "${name}" — historial en base de datos (máx. 20)`, kind: 'out' })
    } catch {
      s.pushConsole({ text: 'VERSIONES: no se pudo guardar', kind: 'err' })
    } finally {
      setBusy(null)
    }
  }

  const restoreVersion = async (versionId: string, name: string) => {
    if (!s.cloud.planId) return
    setBusy(`Restaurando "${name}"…`)
    try {
      const r = await fetch(`/api/plans/${s.cloud.planId}/versions/${versionId}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { version } = await r.json()
      const data = JSON.parse(version.data)
      useJarumy.setState({ elements: data.elements, mods: data.mods || {}, undoStack: [], redoStack: [] })
      s.pushConsole({ text: `VERSIÓN NUBE restaurada: "${name}" (${new Date(version.createdAt).toLocaleString('es-PE')})`, kind: 'out' })
    } catch {
      s.pushConsole({ text: 'VERSIONES: no se pudo restaurar', kind: 'err' })
    } finally {
      setBusy(null)
    }
  }

  const joinLive = async () => {
    const url = await s.requestPrompt('Enlace o token de la sesión (ej. ?plano=abc123…):', s.collab.token || '')
    if (url === null) return
    const token = url.trim().replace(/^.*\?plano=/, '').replace(/^.*\/api\/share\//, '')
    if (token.length < 6) { s.pushConsole({ text: 'SESIÓN: token no válido', kind: 'err' }); return }
    // permiso real desde el servidor
    try {
      const r = await fetch(`/api/share/${token}`)
      if (r.ok) {
        const d = await r.json()
        s.setCloud({ planId: d.plan.id, planName: d.plan.name, projectName: d.plan.projectName, status: 'saved', revision: 0 })
        if (d.data) {
          const data = JSON.parse(d.data)
          if (Array.isArray(data.elements)) {
            useJarumy.setState({ elements: data.elements, mods: data.mods || {}, undoStack: [], redoStack: [] })
          }
        }
        startCollabSession(token, d.permission === 'edit' ? 'edit' : 'view', 'Invitado')
        setTab('vivo')
      } else {
        s.pushConsole({ text: 'SESIÓN: el enlace no existe o fue revocado', kind: 'err' })
      }
    } catch {
      s.pushConsole({ text: 'SESIÓN: servidor no disponible', kind: 'err' })
    }
  }

  const hostLive = async () => {
    if (!s.cloud.planId) {
      s.pushConsole({ text: 'SESIÓN: guarde primero el plano en la nube', kind: 'err' })
      return
    }
    // crea/consigue un enlace de edición y abre el canal
    setBusy('Abriendo sesión…')
    try {
      const r = await fetch(`/api/plans/${s.cloud.planId}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: 'edit' }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const { share } = await r.json()
      startCollabSession(share.token, 'edit', 'J. Burga')
      setTab('vivo')
      const url = `${window.location.origin}/?plano=${share.token}`
      try { await navigator.clipboard.writeText(url) } catch { /* sin portapapeles */ }
      s.pushConsole({ text: `SESIÓN ANFITRIÓN abierta — comparta este enlace para que editen en vivo: ${url}`, kind: 'out' })
    } catch {
      s.pushConsole({ text: 'SESIÓN: no se pudo abrir el canal', kind: 'err' })
    } finally {
      setBusy(null)
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'planos', label: 'Mis planos', icon: 'CloudUpload' },
    { id: 'versiones', label: 'Versiones', icon: 'History' },
    { id: 'compartir', label: 'Compartir', icon: 'Share2' },
    { id: 'vivo', label: 'Sesión en vivo', icon: 'Radio' },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { s.setDialog(null); stopCollabSession(true) } }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-2xl max-h-[88vh] overflow-y-auto jy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="CloudUpload" className="text-amber-400" size={18} />
            Planos en la nube — multi-dispositivo · versiones · colaboración
            {s.cloud.planId && (
              <span className="ml-auto text-[10px] font-mono jy-muted normal-case truncate max-w-[200px]">
                {s.cloud.planName || 'plano'} · rev {s.cloud.revision}
                {s.cloud.lastSyncAt ? ` · ${new Date(s.cloud.lastSyncAt).toLocaleTimeString('es-PE')}` : ''}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                tab === t.id ? 'bg-amber-500 text-zinc-950' : 'border jy-border jy-muted hover:jy-text hover:border-amber-500/50'}`}
            >
              <ToolIcon name={t.icon} size={13} /> {t.label}
            </button>
          ))}
        </div>

        {busy && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] font-semibold text-amber-300 animate-pulse">{busy}</p>
        )}
        {authError === 'login' && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-300 leading-relaxed">
            <b>Sesión requerida.</b> La nube guarda planos por usuario: abra el <b>Panel Admin</b> (arriba a la derecha),
            inicie sesión y vuelva aquí.
          </div>
        )}
        {authError === 'server' && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[11.5px] text-amber-300 leading-relaxed">
            <b>Nube no disponible.</b> El servidor de planos no responde (base de datos sin configurar en este entorno).
            El resto de la app — auto-guardado local, versiones en navegador y export .json — sigue funcionando con normalidad.
          </div>
        )}

        {tab === 'planos' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button onClick={() => void saveToCloud(false)} disabled={loading}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-[12px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50">
                {s.cloud.planId ? 'Actualizar plano en la nube' : 'Guardar plano actual en la nube'}
              </button>
              {s.cloud.planId && (
                <button onClick={() => void saveToCloud(true)}
                  className="rounded-xl border jy-border px-4 py-2.5 text-[11.5px] font-bold jy-text hover:border-amber-500/50 transition-colors">
                  Guardar como copia
                </button>
              )}
            </div>
            {loading && <p className="text-[11px] jy-muted animate-pulse">Cargando planos…</p>}
            {!loading && plans.length === 0 && authError === null && (
              <p className="text-[11.5px] jy-muted text-center py-6 leading-relaxed">
                Aún no hay planos en la nube. Guarde el plano actual y estará disponible
                desde cualquier dispositivo con su sesión.
              </p>
            )}
            <div className="space-y-1.5 max-h-72 overflow-y-auto jy-scroll">
              {plans.map((p) => (
                <div key={p.id} className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${s.cloud.planId === p.id ? 'border-amber-500/50 bg-amber-500/8' : 'jy-border'}`}>
                  <div className="w-14 h-10 rounded-lg border jy-border bg-zinc-900/60 overflow-hidden flex items-center justify-center shrink-0">
                    {p.thumbnail
                        ? <img src={p.thumbnail} alt={p.name} className="w-full h-full object-cover" />
                      : <ToolIcon name="DraftingCompass" size={16} className="jy-muted" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold jy-text truncate">{p.name}</p>
                    <p className="text-[10px] jy-muted">{p.projectName} · rev {p.revision} · {new Date(p.updatedAt).toLocaleString('es-PE')}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => void openFromCloud(p.id, p.name)} title="Abrir en el editor"
                      className="rounded-lg border jy-border px-2.5 py-1.5 text-[10.5px] font-bold text-amber-300 hover:bg-amber-500/15 transition-colors">
                      Abrir
                    </button>
                    <button onClick={() => void deleteFromCloud(p.id, p.name)} title="Enviar a papelera"
                      className="rounded-lg border jy-border px-2 py-1.5 jy-muted hover:text-rose-400 hover:border-rose-500/50 transition-colors">
                      <ToolIcon name="Trash2" size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'versiones' && (
          <div className="space-y-2">
            {!s.cloud.planId ? (
              <p className="text-[11.5px] jy-muted text-center py-6 leading-relaxed">
                Guarde primero el plano en la nube (pestaña Mis planos) y aquí aparecerá su historial
                de versiones en base de datos — hasta 20 snapshots restaurables.
              </p>
            ) : (
              <>
                <button onClick={() => void saveVersion()}
                  className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-[12px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.98] transition-all">
                  Crear versión del estado actual
                </button>
                <div className="space-y-1.5 max-h-72 overflow-y-auto jy-scroll">
                  {versions.length === 0 && <p className="text-[11px] jy-muted text-center py-4">Sin versiones todavía.</p>}
                  {versions.map((v) => (
                    <div key={v.id} className="rounded-xl border jy-border px-3 py-2 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold jy-text truncate">{v.name}</p>
                        <p className="text-[10px] jy-muted">{new Date(v.createdAt).toLocaleString('es-PE')}</p>
                      </div>
                      <button onClick={() => void restoreVersion(v.id, v.name)}
                        className="rounded-lg border jy-border px-2.5 py-1.5 text-[10.5px] font-bold text-amber-300 hover:bg-amber-500/15 transition-colors shrink-0">
                        Restaurar
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'compartir' && (
          <div className="space-y-2">
            {!s.cloud.planId ? (
              <p className="text-[11.5px] jy-muted text-center py-6 leading-relaxed">
                Guarde el plano en la nube para generar enlaces con permiso de <b>vista</b> o <b>edición</b>.
                El receptor abre el enlace en su navegador — sin instalar nada.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => void createShare('view')}
                    className="rounded-xl border jy-border px-4 py-2.5 text-[11.5px] font-bold jy-text hover:border-amber-500/50 transition-colors">
                    Enlace de solo lectura
                  </button>
                  <button onClick={() => void createShare('edit')}
                    className="rounded-xl bg-amber-500 px-4 py-2.5 text-[11.5px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.98] transition-all">
                    Enlace de edición
                  </button>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto jy-scroll">
                  {shares.length === 0 && <p className="text-[11px] jy-muted text-center py-4">Sin enlaces activos.</p>}
                  {shares.map((sh) => (
                    <div key={sh.id} className="rounded-xl border jy-border px-3 py-2 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] font-bold jy-text">
                          {sh.permission === 'edit' ? 'Edición' : 'Solo lectura'} · {sh.token.slice(0, 12)}…
                        </p>
                        <p className="text-[9.5px] jy-muted truncate">
                          {window.location.origin}/?plano={sh.token}
                          {sh.lastAccessAt ? ` · visto ${new Date(sh.lastAccessAt).toLocaleDateString('es-PE')}` : ' · sin visitas'}
                        </p>
                      </div>
                      <button onClick={() => {
                        const url = `${window.location.origin}/?plano=${sh.token}`
                        void navigator.clipboard.writeText(url).then(() => s.pushConsole({ text: 'ENLACE copiado al portapapeles', kind: 'out' }))
                      }} title="Copiar enlace"
                        className="rounded-lg border jy-border px-2 py-1.5 jy-muted hover:text-amber-300 transition-colors shrink-0">
                        <ToolIcon name="Copy" size={13} />
                      </button>
                      <button onClick={() => void revokeShare(sh.id)} title="Revocar"
                        className="rounded-lg border jy-border px-2 py-1.5 jy-muted hover:text-rose-400 hover:border-rose-500/50 transition-colors shrink-0">
                        <ToolIcon name="Ban" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'vivo' && (
          <div className="space-y-2">
            {!s.collab.active ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button onClick={() => void hostLive()}
                  className="rounded-xl bg-amber-500 px-4 py-3 text-[12px] font-black text-zinc-950 hover:brightness-110 active:scale-[0.98] transition-all">
                  Ser anfitrión (plano actual)
                </button>
                <button onClick={() => void joinLive()}
                  className="rounded-xl border jy-border px-4 py-3 text-[12px] font-bold jy-text hover:border-amber-500/50 transition-colors">
                  Unirme con enlace de invitado
                </button>
                <p className="col-span-full text-[10.5px] jy-muted leading-relaxed">
                  Sesión multiusuario en vivo: los cambios del plano se sincronizan entre todos los
                  participantes (~0.7 s) con indicación de quién editó, lista de presentes y chat de sesión.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10.5px] font-bold ${collabConnected() ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/50 bg-amber-500/10 text-amber-300'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${collabConnected() ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                    {collabConnected() ? 'canal en vivo' : 'conectando…'} · {s.collab.permission === 'edit' ? 'edición' : 'vista'}
                  </span>
                  {s.collab.peers.length > 0 && (
                    <span className="text-[10.5px] jy-muted">presentes: {s.collab.peers.join(', ')}</span>
                  )}
                  <button onClick={() => stopCollabSession()}
                    className="ml-auto rounded-lg border border-rose-500/50 px-3 py-1 text-[10.5px] font-bold text-rose-400 hover:bg-rose-500/10 transition-colors">
                    Salir de la sesión
                  </button>
                </div>
                <div className="rounded-xl border jy-border h-56 overflow-y-auto jy-scroll px-3 py-2 space-y-1 bg-zinc-950/30">
                  {s.collab.messages.length === 0 && <p className="text-[10.5px] jy-muted text-center pt-6">Sin mensajes — salude a su equipo.</p>}
                  {s.collab.messages.map((m, i) => (
                    <p key={i} className="text-[11.5px] leading-snug">
                      <b className={m.user === s.collab.user ? 'text-amber-300' : 'text-sky-300'}>{m.user}:</b> <span className="jy-text">{m.text}</span>
                      <span className="text-[8.5px] jy-muted ml-1.5">{new Date(m.at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
                    </p>
                  ))}
                </div>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); sendCollabChat(chatText); setChatText('') }}>
                  <input
                    value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="mensaje al equipo…"
                    className="flex-1 rounded-lg border jy-border jy-bg px-3 py-2 text-[12px] jy-text outline-none focus:border-amber-500/60"
                  />
                  <button type="submit" className="rounded-lg bg-amber-500 px-4 py-2 text-[11.5px] font-black text-zinc-950 hover:brightness-110 transition-all">
                    Enviar
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
