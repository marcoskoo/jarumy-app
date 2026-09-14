<div align="center">

# 🏛️ Jarumy app

**Suite de diseño arquitectónico CAD en la web** — con menú radial contextual interactivo y panel de administración completo.

`Next.js 16` · `React 19` · `TypeScript` · `Tailwind CSS 4` · `Prisma + PostgreSQL (Neon)` · `Framer Motion`

🌐 **Demo en vivo:** https://jarumy-app-dusky.vercel.app · 📦 **Repositorio:** https://github.com/marcoskoo/jarumy-app

</div>

---

## 📖 Descripción

**Jarumy app** es una aplicación web de diseño arquitectónico inspirada en las suites profesionales de CAD y BIM (AutoCAD, Revit, ArchiCAD, SketchUp, Rhino, Vectorworks, Lumion, Enscape, V-Ray, Corona y D5 Render). Recopila **98 herramientas** de las mejores aplicaciones de arquitectura en su versión PRO y las unifica en una sola interfaz web moderna: CAD interactivo con OSNAP y multi-selección, **multinivel por plantas**, planos en la nube con colaboración en vivo, IA generativa, analítica RNE completa y PWA offline.

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

### 🏢 Multinivel (plantas PB · P1 · P2 · azotea)
- Selector de niveles flotante sobre el lienzo: crea, duplica, elimina y edita **cota y altura reales** de cada piso
- Cada objeto pertenece a un nivel; el dibujo y los análisis (normativa, evacuación, térmica) operan **sobre la planta activa**
- **IFC multi-storey**: un `IfcBuildingStorey` por nivel con `Elevation` real — ábralo en Revit/ArchiCAD
- **Trazado por lotes real**: un solo PDF con índice (A-00) + una lámina de planta por nivel + 4 elevaciones + sección transversal

### ☁️ Nube, colaboración y IA
- **Planos en la nube** por usuario (Prisma + PostgreSQL): guardar/abrir/eliminar, **versionado en BD** (máx. 20) y papelera
- **Enlaces para compartir** con permiso de vista o edición (`?plano=token`) y **expiración configurable** (7/30/90/365 días o nunca)
- **Sesión colaborativa en vivo** (socket.io, mini-servicio incluido en `mini-services/collab-service`): sincronización del plano a ~0.7 s, presencia y chat de sesión
- **IA generativa**: plantas esquemáticas desde texto (muros, espacios RNE, puertas y ventanas reales)
- **Revisor IA de normativa**: interpreta los checks RNE del plano y propone correcciones dimensionadas
- **Comandos de voz** (Web Speech API, es-PE) sobre la consola

### 📥 Importación y exportación total
- **Importar DXF R12/R2000** (líneas, círculos, arcos, textos, polilíneas) con detección de unidades, re-encuadre y **expansión real de bloques INSERT** (sección BLOCKS con escala y rotación)
- **Underlay de referencia**: imagen PNG/JPG o 1ª página de PDF rasterizada — calque encima con opacidad ajustable
- Exporta **PDF a escala**, **lote multi-lámina**, **DXF**, **IFC4 (BIM multi-storey)**, **OBJ/STL (3D)**, **PNG/SVG**, **Excel BIM/S10** y **.jarumy.json**

### 🏃 3D y análisis extendidos
- **Walkthrough en 1ª persona** (WASD + perspectiva real a 1.60 m con colisión de muros) y axonometría orbital
- **Sombreado solar real en 3D**: la axonometría ilumina cada cara según la posición del sol del heliodón (latitud/fecha/hora); el modo *ultra* añade cielo y ambiente
- **Térmica RNE E.020**: transmitancia U por zona climática + riesgo de condensación (Glaser)
- **Accesibilidad** (A.010/A.050), **evacuación A.130** (rutas, aforo, anchos de salida — 25 m compartidos con normativa) y **potencial fotovoltaico** (kWp, kWh/año, payback)
- **Análisis energético REAL**: refrigeración por CDD de la zona + ganancia solar (SHGC real del vidrio), calefacción por HDD18 + infiltración n50, y **scorecard LEED v4.1 dinámico** (mejora % vs línea base E.020, renovables desde el PV real, iluminación natural y envolvente)

### 🖊️ Dibujo real
- Línea, polilínea, rectángulo, círculo, texto, cota, mover, copiar, borrar e inserción de bloques
- **Deshacer / Rehacer** completo
- Consola de comandos estilo AutoCAD: `L`, `C`, `REC`, `TXT`, `CO`, `M`, `ROT`, `DEL`, `U`, `REDO`, `RENDER`, `3D`, `RECORRIDO`, `PURGA`, `NIVEL`, `NIVELES`, `NIVELNUEVO`, `NIVELDUP`, `BATCHPLOT`, `AYUDA`…

### 🧰 98 herramientas PRO recopiladas
Organizadas en **11 pestañas de cinta** (ribbon estilo AutoCAD):
Inicio (13) · Dibujo (9) · Modificación (15) · Anotación (10) · Arquitectura (9) · Bloques (6) · Instalaciones (5) · BIM (6) · Visualización (7) · Análisis (11) · Productividad (8)

### 🏢 BIM y análisis
- Cuadro de espacios en vivo con áreas
- **Análisis energético calculado del modelo** y **detección de colisiones**
- **Vista 3D axonométrica** con sombreado solar del heliodón y **modo render ultra**

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

Cámbiela desde *Cuenta y clave* y active el **2FA real (TOTP RFC 6238)** con su
app autenticadora (Google Authenticator, Authy…).

Desde el panel se configura:

| Módulo | Opciones |
|---|---|
| **🔐 Seguridad** | 2FA (TOTP real), timeout de sesión, bloqueo por intentos, política de contraseñas (longitud/mayúsculas/números/símbolos), auditoría on/off |
| **👥 Usuarios** | CRUD completo: crear/editar/deshabilitar, **roles admin/editor/visor** con enforcement en el servidor, restablecer contraseña (revoca sesiones) |
| **🎨 Diseño web** | Marca, logo, tema claro/oscuro, 7 colores primarios, color de acento, radio de bordes, densidad — **aplicados en vivo y persistidos en BD** |
| **🔑 Cambio de clave** | Con validación de política y verificación de clave actual; revoca TODAS las sesiones activas |
| **📜 Auditoría** | Últimos eventos con usuario, acción, detalle e IP (paginado, filtro por usuario) |
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

# 5. (Opcional) Servicio de colaboración en vivo — puerto 3003
cd mini-services/collab-service && bun install && bun run dev

# 6. Tests automatizados (vitest — 31 pruebas)
bun run test
```

La aplicación se abre en `http://localhost:3000`. En el primer arranque, la BD se auto-siembra con el usuario administrador y los valores por defecto de seguridad y diseño.

> Variables de entorno (ver `.env.example`):
> `DATABASE_URL` (PostgreSQL, p. ej. Neon) · `AUTH_SECRET` (firma HMAC de sesiones — si no se define, se genera y persiste un secreto aleatorio en la BD)

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

> La colaboración en vivo usa un mini-servicio socket.io propio (puerto 3003): despliéguelo aparte (VPS, Railway, Fly.io) y apunte el gateway `XTransformPort=3003` a él.

---

## 🗂️ Estructura del proyecto

```
src/
├── app/
│   ├── api/
│   │   ├── auth/{login,logout,password,session,totp}/ # Sesiones HMAC revocables, 2FA TOTP real, bloqueo en BD
│   │   ├── users/[id]           # CRUD de usuarios con roles (solo admin)
│   │   ├── plans/[id]/...       # Planos: CRUD, versiones, enlaces con expiración
│   │   ├── share/[token]/       # Acceso público por enlace (con caducidad)
│   │   ├── ai/{plan,normativa}/ # IA con sesión + rate-limit en BD
│   │   ├── audit/               # Auditoría paginada (solo admin)
│   │   ├── health/              # Health check real (BD, latencia, uptime)
│   │   └── settings/            # Seguridad y diseño (GET split público/auth)
│   ├── error.tsx · global-error.tsx · not-found.tsx · loading.tsx
│   ├── layout.tsx · globals.css
│   └── page.tsx                 # App principal
├── components/
│   ├── jarumy/
│   │   ├── PlanCanvas.tsx        # Lienzo SVG: zoom, paneo, dibujo, snap/orto, undo/redo, multinivel
│   │   ├── RadialMenu.tsx        # ⭐ Menú radial contextual con subopciones
│   │   ├── RibbonToolbar.tsx     # Cinta de 98 herramientas en 11 pestañas
│   │   ├── LevelSelector.tsx     # Selector multinivel flotante (PB/P1/P2…)
│   │   ├── SidePanels.tsx        # Capas, biblioteca de bloques, propiedades
│   │   ├── ElementRenderers.tsx  # Muros, puertas, ventanas, mobiliario, cotas…
│   │   ├── ConsoleBar.tsx        # Consola de comandos (aria-live) + barra de estado
│   │   ├── Dialogs.tsx           # Cuadro de espacios, catálogo, energía real, colisiones
│   │   ├── AdminPanel.tsx        # Panel de administración + gestión de usuarios
│   │   └── ToolIcon.tsx
│   └── ui/                       # Componentes shadcn/ui (solo los usados)
└── lib/
    ├── db.ts                     # PrismaClient (PostgreSQL) + bootstrap idempotente del esquema
    ├── auth.ts                   # scrypt, sesiones firmadas revocables (jti+epoch), roles
    ├── rate-limit.ts             # Rate limit y bloqueo de login persistidos en BD
    ├── rne.ts                    # Constantes normativas compartidas (A.130 = 25 m en todos los módulos)
    ├── energy.ts                 # Análisis energético real + scorecard LEED
    ├── plan-data.ts              # Geometría del plano + niveles (multinivel)
    ├── tools-data.ts             # Catálogo de 98 herramientas + mapeo radial
    ├── dxf-import.ts             # DXF con expansión de bloques INSERT
    ├── pdf-export.ts             # PDF a escala + trazado por lotes multi-lámina
    ├── ifc-export.ts             # IFC4 multi-storey (un nivel = un IfcBuildingStorey)
    └── store.ts                  # Estado global (zustand)
mini-services/collab-service/     # socket.io :3003 — presencia, sync y chat en vivo
tests/                            # vitest: normativa, evacuación, energía, TOTP, DXF (31 pruebas)
docs/research/                    # Investigación de apps PRO (AutoCAD, BIM, plugins, menús radiales)
```

---

## 🔒 Notas de seguridad

- Contraseñas con **scrypt** (salt por usuario) y comparación *timing-safe*
- Sesiones firmadas con **HMAC-SHA256**, expiración configurable, **jti revocable en BD** (logout real) y **epoch por usuario** (cambio de clave revoca todas las sesiones)
- **AUTH_SECRET** sin fallback estático: variable de entorno → secreto aleatorio persistido en BD → efímero por proceso (con advertencia) si la BD no responde
- **Bloqueo de login y rate-limit en BD** (eficaces en serverless multi-instancia); las rutas de IA exigen sesión y 10 req/min por usuario
- **Roles en el servidor**: admin (todo) · editor (crear/editar planos propios) · visor (solo lectura)
- Enlaces compartidos con **expiración opcional**; `GET /api/settings` público solo expone el diseño
- El hash de la clave y el secreto TOTP nunca salen del servidor
- Defina `AUTH_SECRET` como variable de entorno en producción para control total

---

<div align="center">

**Jarumy app** · Suite arquitectónica web con menú radial contextual

*Investigación + desarrollo: AutoCAD · Revit · ArchiCAD · SketchUp · Rhino · Vectorworks · Lumion · Enscape · V-Ray · Corona · D5 Render*

</div>
