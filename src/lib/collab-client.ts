// ============================================================
// JARUMY APP — Cliente de colaboración en vivo (socket.io).
// Se conecta al mini-servicio :3003 a través del gateway
// (/ ? XTransformPort=3003), sincroniza el plano con debounce
// y mantiene presencia + chat de sesión.
// ============================================================

'use client'

import { io, type Socket } from 'socket.io-client'
import { useJarumy } from './store'

let socket: Socket | null = null
let emitTimer: ReturnType<typeof setTimeout> | null = null

export function collabConnected(): boolean {
  return !!socket && socket.connected
}

/** Inicia la sesión colaborativa sobre un plan compartido. */
export function startCollabSession(token: string, permission: 'view' | 'edit', user: string) {
  stopCollabSession()
  try {
    socket = io('/?XTransformPort=3003', { transports: ['websocket', 'polling'], reconnectionAttempts: 5 })
  } catch {
    useJarumy.getState().pushConsole({ text: 'COLABORACIÓN: no se pudo abrir el canal en vivo (servicio no disponible)', kind: 'err' })
    return
  }
  const st = useJarumy.getState()
  st.setCollab({ active: true, token, permission, user, peers: [], messages: [] })
  st.pushConsole({ text: `SESIÓN COLABORATIVA iniciada — canal ${token.slice(0, 8)}… · permiso ${permission === 'edit' ? 'EDICIÓN' : 'VISTA'} · usuario ${user}`, kind: 'out' })

  socket.on('connect', () => {
    socket?.emit('join', { planId: token, user })
  })
  socket.on('presence', (p: { planId: string; users: string[] }) => {
    useJarumy.getState().setCollab({ peers: (p.users || []).filter((u) => u !== user) })
  })
  socket.on('remote:update', (d: { planId: string; user: string; revision?: number; elements: unknown; mods: unknown; gridSpacing?: number }) => {
    if (d.planId !== token) return
    useJarumy.getState().applyRemotePlan({
      elements: d.elements as never,
      mods: d.mods as never,
      gridSpacing: d.gridSpacing,
    })
    useJarumy.getState().pushConsole({ text: `COLAB: ${d.user} actualizó el plano (rev ${d.revision ?? '—'})`, kind: 'out' })
  })
  socket.on('remote:chat', (d: { user: string; text: string }) => {
    const st = useJarumy.getState()
    st.setCollab({ messages: [...st.collab.messages.slice(-40), { user: d.user, text: d.text, at: Date.now() }] })
  })
  socket.on('disconnect', () => {
    useJarumy.getState().pushConsole({ text: 'COLABORACIÓN: canal interrumpido — reintentando…', kind: 'err' })
  })

  // sincroniza cambios locales (debounced) solo con permiso de edición
  useJarumy.subscribe((st, prev) => {
    if (!socket || !st.collab.active || st.collab.permission !== 'edit' || st.applyingRemote) return
    if (st.elements === prev.elements && st.mods === prev.mods) return
    if (emitTimer) clearTimeout(emitTimer)
    emitTimer = setTimeout(() => {
      const now = useJarumy.getState()
      if (!socket || !now.collab.active || now.applyingRemote) return
      socket.emit('plan:update', {
        planId: token,
        revision: now.cloud.revision + 1,
        elements: now.elements,
        mods: now.mods,
        layers: now.layers,
        gridSpacing: now.gridSpacing,
        user,
      })
    }, 700)
  })
}

/** Envía un mensaje de chat a la sesión activa. */
export function sendCollabChat(text: string) {
  const st = useJarumy.getState()
  if (!socket || !st.collab.active || !text.trim()) return
  socket.emit('chat', { planId: st.collab.token, user: st.collab.user, text: text.trim().slice(0, 500) })
  st.setCollab({ messages: [...st.collab.messages.slice(-40), { user: st.collab.user, text: text.trim(), at: Date.now() }] })
}

/** Cierra la sesión colaborativa. */
export function stopCollabSession(silent = false) {
  if (emitTimer) { clearTimeout(emitTimer); emitTimer = null }
  if (socket) {
    try { socket.disconnect() } catch { /* ya muerto */ }
    socket = null
  }
  const st = useJarumy.getState()
  if (st.collab.active) {
    st.setCollab({ active: false, token: null, peers: [], messages: [] })
    if (!silent) st.pushConsole({ text: 'SESIÓN COLABORATIVA cerrada', kind: 'out' })
  }
}
