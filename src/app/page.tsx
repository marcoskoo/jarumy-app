'use client'

import { useState, useEffect, useCallback } from 'react'
import { useJarumy } from '@/lib/store'
import { TOTAL_TOOLS } from '@/lib/tools-data'
import type { DesignSettings } from '@/lib/settings'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import PlanCanvas from '@/components/jarumy/PlanCanvas'
import RibbonToolbar from '@/components/jarumy/RibbonToolbar'
import { LayersPanel, PropertiesPanel } from '@/components/jarumy/SidePanels'
import { CommandConsole, StatusBar } from '@/components/jarumy/ConsoleBar'
import { ScheduleDialog, CatalogDialog, EnergyDialog, ClashDialog } from '@/components/jarumy/Dialogs'
import AdminPanel, { PRIMARY_PRESETS } from '@/components/jarumy/AdminPanel'
import { ToolIcon } from '@/components/jarumy/ToolIcon'

export default function JarumyApp() {
  const s = useJarumy()
  const [brand, setBrand] = useState('Jarumy app')
  const [logoInitial, setLogoInitial] = useState('J')

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
      text: 'Sistema listo · haga clic sobre el plano para el menú radial de herramientas',
      kind: 'out',
    })
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden jy-bg jy-text flex flex-col jy-print-area" style={{ display: 'flex' }}>
      <Toaster position="top-center" richColors />

      {/* ---------- encabezado ---------- */}
      <header className="flex items-center gap-3 px-4 py-2 border-b jy-border shrink-0"
        style={{ background: 'linear-gradient(90deg, rgba(245,158,11,0.10), transparent 55%)' }}>
        <div className="flex items-center gap-2.5 min-w-0">
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
            className="flex items-center gap-1.5 rounded-lg jy-bg-primary px-4 py-2 text-[12px] font-bold text-zinc-950 hover:brightness-110 active:scale-95 transition-all shadow-lg"
            title="Panel de administración — usuario: J. Burga"
          >
            <ToolIcon name="ShieldCheck" size={14} />
            Panel Admin
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

      {/* ---------- diálogos ---------- */}
      <ScheduleDialog />
      <CatalogDialog />
      <EnergyDialog />
      <ClashDialog />

      {/* ---------- panel de administración ---------- */}
      <AdminPanel onDesignChange={applyDesign} />
    </div>
  )
}
