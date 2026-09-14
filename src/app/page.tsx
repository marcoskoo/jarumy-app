'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useJarumy } from '@/lib/store'
import { TOTAL_TOOLS } from '@/lib/tools-data'
import { BLOCK_LIBRARY } from '@/lib/plan-data'
import type { DesignSettings } from '@/lib/settings'
import { Toaster } from '@/components/ui/sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import PlanCanvas from '@/components/jarumy/PlanCanvas'
import LevelSelector from '@/components/jarumy/LevelSelector'
import RibbonToolbar from '@/components/jarumy/RibbonToolbar'
import { LayersPanel, PropertiesPanel } from '@/components/jarumy/SidePanels'
import { CommandConsole, StatusBar } from '@/components/jarumy/ConsoleBar'
import { ScheduleDialog, CatalogDialog, EnergyDialog, ClashDialog } from '@/components/jarumy/Dialogs'
import { BlockLibraryDialog } from '@/components/jarumy/BlockLibrary'
import { ExportPdfDialog } from '@/components/jarumy/ExportPdfDialog'
import {
  StairDialog, RoofDialog, ElevationsDialog, Iso3DDialog,
  NormativaDialog, MetradosDialog, ShareDialog,
  QuickSelectDialog, LightingDialog, AcousticDialog, PhasesDialog,
  StructuralDialog, CollabDialog, FamiliasDialog, BlockEditorDialog,
} from '@/components/jarumy/FeatureDialogs'
import AdminPanel, { PRIMARY_PRESETS } from '@/components/jarumy/AdminPanel'
import { ToolIcon } from '@/components/jarumy/ToolIcon'
import { PromptDialog } from '@/components/jarumy/PromptDialog'
import { UnderlayDialog } from '@/components/jarumy/UnderlayDialog'
import { ThermalDialog, AccessibilityDialog, EvacuationDialog, PvDialog } from '@/components/jarumy/AnalysisDialogs'
import { CloudDialog } from '@/components/jarumy/CloudDialog'
import { AiPlanDialog, AiNormaDialog } from '@/components/jarumy/AiDialogs'
import { Walkthrough3DDialog } from '@/components/jarumy/Walkthrough3DDialog'
import { readDxfFile } from '@/lib/dxf-import'
import { stopCollabSession } from '@/lib/collab-client'

type MobileSheet = 'menu' | 'layers' | 'props' | null

// Logotipo oficial (imagen servida desde /public) con degradación elegante
// al badge de inicial si la imagen no pudiera cargarse
function HeaderLogo({ initial, className }: { initial: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="flex items-center justify-center w-9 h-9 rounded-xl jy-bg-primary text-zinc-950 font-black text-lg shrink-0 shadow-lg">
        {initial}
      </span>
    )
  }
  return (
    <img
      src="/logo-jarumy.png"
      alt="Arq. Jarumy"
      className={className}
      onError={() => setFailed(true)}
      draggable={false}
    />
  )
}

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

  // restauración del auto-guardado (tras la hidratación, para no
  // desincronizar el render del servidor con el estado persistido)
  useEffect(() => {
    const restored = useJarumy.getState().restoreAutosave()
    if (restored) {
      toast.success('Plano restaurado del auto-guardado', {
        description: 'Elementos, capas, ajustes y vista intactos — nada se perdió',
      })
    }
  }, [])

  // aviso cuando cambia la sesión (ej. al cerrar desde admin)
  useEffect(() => {
    useJarumy.getState().pushConsole({
      text: 'Sistema listo · toque o haga clic sobre el plano para el menú radial de herramientas',
      kind: 'out',
    })
  }, [])

  // ---------- PWA: registro del service worker (offline) ----------
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* sin SW */ })
    }
  }, [])

  // ---------- importación de DXF (input oculto + evento de la consola) ----------
  const dxfInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const trigger = () => dxfInputRef.current?.click()
    window.addEventListener('jarumy-import-dxf', trigger)
    return () => window.removeEventListener('jarumy-import-dxf', trigger)
  }, [])

  // ---------- apertura de enlaces compartidos (?plano=token) ----------
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('plano')
    if (!token) return
    useJarumy.getState().pushConsole({ text: `PLANO COMPARTIDO detectado (${token.slice(0, 10)}…) — ábralo desde NUBE › Sesión en vivo › Unirme con enlace`, kind: 'out' })
    // precarga el plano compartido (solo lectura o edición según permiso)
    fetch(`/api/share/${token}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.data) return
      try {
        const data = JSON.parse(d.data)
        if (Array.isArray(data.elements)) {
          useJarumy.setState({ elements: data.elements, mods: data.mods || {}, undoStack: [], redoStack: [] })
          useJarumy.getState().setCloud({ planId: d.plan.id, planName: d.plan.name, projectName: d.plan.projectName, status: 'saved' })
          useJarumy.getState().setCollab({ token, permission: d.permission === 'edit' ? 'edit' : 'view' })
          useJarumy.getState().pushConsole({ text: `PLANO COMPARTIDO cargado: "${d.plan.name}" (${d.permission === 'edit' ? 'EDICIÓN' : 'solo lectura'}) — inicie la sesión en vivo para colaborar`, kind: 'out' })
          toast.success('Plano compartido cargado', { description: `${d.plan.name} · ${d.permission === 'edit' ? 'permiso de edición' : 'solo lectura'}` })
        }
      } catch { /* enlace corrupto */ }
    }).catch(() => { /* sin servidor */ })
  }, [])

  // cierra el canal colaborativo al salir de la página
  useEffect(() => () => stopCollabSession(true), [])

  // ---------- acciones del menú móvil ----------
  const menuActions = [
    { icon: 'FileDown', label: 'PDF a escala', detail: 'Exportación vectorial 1:25 – 1:250 con cartela', fn: () => s.setDialog('pdf'), highlight: true },
    { icon: 'CloudUpload', label: 'Nube y colaboración', detail: 'Planos en el servidor · enlaces · sesión en vivo', fn: () => s.setDialog('cloud') },
    { icon: 'Sparkles', label: 'IA arquitectónica', detail: 'Genera plantas desde texto · revisor RNE', fn: () => s.setDialog('aiplan') },
    { icon: 'Footprints', label: 'Walkthrough 3D', detail: 'Recorrido en 1ª persona (WASD)', fn: () => s.setDialog('walkthrough') },
    { icon: 'Blocks', label: `Bloques (${BLOCK_LIBRARY.length})`, detail: 'Biblioteca con vista previa y buscador', fn: () => s.setDialog('blocks') },
    { icon: 'Box', label: 'Vista 3D', detail: 'Axonometría interactiva con órbita', fn: () => s.setDialog('iso3d') },
    { icon: 'Landmark', label: 'Elevaciones', detail: 'Vistas N/S/E/O y sección automática', fn: () => s.setDialog('elevations') },
    { icon: 'Scale', label: 'Normativa RNE', detail: 'Verificación A.010 · A.130 en el plano', fn: () => s.setDialog('normativa') },
    { icon: 'Calculator', label: 'Metrados S10', detail: 'Presupuesto por partidas → Excel', fn: () => s.setDialog('metrados') },
    { icon: 'Thermometer', label: 'Térmica E.020', detail: 'U de muros/techos + condensación', fn: () => s.setDialog('thermal') },
    { icon: 'SolarPower', label: 'Fotovoltaico', detail: 'kWp · kWh/año · ahorro · payback', fn: () => s.setDialog('fotovoltaico') },
    { icon: 'Sun', label: 'Heliodón', detail: 'Sol, sombras y trayectorias reales', fn: () => s.runGlobal('toggleSun') },
    { icon: 'Library', label: `Catálogo (${TOTAL_TOOLS})`, detail: 'Herramientas recopiladas de 11 apps', fn: () => s.setDialog('catalog') },
    { icon: 'ClipboardList', label: 'Cuadro BIM', detail: 'Espacios, áreas y acabados + exportar a Excel', fn: () => s.setDialog('schedule') },
    { icon: 'Share2', label: 'Compartir e historial', detail: 'Plano .json + versiones guardadas', fn: () => s.setDialog('share') },
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
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <HeaderLogo
            initial={logoInitial}
            className="h-9 sm:h-10 w-auto rounded-lg object-cover shrink-0 shadow-lg ring-1 ring-white/15"
          />
          <div className="min-w-0 hidden sm:flex flex-col justify-center gap-[3px] pl-2.5 sm:pl-3 border-l jy-border">
            <h1 className="text-[11px] font-bold leading-none jy-text truncate">Suite arquitectónica</h1>
            <p className="text-[8.5px] jy-muted tracking-[0.16em] uppercase leading-none">CAD · BIM · Render</p>
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
            onClick={() => s.setDialog('iso3d')}
            className="hidden md:flex items-center gap-1.5 rounded-lg border jy-border px-3 py-1.5 text-[11px] font-semibold jy-text hover:border-amber-500/60 hover:text-amber-300 transition-colors"
            title="Vista 3D interactiva: órbita, extrusión y techos con pendiente"
          >
            <ToolIcon name="Box" size={13} />
            3D
          </button>
          <button
            onClick={() => s.setDialog('elevations')}
            className="hidden md:flex items-center gap-1.5 rounded-lg border jy-border px-3 py-1.5 text-[11px] font-semibold jy-text hover:border-amber-500/60 hover:text-amber-300 transition-colors"
            title="Elevaciones y sección automáticas (N/S/E/O + corte)"
          >
            <ToolIcon name="Landmark" size={13} />
            Elevaciones
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

        <div className="relative flex flex-1 min-w-0">
          <PlanCanvas />
          <LevelSelector />
        </div>

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
            <SheetTitle className="flex items-center gap-2.5 text-[15px] jy-text">
              <HeaderLogo
                initial={logoInitial}
                className="h-8 w-auto rounded-md object-cover shrink-0 ring-1 ring-white/15"
              />
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
      <StairDialog />
      <RoofDialog />
      <ElevationsDialog />
      <Iso3DDialog />
      <NormativaDialog />
      <MetradosDialog />
      <ShareDialog />
      <QuickSelectDialog />
      <LightingDialog />
      <AcousticDialog />
      <PhasesDialog />
      <StructuralDialog />
      <CollabDialog />
      <FamiliasDialog />
      <BlockEditorDialog />

      {/* ---------- diálogos nuevos (Olas 1–7) ---------- */}
      <PromptDialog />
      <UnderlayDialog />
      <ThermalDialog />
      <AccessibilityDialog />
      <EvacuationDialog />
      <PvDialog />
      <CloudDialog />
      <AiPlanDialog />
      <AiNormaDialog />
      <Walkthrough3DDialog />

      {/* ---------- entrada oculta de DXF ---------- */}
      <input
        ref={dxfInputRef}
        type="file"
        accept=".dxf,text/plain,application/dxf"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          useJarumy.getState().pushConsole({ text: `IMPORTAR DXF: leyendo "${f.name}" (${(f.size / 1024).toFixed(1)} KB)…`, kind: 'out' })
          try {
            const els = await readDxfFile(f)
            if (!els.length) {
              useJarumy.getState().pushConsole({ text: 'IMPORTAR DXF: el archivo no contiene entidades soportadas (LINE/CIRCLE/ARC/TEXT/POLYLINE)', kind: 'err' })
              return
            }
            useJarumy.getState().importElements(els, 'DXF importado')
            useJarumy.getState().fitView()
            toast.success('DXF importado', { description: `${els.length} entidades trazadas sobre el plano` })
          } catch (err) {
            useJarumy.getState().pushConsole({ text: `IMPORTAR DXF: archivo corrupto o incompatible (${(err as Error).message.slice(0, 60)})`, kind: 'err' })
          }
        }}
      />

      {/* ---------- panel de administración ---------- */}
      <AdminPanel onDesignChange={applyDesign} />
    </div>
  )
}
