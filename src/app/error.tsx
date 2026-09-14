'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Boundary de render por error de la página. Muestra un mensaje accionable
// (reintentar / volver al inicio) en lugar de una pantalla blanca.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[jarumy] error de render:', error)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl" aria-hidden>
        🏗️
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">El plano no se pudo renderizar</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Ocurrió un error inesperado en el lienzo. Sus datos están a salvo: el auto-guardado
          local conserva la última versión y puede recuperarla al volver a entrar.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground/70">código: {error.digest}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Reintentar</Button>
        <Button variant="outline" onClick={() => { window.location.href = '/' }}>
          Volver al inicio
        </Button>
      </div>
    </main>
  )
}
