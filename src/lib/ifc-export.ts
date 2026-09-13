// ============================================================
// JARUMY APP — Exportador IFC4 (ISO 10303-21 / SPF).
// Genera un archivo .ifc real con esqueleto espacial completo
// (Project → Site → Building → Storey) y cuerpos por extrusión:
//   · muros     → IfcWall (rectángulo extruido, XDim/espesor,
//                 YDim/longitud, colocación en el punto medio)
//   · puertas   → IfcOpeningElement + IfcDoor (caja simple)
//   · ventanas  → IfcOpeningElement + IfcWindow (caja simple,
//                 antepecho desde mod.sill)
//   · columnas  → IfcColumn (cuadrado extruido)
//   · espacios  → IfcSpace (placa delgada, área = w×h)
//   · escaleras → IfcStair (caja) + Pset_StairCommon con nº de
//                 contrahuellas / huellas
// Coordenadas en METROS, Y invertida (−y/60) y Z hacia arriba.
// SIN librerías externas — construcción incremental de entidades
// con un contador de #id.
// ============================================================

import type { PlanElement } from '@/lib/plan-data'
import type { WallGeo, DoorGeo, WindowGeo, RoomGeo, ColGeo, StairGeo } from '@/lib/plan-data'
import { PX_PER_M } from '@/lib/plan-data'
import type { Mod } from '@/lib/store'

export interface IfcResult {
  filename: string
  content: string
  bytes: number
}

// ---- utilidades SPF ----

/** Número real IFC: siempre con punto decimal, 6 decimales máx. */
const F = (n: number): string => {
  if (!Number.isFinite(n)) return '0.'
  const r = Math.round(n * 1e6) / 1e6
  const s = r.toString()
  return s.includes('.') ? s : `${s}.`
}

/** Cadena IFC escapada (comillas simples duplicadas) y plegada a ASCII
 *  (SPF clásico es ISO 8859-1; plegamos tildes y signos para máxima interoperabilidad). */
const ASCII_FOLD: Record<string, string> = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U', 'Ñ': 'N',
  '—': '-', '–': '-', '·': '-', '°': 'deg', '²': '2', '³': '3', '×': 'x',
  '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '¿': '', '¡': '',
}
const S = (v: string): string => {
  const folded = (v ?? '').replace(/[^\x20-\x7E]/g, (c) => ASCII_FOLD[c] ?? '?')
  return `'${folded.replace(/'/g, "''")}'`
}

/** Alfabeto base64 de los GUID de IFC (22 caracteres). */
const IFC_B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

/** GUID IFC determinista de 22 caracteres a partir de una semilla (id del elemento). */
const ifcGuid = (seed: string): string => {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = (Math.imul(h2 ^ c, 0x85ebca6b) + i) >>> 0
  }
  let out = ''
  for (let i = 0; i < 22; i++) {
    h1 = Math.imul(h1 ^ (h1 >>> 13), 0x5bd1e995) >>> 0
    h2 = (Math.imul(h2 + 0x9e3779b9, 0xc2b2ae35) ^ h1) >>> 0
    out += IFC_B64[(h1 ^ (h2 >>> (i % 7))) & 63]
  }
  return out
}

/**
 * Exporta el plano como archivo IFC4 SPF.
 */
export function exportPlanIfc(elements: PlanElement[], mods: Record<string, Mod>): IfcResult {
  const drawable = elements.filter((el) => !mods[el.id]?.deleted)

  // ---- construcción incremental de entidades ----
  const lines: string[] = []
  let id = 0
  const E = (body: string): string => {
    id++
    lines.push(`#${id}= ${body};`)
    return `#${id}`
  }

  const now = new Date()
  const stamp = Math.floor(now.getTime() / 1000)
  const iso = now.toISOString().slice(0, 19)

  // ---- cabecera + esqueleto espacial ----
  const person = E(`IFCPERSON($,'Jarumy','Usuario',$,$,$,$,$)`)
  const org = E(`IFCORGANIZATION($,'Jarumy',$,$,$)`)
  const pAndO = E(`IFCPERSONANDORGANIZATION(${person},${org},$)`)
  const app = E(`IFCAPPLICATION($,'1.0','Jarumy APP','JARUMY')`)
  const owner = E(`IFCOWNERHISTORY(${pAndO},${app},$,.ADDED.,${stamp},${person},${app},${stamp})`)

  const uLen = E(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`)
  const uArea = E(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`)
  const uVol = E(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`)
  const units = E(`IFCUNITASSIGNMENT((${uLen},${uArea},${uVol}))`)

  const pt0 = E(`IFCCARTESIANPOINT((0.,0.,0.))`)
  const dirZ = E(`IFCDIRECTION((0.,0.,1.))`)
  const north = E(`IFCDIRECTION((0.,1.,0.))`)
  const worldCS = E(`IFCAXIS2PLACEMENT3D(${pt0},$,$)`)
  const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${worldCS},${north})`)

  const project = E(`IFCPROJECT('${ifcGuid('jarumy-proyecto')}',${owner},'Plano Jarumy','Vivienda exportada desde Jarumy APP',$,$,$,(${ctx}),${units})`)

  const sitePl = E(`IFCLOCALPLACEMENT($,${worldCS})`)
  const site = E(`IFCSITE('${ifcGuid('jarumy-sitio')}',${owner},'Sitio','Terreno de la vivienda',$,$,${sitePl},$,$,.ELEMENT.,(-12,-5,0),(-77,-2,0),0.,$,$)`)

  const bldgPl = E(`IFCLOCALPLACEMENT(${sitePl},${worldCS})`)
  const building = E(`IFCBUILDING('${ifcGuid('jarumy-edificio')}',${owner},'Vivienda unifamiliar','Edificio principal',$,$,${bldgPl},$,$,.ELEMENT.,$,$,$)`)

  const storeyPt = E(`IFCCARTESIANPOINT((0.,0.,0.))`)
  const storeyAx = E(`IFCAXIS2PLACEMENT3D(${storeyPt},$,$)`)
  const storeyPl = E(`IFCLOCALPLACEMENT(${bldgPl},${storeyAx})`)
  const storey = E(`IFCBUILDINGSTOREY('${ifcGuid('jarumy-piso-1')}',${owner},'Piso 1 — NPT +0.00','Nivel de piso terminado',$,$,${storeyPl},$,$,.ELEMENT.,0.)`)

  E(`IFCRELAGGREGATES('${ifcGuid('agg-proyecto-sitio')}',${owner},$,$,${project},(${site}))`)
  E(`IFCRELAGGREGATES('${ifcGuid('agg-sitio-edificio')}',${owner},$,$,${site},(${building}))`)
  E(`IFCRELAGGREGATES('${ifcGuid('agg-edificio-piso')}',${owner},$,$,${building},(${storey}))`)

  // ---- estilo gris para muros (opcional, IFC4 permite StyledItem) ----
  const grey = E(`IFCCOLOURRGB($,0.62,0.62,0.62)`)
  const render = E(`IFCSURFACESTYLERENDERING(${grey},0.,$,$,$,$,$,$,.NOTDEFINED.)`)
  const surfStyle = E(`IFCSURFACESTYLE('Muro Jarumy',.BOTH.,(${render}))`)
  const styleAssign = E(`IFCPRESENTATIONSTYLEASSIGNMENT((${surfStyle}))`)

  // ---- helpers geométricos (extrusión de perfil rectangular) ----
  const placeAt = (x: number, y: number, z = 0): string => {
    const p = E(`IFCCARTESIANPOINT((${F(x)},${F(y)},${F(z)}))`)
    const ax = E(`IFCAXIS2PLACEMENT3D(${p},$,$)`)
    return E(`IFCLOCALPLACEMENT(${storeyPl},${ax})`)
  }
  const rectProfile = (name: string, xdim: number, ydim: number): string => {
    const p = E(`IFCCARTESIANPOINT((0.,0.))`)
    const d = E(`IFCDIRECTION((1.,0.))`)
    const ax = E(`IFCAXIS2PLACEMENT2D(${p},${d})`)
    return E(`IFCRECTANGLEPROFILEDEF(.AREA.,${S(name)},${ax},${F(xdim)},${F(ydim)})`)
  }
  const extrude = (profile: string, h: number): string =>
    E(`IFCEXTRUDEDAREASOLID(${profile},${worldCS},${dirZ},${F(h)})`)
  const bodyShape = (solid: string): string => {
    const rep = E(`IFCSHAPEREPRESENTATION(${ctx},'Body','SweptSolid',(${solid}))`)
    return E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`)
  }

  const contained: string[] = [] // productos colgados del piso (IfcRelContainedInSpatialStructure)
  const spaces: string[] = []    // espacios agregados al piso (IfcRelAggregates)

  // coordenadas de la app (px, Y-abajo) → IFC (m, Y-arriba, Z-arriba)
  const XM = (px: number) => px / PX_PER_M
  const YM = (px: number) => -px / PX_PER_M

  // ---- muros ----
  for (const el of drawable) {
    if (el.type !== 'muro') continue
    const g = el.geo as WallGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const tM = (m?.thickness ?? g.t) / PX_PER_M
    const x1 = XM(g.x1 + tx), y1 = YM(g.y1 + ty)
    const x2 = XM(g.x2 + tx), y2 = YM(g.y2 + ty)
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2
    const lenM = Math.hypot(x2 - x1, y2 - y1)
    const h = m?.wallHeight ?? 2.5
    // los muros de la app son ortogonales: el rectángulo se alinea a ejes
    const vert = g.x1 === g.x2
    const xdim = vert ? tM : lenM
    const ydim = vert ? lenM : tM
    const solid = extrude(rectProfile('Muro', xdim, ydim), h)
    const placement = placeAt(midX, midY, 0)
    const shape = bodyShape(solid)
    E(`IFCSTYLEDITEM(${solid},(${styleAssign}),$)`) // gris para muros
    const wallRef = E(`IFCWALL('${ifcGuid(el.id)}',${owner},${S(el.name)},$,$,${placement},${shape},${S(el.id)},.SOLIDWALL.)`)
    contained.push(wallRef)
  }

  // ---- puertas: vano + caja de hoja ----
  for (const el of drawable) {
    if (el.type !== 'puerta') continue
    const g = el.geo as DoorGeo
    const m = mods[el.id]
    const wM = g.r / PX_PER_M
    const hM = m?.doorHeight ?? 2.1
    const cx = XM(g.cx), cy = YM(g.cy)
    const openSolid = extrude(rectProfile('Vano puerta', wM, 0.2), hM)
    E(`IFCOPENINGELEMENT('${ifcGuid(`${el.id}-vano`)}',${owner},${S(el.name)},$,$,${placeAt(cx, cy, 0)},${bodyShape(openSolid)},${S(el.id)})`)
    const leafSolid = extrude(rectProfile('Hoja puerta', Math.max(wM - 0.04, 0.05), 0.06), Math.max(hM - 0.02, 0.1))
    const doorRef = E(`IFCDOOR('${ifcGuid(el.id)}',${owner},${S(el.name)},$,$,${placeAt(cx, cy, 0)},${bodyShape(leafSolid)},${S(el.id)},${F(hM)},${F(wM)},.DOOR.,.SINGLE_SWING_LEFT.)`)
    contained.push(doorRef)
  }

  // ---- ventanas: vano + caja de vidrio a la altura del antepecho ----
  for (const el of drawable) {
    if (el.type !== 'ventana') continue
    const g = el.geo as WindowGeo
    const m = mods[el.id]
    const wM = g.len / PX_PER_M
    const hM = 1.2
    const sill = m?.sill ?? 0.9
    const cx = XM(g.x + (g.orient === 'h' ? wM / 2 : 0))
    const cy = YM(g.y + (g.orient === 'v' ? wM / 2 : 0))
    const openSolid = extrude(rectProfile('Vano ventana', wM, 0.2), hM)
    E(`IFCOPENINGELEMENT('${ifcGuid(`${el.id}-vano`)}',${owner},${S(el.name)},$,$,${placeAt(cx, cy, sill)},${bodyShape(openSolid)},${S(el.id)})`)
    const glassSolid = extrude(rectProfile('Vidrio', Math.max(wM - 0.04, 0.05), 0.05), hM)
    const winRef = E(`IFCWINDOW('${ifcGuid(el.id)}',${owner},${S(el.name)},$,$,${placeAt(cx, cy, sill)},${bodyShape(glassSolid)},${S(el.id)},${F(hM)},${F(wM)},.WINDOW.,.SINGLE_PANEL.,$)`)
    contained.push(winRef)
  }

  // ---- columnas ----
  for (const el of drawable) {
    if (el.type !== 'columna') continue
    const g = el.geo as ColGeo
    const m = mods[el.id]
    const s = (m?.size ?? g.size) / PX_PER_M
    const h = m?.wallHeight ?? 2.5
    const solid = extrude(rectProfile('Columna', s, s), h)
    const colRef = E(`IFCCOLUMN('${ifcGuid(el.id)}',${owner},${S(el.name)},$,$,${placeAt(XM(g.x), YM(g.y), 0)},${bodyShape(solid)},${S(el.id)},.COLUMN.)`)
    contained.push(colRef)
  }

  // ---- espacios (IfcSpace con placa delgada; el área viaja en el nombre) ----
  for (const el of drawable) {
    if (el.type !== 'espacio') continue
    const g = el.geo as RoomGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const wM = g.w / PX_PER_M, dM = g.h / PX_PER_M
    const areaM2 = wM * dM
    const cx = XM(g.x + tx + g.w / 2), cy = YM(g.y + ty + g.h / 2)
    const solid = extrude(rectProfile('Espacio', wM, dM), 0.02)
    const spaceRef = E(`IFCSPACE('${ifcGuid(el.id)}',${owner},${S(`${el.name} - ${areaM2.toFixed(2)} m2`)},$,$,${placeAt(cx, cy, 0)},${bodyShape(solid)},${S(g.name || el.name)},.ELEMENT.,0.)`)
    spaces.push(spaceRef)
  }

  // ---- escaleras: caja + Pset_StairCommon ----
  for (const el of drawable) {
    if (el.type !== 'escalera') continue
    const g = el.geo as StairGeo
    const m = mods[el.id]
    const tx = m?.translate?.[0] ?? 0
    const ty = m?.translate?.[1] ?? 0
    const wM = g.w / PX_PER_M, dM = g.h / PX_PER_M
    const hM = g.steps * g.riser
    const cx = XM(g.x + tx + g.w / 2), cy = YM(g.y + ty + g.h / 2)
    const solid = extrude(rectProfile('Escalera', wM, dM), hM)
    const stairRef = E(`IFCSTAIR('${ifcGuid(el.id)}',${owner},${S(el.name)},$,$,${placeAt(cx, cy, 0)},${bodyShape(solid)},${S(el.id)},.STRAIGHT_RUN_STAIR.)`)
    contained.push(stairRef)
    // propiedades reales de la escalera (nº de pasos, huella y contrahuella)
    const pRisers = E(`IFCPROPERTYSINGLEVALUE('NumberOfRisers',$,IFCINTEGER(${g.steps}),$)`)
    const pTreads = E(`IFCPROPERTYSINGLEVALUE('NumberOfTreads',$,IFCINTEGER(${Math.max(g.steps - 1, 0)}),$)`)
    const pRiserH = E(`IFCPROPERTYSINGLEVALUE('RiserHeight',$,IFCLENGTHMEASURE(${F(g.riser)}),$)`)
    const pTreadL = E(`IFCPROPERTYSINGLEVALUE('TreadLength',$,IFCLENGTHMEASURE(${F(g.tread)}),$)`)
    const pset = E(`IFCPROPERTYSET('${ifcGuid(`${el.id}-pset`)}',${owner},'Pset_StairCommon',$,(${pRisers},${pTreads},${pRiserH},${pTreadL}))`)
    E(`IFCRELDEFINESBYPROPERTIES('${ifcGuid(`${el.id}-reldef`)}',${owner},$,$,(${stairRef}),${pset})`)
  }

  // ---- relación espacial de productos y espacios ----
  if (contained.length > 0) {
    E(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid('rel-contenido-piso')}',${owner},'Contenido del piso',$,(${contained.join(',')}),${storey})`)
  }
  if (spaces.length > 0) {
    E(`IFCRELAGGREGATES('${ifcGuid('rel-espacios-piso')}',${owner},'Espacios del piso',$,${storey},(${spaces.join(',')}))`)
  }

  // ---- ensamblado del archivo SPF ----
  const header = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`,
    `FILE_NAME('jarumy-plano.ifc','${iso}',('Jarumy APP'),('Jarumy'),('Jarumy APP 1.0','Jarumy APP',''),'Jarumy','');`,
    `FILE_SCHEMA(('IFC4'));`,
    'ENDSEC;',
    'DATA;',
  ].join('\n')
  const footer = 'ENDSEC;\nEND-ISO-10303-21;\n'
  const content = `${header}\n${lines.join('\n')}\n${footer}`

  return { filename: 'jarumy-plano.ifc', content, bytes: content.length }
}
