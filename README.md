<div align="center">

# 🏛️ Jarumy app

**Suite de diseño arquitectónico CAD en la web** — con menú radial contextual interactivo y panel de administración completo.

`Next.js 16` · `React 19` · `TypeScript` · `Tailwind CSS 4` · `Prisma + SQLite` · `Framer Motion`

🌐 **Demo en vivo:** https://jarumy-app-dusky.vercel.app · 📦 **Repositorio:** https://github.com/marcoskoo/jarumy-app

</div>

---

## 📖 Descripción

**Jarumy app** es una aplicación web de diseño arquitectónico inspirada en las suites profesionales de CAD y BIM (AutoCAD, Revit, ArchiCAD, SketchUp, Rhino, Vectorworks, Lumion, Enscape, V-Ray, Corona y D5 Render). Recopila **73 herramientas** de las mejores aplicaciones de arquitectura en su versión PRO y las unifica en una sola interfaz web moderna.

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
- **Snap** y **Orto** con vista previa de dibujo en vivo

### 🖊️ Dibujo real
- Línea, polilínea, rectángulo, círculo, texto, cota, mover, copiar, borrar e inserción de bloques
- **Deshacer / Rehacer** completo
- Consola de comandos estilo AutoCAD: `L`, `C`, `REC`, `TXT`, `CO`, `M`, `ROT`, `DEL`, `U`, `REDO`, `RENDER`, `3D`, `RECORRIDO`, `PURGA`, `AYUDA`…

### 🧰 73 herramientas PRO recopiladas
Organizadas en **10 pestañas de cinta** (ribbon estilo AutoCAD):
Dibujo (10) · Modificación (14) · Anotación (8) · Arquitectura/BIM (11) · Bloques (7) · Visualización (8) · Análisis (6) · Productividad (8)

### 🏢 BIM y análisis
- Cuadro de espacios en vivo con áreas
- **Análisis energético** y **detección de colisiones**
- **Vista 3D axonométrica** y **modo render** (filtros cálidos + sombras)

### 🛠️ Paneles profesionales
- Panel de **capas** funcional, **biblioteca de bloques**, panel de **propiedades**
- Barra de estado con toggles (snap, orto, rejilla, peso de línea)

---

## 🔐 Panel de Administración

Acceso con las credenciales del administrador:

```
Usuario:  J. Burga
Clave:    BurgaKoo
```

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

# 2. Generar el cliente de Prisma y crear la BD
bunx prisma db push

# 3. Servidor de desarrollo
bun run dev        # o npm run dev
```

La aplicación se abre en `http://localhost:3000`. En el primer arranque, la BD se auto-siembra con el usuario administrador y los valores por defecto de seguridad y diseño.

> Variables de entorno opcionales en `.env`:
> `DATABASE_URL` (por defecto `file:./db/custom.db`) · `AUTH_SECRET` (firma HMAC de sesiones)

---

## ☁️ Despliegue en Vercel

El proyecto incluye `vercel.json` con la configuración de build (`prisma generate && next build`).

En entornos serverless el filesystem es efímero, por lo que la BD SQLite se crea automáticamente en `/tmp` con su esquema y seed en cada arranque en frío (`ensureSchema` + `ensureSeed`). Para datos persistentes en producción se recomienda reemplazar SQLite por PostgreSQL/Turso ajustando `prisma/schema.prisma` y `DATABASE_URL`.

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
│   │   ├── RibbonToolbar.tsx     # Cinta de 73 herramientas en 10 pestañas
│   │   ├── SidePanels.tsx        # Capas, biblioteca de bloques, propiedades
│   │   ├── ElementRenderers.tsx  # Muros, puertas, ventanas, mobiliario, cotas…
│   │   ├── ConsoleBar.tsx        # Consola de comandos + barra de estado
│   │   ├── Dialogs.tsx           # Cuadro de espacios, catálogo, energía, colisiones
│   │   ├── AdminPanel.tsx        # Panel de administración completo
│   │   └── ToolIcon.tsx
│   └── ui/                       # Componentes shadcn/ui
└── lib/
    ├── db.ts                     # PrismaClient + bootstrap de esquema serverless
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
