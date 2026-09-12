// ============================================================
// JARUMY APP — Catálogo de herramientas recopiladas de las
// aplicaciones de arquitectura PRO: AutoCAD (+ Architecture
// Toolset), Revit, ArchiCAD, SketchUp, Rhino, Vectorworks,
// Lumion, Enscape, V-Ray, Corona, D5 Render y plugins de
// productividad (CADinTools, rendair, etc.)
// ============================================================

export type ElementType =
  | 'muro' | 'puerta' | 'ventana' | 'espacio' | 'mobiliario' | 'sanitario'
  | 'cota' | 'texto' | 'columna' | 'apertura' | 'dibujo' | 'lamina'

export type ActionKind = 'effect' | 'info' | 'global' | 'draw' | 'prompt'

export interface ToolAction {
  kind: ActionKind
  effect?: string
  value?: string | number
  info?: string
  global?: string
  draw?: string
  prompt?: { label: string; effect: string; def?: string }
}

export interface ToolOption {
  label: string
  detail?: string
  action: ToolAction
}

export interface Tool {
  id: string
  label: string
  icon: string
  desc: string
  source: string
  options: ToolOption[]
}

export interface ToolCategory {
  id: string
  label: string
  icon: string
  color: string
  tools: Tool[]
}

const A = (effect: string, value?: string | number): ToolAction => ({ kind: 'effect', effect, value })
const G = (global: string): ToolAction => ({ kind: 'global', global })
const D = (draw: string): ToolAction => ({ kind: 'draw', draw })
const I = (info: string): ToolAction => ({ kind: 'info', info })
const P = (label: string, effect: string, def?: string): ToolAction => ({ kind: 'prompt', prompt: { label, effect, def } })

// ------------------------------------------------------------
// PESTAÑAS DE LA CINTA (RIBBON) — estilo AutoCAD
// ------------------------------------------------------------

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: 'Home',
    color: '#f59e0b',
    tools: [
      {
        id: 'nuevo', label: 'Nuevo plano', icon: 'FilePlus2', desc: 'Crea una lámina nueva desde plantilla arquitectónica', source: 'AutoCAD',
        options: [
          { label: 'Plano de plantas', detail: 'Plantilla A1 - métrico', action: I('Plantilla "Planta Arquitectónica A1" cargada. Lámina 841×594 mm, escala 1:60, unidades métricas.') },
          { label: 'Lámina en blanco', action: G('newPlan') },
        ],
      },
      {
        id: 'guardar', label: 'Guardar', icon: 'Save', desc: 'Guarda el estado del plano', source: 'AutoCAD',
        options: [
          { label: 'Guardar plano', detail: 'Ctrl+S', action: I('Plano guardado en la nube Jarumy (versión 1). Historial activado.') },
          { label: 'Guardar como copia', action: I('Copia creada: jarumy-plano-v2.jrm') },
        ],
      },
      {
        id: 'exportar', label: 'Exportar', icon: 'FileDown', desc: 'Exporta a PDF a escala, DWG, PNG o IFC', source: 'AutoCAD / Revit',
        options: [
          { label: 'Exportar PDF a escala', detail: '1:50 · 1:75 · 1:100 · cartela y papel A4/A3/A2', action: G('showPdfExport') },
          { label: 'Exportar DWG', action: I('Exportación DWG 2024 configurada: capas conservadas, colores indexados, referencias externas enlazadas.') },
          { label: 'Exportar IFC (BIM)', action: I('Modelo IFC 4.0 generado con 26 elementos: 22 muros, 4 losas, 158 m² de espacios.') },
        ],
      },
      {
        id: 'imprimir', label: 'Imprimir', icon: 'Printer', desc: 'Trazado de lámina', source: 'AutoCAD',
        options: [
          { label: 'Imprimir lámina', detail: 'Ctrl+P', action: G('print') },
          { label: 'PDF a escala', detail: 'Vectorial con cartela y barra de escala', action: G('showPdfExport') },
          { label: 'Trazado por lotes', action: I('Batch Plot: 3 láminas en cola, impresora "Plotter A1 Jarumy".') },
        ],
      },
      {
        id: 'deshacer', label: 'Deshacer', icon: 'Undo2', desc: 'Deshace la última acción', source: 'AutoCAD',
        options: [{ label: 'Deshacer (U)', action: G('undo') }, { label: 'Deshacer todo', action: G('newPlan') }],
      },
      {
        id: 'rehacer', label: 'Rehacer', icon: 'Redo2', desc: 'Repite la última acción deshecha', source: 'AutoCAD',
        options: [{ label: 'Rehacer (REHACER)', action: G('redo') }],
      },
      {
        id: 'propiedades', label: 'Propiedades', icon: 'PanelRight', desc: 'Panel de propiedades del objeto', source: 'AutoCAD',
        options: [{ label: 'Mostrar panel', action: G('toggleProperties') }],
      },
      {
        id: 'catalogo', label: 'Catálogo', icon: 'Library', desc: 'Catálogo completo de las 92 herramientas recopiladas de AutoCAD, Revit, ArchiCAD, SketchUp, Rhino, Lumion, V-Ray y más', source: 'Jarumy',
        options: [{ label: 'Ver catálogo completo', detail: '92 herramientas · 10 aplicaciones analizadas', action: G('showCatalog') }],
      },
    ],
  },
  {
    id: 'dibujo',
    label: 'Dibujo',
    icon: 'PencilRuler',
    color: '#10b981',
    tools: [
      {
        id: 'linea', label: 'Línea', icon: 'Minus', desc: 'LÍNEA: dibuja segmentos rectos (AutoCAD: L)', source: 'AutoCAD',
        options: [
          { label: 'Dibujar línea', detail: 'Clic: origen → destino', action: D('linea') },
          { label: 'Modo ortogonal', action: G('toggleOrtho') },
          { label: 'Snap a rejilla', action: G('toggleSnap') },
        ],
      },
      {
        id: 'polilinea', label: 'Polilínea', icon: 'Spline', desc: 'PLINE: secuencia conectada de segmentos (AutoCAD: PL)', source: 'AutoCAD',
        options: [
          { label: 'Dibujar polilínea', detail: 'Múltiples vértices, doble clic para cerrar', action: D('polilinea') },
          { label: 'Grosor de línea', action: I('Ancho de polilínea: 0.00 / 0.30 / 0.60 mm') },
        ],
      },
      {
        id: 'circulo', label: 'Círculo', icon: 'Circle', desc: 'CIRCULO: centro y radio (AutoCAD: C)', source: 'AutoCAD',
        options: [
          { label: 'Dibujar círculo', detail: 'Clic: centro → radio', action: D('circulo') },
          { label: '3 puntos (3P)', action: D('circulo') },
        ],
      },
      {
        id: 'arco', label: 'Arco', icon: 'Spline', desc: 'ARCO: 3 puntos o inicio-centro-fin (AutoCAD: A)', source: 'AutoCAD',
        options: [
          { label: 'Parámetros del arco', action: I('ARCO: métodos Inicio-Centro-Fin / Inicio-Fin-Dirección / 3 puntos. Radio actual: 1.20 m') },
        ],
      },
      {
        id: 'rectangulo', label: 'Rectángulo', icon: 'Square', desc: 'RECTANGULO: dos esquinas opuestas (AutoCAD: REC)', source: 'AutoCAD',
        options: [
          { label: 'Dibujar rectángulo', detail: 'Clic: esquina 1 → esquina 2', action: D('rectangulo') },
          { label: 'Con chaflán', action: I('RECTANGULO con chaflán 0.25×0.25 m configurado') },
        ],
      },
      {
        id: 'spline', label: 'Spline', icon: 'TrendingUp', desc: 'SPLINE: curva suave por puntos de ajuste (Rhino: Curva)', source: 'AutoCAD / Rhino',
        options: [
          { label: 'Curva de ajuste', action: I('SPLINE grado 3, 6 puntos de control, tolerancia 0.001. Curvatura G2 continua.') },
        ],
      },
      {
        id: 'elipse', label: 'Elipse', icon: 'CircleDashed', desc: 'ELIPSE: ejes mayor y menor (AutoCAD: EL)', source: 'AutoCAD',
        options: [{ label: 'Eje 2.40 × 1.20', action: I('ELIPSE: eje mayor 2.40 m, eje menor 1.20 m, rotación 15°') }],
      },
      {
        id: 'punto', label: 'Punto', icon: 'Dot', desc: 'PUNTO: marcador de coordenada (AutoCAD: PO)', source: 'AutoCAD',
        options: [{ label: 'Estilo de punto', action: I('PDMODE: cruz / círculo / cuadrado. Tamaño relativo a pantalla 5%.') }],
      },
      {
        id: 'sombreado', label: 'Sombreado', icon: 'Grid2x2', desc: 'HATCH: rellena áreas con patrón (AutoCAD: H)', source: 'AutoCAD',
        options: [
          { label: 'ANSI31 (hormigón)', action: I('HATCH ANSI31: escala 1.0, ángulo 0° — patrón de hormigón armado aplicado a losas.') },
          { label: 'Ladrillo a soga', action: I('HATCH AR-B816: ladrillo a soga 0.25×0.08 m, junta 0.01 m — muros de albañilería.') },
          { label: 'Tierra / jardín', action: I('HATCH GRAVEL: tierra compactada y gravilla para exteriores y jardines.') },
          { label: 'Mosaico / cerámico', action: I('HATCH AR-CONC: mosaico 0.30×0.30 m para pisos de baños y cocinas.') },
        ],
      },
    ],
  },
  {
    id: 'modificacion',
    label: 'Modificación',
    icon: 'Wrench',
    color: '#f43f5e',
    tools: [
      {
        id: 'mover', label: 'Mover', icon: 'Move', desc: 'MUEVE: desplaza objetos (AutoCAD: M)', source: 'AutoCAD',
        options: [
          { label: 'Mover elemento', detail: 'Clic: objeto → punto destino', action: D('mover') },
          { label: 'Desplazamiento exacto', action: I('MUEVE con coordenadas: @1.50,0.00 (relativo) o 2500,3600 (absoluto).') },
        ],
      },
      {
        id: 'copiar', label: 'Copiar', icon: 'Copy', desc: 'COPIA: duplica objetos (AutoCAD: CO)', source: 'AutoCAD',
        options: [
          { label: 'Copiar elemento', detail: 'Clic en el objeto a duplicar', action: D('copiar') },
          { label: 'Copiar matriz', detail: '3 copias alineadas', action: A('duplicateTriple') },
        ],
      },
      {
        id: 'rotar', label: 'Rotar', icon: 'RotateCw', desc: 'GIRA: rota alrededor de punto base (AutoCAD: G)', source: 'AutoCAD',
        options: [
          { label: 'Rotar 90°', action: A('rotate', 90) },
          { label: 'Rotar -90°', action: A('rotate', -90) },
          { label: 'Rotar 180°', action: A('rotate', 180) },
          { label: 'Ángulo exacto', action: I('GIRA: ángulo 45°, punto base en centroide. Referencia: 30°') },
        ],
      },
      {
        id: 'escalar', label: 'Escalar', icon: 'Maximize2', desc: 'ESCALA: cambia tamaño (AutoCAD: SC)', source: 'AutoCAD',
        options: [
          { label: 'Agrandar ×1.15', action: A('scale', 1.15) },
          { label: 'Reducir ×0.87', action: A('scale', 0.87) },
          { label: 'Restaurar tamaño', action: A('scale', 'reset') },
          { label: 'Factor exacto', action: I('ESCALA: factor 0.75 / 1.5 / 2.0, tipo base de escala métrica.') },
        ],
      },
      {
        id: 'simetria', label: 'Simetría', icon: 'FlipHorizontal2', desc: 'SIMETRIA: refleja objetos (AutoCAD: MI)', source: 'AutoCAD',
        options: [
          { label: 'Eje horizontal', action: A('mirror', 'h') },
          { label: 'Eje vertical', action: A('mirror', 'v') },
          { label: 'Borrar originales', action: I('SIMETRIA con borrado de origen: eje de simetría 2 puntos (0,0)-(0,10).') },
        ],
      },
      {
        id: 'equidistancia', label: 'Equidistancia', icon: 'MoveHorizontal', desc: 'EQUISDIST: offset paralelo (AutoCAD: O)', source: 'AutoCAD',
        options: [
          { label: 'Engrosar muro', detail: 'Offset exterior', action: A('thicken', 4) },
          { label: 'Adelgazar muro', action: A('thicken', -4) },
          { label: 'Distancia exacta', action: I('EQUISDIST: 0.15 m para eje de muro doble, 0.60 m para mobiliario.') },
        ],
      },
      {
        id: 'recortar', label: 'Recortar', icon: 'Scissors', desc: 'RECORTA: corta en bordes (AutoCAD: TR)', source: 'AutoCAD',
        options: [
          { label: 'Acortar extremo A', action: A('shortenA') },
          { label: 'Acortar extremo B', action: A('shortenB') },
          { label: 'Recorte rápido', action: I('RECORTA con selección por barra: 4 bordes de corte encontrados, 12 objetos recortados.') },
        ],
      },
      {
        id: 'alargar', label: 'Alargar', icon: 'Expand', desc: 'ALARGA: extiende hasta borde (AutoCAD: EX)', source: 'AutoCAD',
        options: [
          { label: 'Alargar extremo A', action: A('extendA') },
          { label: 'Alargar extremo B', action: A('extendB') },
        ],
      },
      {
        id: 'empalme', label: 'Empalme', icon: 'Spline', desc: 'EMPALME: une con radio (AutoCAD: F)', source: 'AutoCAD',
        options: [
          { label: 'Radio 0 (unir)', action: I('EMPALME radio 0: 8 muros unidos en las intersecciones seleccionadas.') },
          { label: 'Radio 0.15 m', action: I('EMPALME radio 0.15 m aplicado a esquinas interiores.') },
          { label: 'Achaflanado 0.10', action: I('ACHAFLANA: distancia 0.10 m en ambos lados del vértice.') },
        ],
      },
      {
        id: 'matriz', label: 'Matriz', icon: 'LayoutGrid', desc: 'MATRIZ: copias múltiples (AutoCAD: AR)', source: 'AutoCAD',
        options: [
          { label: 'Rectangular 3×1', action: A('duplicateTriple') },
          { label: 'Circular 8×', action: I('MATRIZ polar: 8 elementos en 360°, punto base en centro del círculo.') },
          { label: 'Por trayecto', action: I('MATRIZ sobre trayecto: 14 columnas cada 3.00 m en polilínea de eje.') },
        ],
      },
      {
        id: 'estirar', label: 'Estirar', icon: 'StretchHorizontal', desc: 'ESTIRA: deformación por cruces (AutoCAD: S)', source: 'AutoCAD',
        options: [{ label: 'Ventana de cruces', action: I('ESTIRA: 6 vértices seleccionados, desplazamiento @0.80,0.00 aplicado.') }],
      },
      {
        id: 'descomponer', label: 'Descomponer', icon: 'Ungroup', desc: 'EXPLOT: separa bloques (AutoCAD: X)', source: 'AutoCAD',
        options: [{ label: 'Explotar bloque', action: I('EXPLOT: bloque "MESA-COMEDOR" separado en 7 primitivas editables.') }],
      },
      {
        id: 'matchprop', label: 'Igualar propiedades', icon: 'Paintbrush', desc: 'MATCHPROP: copia propiedades (AutoCAD: MA)', source: 'AutoCAD',
        options: [
          { label: 'Aplicar a todos los iguales', action: A('matchAll') },
          { label: 'Solo capa', action: I('MATCHPROP: solo CAPA y COLOR. Objeto fuente: muro de 0.15 m ladrillo.') },
        ],
      },
      {
        id: 'borrar', label: 'Borrar', icon: 'Trash2', desc: 'BORRA: elimina objetos (AutoCAD: E)', source: 'AutoCAD',
        options: [{ label: 'Borrar elemento', detail: 'Clic en el objeto a eliminar', action: D('borrar') }],
      },
    ],
  },
  {
    id: 'anotacion',
    label: 'Anotación',
    icon: 'Ruler',
    color: '#a855f7',
    tools: [
      {
        id: 'cota-lineal', label: 'Cota lineal', icon: 'Ruler', desc: 'ACOTA: distancia horizontal/vertical (AutoCAD: DLI)', source: 'AutoCAD',
        options: [
          { label: 'Dibujar cota', detail: 'Clic: punto 1 → punto 2', action: D('cota') },
          { label: 'Precisión 0.00', action: A('precision', 2) },
          { label: 'Precisión 0.0', action: A('precision', 1) },
        ],
      },
      {
        id: 'cota-alineada', label: 'Cota alineada', icon: 'Ruler', desc: 'ACOTALIN: alineada al objeto (AutoCAD: DAL)', source: 'AutoCAD',
        options: [{ label: 'Cota alineada', action: I('ACOTALIN: alineada a la arista de 3.47 m, ángulo 31°.') }],
      },
      {
        id: 'cota-angular', label: 'Cota angular', icon: 'Compass', desc: 'ACOTANG: ángulo entre líneas (AutoCAD: DAN)', source: 'AutoCAD',
        options: [{ label: 'Angular 90°', action: I('ACOTANG: 90° entre muro norte y muro este. Estilo: flecha cerrada.') }],
      },
      {
        id: 'cota-radio', label: 'Radio / Diámetro', icon: 'CircleDot', desc: 'ACOTRAD: radios y diámetros (AutoCAD: DRA)', source: 'AutoCAD',
        options: [{ label: 'R = 1.20 m', action: I('ACOTRAD: R1.20 m con directriz al centro del círculo.') }],
      },
      {
        id: 'texto', label: 'Texto', icon: 'Type', desc: 'TEXTO: línea de texto (AutoCAD: T / DT)', source: 'AutoCAD',
        options: [
          { label: 'Insertar texto', detail: 'Clic en el punto de inserción', action: D('texto') },
          { label: 'Altura 0.20 m', action: A('textHeight', 22) },
          { label: 'Estilo arquitectural', action: I('Estilo de texto: fuente "Arquitectural", altura 0.20, factor de anchura 0.85.') },
        ],
      },
      {
        id: 'directriz', label: 'Directriz', icon: 'CornerDownRight', desc: 'DIRECTRIZ: llama con flecha (AutoCAD: LE)', source: 'AutoCAD',
        options: [{ label: 'Nota de directriz', action: I('DIRECTRIZ multicapa: "UMBRAL GRANITO NEGRO PULIDO e=0.02" con flecha punteada.') }],
      },
      {
        id: 'tabla', label: 'Tabla', icon: 'Table', desc: 'TABLA: cuadros con estilos (AutoCAD: TB)', source: 'AutoCAD / Revit',
        options: [{ label: 'Cuadro de espacios', detail: 'Generado desde los espacios BIM', action: G('showSchedule') }],
      },
      {
        id: 'rotulado-areas', label: 'Rotulado de áreas', icon: 'Tags', desc: 'Etiquetas automáticas de nombre + m² por ambiente, calculadas en tiempo real (Revit: Rooms)', source: 'Revit / ArchiCAD',
        options: [
          { label: 'Mostrar áreas', detail: 'Nombre + m² + número en cada espacio', action: G('toggleAreas') },
          { label: 'Ocultar áreas', detail: 'Deja solo el nombre del ambiente', action: G('toggleAreas') },
          { label: 'Cuadro de espacios', detail: 'Tabla BIM con total techado', action: G('showSchedule') },
        ],
      },
      {
        id: 'acotacion-auto', label: 'Acotación automática', icon: 'Scaling', desc: 'Cotas interiores de cada ambiente (ancho y alto en metros), generadas y recalculadas en tiempo real (Revit: Auto Dimension)', source: 'Revit / ArchiCAD',
        options: [
          { label: 'Mostrar cotas', detail: 'Ancho + alto interior por ambiente, en m', action: G('toggleAutoDims') },
          { label: 'Ocultar cotas', detail: 'Quita la acotación automática', action: G('toggleAutoDims') },
          { label: 'Cota manual', detail: 'Dibujar cota con 2 clics (COTA)', action: D('cota') },
        ],
      },
      {
        id: 'nube', label: 'Nube de revisión', icon: 'Cloud', desc: 'NUBE: marca cambios (AutoCAD: REVCLOUD)', source: 'AutoCAD',
        options: [{ label: 'Marcar revisión', action: I('NUBEDECTRL: arco 0.5 m. Revisión R3 — "AMPLIAR VANOS DORMITORIO 2" registrada.') }],
      },
    ],
  },
  {
    id: 'arquitectura',
    label: 'Arquitectura',
    icon: 'Building2',
    color: '#f59e0b',
    tools: [
      {
        id: 'muro', label: 'Muro', icon: 'BrickWall', desc: 'Muros inteligentes AEC con espesor, altura y material (ACA / Revit / ArchiCAD)', source: 'AutoCAD Arch / Revit',
        options: [
          { label: 'Espesor 0.15 m', action: A('thickness', 15) },
          { label: 'Espesor 0.20 m', action: A('thickness', 20) },
          { label: 'Altura 2.70 m', action: I('Muro: altura 2.70 m, tipo "Tabique 15", material ladrillo king kong 18 huecos.') },
          { label: 'Material: concreto', action: A('material', 'concreto') },
          { label: 'Material: drywall', action: A('material', 'drywall') },
        ],
      },
      {
        id: 'puerta', label: 'Puerta', icon: 'DoorOpen', desc: 'Puertas con giro, tipo y hoja (ACA / Revit)', source: 'AutoCAD Arch / Revit',
        options: [
          { label: 'Invertir apertura', action: A('swingFlip') },
          { label: 'Invertir bisagra', action: A('hingeFlip') },
          { label: 'Ancho 1.00 m', action: A('scale', 1.15) },
          { label: 'Hoja de vidrio', action: A('material', 'marmol') },
        ],
      },
      {
        id: 'ventana', label: 'Ventana', icon: 'AppWindow', desc: 'Ventanas con antepecho y vidriería (ACA / Revit)', source: 'AutoCAD Arch / Revit',
        options: [
          { label: 'Tipo corrediza', action: A('windowType', 1) },
          { label: 'Tipo fija', action: A('windowType', 2) },
          { label: 'Antepecho 0.90 m', action: I('Ventana: antepecho 0.90 m, alto 1.20 m, vidrio laminado 6+6 mm.') },
        ],
      },
      {
        id: 'escalera', label: 'Escalera', icon: 'ArrowUpNarrowWide', desc: 'Escaleras con contrahuella normativa (ACA / Revit)', source: 'AutoCAD Arch / Revit',
        options: [{ label: 'Trazar escalera', action: I('ESCALERA: recta de 14 pasos, huella 0.28, contrahuella 0.17, ancho 0.90 — cumple normas.') }],
      },
      {
        id: 'losa', label: 'Losa / Techo', icon: 'Layers', desc: 'Losas aligeradas y techos (Revit / ArchiCAD)', source: 'Revit / ArchiCAD',
        options: [{ label: 'Losa aligerada e=0.20', action: I('LOSA: aligerada 0.20 m, viguetas cada 0.40, concreto f\'c 210.') }],
      },
      {
        id: 'columna', label: 'Columna', icon: 'Columns3', desc: 'Columnas estructurales (Revit / Vectorworks)', source: 'Revit',
        options: [
          { label: 'Dimensión 0.30 m', action: A('size', 30) },
          { label: 'Material acero', action: A('material', 'metal') },
        ],
      },
      {
        id: 'espacio', label: 'Espacio', icon: 'LayoutGrid', desc: 'Espacios/habitaciones BIM con área y uso (Revit / ArchiCAD)', source: 'Revit / ArchiCAD',
        options: [
          { label: 'Sombrear espacio', action: A('fillRoom', 'amber') },
          { label: 'Renombrar espacio', action: P('Nuevo nombre del espacio', 'rename') },
          { label: 'Cuadro de espacios', action: G('showSchedule') },
        ],
      },
      {
        id: 'rejilla', label: 'Rejilla estructural', icon: 'Grid3x3', desc: 'Ejes estructurales con burbujas (Revit / ArchiCAD)', source: 'Revit',
        options: [
          { label: 'Espaciado 1.00 m', action: A('gridSpacing', 60) },
          { label: 'Espaciado 0.50 m', action: A('gridSpacing', 30) },
          { label: 'Ocultar rejilla', action: G('toggleGrid') },
        ],
      },
    ],
  },
  {
    id: 'bloques',
    label: 'Bloques',
    icon: 'Blocks',
    color: '#14b8a6',
    tools: [
      {
        id: 'bib-mobiliario', label: 'Mobiliario', icon: 'Armchair', desc: 'Biblioteca de bloques de mobiliario (8,500+ objetos AEC)', source: 'AutoCAD Arch',
        options: [
          { label: 'Sofá 3 cuerpos', detail: 'Insertar bloque', action: D('ins:sofa') },
          { label: 'Cama plaza y media', detail: 'Insertar bloque', action: D('ins:cama') },
          { label: 'Mesa de centro', detail: 'Insertar bloque', action: D('ins:mesacentro') },
          { label: 'Ropero 6 puertas', detail: 'Insertar bloque', action: D('ins:ropero') },
          { label: 'Escritorio', detail: 'Insertar bloque', action: D('ins:escritorio') },
          { label: 'Silla giratoria', detail: 'Insertar bloque', action: D('ins:sillaescritorio') },
          { label: 'Estante modular', detail: 'Insertar bloque', action: D('ins:estante') },
        ],
      },
      {
        id: 'bib-sanitarios', label: 'Sanitarios', icon: 'Bath', desc: 'Aparatos sanitarios normativos', source: 'AutoCAD Arch',
        options: [
          { label: 'Inodoro', detail: 'Insertar bloque', action: D('ins:inodoro') },
          { label: 'Lavatorio', detail: 'Insertar bloque', action: D('ins:lavatorio') },
          { label: 'Ducha 0.90×0.90', detail: 'Insertar bloque', action: D('ins:ducha') },
        ],
      },
      {
        id: 'bib-cocina', label: 'Cocina', icon: 'CookingPot', desc: 'Módulos de cocina y electrodomésticos', source: 'ArchiCAD / Plugins',
        options: [
          { label: 'Isla de cocina', detail: 'Insertar bloque', action: D('ins:isla') },
          { label: 'Refrigeradora', detail: 'Insertar bloque', action: D('ins:refri') },
          { label: 'Módulo de cocina', detail: 'Insertar bloque', action: D('ins:counter') },
          { label: 'Cocina 4 hornillas', detail: 'Insertar bloque', action: D('ins:stove') },
          { label: 'Fregadero doble', detail: 'Insertar bloque', action: D('ins:sinkk') },
        ],
      },
      {
        id: 'bib-exterior', label: 'Exterior', icon: 'TreePine', desc: 'Vegetación y vehículos para sitios y jardines', source: 'AutoCAD Arch / SketchUp',
        options: [
          { label: 'Árbol copa 2.5 m', detail: 'Insertar bloque', action: D('ins:arbol') },
          { label: 'Arbusto 1.0 m', detail: 'Insertar bloque', action: D('ins:arbusto') },
          { label: 'Automóvil 4.5 m', detail: 'Insertar bloque', action: D('ins:auto') },
        ],
      },
      {
        id: 'bib-visual', label: 'Biblioteca visual', icon: 'LayoutGrid', desc: 'Explorador de bloques con vista previa — clic para armar, clic en el plano para insertar (R rota 90°)', source: 'Jarumy',
        options: [
          { label: 'Abrir biblioteca de bloques', detail: '23 bloques con vista previa', action: G('showBlockLibrary') },
        ],
      },
      {
        id: 'bloque-dinamico', label: 'Bloque dinámico', icon: 'Shapes', desc: 'Bloques paramétricos con acciones', source: 'AutoCAD',
        options: [{ label: 'Editor de bloques', action: I('EDITOR DE BLOQUES: parámetros (lineal, girar, voltee) + acciones (estirar, matriz).') }],
      },
    ],
  },
  {
    id: 'bim',
    label: 'BIM',
    icon: 'Boxes',
    color: '#0d9488',
    tools: [
      {
        id: 'cantidades', label: 'Cuadros de cantidades', icon: 'ClipboardList', desc: 'Schedules BIM por categoría (Revit: Schedule)', source: 'Revit / ArchiCAD',
        options: [
          { label: 'Cuadro de espacios', action: G('showSchedule') },
          { label: 'Cuadro de muros', action: I('MUROS: 22 unidades · 96.4 m² de área · 28.9 m³ de volumen · 8 tipos.') },
          { label: 'Cuadro de puertas', action: I('PUERTAS: 5 unidades · 4.6 m² de área · 3 tipos (simple, corrediza, doble).') },
        ],
      },
      {
        id: 'colisiones', label: 'Detección de colisiones', icon: 'AlertTriangle', desc: 'Clash Detection entre disciplinas (Navisworks / Revit)', source: 'Revit / Navisworks',
        options: [
          { label: 'Ejecutar revisión', action: G('clashCheck') },
          { label: 'Configurar reglas', action: I('Reglas: muro↔MEP, losa↔ducto, columna↔tubería. Tolerancia 0.01 m.') },
        ],
      },
      {
        id: 'energia', label: 'Análisis energético', icon: 'Zap', desc: 'Simulación térmica y LEED (Revit / Insight)', source: 'Revit / Insight',
        options: [{ label: 'Generar reporte', action: G('energyReport') }],
      },
      {
        id: 'fases', label: 'Fases', icon: 'History', desc: 'Fases demolición / construcción (Revit: Phases)', source: 'Revit',
        options: [{ label: 'Ver fases', action: I('FASES: Existente (gris) → Demolición (rojo punteado) → Nueva (línea continua).') }],
      },
      {
        id: 'colaboracion', label: 'Colaboración', icon: 'Users', desc: 'Worksharing multiusuario (Revit / BIM360)', source: 'Revit',
        options: [{ label: 'Estado del central', action: I('MODELO CENTRAL: 3 usuarios sincronizados — J. Burga (arquitectura), MEP, estructura.') }],
      },
      {
        id: 'familias', label: 'Familias / Objetos', icon: 'Component', desc: 'Familias paramétricas (Revit) / Objetos GDL (ArchiCAD)', source: 'Revit / ArchiCAD',
        options: [{ label: 'Explorador de familias', action: I('FAMILIAS: 142 cargadas — 38 muebles, 24 puertas, 30 ventanas, 50 perfiles.') }],
      },
    ],
  },
  {
    id: 'visualizacion',
    label: 'Visualización',
    icon: 'Eye',
    color: '#fb923c',
    tools: [
      {
        id: 'render', label: 'Render', icon: 'Sparkles', desc: 'Render fotorrealista (V-Ray / Lumion / Enscape / Corona / D5)', source: 'V-Ray / Lumion',
        options: [
          { label: 'Vista render', detail: 'Sombras + materiales cálidos', action: G('toggleRender') },
          { label: 'Calidad: borrador', action: I('RENDER borrador: 30 s, resolución 1280×720, GI básico, sin cálculo de cáusticas.') },
          { label: 'Calidad: ultra', action: I('RENDER ultra: ray tracing 4K, 2,400 muestras/píxel, denoiser AI activado, HDRI interior.') },
        ],
      },
      {
        id: 'vista3d', label: 'Vista 3D', icon: 'Box', desc: 'Axonometría interactiva (SketchUp / Rhino)', source: 'SketchUp / Rhino',
        options: [
          { label: 'Activar/Desactivar 3D', action: G('toggle3D') },
          { label: 'Isométrica 30°', action: G('toggle3D') },
        ],
      },
      {
        id: 'recorrido', label: 'Recorrido', icon: 'Footprints', desc: 'Walkthrough animado (Lumion / Enscape)', source: 'Lumion / Enscape',
        options: [{ label: 'Simular recorrido', action: G('walkthrough') }],
      },
      {
        id: 'sombras', label: 'Estudio de sombras', icon: 'Sun', desc: 'Heliodón interactivo: sombras proyectadas según latitud, fecha y hora (Revit / SketchUp)', source: 'Revit',
        options: [
          { label: 'Heliodón interactivo', detail: 'Panel de sol con sombras en vivo', action: G('toggleSun') },
          { label: 'Solsticio de verano', detail: 'Sombra mínima del año', action: G('sunSummer') },
          { label: 'Solsticio de invierno', detail: 'Sombra máxima del año', action: G('sunWinter') },
          { label: 'Equinoccio', detail: '21 marzo · sombra media', action: G('sunEquinox') },
          { label: 'Trayectorias solares', detail: 'Mostrar/ocultar arcos de 3 fechas', action: G('toggleSunPath') },
        ],
      },
      {
        id: 'materiales', label: 'Materiales', icon: 'Palette', desc: 'Librería de materiales PBR', source: 'V-Ray / Lumion',
        options: [
          { label: 'Madera', action: A('material', 'madera') },
          { label: 'Mármol', action: A('material', 'marmol') },
          { label: 'Metal', action: A('material', 'metal') },
        ],
      },
    ],
  },
  {
    id: 'analisis',
    label: 'Análisis',
    icon: 'Activity',
    color: '#84cc16',
    tools: [
      {
        id: 'areas', label: 'Áreas y perímetros', icon: 'SquareSigma', desc: 'Cálculo de áreas normado', source: 'AutoCAD / Revit',
        options: [{ label: 'Reporte de áreas', action: G('showSchedule') }],
      },
      {
        id: 'iluminacion', label: 'Iluminación', icon: 'Lightbulb', desc: 'Niveles de lux por espacio (Dialux / Revit)', source: 'Dialux',
        options: [{ label: 'Niveles de iluminación', action: I('ILUMINACIÓN: Sala 280 lx · Cocina 500 lx · Baño 250 lx · Dormitorios 150 lx. Cumple EN 12464-1.') }],
      },
      {
        id: 'energia-a', label: 'Energía', icon: 'Zap', desc: 'Demanda energética y U-values', source: 'Insight / Ladybug',
        options: [{ label: 'Reporte energético', action: G('energyReport') }],
      },
      {
        id: 'estructural', label: 'Estructural', icon: 'Landmark', desc: 'Verificación de cargas (ETABS / Robot)', source: 'ETABS / Robot',
        options: [{ label: 'Cargas y reacciones', action: I('ESTRUCTURAL: carga muerta 5.4 kN/m², viva 2.0 kN/m², deriva sísmica 0.0021 — OK.') }],
      },
      {
        id: 'acustica', label: 'Acústica', icon: 'AudioWaveform', desc: 'Aislamiento acústico', source: 'Plugins',
        options: [{ label: 'Aislamiento muros', action: I('ACÚSTICA: muro ladrillo 0.15 → Rw 42 dB · muro doble → Rw 52 dB. OK para dormitorios.') }],
      },
    ],
  },
  {
    id: 'productividad',
    label: 'Productividad',
    icon: 'Rocket',
    color: '#e879f9',
    tools: [
      {
        id: 'capas', label: 'Capas', icon: 'Layers', desc: 'Gestor de capas con propiedades (AutoCAD: LA)', source: 'AutoCAD',
        options: [{ label: 'Administrar capas', action: G('toggleLayers') }],
      },
      {
        id: 'purge', label: 'Purge', icon: 'Trash', desc: 'Limpia elementos no usados (AutoCAD: PU)', source: 'AutoCAD',
        options: [{ label: 'Ejecutar purge', action: G('purge') }],
      },
      {
        id: 'audit', label: 'Audit', icon: 'ShieldCheck', desc: 'Repara errores de BD del dibujo (AutoCAD: AUDIT)', source: 'AutoCAD',
        options: [{ label: 'Auditar plano', action: G('auditCmd') }],
      },
      {
        id: 'quickselect', label: 'Quick Select', icon: 'MousePointerClick', desc: 'Selección por filtros (AutoCAD: QSE)', source: 'AutoCAD',
        options: [{ label: 'Filtro: muros', action: I('QUICK SELECT: 22 muros seleccionados por tipo "Tabique". Filtro aplicado.') }],
      },
      {
        id: 'layer-states', label: 'Layer States', icon: 'Save', desc: 'Estados de capa guardados', source: 'AutoCAD',
        options: [{ label: 'Estado "Revisión"', action: I('ESTADO DE CAPA "Revisión" aplicado: mobiliario apagado, cotas encendidas.') }],
      },
      {
        id: 'tool-palettes', label: 'Tool Palettes', icon: 'Palette', desc: 'Paletas de herramientas AEC', source: 'AutoCAD Arch',
        options: [{ label: 'Abrir paleta', action: G('toggleLayers') }],
      },
    ],
  },
]

// ------------------------------------------------------------
// MENÚ RADIAL CONTEXTUAL — herramientas por tipo de elemento
// ------------------------------------------------------------

export interface RadialTool {
  id: string
  label: string
  icon: string
  options: ToolOption[]
}

export const RADIAL_TOOLS: Record<string, RadialTool[]> = {
  muro: [
    {
      id: 'editar', label: 'Editar muro', icon: 'PencilRuler',
      options: [
        { label: 'Espesor 0.10', action: A('thickness', 10) },
        { label: 'Espesor 0.15', action: A('thickness', 15) },
        { label: 'Espesor 0.20', action: A('thickness', 20) },
        { label: 'Altura 2.70', action: I('Altura de muro: 2.70 m · tipo Tabique-15 · ladrillo 18 huecos.') },
        { label: 'Ladrillo', action: A('material', 'ladrillo') },
        { label: 'Concreto', action: A('material', 'concreto') },
        { label: 'Drywall', action: A('material', 'drywall') },
      ],
    },
    {
      id: 'modificar', label: 'Modificar', icon: 'Wrench',
      options: [
        { label: 'Recortar A', action: A('shortenA') },
        { label: 'Recortar B', action: A('shortenB') },
        { label: 'Alargar A', action: A('extendA') },
        { label: 'Alargar B', action: A('extendB') },
        { label: 'Engrosar', action: A('thicken', 4) },
        { label: 'Adelgazar', action: A('thicken', -4) },
        { label: 'Empalme R0', action: I('EMPALME radio 0 aplicado en la intersección más próxima.') },
      ],
    },
    {
      id: 'copiar', label: 'Copiar', icon: 'Copy',
      options: [
        { label: 'Duplicar', action: A('duplicate') },
        { label: 'Matriz ×3', action: A('duplicateTriple') },
        { label: 'Igualar a todos', action: A('matchAll') },
      ],
    },
    {
      id: 'bim', label: 'BIM', icon: 'Boxes',
      options: [
        { label: 'Cantidades', action: I('MURO: 4.20 m² de área · 1.26 m³ · ladrillo 92 und · mortero 0.31 m³.') },
        { label: 'Colisiones', action: G('clashCheck') },
        { label: 'Fase', action: I('FASE: Nueva construcción — elemento en fase "Nueva".') },
      ],
    },
    {
      id: 'capa', label: 'Capa', icon: 'Layers',
      options: [
        { label: 'Aislar capa', action: G('isolateLayer') },
        { label: 'Ocultar capa', action: G('hideLayer') },
        { label: 'Administrar', action: G('toggleLayers') },
      ],
    },
    {
      id: 'render', label: 'Render', icon: 'Sparkles',
      options: [
        { label: 'Vista render', action: G('toggleRender') },
        { label: 'Material cálido', action: A('material', 'madera') },
      ],
    },
  ],
  puerta: [
    {
      id: 'editar', label: 'Editar', icon: 'Settings2',
      options: [
        { label: 'Ancho 1.00', action: A('scale', 1.15) },
        { label: 'Ancho 0.90', action: A('scale', 'reset') },
        { label: 'Altura 2.10', action: I('Alto de puerta: 2.10 m · marco aluminio natural · hoja cedro.' ) },
        { label: 'Hoja vidrio', action: A('material', 'marmol') },
      ],
    },
    {
      id: 'giro', label: 'Giro', icon: 'RotateCw',
      options: [
        { label: 'Invertir apertura', action: A('swingFlip') },
        { label: 'Invertir bisagra', action: A('hingeFlip') },
        { label: 'Girar 90°', action: A('rotate', 90) },
      ],
    },
    {
      id: 'tipo', label: 'Tipo', icon: 'Replace',
      options: [
        { label: 'Simple', action: A('scale', 'reset') },
        { label: 'Doble', action: A('scale', 1.6) },
        { label: 'Corrediza', action: I('Puerta corrediza: riel superior 2 vías, hoja 2.00 m de vidrio templado.') },
      ],
    },
    {
      id: 'copiar', label: 'Copiar', icon: 'Copy',
      options: [
        { label: 'Duplicar', action: A('duplicate') },
        { label: 'Matriz ×3', action: A('duplicateTriple') },
      ],
    },
    {
      id: 'bim', label: 'BIM', icon: 'Boxes',
      options: [
        { label: 'Cantidades', action: I('PUERTA: 1.71 m² · 1 unidad · herrajes 1 juego · tipo simple 0.90 m.') },
        { label: 'Colisiones', action: G('clashCheck') },
      ],
    },
    {
      id: 'capa', label: 'Capa', icon: 'Layers',
      options: [
        { label: 'Aislar capa', action: G('isolateLayer') },
        { label: 'Ocultar capa', action: G('hideLayer') },
      ],
    },
  ],
  ventana: [
    {
      id: 'editar', label: 'Editar', icon: 'Settings2',
      options: [
        { label: 'Ancho 1.80', action: A('scale', 1.2) },
        { label: 'Ancho 1.20', action: A('scale', 'reset') },
        { label: 'Antepecho 0.90', action: I('Antepecho 0.90 m · alto 1.20 m · vidrio laminado 6+6 mm claro.') },
      ],
    },
    {
      id: 'vanos', label: 'Tipo', icon: 'LayoutGrid',
      options: [
        { label: 'Corrediza', action: A('windowType', 1) },
        { label: 'Fija', action: A('windowType', 2) },
        { label: 'Abatible', action: A('windowType', 3) },
      ],
    },
    {
      id: 'copiar', label: 'Copiar', icon: 'Copy',
      options: [
        { label: 'Duplicar', action: A('duplicate') },
        { label: 'Matriz ×3', action: A('duplicateTriple') },
      ],
    },
    {
      id: 'bim', label: 'BIM', icon: 'Boxes',
      options: [
        { label: 'Cantidades', action: I('VENTANA: 1.68 m² · vidrio 1.5 m² · perfil PVC blanco · U 1.4 W/m²K.') },
        { label: 'Colisiones', action: G('clashCheck') },
      ],
    },
    {
      id: 'capa', label: 'Capa', icon: 'Layers',
      options: [
        { label: 'Aislar capa', action: G('isolateLayer') },
        { label: 'Ocultar capa', action: G('hideLayer') },
      ],
    },
  ],
  espacio: [
    {
      id: 'props', label: 'Propiedades', icon: 'Tag',
      options: [
        { label: 'Renombrar', action: P('Nuevo nombre', 'rename') },
        { label: 'Número', action: P('Número del espacio', 'renumber') },
        { label: 'Uso: sala', action: I('Uso del espacio: Estar / convivencia. Ocupación: 6 personas.') },
      ],
    },
    {
      id: 'etiquetas', label: 'Etiquetas', icon: 'Tags',
      options: [
        { label: 'Mostrar áreas m²', detail: 'Rotulado automático en tiempo real', action: G('toggleAreas') },
        { label: 'Ocultar áreas', action: G('toggleAreas') },
        { label: 'Acotar ambiente', detail: 'Cotas interiores de ancho y alto', action: G('toggleAutoDims') },
        { label: 'Cuadro de espacios', action: G('showSchedule') },
      ],
    },
    {
      id: 'area', label: 'Área', icon: 'Ruler',
      options: [
        { label: 'Calcular área', action: I('AREA: ver cálculo en el propio espacio del plano.') },
        { label: 'Perímetro', action: I('PERÍMETRO calculado: ver etiqueta del espacio. Límites por línea media de muros.') },
        { label: 'Volumen', action: I('VOLUMEN: área × altura 2.70 m (auto en BIM).') },
      ],
    },
    {
      id: 'acabados', label: 'Acabados', icon: 'PaintBucket',
      options: [
        { label: 'Piso porcelanato', action: A('fillRoom', 'amber') },
        { label: 'Piso laminado', action: A('fillRoom', 'naranja') },
        { label: 'Cerámico', action: A('fillRoom', 'emerald') },
        { label: 'Sin relleno', action: A('fillRoom', 'none') },
      ],
    },
    {
      id: 'cuadro', label: 'Cuadro', icon: 'ClipboardList',
      options: [{ label: 'Cuadro de espacios', action: G('showSchedule') }],
    },
    {
      id: 'energia', label: 'Energía', icon: 'Zap',
      options: [
        { label: 'Análisis energético', action: G('energyReport') },
        { label: 'Iluminación', action: I('ILUMINACIÓN: 280 lx promedio · 5 luminarias LED 9W · factor mantenimiento 0.8.') },
      ],
    },
  ],
  mobiliario: [
    {
      id: 'rotar', label: 'Rotar', icon: 'RotateCw',
      options: [
        { label: '90°', action: A('rotate', 90) },
        { label: '-90°', action: A('rotate', -90) },
        { label: '180°', action: A('rotate', 180) },
      ],
    },
    {
      id: 'simetria', label: 'Simetría', icon: 'FlipHorizontal2',
      options: [
        { label: 'Horizontal', action: A('mirror', 'h') },
        { label: 'Vertical', action: A('mirror', 'v') },
      ],
    },
    {
      id: 'escalar', label: 'Escalar', icon: 'Maximize2',
      options: [
        { label: 'Agrandar', action: A('scale', 1.15) },
        { label: 'Reducir', action: A('scale', 0.87) },
        { label: 'Restaurar', action: A('scale', 'reset') },
      ],
    },
    {
      id: 'material', label: 'Material', icon: 'Palette',
      options: [
        { label: 'Madera', action: A('material', 'madera') },
        { label: 'Tela', action: A('material', 'tela') },
        { label: 'Metal', action: A('material', 'metal') },
        { label: 'Mármol', action: A('material', 'marmol') },
      ],
    },
    {
      id: 'bloque', label: 'Bloque', icon: 'Blocks',
      options: [
        { label: 'Duplicar', action: A('duplicate') },
        { label: 'Explotar', action: I('EXPLOT: bloque separado en primitivas editables.') },
      ],
    },
    {
      id: 'capa', label: 'Capa', icon: 'Layers',
      options: [
        { label: 'Aislar capa', action: G('isolateLayer') },
        { label: 'Ocultar capa', action: G('hideLayer') },
      ],
    },
  ],
  sanitario: [
    {
      id: 'rotar', label: 'Rotar', icon: 'RotateCw',
      options: [
        { label: '90°', action: A('rotate', 90) },
        { label: '-90°', action: A('rotate', -90) },
        { label: '180°', action: A('rotate', 180) },
      ],
    },
    {
      id: 'simetria', label: 'Simetría', icon: 'FlipHorizontal2',
      options: [
        { label: 'Horizontal', action: A('mirror', 'h') },
        { label: 'Vertical', action: A('mirror', 'v') },
      ],
    },
    {
      id: 'material', label: 'Material', icon: 'Palette',
      options: [
        { label: 'Loza blanca', action: A('material', 'marmol') },
        { label: 'Metal', action: A('material', 'metal') },
      ],
    },
    {
      id: 'copiar', label: 'Copiar', icon: 'Copy',
      options: [{ label: 'Duplicar', action: A('duplicate') }],
    },
    {
      id: 'capa', label: 'Capa', icon: 'Layers',
      options: [
        { label: 'Aislar capa', action: G('isolateLayer') },
        { label: 'Ocultar capa', action: G('hideLayer') },
      ],
    },
  ],
  cota: [
    {
      id: 'estilo', label: 'Estilo', icon: 'Settings2',
      options: [
        { label: 'Flecha arquitect.', action: I('Estilo de cota "ARQ-60": flechas oblicuas, texto 2.5 mm, ISO-25.)') },
        { label: 'Texto en ángulo', action: A('rotate', 0) },
        { label: 'Texto horizontal', action: A('rotate', 1) },
      ],
    },
    {
      id: 'precision', label: 'Precisión', icon: 'Hash',
      options: [
        { label: '0 (m)', action: A('precision', 0) },
        { label: '0.0', action: A('precision', 1) },
        { label: '0.00', action: A('precision', 2) },
      ],
    },
    {
      id: 'texto', label: 'Texto', icon: 'Type',
      options: [
        { label: 'Anular texto', action: P('Texto de reemplazo', 'dimOverride') },
        { label: 'Restaurar', action: A('dimOverride', '') },
      ],
    },
    {
      id: 'actualizar', label: 'Actualizar', icon: 'RefreshCw',
      options: [
        { label: 'Recalcular', action: A('dimRefresh') },
        { label: 'Asociar', action: I('Cota asociada geométricamente al muro: se actualiza al mover el objeto.') },
      ],
    },
    {
      id: 'capa', label: 'Capa', icon: 'Layers',
      options: [
        { label: 'Aislar capa', action: G('isolateLayer') },
        { label: 'Ocultar capa', action: G('hideLayer') },
      ],
    },
  ],
  texto: [
    {
      id: 'editar', label: 'Editar', icon: 'Pencil',
      options: [
        { label: 'Contenido', action: P('Nuevo texto', 'rename') },
        { label: 'Copiar texto', action: I('TEXTO copiado al portapapeles del sistema.') },
      ],
    },
    {
      id: 'estilo', label: 'Estilo', icon: 'Type',
      options: [
        { label: 'Altura ×1.3', action: A('textHeight', 26) },
        { label: 'Altura ×0.8', action: A('textHeight', 15) },
        { label: 'Fuente Romans', action: I('Estilo de texto: fuente "Romans", altura 0.20 m, oblicua 15°.') },
      ],
    },
    {
      id: 'justificar', label: 'Justificar', icon: 'AlignLeft',
      options: [
        { label: 'Izquierda', action: A('justify', 'start') },
        { label: 'Centro', action: A('justify', 'middle') },
        { label: 'Derecha', action: A('justify', 'end') },
      ],
    },
    {
      id: 'capa', label: 'Capa', icon: 'Layers',
      options: [
        { label: 'Aislar capa', action: G('isolateLayer') },
        { label: 'Ocultar capa', action: G('hideLayer') },
      ],
    },
  ],
  columna: [
    {
      id: 'editar', label: 'Editar', icon: 'Square',
      options: [
        { label: '0.25×0.25', action: A('size', 25) },
        { label: '0.30×0.30', action: A('size', 30) },
        { label: '0.40×0.40', action: A('size', 40) },
        { label: 'Acero', action: A('material', 'metal') },
      ],
    },
    {
      id: 'copiar', label: 'Copiar', icon: 'Copy',
      options: [
        { label: 'Duplicar', action: A('duplicate') },
        { label: 'Matriz ×3', action: A('duplicateTriple') },
      ],
    },
    {
      id: 'bim', label: 'BIM', icon: 'Boxes',
      options: [{ label: 'Cantidades', action: I('COLUMNA: 0.09 m² · 0.24 m³ · concreto f\'c 210 · acero 4Ø3/4".') }],
    },
    {
      id: 'capa', label: 'Capa', icon: 'Layers',
      options: [
        { label: 'Aislar capa', action: G('isolateLayer') },
        { label: 'Ocultar capa', action: G('hideLayer') },
      ],
    },
  ],
  apertura: [
    {
      id: 'convertir', label: 'Convertir', icon: 'DoorOpen',
      options: [
        { label: 'Puerta simple', action: I('Hueco convertido a puerta simple de 0.90 m con giro a la izquierda.') },
        { label: 'Doble puerta', action: I('Hueco convertido a doble puerta 1.60 m con hojas iguales.') },
        { label: 'Mantener hueco', action: I('Vano libre mantenido: 1.20 m de ancho sin carpintería.') },
      ],
    },
    {
      id: 'ancho', label: 'Ancho', icon: 'MoveHorizontal',
      options: [
        { label: '1.20 m', action: A('scale', 'reset') },
        { label: '1.80 m', action: A('scale', 1.4) },
      ],
    },
  ],
  dibujo: [
    {
      id: 'trazo', label: 'Trazo', icon: 'Palette',
      options: [
        { label: 'Ámbar', action: A('colorLine', 'amber') },
        { label: 'Esmeralda', action: A('colorLine', 'emerald') },
        { label: 'Rosa', action: A('colorLine', 'rose') },
        { label: 'Blanco', action: A('colorLine', 'blanco') },
      ],
    },
    {
      id: 'grosor', label: 'Grosor', icon: 'PenLine',
      options: [
        { label: 'Fino 1', action: A('weight', 1) },
        { label: 'Medio 2', action: A('weight', 2) },
        { label: 'Grueso 3', action: A('weight', 3) },
      ],
    },
    {
      id: 'copiar', label: 'Copiar', icon: 'Copy',
      options: [{ label: 'Duplicar', action: A('duplicate') }],
    },
    {
      id: 'borrar', label: 'Borrar', icon: 'Trash2',
      options: [{ label: 'Eliminar', action: A('delete') }],
    },
  ],
  lamina: [
    {
      id: 'anotar', label: 'Anotar', icon: 'Ruler',
      options: [
        { label: 'Acotación automática', detail: 'Ancho + alto por ambiente (m)', action: G('toggleAutoDims') },
        { label: 'Rotulado de áreas', detail: 'Etiquetas m² en tiempo real', action: G('toggleAreas') },
        { label: 'Exportar PDF a escala', detail: 'Escala real · cartela · A4/A3/A2', action: G('showPdfExport') },
      ],
    },
    {
      id: 'sol', label: 'Sol', icon: 'Sun',
      options: [
        { label: 'Heliodón y sombras', detail: 'Latitud · fecha · hora', action: G('toggleSun') },
        { label: 'Solsticio de verano', action: G('sunSummer') },
        { label: 'Solsticio de invierno', action: G('sunWinter') },
        { label: 'Equinoccio', action: G('sunEquinox') },
        { label: 'Trayectorias solares', action: G('toggleSunPath') },
      ],
    },
    {
      id: 'unidades', label: 'Unidades', icon: 'Ruler',
      options: [
        { label: 'Métrico (m)', action: I('UNIDADES: métrico decimal, precisión 0.00, ángulos decimales grados.') },
        { label: 'Pulgadas', action: I('UNIDADES: arquitectural (pies-pulgadas), precisión 1/16".') },
      ],
    },
    {
      id: 'escala', label: 'Escala', icon: 'Scaling',
      options: [
        { label: '1:50', action: I('ESCALA de lámina 1:50 — cotas y textos reajustados automáticamente.') },
        { label: '1:75', action: I('ESCALA de lámina 1:75 — anotaciones ajustadas al 133%.') },
        { label: '1:100', action: I('ESCALA de lámina 1:100 — anotaciones ajustadas al 200%.') },
      ],
    },
    {
      id: 'rejilla', label: 'Rejilla', icon: 'Grid3x3',
      options: [
        { label: 'Espaciado 1.00', action: A('gridSpacing', 60) },
        { label: 'Espaciado 0.50', action: A('gridSpacing', 30) },
        { label: 'Ocultar', action: G('toggleGrid') },
      ],
    },
    {
      id: 'encuadre', label: 'Encuadre', icon: 'Frame',
      options: [
        { label: 'Ajustar a lámina', action: G('fit') },
        { label: 'Acercar', action: G('zoomIn') },
        { label: 'Alejar', action: G('zoomOut') },
      ],
    },
    {
      id: 'salida', label: 'Salida', icon: 'Printer',
      options: [
        { label: 'Imprimir', action: G('print') },
        { label: 'Exportar PDF a escala', detail: 'Vectorial · cartela · barra de escala', action: G('showPdfExport') },
      ],
    },
  ],
}

// ------------------------------------------------------------
// Paletas de colores / materiales (datos del dibujo)
// ------------------------------------------------------------

export const MATERIAL_COLORS: Record<string, string> = {
  ladrillo: '#b45309',
  concreto: '#6b7280',
  drywall: '#a8a29e',
  bloque: '#78716c',
  madera: '#92400e',
  tela: '#57534e',
  metal: '#52525b',
  marmol: '#e7e5e4',
}

export const ROOM_FILLS: Record<string, string> = {
  amber: 'rgba(245,158,11,0.20)',
  naranja: 'rgba(249,115,22,0.20)',
  emerald: 'rgba(16,185,129,0.20)',
  rose: 'rgba(244,63,94,0.20)',
  violeta: 'rgba(139,92,246,0.20)',
  none: 'transparent',
}

export const LINE_COLORS: Record<string, string> = {
  amber: '#f59e0b',
  emerald: '#10b981',
  rose: '#f43f5e',
  blanco: '#f5f5f4',
}

export const TOTAL_TOOLS = TOOL_CATEGORIES.reduce((n, c) => n + c.tools.length, 0)
