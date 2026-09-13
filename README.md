<div align="center">

# 🏛️ Jarumy app

**Suite de diseño arquitectónico CAD en la web** — con menú radial contextual interactivo y panel de administración completo.

`Next.js 16` · `React 19` · `TypeScript` · `Tailwind CSS 4` · `Prisma + PostgreSQL (Neon)` · `Framer Motion`

🌐 **Demo en vivo:** https://jarumy-app-dusky.vercel.app · 📦 **Repositorio:** https://github.com/marcoskoo/jarumy-app

</div>

---

## 📖 Descripción

**Jarumy app** es una aplicación web de diseño arquitectónico inspirada en las suites profesionales de CAD y BIM (AutoCAD, Revit, ArchiCAD, SketchUp, Rhino, Vectorworks, Lumion, Enscape, V-Ray, Corona y D5 Render). Recopila **97 herramientas** de las mejores aplicaciones de arquitectura en su versión PRO y las unifica en una sola interfaz web moderna: CAD interactivo con OSNAP y multi-selección, planos en la nube con colaboración en vivo, IA generativa, analítica RNE completa y PWA offline.

Su característica distintiva es el **menú radial contextual**: al colocar el cursor sobre cualquier elemento del plano (muro, puerta, ventana, espacio, mobiliario, sanitario, cota, columna…), aparece un **círculo de herramientas** específicas para ese elemento; al escoger una, se despliegan **todas sus opciones** (rotar, cambiar material, espesor, sombreado, giro de puerta, etc.).

---

## ✨ Características principales

### 🎯 Menú radial contextual (hover)
- Círculo animado con **6 herramientas contextuales** + hub central que identifica el tipo de elemento
- Panel de subopciones por herramienta con efectos **reales sobre el plano**
- Contextos: muro, puerta, ventana, espacio, mobiliario, sanitario, cota, texto, columna, vano, modo dibujo y lámina

### 📐 Plano arquitectónico interactivo
- Vivienda de 15×10 m renderizada en SVG: **23 muros**, 5 puertas con arcos de giro, 8 ventanas, 6 espacios con áreas, 26 mobiliarios/sanitarios, 6 columnas, 6 cotas, vanos, rejilla de 1 m, rosa de los vientos, escala gráfica y cajetín
- **Zoom a cursor** con rueda, paneo por arrastre, ajuste inicial automático (fit)
- **Snap**, **Orto** y **OSNAP real** (F3): imanes a extremo, punto medio, centro, cuadrante e intersección con glifos AutoCAD en vivo
- **Multi-selección**: ventana (marquee), Ctrl+clic, Seleccionar todo y edición grupal (mover/rotar/borrar/pegar conjuntos)
- **Drag-and-drop** de elementos, **grips** editables en vértices de muros/dibujos/ventanas y **menú contextual de clic derecho**
- **Atajos de teclado**: Ctrl+Z/Y/S/P/C/X/V/A, Supr, flechas (nudge) y F3/F8/F9
- Prompt in-app elegante (adiós `window.prompt`) en todos los flujos de entrada

### ☁️ Nube, colaboración y IA
- **Planos en la nube** por usuario (Prisma + PostgreSQL): guardar/abrir/eliminar, **versionado en BD** (máx. 20) y papelera
- **Enlaces para compartir** con permiso de vista o edición (`?plano=token`) — el receptor abre en su navegador
- **Sesión colaborativa en vivo** (socket.io): sincronización del plano a ~0.7 s, presencia y chat de sesión
- **IA generativa**: plantas esquemáticas desde texto (muros, espacios RNE, puertas y ventanas reales)
- **Revisor IA de normativa**: interpreta los checks RNE del plano y propone correcciones dimensionadas
- **Comandos de voz** (Web Speech API, es-PE) sobre la consola

### 📥 Importación y exportación total
- **Importar DXF R12+** (líneas, círculos, arcos, textos, polilíneas) con detección de unidades y re-encuadre
- **Underlay de referencia**: imagen PNG/JPG o 1ª página de PDF rasterizada — calque encima con opacidad ajustable
- Exporta **PDF a escala**, **DXF**, **IFC4 (BIM)**, **OBJ/STL (3D)**, **PNG/SVG**, **Excel BIM/S10** y **.jarumy.json**

### 🏃 3D y análisis extendidos
- **Walkthrough en 1ª persona** (WASD + perspectiva real a 1.60 m con colisión de muros) y axonometría orbital
- **Térmica RNE E.020**: transmitancia U por zona climática + riesgo de condensación (Glaser)
- **Accesibilidad** (A.010/A.050), **evacuación A.130** (rutas, aforo, anchos de salida) y **potencial fotovoltaico** (kWp, kWh/año, payback)

### 🖊️ Dibujo real
- Línea, polilínea, rectángulo, círculo, texto, cota, mover, copiar, borrar e inserción de bloques
- **Deshacer / Rehacer** completo
- Consola de comandos estilo AutoCAD: `L`, `C`, `REC`, `TXT`, `CO`, `M`, `ROT`, `DEL`, `U`, `REDO`, `RENDER`, `3D`, `RECORRIDO`, `PURGA`, `AYUDA`…

### 🧰 97 herramientas PRO recopiladas
Organizadas en **11 pestañas de cinta** (ribbon estilo AutoCAD):
Inicio (13) · Dibujo (9) · Modificación (15) · Anotación (10) · Arquitectura (9) · Bloques (6) · Instalaciones (5) · BIM (6) · Visualización (6) · Análisis (11) · Productividad (8)

### 🏢 BIM y análisis
- Cuadro de espacios en vivo con áreas
- **Análisis energético** y **detección de colisiones**
- **Vista 3D axonométrica** y **modo render** (filtros cálidos + sombras)

### 🛠️ Paneles profesionales
- Panel de **capas** funcional, **biblioteca de bloques**, panel de **propiedades**
- Barra de estado con toggles (snap, orto, rejilla, peso de línea)

---

## 🔐 Panel de Administración

Acceso del administrador (sin credenciales fijas):

```
Usuario:            J. Burga
Contraseña inicial: se imprime en el registro del servidor al primer
                    arranque — o defínela con la variable
                    JARUMY_ADMIN_PASSWORD
```

Cámbiela desde *Cuenta y clave* y active el **2FA real (TOTP)** con su
app autenticadora (Google Authenticator, Authy…).

Desde el panel se configura:

| Módulo | Opciones |
|---|---|
| **🔐 Seguridad** | 2FA simulado, timeout de sesión, bloqueo por intentos, política de contraseñas (longitud/mayúsculas/números/símbolos), auditoría on/off |
| **🎨 Diseño web** | Marca, logo, tema claro/oscuro, 7 colores primarios, color de acento, radio de bordes, densidad — **aplicados en vivo y persistidos en BD** |
| **🔑 Cambio de clave** | Con validación de política y verificación de clave actual |
| **📜 Auditoría** | Últimos 30 eventos con usuario, acción, detalle e IP |
| **📦 Módulos** | Activación de grupos de herramientas de la cinta |

---

## 🚀 Puesta en marcha local

```bash
# 1. Instalar dependencias
bun install        # o npm install

# 2. Configurar la conexión a PostgreSQL (Neon, Supabase, local...)
cp .env.example .env
#    → edita DATABASE_URL con la cadena de tu proyecto Neon

# 3. Generar el cliente de Prisma y crear el esquema
bunx prisma generate
bunx prisma db push

# 4. Servidor de desarrollo
bun run dev        # o npm run dev
```

La aplicación se abre en `http://localhost:3000`. En el primer arranque, la BD se auto-siembra con el usuario administrador y los valores por defecto de seguridad y diseño.

> Variables de entorno (ver `.env.example`):
> `DATABASE_URL` (PostgreSQL, p. ej. Neon) · `AUTH_SECRET` (firma HMAC de sesiones)

---

## ☁️ Despliegue en Vercel

El proyecto incluye `vercel.json` con la configuración de build (`prisma generate && next build`).

La persistencia usa **PostgreSQL gestionado (Neon)**: configura `DATABASE_URL` (host `-pooler` con `?pgbouncer=true&connection_limit=1`) y `AUTH_SECRET` como variables de entorno del proyecto en Vercel. Los datos (usuarios, configuración, auditoría) **persisten entre arranques en frío** y se comparten entre todas las instancias serverless.

```bash
npm i -g vercel
vercel          # primer deploy (preview)
vercel --prod   # producción
```

O directamente desde GitHub: **New Project → Import Repository** (build automático detectado).

---

## 🗂️ Estructura del proyecto

```
src/
├── app/
│   ├── api/
│   │   ├── auth/{login,logout,password,session}/  # Sesiones HMAC, 2FA, bloqueo, política de claves
│   │   ├── audit/                                  # Registro de auditoría
│   │   └── settings/                               # Seguridad y diseño (GET/PUT)
│   ├── layout.tsx · globals.css
│   └── page.tsx                                    # App principal
├── components/
│   ├── jarumy/
│   │   ├── PlanCanvas.tsx        # Lienzo SVG: zoom, paneo, dibujo, snap/orto, undo/redo
│   │   ├── RadialMenu.tsx        # ⭐ Menú radial contextual con subopciones
│   │   ├── RibbonToolbar.tsx     # Cinta de 97 herramientas en 11 pestañas
│   │   ├── SidePanels.tsx        # Capas, biblioteca de bloques, propiedades
│   │   ├── ElementRenderers.tsx  # Muros, puertas, ventanas, mobiliario, cotas…
│   │   ├── ConsoleBar.tsx        # Consola de comandos + barra de estado
│   │   ├── Dialogs.tsx           # Cuadro de espacios, catálogo, energía, colisiones
│   │   ├── AdminPanel.tsx        # Panel de administración completo
│   │   └── ToolIcon.tsx
│   └── ui/                       # Componentes shadcn/ui
└── lib/
    ├── db.ts                     # PrismaClient (PostgreSQL) + bootstrap idempotente del esquema
    ├── auth.ts                   # scrypt, sesiones firmadas, política de claves
    ├── settings.ts               # Seguridad/diseño: defaults, seed idempotente
    ├── plan-data.ts              # Geometría del plano arquitectónico
    ├── tools-data.ts             # Catálogo de 73 herramientas + mapeo radial
    └── store.ts                  # Estado global (zustand)
docs/research/                    # Investigación de apps PRO (AutoCAD, BIM, plugins, menús radiales)
```

---

## 🔒 Notas de seguridad

- Contraseñas con **scrypt** (salt por usuario) y comparación *timing-safe*
- Sesiones firmadas con **HMAC-SHA256** y expiración configurable
- Bloqueo temporal tras N intentos fallidos · 2FA simulado
- El hash de la clave nunca sale del servidor; se recomienda cambiar `AUTH_SECRET` en producción

---

<div align="center">

**Jarumy app** · Suite arquitectónica web con menú radial contextual

*Investigación + desarrollo: AutoCAD · Revit · ArchiCAD · SketchUp · Rhino · Vectorworks · Lumion · Enscape · V-Ray · Corona · D5 Render*

</div>
