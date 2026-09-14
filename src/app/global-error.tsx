'use client'

// Boundary global (errores fuera del árbol de layout). Debe renderizar
// sus propios <html>/<body>.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: '#18181b', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }} aria-hidden>🏗️</div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Jarumy dejó de responder</h1>
          <p style={{ maxWidth: 420, fontSize: 14, color: '#a1a1aa', margin: 0 }}>
            Error crítico de la aplicación. El auto-guardado local conserva su último plano.
            Intente de nuevo; si persista, recargue con Ctrl+F5.
          </p>
          {error.digest && <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#71717a' }}>código: {error.digest}</p>}
          <button
            onClick={reset}
            style={{ background: '#f59e0b', color: '#18181b', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  )
}
