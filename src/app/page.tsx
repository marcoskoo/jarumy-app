'use client'

import { useState, useEffect, useCallback } from 'react'
import { useJarumy } from '@/lib/store'
import { TOTAL_TOOLS } from '@/lib/tools-data'
import { BLOCK_LIBRARY } from '@/lib/plan-data'
import type { DesignSettings } from '@/lib/settings'
import { Toaster } from '@/components/ui/sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import PlanCanvas from '@/components/jarumy/PlanCanvas'
import RibbonToolbar from '@/components/jarumy/RibbonToolbar'
import { LayersPanel, PropertiesPanel } from '@/components/jarumy/SidePanels'
import { CommandConsole, StatusBar } from '@/components/jarumy/ConsoleBar'
import { ScheduleDialog, CatalogDialog, EnergyDialog, ClashDialog } from '@/components/jarumy/Dialogs'
import { BlockLibraryDialog } from '@/components/jarumy/BlockLibrary'
import { ExportPdfDialog } from '@/components/jarumy/ExportPdfDialog'
import AdminPanel, { PRIMARY_PRESETS } from '@/components/jarumy/AdminPanel'
import { ToolIcon } from '@/components/jarumy/ToolIcon'

type MobileSheet = 'menu' | 'layers' | 'props' | null

export default function JarumyApp() {
  const s = useJarumy()
  const [brand, setBrand] = useState('Jarumy app')
  const [logoInitial, setLogoInitial] = useState('J')
  const [sheet, setSheet] = useState<MobileSheet>(null)

  const applyDesign = useCallback((d: DesignSettings) => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.style.setProperty('--jy-primary', PRIMARY_PRESETS[d.primaryColor] || '#f59e0b')
    root.style.setProperty('--jy-accent', PRIMARY_PRESETS[d.accentColor] || '#f97316')
    root.style.setProperty('--radius', `${d.radius}px`)
    root.classList.toggle('jy-theme-light', d.theme === 'light')
    setBrand(d.brand)
    setLogoInitial(d.logoInitial)
  }, [])

  useEffect(() => {
    // diseño guardado en la base de datos
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => { if (data?.design) applyDesign(data.design) })
      .catch(() => { /* valores por defecto */ })
  }, [applyDesign])

  // módulos ocultos desde el panel admin (lectura diferida)
  const [hiddenCats, setHiddenCats] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(localStorage.getItem('jarumy_hidden_cats') || '[]')
    } catch {
      return []
    }
  })

  // aviso cuando cambia la sesión (ej. al cerrar desde admin)
  useEffect(() => {
    useJarumy.getState().pushConsole({
      text: 'Sistema listo · toque o haga clic sobre el plano para el menú radial de herramientas',
      kind: 'out',
    })
  }, [])

  // ---------- acciones del menú móvil ----------
  const menuActions = [
    { icon: 'FileDown', label: 'PDF a escala', detail: 'Exportación vectorial 1:25 – 1:250 con cartela', fn: () => s.setDialog('pdf'), highlight: true },
    { icon: 'Blocks', label: `Bloques (${BLOCK_LIBRARY.length})`, detail: 'Biblioteca con vista previa y buscador', fn: () => s.setDialog('blocks') },
    { icon: 'Sun', label: 'Heliodón', detail: 'Sol, sombras y trayectorias reales', fn: () => s.runGlobal('toggleSun') },
    { icon: 'Library', label: `Catálogo (${TOTAL_TOOLS})`, detail: 'Herramientas recopiladas de 10 apps', fn: () => s.setDialog('catalog') },
    { icon: 'ClipboardList', label: 'Cuadro BIM', detail: 'Espacios, áreas y acabados', fn: () => s.setDialog('schedule') },
  ]
  const panelActions: { icon: string; label: string; next: MobileSheet }[] = [
    { icon: 'Layers', label: 'Capas y biblioteca', next: 'layers' },
    { icon: 'PanelRight', label: 'Propiedades del objeto', next: 'props' },
  ]

  return (
    <div className="h-dvh w-screen overflow-hidden jy-bg jy-text flex flex-col jy-print-area overscroll-none" style={{ display: 'flex' }}>
      <Toaster position="top-center" richColors />

      {/* ---------- encabezado ---------- */}
      <header className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 py-2 border-b jy-border shrink-0"
        style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.10), transparent 55%)' }}>
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl jy-bg-primary text-zinc-950 font-black text-lg shrink-0 shadow-lg">
            {logoInitial}
          </span>
          <div className="min-w-0 hidden sm:block">
            <h1 className="text-[15px] font-black leading-tight truncate" style={{ color: 'var(--jy-primary)' }}>
              {brand}
            </h1>
            <p className="text-[9.5px] jy-muted tracking-wider uppercase">Suite arquitectónica CAD · BIM · Render</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* --- móvil: acceso rápido a bloques --- */}
          <button
            onClick={() => s.setDialog('blocks')}
            className="md:hidden flex items-center justify-center rounded-lg border jy-border w-9 h-9 jy-text hover:border-amber-500/60 hover:text-amber-300 active:scale-95 transition-all"
            title={`Biblioteca de bloques (${BLOCK_LIBRARY.length})`}
            aria-label="Biblioteca de bloques"
          >
            <ToolIcon name="Blocks" size={15} />
          </button>
          <button
            onClick={() => s.setDialog('pdf')}
            className="hidden md:flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 transition-colors"
            title="Exportar PDF a escala real (1:50 · 1:75 · 1:100) con cartela"
          >
            <ToolIcon name="FileDown" size={13} />
            PDF a escala
          </button>
          <button
            onClick={() => s.setDialog('blocks')}
            className="hidden md:flex items-center gap-1.5 rounded-lg border jy-border px-3 py-1.5 text-[11px] font-semibold jy-text hover:border-amber-500/60 hover:text-amber-300 transition-colors"
            title="Biblioteca de bloques con vista previa"
          >
            <ToolIcon name="Blocks" size={13} />
            Bloques
          </button>
          <button
            onClick={() => s.runGlobal('toggleSun')}
            className="hidden md:flex items-center gap-1.5 rounded-lg border jy-border px-3 py-1.5 text-[11px] font-semibold jy-text hover:border-amber-500/60 hover:text-amber-300 transition-colors"
            title="Heliodón: sol, sombras y trayectorias"
          >
            <ToolIcon name="Sun" size={13} />
            Heliodón
          </button>
          <button
            onClick={() => s.setDialog('catalog')}
            className="hidden md:flex items-center gap-1.5 rounded-lg border jy-border px-3 py-1.5 text-[11px] font-semibold jy-text hover:border-amber-500/60 hover:text-amber-300 transition-colors"
            title="Catálogo completo de herramientas recopiladas"
          >
            <ToolIcon name="Library" size={13} />
            Catálogo ({TOTAL_TOOLS})
          </button>
          <button
            onClick={() => { s.setDialog('schedule'); }}
            className="hidden md:flex items-center gap-1.5 rounded-lg border jy-border px-3 py-1.5 text-[11px] font-semibold jy-text hover:border-amber-500/60 hover:text-amber-300 transition-colors"
            title="Cuadro de espacios BIM"
          >
            <ToolIcon name="ClipboardList" size={13} />
            Cuadro BIM
          </button>
          <button
            onClick={() => s.setAdminOpen(true)}
            className="flex items-center gap-1.5 rounded-lg jy-bg-primary px-2.5 sm:px-4 py-2 text-[12px] font-bold text-zinc-950 hover:brightness-110 active:scale-95 transition-all shadow-lg"
            title="Panel de administración — usuario: J. Burga"
          >
            <ToolIcon name="ShieldCheck" size={14} />
            <span className="hidden sm:inline">Panel Admin</span>
          </button>
          {/* --- móvil: menú hamburguesa con todas las acciones --- */}
          <button
            onClick={() => setSheet('menu')}
            className="md:hidden flex items-center justify-center rounded-lg border jy-border jy-bg2 w-9 h-9 jy-text hover:border-amber-500/60 hover:text-amber-300 active:scale-95 transition-all"
            title="Menú de la aplicación"
            aria-label="Abrir menú"
          >
            <ToolIcon name="Menu" size={16} />
          </button>
        </div>
      </header>

      {/* ---------- cinta de herramientas ---------- */}
      <RibbonToolbar hiddenCats={hiddenCats} />

      {/* ---------- área principal ---------- */}
      <div className="flex flex-1 min-h-0">
        <div className="hidden lg:flex">
          <LayersPanel />
        </div>

        <PlanCanvas />

        <div className="hidden xl:flex">
          <PropertiesPanel />
        </div>
      </div>

      {/* ---------- consola + barra de estado ---------- */}
      <CommandConsole />
      <StatusBar />

      {/* ---------- menú móvil (todas las acciones del encabezado) ---------- */}
      <Sheet open={sheet === 'menu'} onOpenChange={(v) => !v && setSheet(null)}>
        <SheetContent side="right" className="jy-bg2 jy-text border jy-border w-[85vw] sm:max-w-sm p-0">
          <SheetHeader className="border-b jy-border pb-3">
            <SheetTitle className="flex items-center gap-2 text-[15px] jy-text">
              <span className="flex items-center justify-center w-8 h-8 rounded-xl jy-bg-primary text-zinc-950 font-black text-base">
                {logoInitial}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-black" style={{ color: 'var(--jy-primary)' }}>{brand}</span>
                <span className="block text-[10px] jy-muted font-medium tracking-wider uppercase">Menú de la aplicación</span>
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto jy-scroll px-3 py-3 space-y-1.5">
            {menuActions.map((a) => (
              <button
                key={a.label}
                onClick={() => { a.fn(); setSheet(null) }}
                className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all active:scale-[0.98] ${
                  a.highlight
                    ? 'border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/15'
                    : 'border-white/8 jy-bg2/60 hover:border-amber-500/40 hover:bg-amber-500/8'
                }`}
              >
                <span className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${
                  a.highlight ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800/80 text-amber-400'
                }`}>
                  <ToolIcon name={a.icon} size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold jy-text leading-tight">{a.label}</span>
                  <span className="block text-[10.5px] jy-muted leading-snug">{a.detail}</span>
                </span>
              </button>
            ))}

            <p className="pt-3 pb-1 px-1 text-[10px] font-bold jy-muted uppercase tracking-wider">Paneles de trabajo</p>
            {panelActions.map((a) => (
              <button
                key={a.label}
                onClick={() => setSheet(a.next)}
                className="w-full flex items-center gap-3 rounded-xl border border-white/8 px-3 py-3 text-left jy-text transition-all hover:border-amber-500/40 hover:bg-amber-500/8 active:scale-[0.98]"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-800/80 text-amber-400 shrink-0">
                  <ToolIcon name={a.icon} size={18} />
                </span>
                <span className="text-[13px] font-bold leading-tight">{a.label}</span>
              </button>
            ))}

            <p className="px-1 pt-4 text-[9.5px] jy-muted leading-relaxed">
              Toque sobre el plano: menú radial · arrastre con 1 dedo: paneo · 2 dedos: zoom.
              {BLOCK_LIBRARY.length} bloques disponibles en la biblioteca.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* ---------- paneles laterales en móvil / tablet ---------- */}
      <Sheet open={sheet === 'layers'} onOpenChange={(v) => !v && setSheet(null)}>
        <SheetContent side="left" className="jy-bg2 jy-text border jy-border w-[86vw] sm:max-w-xs p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Capas y biblioteca</SheetTitle>
          </SheetHeader>
          <LayersPanel embedded />
        </SheetContent>
      </Sheet>
      <Sheet open={sheet === 'props'} onOpenChange={(v) => !v && setSheet(null)}>
        <SheetContent side="right" className="jy-bg2 jy-text border jy-border w-[86vw] sm:max-w-xs p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Propiedades</SheetTitle>
          </SheetHeader>
          <PropertiesPanel embedded />
        </SheetContent>
      </Sheet>

      {/* ---------- diálogos ---------- */}
      <ScheduleDialog />
      <CatalogDialog />
      <EnergyDialog />
      <ClashDialog />
      <BlockLibraryDialog />
      <ExportPdfDialog />

      {/* ---------- panel de administración ---------- */}
      <AdminPanel onDesignChange={applyDesign} />
    </div>
  )
}
