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
  | 'escalera' | 'techo' | 'instalacion' | 'simbolo' | 'terreno' | 'pin'

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
          { label: 'Plano de plantas', detail: 'Plantilla A1 - métrico', action: G('newPlan') },
          { label: 'Lámina en blanco', action: G('newPlan') },
        ],
      },
      {
        id: 'guardar', label: 'Guardar', icon: 'Save', desc: 'Guarda el estado del plano', source: 'AutoCAD',
        options: [
          { label: 'Guardar plano', detail: 'Ctrl+S · versión real en el historial', action: G('saveNow') },
          { label: 'Guardar como copia', detail: 'Copia real en el historial de versiones', action: G('saveCopy') },
        ],
      },
      {
        id: 'exportar', label: 'Exportar', icon: 'FileDown', desc: 'Exporta a PDF a escala, DXF (AutoCAD), PNG o SVG', source: 'AutoCAD / Revit',
        options: [
          { label: 'Exportar PDF a escala', detail: '1:50 · 1:75 · 1:100 · cartela y papel A4/A3/A2', action: G('showPdfExport') },
          { label: 'Exportar DXF (AutoCAD)', detail: 'Capas conservadas · unidades en metros', action: G('exportDxf') },
          { label: 'Exportar PNG del plano', detail: 'Imagen rápida para WhatsApp/presentaciones', action: G('exportPng') },
          { label: 'Exportar SVG vectorial', detail: 'Editable en Illustrator/Inkscape', action: G('exportSvg') },
        ],
      },
      {
        id: 'compartir', label: 'Compartir', icon: 'Share2', desc: 'Comparte el plano como archivo .jarumy.json o revierte a una versión guardada', source: 'Jarumy',
        options: [
          { label: 'Compartir plano (.json)', detail: 'Exporta el archivo para enviarlo a un colega', action: G('showShare') },
          { label: 'Importar plano (.json)', detail: 'Restaura un plano compartido', action: G('showShare') },
          { label: 'Historial de versiones', detail: 'Guardar y recuperar snapshots', action: G('showVersions') },
        ],
      },
      {
        id: 'imprimir', label: 'Imprimir', icon: 'Printer', desc: 'Trazado de lámina', source: 'AutoCAD',
        options: [
          { label: 'Imprimir lámina', detail: 'Ctrl+P', action: G('print') },
          { label: 'PDF a escala', detail: 'Vectorial con cartela y barra de escala', action: G('showPdfExport') },
          { label: 'Trazado por lotes', detail: '3 láminas en cola → PDF vectorial', action: G('batchPlot') },
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
          { label: 'Grosor de línea', detail: '0.00 / 0.30 / 0.60 mm', action: P('Grosor de línea en mm (0 – 2):', 'weight', '0.6') },
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
        id: 'arco', label: 'Arco', icon: 'Spline', desc: 'ARCO por 3 puntos (AutoCAD: A) — inicio · punto del arco · fin', source: 'AutoCAD',
        options: [
          { label: 'Dibujar arco', detail: 'Clic: inicio · punto del arco · fin', action: D('arco') },
          { label: 'Arco de muro curvo', detail: 'Trazar también como eje de muro (use SPLINE para curvas largas)', action: D('arco') },
        ],
      },
      {
        id: 'rectangulo', label: 'Rectángulo', icon: 'Square', desc: 'RECTANGULO: dos esquinas opuestas (AutoCAD: REC)', source: 'AutoCAD',
        options: [
          { label: 'Dibujar rectángulo', detail: 'Clic: esquina 1 → esquina 2', action: D('rectangulo') },
          { label: 'Con chaflán', detail: 'Aplica chaflán 0.10 m al rectángulo seleccionado', action: A('chamferRect', 0.1) },
        ],
      },
      {
        id: 'spline', label: 'Spline', icon: 'TrendingUp', desc: 'SPLINE: curva suave por puntos de control (Rhino: Curva) — Catmull-Rom G2', source: 'AutoCAD / Rhino',
        options: [
          { label: 'Trazar spline', detail: 'Clics por donde pasa la curva · ENTER cierra', action: D('spline') },
        ],
      },
      {
        id: 'elipse', label: 'Elipse', icon: 'CircleDashed', desc: 'ELIPSE: centro + ejes mayor y menor (AutoCAD: EL)', source: 'AutoCAD',
        options: [{ label: 'Dibujar elipse', detail: 'Clic: centro · vértice del eje', action: D('elipse') }],
      },
      {
        id: 'punto', label: 'Punto', icon: 'Dot', desc: 'PUNTO: marcador de coordenada con cruz (AutoCAD: PO)', source: 'AutoCAD',
        options: [{ label: 'Colocar punto', detail: 'Clic único · cruz de referencia', action: D('punto') }],
      },
      {
        id: 'sombreado', label: 'Hachurado', icon: 'Grid2x2', desc: 'HATCH: rellena regiones con patrones CAD (AutoCAD: H)', source: 'AutoCAD',
        options: [
          { label: 'ANSI31 · hormigón', detail: 'Diagonal 45° — losas y estructuras', action: D('hatch') },
          { label: 'AR-B816 · ladrillo', detail: 'Aparejo de soga 0.25×0.08 m — albañilería', action: D('hatch') },
          { label: 'GRAVEL · tierra', detail: 'Gravilla para exteriores y jardines', action: D('hatch') },
          { label: 'AR-CONC · mosaico', detail: 'Cuadrícula 0.30×0.30 m — baños y cocinas', action: D('hatch') },
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
          { label: 'Desplazamiento exacto', detail: '@dx,dy en metros', action: P('Desplazamiento dx,dy en m (ej. 1.50,0.00):', 'translateM', '1.50,0.00') },
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
          { label: 'Ángulo exacto', detail: 'GIRA por valor', action: P('Ángulo de giro en grados:', 'rotate', '45') },
        ],
      },
      {
        id: 'escalar', label: 'Escalar', icon: 'Maximize2', desc: 'ESCALA: cambia tamaño (AutoCAD: SC)', source: 'AutoCAD',
        options: [
          { label: 'Agrandar ×1.15', action: A('scale', 1.15) },
          { label: 'Reducir ×0.87', action: A('scale', 0.87) },
          { label: 'Restaurar tamaño', action: A('scale', 'reset') },
          { label: 'Factor exacto', detail: '0.5 – 2.2', action: P('Factor de escala:', 'scale', '1.5') },
        ],
      },
      {
        id: 'simetria', label: 'Simetría', icon: 'FlipHorizontal2', desc: 'SIMETRIA: refleja objetos (AutoCAD: MI)', source: 'AutoCAD',
        options: [
          { label: 'Eje horizontal', action: A('mirror', 'h') },
          { label: 'Eje vertical', action: A('mirror', 'v') },
          { label: 'Borrar originales', detail: 'Especifica eje x/y y posición', action: P('Eje de simetría (x,7.50 o y,3.00):', 'mirrorErase', 'x,7.50') },
        ],
      },
      {
        id: 'equidistancia', label: 'Equidistancia', icon: 'MoveHorizontal', desc: 'EQUISDIST: offset paralelo real sobre líneas y polilíneas (AutoCAD: O)', source: 'AutoCAD',
        options: [
          { label: 'Engrosar muro', detail: 'Offset físico del cuerpo del muro', action: A('thicken', 4) },
          { label: 'Adelgazar muro', action: A('thicken', -4) },
          { label: 'Offset 0.15 m', detail: 'Eje de muro doble / juntas de dilatación', action: A('offset', 0.15) },
          { label: 'Offset 0.60 m', detail: 'Distancia de mobiliario a muro', action: A('offset', 0.6) },
          { label: 'Distancia exacta', action: P('EQUISDIST — distancia en metros:', 'offset', '0.15') },
        ],
      },
      {
        id: 'recortar', label: 'Recortar', icon: 'Scissors', desc: 'RECORTA: corta líneas en intersecciones reales (AutoCAD: TR)', source: 'AutoCAD',
        options: [
          { label: 'Acortar extremo A', action: A('shortenA') },
          { label: 'Acortar extremo B', action: A('shortenB') },
          { label: 'Recorte en intersección', detail: 'Clic: línea → tramo a eliminar (corta en el borde que cruza)', action: D('recorta') },
        ],
      },
      {
        id: 'alargar', label: 'Alargar', icon: 'Expand', desc: 'ALARGA: extiende líneas hasta un borde real (AutoCAD: EX)', source: 'AutoCAD',
        options: [
          { label: 'Alargar extremo A', action: A('extendA') },
          { label: 'Alargar extremo B', action: A('extendB') },
          { label: 'Extender hasta borde', detail: 'Clic: línea a extender → elemento límite', action: D('alarga') },
        ],
      },
      {
        id: 'empalme', label: 'Empalme', icon: 'Spline', desc: 'EMPALME: une muros en intersección (AutoCAD: F)', source: 'AutoCAD',
        options: [
          { label: 'Radio 0 (unir T/L)', detail: 'Extremos extendidos hasta el eje común', action: G('cleanJoins') },
          { label: 'Radio 0.15 m', detail: 'Arco real de empalme entre muros', action: A('fillet', 0.15) },
          { label: 'Achaflanado 0.10', detail: 'Corte recto en la esquina', action: A('chamfer', 0.1) },
        ],
      },
      {
        id: 'matriz', label: 'Matriz', icon: 'LayoutGrid', desc: 'MATRIZ: copias múltiples rectangulares y polares (AutoCAD: AR)', source: 'AutoCAD',
        options: [
          { label: 'Rectangular 3×1', detail: '3 copias alineadas', action: A('duplicateTriple') },
          { label: 'Rectangular exacta…', detail: 'Columnas, filas y separación en m', action: P('MATRIZ RECTANGULAR — columnas,filas,sepX m,sepY m:', 'arrayRect', '3,2,2.00,2.00') },
          { label: 'Polar / circular…', detail: 'N elementos alrededor del centro', action: P('MATRIZ POLAR — cantidad,ángulo total (°):', 'arrayPolar', '6,360') },
          { label: 'Por trayecto', detail: '6 copias sobre una polilínea — 2 clics', action: D('matriztrayecto:6') },
        ],
      },
      {
        id: 'estirar', label: 'Estirar', icon: 'StretchHorizontal', desc: 'ESTIRA: deformación por cruces (AutoCAD: S)', source: 'AutoCAD',
        options: [{ label: 'Ventana de cruces', detail: 'ESTIRA real: 1er clic centra la ventana, 2º define el estiramiento', action: D('estira') }],
      },
      {
        id: 'descomponer', label: 'Descomponer', icon: 'Ungroup', desc: 'EXPLOT: separa polilíneas y rectángulos en líneas (AutoCAD: X)', source: 'AutoCAD',
        options: [
          { label: 'Explotar polilínea', detail: 'Separa en segmentos de línea editables', action: A('explode') },
          { label: 'Explotar rectángulo', detail: '4 líneas independientes', action: A('explode') },
        ],
      },
      {
        id: 'matchprop', label: 'Igualar propiedades', icon: 'Paintbrush', desc: 'MATCHPROP: copia propiedades (AutoCAD: MA)', source: 'AutoCAD',
        options: [
          { label: 'Aplicar a todos los iguales', action: A('matchAll') },
          { label: 'Solo capa', detail: 'Copia la capa a los elementos del mismo tipo', action: A('matchLayer') },
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
        id: 'cota-alineada', label: 'Cota alineada', icon: 'Ruler', desc: 'ACOTALIN: distancia entre dos puntos (AutoCAD: DAL)', source: 'AutoCAD',
        options: [{ label: 'Dibujar cota', detail: 'Clic: punto 1 → punto 2 · en m', action: D('cota') }],
      },
      {
        id: 'cota-angular', label: 'Cota angular', icon: 'Compass', desc: 'ACOTANG: ángulo entre dos direcciones (AutoCAD: DAN)', source: 'AutoCAD',
        options: [{ label: 'Dibujar cota angular', detail: 'Clic: vértice · lado 1 · lado 2 · en °', action: D('cota-ang') }],
      },
      {
        id: 'cota-radio', label: 'Radio / Diámetro', icon: 'CircleDot', desc: 'ACOTRAD: radio con directriz al centro (AutoCAD: DRA)', source: 'AutoCAD',
        options: [{ label: 'Dibujar cota de radio', detail: 'Clic: centro · borde · R en m', action: D('cota-rad') }],
      },
      {
        id: 'texto', label: 'Texto', icon: 'Type', desc: 'TEXTO: línea de texto (AutoCAD: T / DT)', source: 'AutoCAD',
        options: [
          { label: 'Insertar texto', detail: 'Clic en el punto de inserción', action: D('texto') },
          { label: 'Altura 0.20 m', action: A('textHeight', 22) },
          { label: 'Estilo arquitectural', detail: 'Fuente serif aplicada a los textos', action: G('textStyleArq') },
        ],
      },
      {
        id: 'directriz', label: 'Directriz', icon: 'CornerDownRight', desc: 'DIRECTRIZ: flecha + texto de especificación (AutoCAD: LE)', source: 'AutoCAD',
        options: [{ label: 'Insertar directriz', detail: 'Clic: flecha · destino · escribe el rótulo', action: D('directriz') }],
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
        id: 'nube', label: 'Nube de revisión', icon: 'Cloud', desc: 'NUBE DE CONTROL: marca revisiones con festones (AutoCAD: REVCLOUD)', source: 'AutoCAD',
        options: [
          { label: 'Marcar revisión', detail: 'Clics alrededor · ENTER cierra la nube', action: D('nube') },
          { label: 'Nube en rectángulo', detail: 'Trazar 4 esquinas con la misma herramienta', action: D('nube') },
        ],
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
        id: 'muro', label: 'Muro', icon: 'BrickWall', desc: 'Muros inteligentes multicapa con espesor real y material (ACA / Revit / ArchiCAD)', source: 'AutoCAD Arch / Revit',
        options: [
          { label: 'Multicapa: Ladrillo 140', detail: 't = 0.14 m · aparejo a soga', action: A('wallType', 'l140') },
          { label: 'Multicapa: Ladrillo 230', detail: 't = 0.23 m · portante', action: A('wallType', 'l230') },
          { label: 'Multicapa: Concreto 175', detail: 't = 0.175 m · armado', action: A('wallType', 'c175') },
          { label: 'Multicapa: Drywall 100', detail: 't = 0.10 m · metálico', action: A('wallType', 'dw100') },
          { label: 'Uniones T/L limpias', detail: 'Extiende muros hasta el eje en esquinas', action: G('cleanJoins') },
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
          { label: 'Antepecho 0.90 m', detail: 'Parámetro BIM real de la ventana', action: A('sill', 0.9) },
        ],
      },
      {
        id: 'escalera', label: 'Escalera', icon: 'ArrowUpNarrowWide', desc: 'Escalera paramétrica por reglamento: contrahuella ≤ 17.5 cm (RNE)', source: 'AutoCAD Arch / Revit',
        options: [{ label: 'Diseñar escalera…', detail: 'Altura a vencer → pasos y huella (Blondel)', action: G('showStairDialog') }],
      },
      {
        id: 'losa', label: 'Losa / Techo', icon: 'Layers', desc: 'Techos paramétricos con pendiente y aguas + losa aligerada', source: 'Revit / ArchiCAD',
        options: [
          { label: 'Diseñar techo…', detail: 'A dos aguas / cuatro aguas / plano con %', action: G('showRoofDialog') },
          { label: 'Losa aligerada e=0.20', detail: 'Viguetas cada 0.40 · f\'c 210 (metrados reales)', action: A('slabType', 'aligerada') },
        ],
      },
      {
        id: 'terreno', label: 'Terreno', icon: 'Mountain', desc: 'Lote con colindancias y curvas de nivel (plano de ubicación)', source: 'AutoCAD Civil / Revit Site',
        options: [
          { label: 'Trazar lote', detail: 'Polígono con área y perímetro automáticos', action: D('terreno') },
          { label: 'Curva de nivel', detail: 'Polilínea con cota de elevación', action: D('curvanivel') },
        ],
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
        options: [{ label: 'Editor de bloques', detail: 'Parámetros en vivo: giro · escala · volteo', action: G('showBlockEditor') }],
      },
    ],
  },
  {
    id: 'instalaciones',
    label: 'Instalaciones',
    icon: 'PlugZap',
    color: '#38bdf8',
    tools: [
      {
        id: 'agua', label: 'Agua', icon: 'Droplets', desc: 'Tubería de agua fría/caliente con trazo azul (ISP)', source: 'AutoCAD MEP / Revit MEP',
        options: [
          { label: 'Trazar tubería Ø1/2"', detail: 'Polilínea azul · ENTER para terminar', action: D('tuberia-agua') },
          { label: 'Tubería Ø3/4"', detail: 'Alimentación principal', action: D('tuberia-agua') },
        ],
      },
      {
        id: 'desague', label: 'Desagüe', icon: 'Waves', desc: 'Colectores de desagüe con pendiente (ISP)', source: 'AutoCAD MEP / Revit MEP',
        options: [
          { label: 'Trazar colector Ø2"', detail: 'Polilínea marrón discontinua · ENTER para terminar', action: D('tuberia-desague') },
          { label: 'Colector Ø4"', detail: 'Red pública', action: D('tuberia-desague') },
        ],
      },
      {
        id: 'electrico', label: 'Eléctrico', icon: 'Zap', desc: 'Circuitos eléctricos con trazo rojo (Código Nacional)', source: 'AutoCAD MEP / Revit MEP',
        options: [
          { label: 'Trazar circuito Ø2.5mm²', detail: 'Polilínea roja · ENTER para terminar', action: D('circuito') },
          { label: 'Circuito 2×2.5mm²', detail: 'Línea de fuerza', action: D('circuito') },
        ],
      },
      {
        id: 'simbolos', label: 'Símbolos', icon: 'Lightbulb', desc: 'Símbolos normalizados de instalación (luz, tomacorrientes, tablero, puntos)', source: 'Norma ISP / IEC',
        options: [
          { label: 'Luminaria', detail: 'Símbolo de iluminación', action: D('simbolo:luz') },
          { label: 'Tomacorriente', detail: 'Toma bipolar + tierra', action: D('simbolo:tomacorriente') },
          { label: 'Interruptor', detail: 'De luz simple', action: D('simbolo:interruptor') },
          { label: 'Tablero eléctrico', detail: 'Gabinete TB', action: D('simbolo:tablero') },
          { label: 'Punto de agua', detail: 'Salida de agua fría', action: D('simbolo:punto-agua') },
          { label: 'Punto de desagüe', detail: 'Sumidero/registro', action: D('simbolo:punto-desague') },
          { label: 'Medidor de agua', detail: 'Medidor de la red pública', action: D('simbolo:medidor-agua') },
        ],
      },
      {
        id: 'isometrico', label: 'Isométrico', icon: 'Axis3d', desc: 'Vista isométrica de instalaciones (Revit MEP)', source: 'Revit MEP',
        options: [{ label: 'Ver isométrico 3D', detail: 'Con tuberías en el modelo', action: G('showIso3D') }],
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
          { label: 'Cuadro de muros', detail: 'Longitud · espesor · área · volumen reales', action: G('showScheduleMuros') },
          { label: 'Cuadro de puertas', detail: 'Ancho · alto · tipo · área reales', action: G('showSchedulePuertas') },
        ],
      },
      {
        id: 'colisiones', label: 'Detección de colisiones', icon: 'AlertTriangle', desc: 'Clash Detection entre disciplinas (Navisworks / Revit)', source: 'Revit / Navisworks',
        options: [
          { label: 'Ejecutar revisión', action: G('clashCheck') },
          { label: 'Configurar reglas', detail: 'Tolerancia ajustable en cm · reglas muro-MEP', action: G('clashCheck') },
        ],
      },
      {
        id: 'energia', label: 'Análisis energético', icon: 'Zap', desc: 'Simulación térmica y LEED (Revit / Insight)', source: 'Revit / Insight',
        options: [{ label: 'Generar reporte', action: G('energyReport') }],
      },
      {
        id: 'fases', label: 'Fases', icon: 'History', desc: 'Fases BIM reales: existente (gris) · demolición (rojo punteado) · nueva — con filtro de vista (Revit: Phases)', source: 'Revit',
        options: [
          { label: 'Panel de fases…', detail: 'Asignar a selección · conteos · filtro', action: G('showPhases') },
          { label: 'Marcar selección: Demolición', detail: 'Rojo punteado + aspas', action: A('phase', 'demolicion') },
          { label: 'Marcar selección: Existente', detail: 'Gris tenue', action: A('phase', 'existente') },
          { label: 'Marcar selección: Nueva', detail: 'Trazo normal', action: A('phase', 'nueva') },
        ],
      },
      {
        id: 'colaboracion', label: 'Colaboración', icon: 'Users', desc: 'Worksharing multiusuario (Revit / BIM360)', source: 'Revit',
        options: [{ label: 'Estado del central', detail: 'Sesión real: elementos por disciplina · ediciones · versiones', action: G('showCollab') }],
      },
      {
        id: 'familias', label: 'Familias / Objetos', icon: 'Component', desc: 'Familias paramétricas (Revit) / Objetos GDL (ArchiCAD)', source: 'Revit / ArchiCAD',
        options: [{ label: 'Explorador de familias', detail: 'Biblioteca real con conteos en vivo e inserción', action: G('showFamilias') }],
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
          { label: 'Calidad: borrador', detail: 'GI básico — vista rápida', action: G('renderDraft') },
          { label: 'Calidad: ultra', detail: 'Sombras multicapa + texturas afinadas', action: G('renderUltra') },
        ],
      },
      {
        id: 'vista3d', label: 'Vista 3D', icon: 'Box', desc: 'Axonometría interactiva con órbita (SketchUp / Rhino)', source: 'SketchUp / Rhino',
        options: [
          { label: 'Vista 3D interactiva…', detail: 'Órbita con sliders · extrusión de muros y techos', action: G('showIso3D') },
          { label: 'Activar/Desactivar 3D', action: G('toggle3D') },
          { label: 'Isométrica 30°', action: G('toggle3D') },
        ],
      },
      {
        id: 'elevaciones', label: 'Elevaciones', icon: 'Landmark', desc: 'Cortes y elevaciones automáticos derivados del modelo (Revit / ArchiCAD)', source: 'Revit / ArchiCAD',
        options: [
          { label: 'Generar elevaciones…', detail: 'N/S/E/O + sección transversal con corte', action: G('showElevations') },
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
        id: 'normativa', label: 'Normativa RNE', icon: 'Scale', desc: 'Verificación automática A.010 (accesibilidad/higiene) y A.130 (evacuación) con marcas en el plano', source: 'RNE Perú',
        options: [
          { label: 'Verificar normativa…', detail: 'A.010 + A.130 + A.040 · luces OK/fallo', action: G('showNormativa') },
        ],
      },
      {
        id: 'metrados', label: 'Metrados S10', icon: 'Calculator', desc: 'Presupuesto de obra por partidas con exportación Excel (S10)', source: 'S10 Perú',
        options: [
          { label: 'Metrados y presupuesto…', detail: 'Partidas · unidades · P.U. editable · .xls', action: G('showMetrados') },
        ],
      },
      {
        id: 'iluminacion', label: 'Iluminación', icon: 'Lightbulb', desc: 'Cálculo real de lux por ambiente (método de los lúmenes · EN 12464-1 · Dialux)', source: 'Dialux',
        options: [
          { label: 'Niveles de iluminación…', detail: 'Lux requeridos · Nº de luminarias · W/m²', action: G('showLighting') },
          { label: 'Colocar luminaria', detail: 'Símbolo de luz en el plano', action: D('simbolo:luz') },
        ],
      },
      {
        id: 'energia-a', label: 'Energía', icon: 'Zap', desc: 'Demanda energética y U-values', source: 'Insight / Ladybug',
        options: [{ label: 'Reporte energético', action: G('energyReport') }],
      },
      {
        id: 'estructural', label: 'Estructural', icon: 'Landmark', desc: 'Verificación de cargas (ETABS / Robot)', source: 'ETABS / Robot',
        options: [{ label: 'Cargas y reacciones', detail: 'D · L · W · V (E.030) · columnas · deriva — desde la geometría real', action: G('structuralReport') }],
      },
      {
        id: 'acustica', label: 'Acústica', icon: 'AudioWaveform', desc: 'Aislamiento Rw por tipo de muro con verificación de dormitorios (ISO 12354 simplificado)', source: 'Plugins',
        options: [
          { label: 'Aislamiento de muros…', detail: 'Rw estimado · cumple/no cumple ≥ 45 dB', action: G('showAcoustic') },
        ],
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
        id: 'quickselect', label: 'Quick Select', icon: 'MousePointerClick', desc: 'Selección por filtros de tipo, capa y fase (AutoCAD: QSE)', source: 'AutoCAD',
        options: [
          { label: 'Filtro de selección…', detail: 'Tipo + capa + fase → lista clicable', action: G('showQuickSelect') },
          { label: 'Aislar capa de selección', detail: 'Oculta las demás capas', action: G('isolateLayer') },
        ],
      },
      {
        id: 'comentarios', label: 'Pines de comentarios', icon: 'MessageSquare', desc: 'Revisión de planos con pines numerados (BIM 360 / Bluebeam)', source: 'BIM 360',
        options: [
          { label: 'Colocar pin de comentario', detail: 'Clic en el plano · texto + autor', action: D('pin') },
        ],
      },
      {
        id: 'layer-states', label: 'Layer States', icon: 'Save', desc: 'Estados de capa guardados y preajustes reales', source: 'AutoCAD',
        options: [
          { label: 'Estado "Revisión"', detail: 'Mobiliario/MEP apagado · cotas y comentarios encendidos', action: G('layerStateRevision') },
          { label: 'Guardar estado actual', detail: 'Guarda la visibilidad real de las 13 capas', action: G('layerStateSave') },
        ],
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
        { label: 'Altura 2.70', detail: 'Parámetro BIM real (cantidades/estructural)', action: A('wallHeight', 2.7) },
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
        { label: 'Empalme R0', detail: 'Limpia la unión T/L más próxima', action: G('cleanJoins') },
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
        { label: 'Cantidades', detail: 'Área · volumen · ladrillo · mortero reales', action: A('qtyReport') },
        { label: 'Colisiones', action: G('clashCheck') },
        { label: 'Fase', detail: 'Asigna fase Nueva construcción', action: A('phase', 'nueva') },
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
        { label: 'Altura 2.10', detail: 'Parámetro BIM real (cuadros y metrados)', action: A('doorHeight', 2.1) },
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
        { label: 'Corrediza', detail: 'Dos paneles sobre riel — cambia el dibujo en planta', action: A('doorKind', 'corrediza') },
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
        { label: 'Cantidades', detail: 'Área · herrajes · marco reales', action: A('qtyReport') },
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
        { label: 'Antepecho 0.90', detail: 'Parámetro BIM real de la ventana', action: A('sill', 0.9) },
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
        { label: 'Cantidades', detail: 'Área · vidrio · perfil reales', action: A('qtyReport') },
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
        { label: 'Uso: sala', detail: 'Estar/convivencia · 6 ocupantes (RNE A.010)', action: A('usage', 'estar') },
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
        { label: 'Calcular área', detail: 'Ancho × alto medidos del elemento', action: A('roomCalc', 'area') },
        { label: 'Perímetro', detail: '2 × (ancho + alto) real', action: A('roomCalc', 'perim') },
        { label: 'Volumen', detail: 'Área × altura de muro BIM', action: A('roomCalc', 'vol') },
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
        { label: 'Iluminación', detail: 'LUX por ambiente (método de lúmenes)', action: G('showLighting') },
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
        { label: 'Explotar', detail: 'Separa el bloque en 4 líneas editables', action: A('explode') },
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
        { label: 'Flecha arquitect.', detail: 'Estilo ARQ-60: marcas oblicuas 45°', action: G('dimStyleArq') },
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
        { label: 'Asociar', detail: 'Recalcula el valor desde la geometría', action: A('dimRefresh') },
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
        { label: 'Copiar texto', detail: 'Copia REAL al portapapeles', action: A('copyText') },
      ],
    },
    {
      id: 'estilo', label: 'Estilo', icon: 'Type',
      options: [
        { label: 'Altura ×1.3', action: A('textHeight', 26) },
        { label: 'Altura ×0.8', action: A('textHeight', 15) },
        { label: 'Fuente Romans', detail: 'Serif con oblicua 15° — aplicado en vivo', action: G('textStyleRomans') },
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
      options: [{ label: 'Cantidades', detail: 'Concreto · acero · encofrado reales', action: A('qtyReport') }],
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
        { label: 'Puerta simple', detail: 'Convierte el vano en puerta con giro', action: A('convertDoor', 'simple') },
        { label: 'Doble puerta', detail: 'Dos hojas iguales con giro opuesto', action: A('convertDoor', 'doble') },
        { label: 'Mantener hueco', detail: 'Vano libre sin carpintería', action: A('convertDoor', 'hueco') },
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
      id: 'editar', label: 'Editar', icon: 'Wrench',
      options: [
        { label: 'Matriz 3×2…', detail: 'Copias múltiples con separación', action: P('MATRIZ RECTANGULAR — columnas,filas,sepX m,sepY m:', 'arrayRect', '3,2,2.00,2.00') },
        { label: 'Matriz polar…', detail: 'Copias alrededor del centro', action: P('MATRIZ POLAR — cantidad,ángulo total (°):', 'arrayPolar', '6,360') },
        { label: 'Equisdist 0.15 m', detail: 'Offset paralelo real', action: A('offset', 0.15) },
        { label: 'Explotar', detail: 'Separar en líneas', action: A('explode') },
      ],
    },
    {
      id: 'fase', label: 'Fase', icon: 'History',
      options: [
        { label: 'Demolición', detail: 'Rojo punteado + aspas', action: A('phase', 'demolicion') },
        { label: 'Existente', detail: 'Gris tenue', action: A('phase', 'existente') },
        { label: 'Nueva', detail: 'Trazo normal', action: A('phase', 'nueva') },
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
        { label: 'Métrico (m)', detail: 'Cotas en metros — aplicado en vivo', action: G('unitsMetric') },
        { label: 'Pulgadas', detail: 'Cotas en pies-pulgadas — aplicado en vivo', action: G('unitsImperial') },
      ],
    },
    {
      id: 'escala', label: 'Escala', icon: 'Scaling',
      options: [
        { label: '1:50', detail: 'Anotaciones reajustadas al 67%', action: G('scale50') },
        { label: '1:75', detail: 'Escala base de la lámina', action: G('scale75') },
        { label: '1:100', detail: 'Anotaciones reajustadas al 133%', action: G('scale100') },
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

  // ---------- nuevos elementos paramétricos / MEP / terreno ----------

  escalera: [
    {
      id: 'editar', label: 'Editar', icon: 'Wrench',
      options: [
        { label: 'Rediseñar…', detail: 'Vuelve al diálogo paramétrico', action: G('showStairDialog') },
        { label: 'Rotar 90°', action: A('rotate', 90) },
        { label: 'Duplicar', action: A('duplicate') },
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
  techo: [
    {
      id: 'editar', label: 'Editar', icon: 'Wrench',
      options: [
        { label: 'Rediseñar…', detail: 'Vuelve al diálogo paramétrico', action: G('showRoofDialog') },
        { label: 'Rotar 90°', action: A('rotate', 90) },
        { label: 'Duplicar', action: A('duplicate') },
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
  instalacion: [
    {
      id: 'diametro', label: 'Diámetro', icon: 'CircleDot',
      options: [
        { label: 'Ø 1/2"', detail: '15 mm', action: A('scale', 1) },
        { label: 'Ø 3/4"', detail: '20 mm — cambia el trazo en vivo', action: A('pipeDia', 20) },
        { label: 'Ø 2"', detail: '50 mm desagüe con pendiente 1.5%', action: A('pipeDia', 50) },
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
  simbolo: [
    {
      id: 'editar', label: 'Editar', icon: 'Wrench',
      options: [
        { label: 'Rotar 90°', action: A('rotate', 90) },
        { label: 'Duplicar', action: A('duplicate') },
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
  terreno: [
    {
      id: 'datos', label: 'Datos', icon: 'Mountain',
      options: [
        { label: 'Renombrar', action: P('Nuevo nombre del lote', 'rename') },
        { label: 'Elevación de curva', action: P('Cota de elevación (m)', 'rename') },
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
  pin: [
    {
      id: 'estado', label: 'Estado', icon: 'Check',
      options: [
        { label: 'Marcar resuelto', detail: 'Pin en verde', action: A('resolvePin') },
        { label: 'Reabrir', detail: 'Vuelve a pendiente', action: A('reopenPin') },
      ],
    },
    {
      id: 'texto', label: 'Texto', icon: 'Type',
      options: [{ label: 'Editar comentario', action: P('Nuevo texto del comentario', 'rename') }],
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
