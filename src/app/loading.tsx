// Pantalla de carga del lienzo CAD (SVG esqueleto tipo plano)

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6" aria-busy="true" aria-label="Cargando el lienzo de dibujo">
      <svg width="120" height="80" viewBox="0 0 120 80" fill="none" aria-hidden>
        <rect x="8" y="8" width="104" height="64" rx="3" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <line x1="8" y1="34" x2="112" y2="34" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
        <line x1="52" y1="8" x2="52" y2="72" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
        <rect x="14" y="40" width="32" height="26" rx="2" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" className="animate-pulse" />
        <circle cx="86" cy="22" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" className="animate-pulse" />
      </svg>
      <p className="text-sm text-muted-foreground">Cargando el plano…</p>
    </main>
  )
}
