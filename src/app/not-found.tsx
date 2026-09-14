import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl" aria-hidden>
        📐
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Página no encontrada</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Esta lámina no existe en el proyecto. El lienzo CAD vive en la página principal.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Abrir el lienzo</Link>
      </Button>
    </main>
  )
}
