'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ToolIcon } from './ToolIcon'

// ============================================================
// "Autenticador Jarumy" — código TOTP en vivo dentro de la app.
//
// Muestra el MISMO código de 6 dígitos que genera Google
// Authenticator / Authy / 1Password para la cuenta del usuario
// (idéntico algoritmo RFC 6238 · SHA-1 · 30 s · 6 dígitos), con
// anillo de cuenta regresiva de la ventana actual. Se usa:
//   · durante el setup, para comparar con Google Authenticator y
//     confirmar que el QR se escaneó correctamente (match);
//   · con el 2FA activo, como comodidad para iniciar sesión.
// ============================================================

const PERIOD = 30
const R = 26
const CIRC = 2 * Math.PI * R

interface TotpLiveProps {
  /** título del bloque (p. ej. "Comparación con Google Authenticator") */
  title?: string
  /** contexto compacto (setup) o completo (2FA activo) */
  variant?: 'full' | 'compact'
}

export function TotpLive({ title, variant = 'full' }: TotpLiveProps) {
  const [code, setCode] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(PERIOD)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [copied, setCopied] = useState(false)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/totp/live', { cache: 'no-store' })
      if (!alive.current) return
      if (r.status === 400) {
        setStatus('error')
        return
      }
      if (!r.ok) {
        // 429 u otro error transitorio: reintenta en la próxima ventana
        setRemaining(PERIOD)
        return
      }
      const d = (await r.json()) as { code?: string; secondsRemaining?: number }
      if (!alive.current) return
      setCode(String(d.code ?? '').replace(/\D/g, '').slice(0, 6) || null)
      setRemaining(Math.max(1, Math.min(PERIOD, Number(d.secondsRemaining ?? PERIOD))))
      setStatus('ok')
    } catch {
      if (alive.current) setRemaining(PERIOD) // reintenta tras la ventana
    }
  }, [])

  useEffect(() => {
    alive.current = true
    // diferido fuera del cuerpo síncrono del efecto (lint react-hooks)
    const t = setTimeout(() => { void refresh() }, 0)
    return () => {
      alive.current = false
      clearTimeout(t)
    }
  }, [refresh])

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          void refresh()
          return PERIOD
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [refresh])

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Código copiado')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const display = code ? `${code.slice(0, 3)} ${code.slice(3)}` : '······'
  const progress = remaining / PERIOD
  const urgent = remaining <= 5

  if (status === 'error') {
    return (
      <p className="text-[10.5px] jy-muted">
        Autenticador Jarumy no disponible (2FA sin configurar).
      </p>
    )
  }

  return (
    <div
      className="rounded-xl border jy-border jy-bg2 p-3.5 select-none"
      role="group"
      aria-label="Autenticador Jarumy — código TOTP en vivo"
    >
      {title && (
        <p className="text-[11px] font-semibold jy-text mb-2.5 flex items-center gap-1.5">
          <ToolIcon name="Smartphone" size={13} /> {title}
        </p>
      )}
      <div className="flex items-center gap-4">
        {/* ---- anillo de cuenta regresiva (ventana de 30 s) ---- */}
        <svg
          width="62"
          height="62"
          viewBox="0 0 62 62"
          className="shrink-0"
          aria-hidden="true"
        >
          <circle cx="31" cy="31" r={R} fill="none" stroke="currentColor" strokeWidth="4.5" className="text-white/10" />
          <circle
            cx="31"
            cy="31"
            r={R}
            fill="none"
            stroke={urgent ? '#f43f5e' : '#f59e0b'}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            transform="rotate(-90 31 31)"
            style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
          />
          <text
            x="31"
            y="36"
            textAnchor="middle"
            fontSize="17"
            fontWeight="700"
            fill="currentColor"
            className="jy-text"
          >
            {remaining}
          </text>
        </svg>

        {/* ---- código de 6 dígitos ---- */}
        <div className="flex-1 min-w-0">
          <p
            className="font-mono font-bold tracking-[0.22em] text-[26px] leading-none jy-text"
            aria-live="polite"
            style={{ opacity: code ? 1 : 0.35 }}
          >
            {display}
          </p>
          <p className="text-[9.5px] jy-muted mt-1.5">
            {status === 'loading' && !code
              ? 'Consultando código…'
              : `Vence en ${remaining} s · coincide con Google Authenticator`}
          </p>
        </div>

        {/* ---- copiar ---- */}
        {variant === 'full' && (
          <button
            type="button"
            onClick={copy}
            disabled={!code}
            className="shrink-0 rounded-lg border jy-border px-2.5 py-1.5 text-[10px] font-semibold jy-muted hover:jy-text hover:bg-white/5 transition-colors disabled:opacity-40"
            aria-label="Copiar código TOTP"
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        )}
      </div>
      {variant === 'full' && (
        <p className="text-[9.5px] jy-muted leading-relaxed mt-2.5 pt-2.5 border-t jy-border">
          Mismo algoritmo que su app autenticadora (RFC 6238 · SHA-1 · 30 s): ambos códigos deben
          coincidir. Si difieren, revise el reloj del dispositivo.
        </p>
      )}
    </div>
  )
}
