'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useJarumy } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToolIcon } from './ToolIcon'
import { buildFpScene, moveFpCam, type FpCam } from '@/lib/fp3d'

/**
 * Walkthrough en 1ª persona: cámara a 1.60 m con proyección perspectiva
 * real, WASD para caminar (con colisión contra muros), Q/E o ←/→ para
 * girar. Bucle de render a ~60 fps con painter's algorithm.
 * El contenido vive en un componente interno que se REMONTA al abrir,
 * de modo que la cámara parte del centro del primer ambiente.
 */
export function Walkthrough3DDialog() {
  const open = useJarumy((s) => s.dialog === 'walkthrough')
  const setDialog = useJarumy((s) => s.setDialog)
  if (!open) return null
  return <WalkthroughInner onClose={() => setDialog(null)} />
}

/** cámara inicial: centro del primer ambiente del plano */
function computeInitialCam(): FpCam {
  const st = useJarumy.getState()
  const rooms = st.elements.filter((e) => e.type === 'espacio' && !st.mods[e.id]?.deleted)
  if (rooms.length) {
    const g = rooms[0].geo as { x: number; y: number; w: number; h: number }
    return { x: (g.x + g.w / 2) / 60, y: (g.y + g.h / 2) / 60, heading: 0 }
  }
  return { x: 4, y: 5.5, heading: -Math.PI / 2 }
}

function WalkthroughInner({ onClose }: { onClose: () => void }) {
  const s = useJarumy()
  const keysRef = useRef<Record<string, boolean>>({})

  // posición inicial: centro del primer ambiente (inicializador perezoso — UNA vez al montar)
  const [cam, setCam] = useState<FpCam>(computeInitialCam)
  const [initialCam] = useState<FpCam>(computeInitialCam)
  const camRef = useRef(cam)
  useEffect(() => { camRef.current = cam }, [cam])

  // bucle de movimiento + render
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(0.06, (t - last) / 1000)
      last = t
      const k = keysRef.current
      const st = useJarumy.getState()
      const camNow = camRef.current
      let { heading } = camNow
      let moved = false
      const speed = (k['shift'] ? 3.4 : 1.7) * dt
      const turn = 2.1 * dt
      if (k['q'] || k['arrowleft']) { heading -= turn; moved = true }
      if (k['e'] || k['arrowright']) { heading += turn; moved = true }
      let dx = 0, dy = 0
      const fx = Math.cos(heading), fy = Math.sin(heading)
      if (k['w'] || k['arrowup']) { dx += fx * speed; dy += fy * speed; moved = true }
      if (k['s'] || k['arrowdown']) { dx -= fx * speed; dy -= fy * speed; moved = true }
      if (k['d']) { dx += fy * speed; dy -= fx * speed; moved = true }
      if (k['a']) { dx -= fy * speed; dy += fx * speed; moved = true }
      if (moved) {
        setCam((c) => moveFpCam({ ...c, heading }, dx, dy, st.elements, st.mods))
      } else if (heading !== camNow.heading) {
        setCam((c) => ({ ...c, heading }))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true
      if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const W = 720, H = 430
  const scene = useMemo(
    () => buildFpScene(s.elements, s.mods, cam, W, H),
    [s.elements, s.mods, cam],
  )

  // botones de movimiento táctil (móvil)
  const hold = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); keysRef.current[key] = true },
    onPointerUp: () => { keysRef.current[key] = false },
    onPointerLeave: () => { keysRef.current[key] = false },
    onPointerCancel: () => { keysRef.current[key] = false },
  })

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="jy-bg2 jy-text border jy-border max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ToolIcon name="Footprints" className="text-amber-400" size={18} />
            Walkthrough 1ª persona — WASD para caminar · Q/E girar
            <span className="ml-auto text-[10px] font-mono jy-muted normal-case">
              X {cam.x.toFixed(1)} · Y {cam.y.toFixed(1)} m · rumbo {((cam.heading * 180 / Math.PI + 360) % 360).toFixed(0)}°
            </span>
          </DialogTitle>
        </DialogHeader>

        <div
          className="relative rounded-xl border jy-border overflow-hidden"
          style={{ background: 'linear-gradient(180deg, #14161c 0%, #101014 100%)' }}
          tabIndex={0}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ aspectRatio: `${W}/${H}` }}>
            {scene.faces.map((f, i) => (
              <polygon
                key={i}
                points={f.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}
                fill={f.fill}
                stroke="rgba(10,12,16,0.35)"
                strokeWidth="0.6"
              />
            ))}
            {/* retícula de mira sutil */}
            <circle cx={W / 2} cy={H / 2} r="3" fill="rgba(245,158,11,0.6)" />
            <text x="12" y={H - 12} fontSize="10" fill="#a1a1aa">
              {scene.inside ? `DENTRO DE: ${scene.roomName}` : 'EXTERIOR'} · ojo a 1.60 m · FOV 70° · {scene.faces.length} caras
            </text>
          </svg>

          {/* joystick táctil (móvil / tablet) */}
          <div className="absolute bottom-2 right-2 grid grid-cols-3 gap-1 md:hidden">
            <span />
            <button {...hold('w')} className="w-10 h-10 rounded-lg bg-zinc-900/85 border jy-border jy-text text-[15px] font-black active:bg-amber-500 active:text-zinc-950 touch-none">▲</button>
            <span />
            <button {...hold('a')} className="w-10 h-10 rounded-lg bg-zinc-900/85 border jy-border jy-text text-[15px] font-black active:bg-amber-500 active:text-zinc-950 touch-none">◀</button>
            <button {...hold('s')} className="w-10 h-10 rounded-lg bg-zinc-900/85 border jy-border jy-text text-[15px] font-black active:bg-amber-500 active:text-zinc-950 touch-none">▼</button>
            <button {...hold('d')} className="w-10 h-10 rounded-lg bg-zinc-900/85 border jy-border jy-text text-[15px] font-black active:bg-amber-500 active:text-zinc-950 touch-none">▶</button>
          </div>
          <div className="absolute bottom-2 left-2 flex gap-1 md:hidden">
            <button {...hold('q')} className="w-10 h-10 rounded-lg bg-zinc-900/85 border jy-border jy-text text-[12px] font-black active:bg-amber-500 active:text-zinc-950 touch-none">↺</button>
            <button {...hold('e')} className="w-10 h-10 rounded-lg bg-zinc-900/85 border jy-border jy-text text-[12px] font-black active:bg-amber-500 active:text-zinc-950 touch-none">↻</button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10.5px] jy-muted leading-snug flex-1 min-w-[220px]">
            Perspectiva real proyectada desde el modelo (muros, vanos, columnas y escaleras). El cuerpo no atraviesa
            muros (colisión con radio de 0.25 m). Shift = correr.
          </span>
          <button
            onClick={() => setCam({ x: initialCam.x, y: initialCam.y, heading: initialCam.heading })}
            className="rounded-xl border jy-border px-3 py-1.5 text-[11px] font-bold jy-text hover:border-amber-500/50 transition-colors"
          >
            Reiniciar posición
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
