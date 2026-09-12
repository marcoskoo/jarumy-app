// ============================================================
// JARUMY APP — Geometría solar para el heliodón
// Posición del sol (azimut/elevación) a partir de latitud,
// día del año y hora solar local. Convención: azimut 0°=Norte,
// 90°=Este, 180°=Sur, 270°=Oeste (sentido horario).
// En pantalla: Norte = -y (arriba), Este = +x (derecha).
// ============================================================

export interface SunPos {
  azimuth: number   // grados, 0=N · 90=E · 180=S · 270=O
  elevation: number // grados sobre el horizonte
}

const RAD = Math.PI / 180

/** Declinación solar en grados para un día del año (1-365). */
export function solarDeclination(dayOfYear: number): number {
  return -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365)
}

/**
 * Posición del sol. Devuelve null si el sol está bajo el horizonte.
 * Fórmulas estándar de astronomía de posición (NOAA simplificada).
 */
export function solarPosition(lat: number, dayOfYear: number, hour: number): SunPos | null {
  const decl = solarDeclination(dayOfYear) * RAD
  const latR = lat * RAD
  const H = (15 * (hour - 12)) * RAD // ángulo horario

  const sinEl = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(H)
  if (sinEl <= 0.005) return null // bajo el horizonte (o rasante)

  const elevation = Math.asin(sinEl) / RAD

  // azimut medido desde el norte en sentido horario
  const cosAz = (Math.sin(decl) - Math.sin(latR) * sinEl) / (Math.cos(latR) * Math.cos(Math.asin(sinEl)))
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) / RAD
  if (H > 0) azimuth = 360 - azimuth // tarde: el sol pasa al oeste
  return { azimuth, elevation }
}

/** Hora de amanecer y atardecer (hora solar local). */
export function sunTimes(lat: number, dayOfYear: number): { sunrise: number; sunset: number } {
  const decl = solarDeclination(dayOfYear) * RAD
  const latR = lat * RAD
  const cosH0 = -Math.tan(latR) * Math.tan(decl)
  if (cosH0 <= -1) return { sunrise: 0, sunset: 24 }   // día polar
  if (cosH0 >= 1) return { sunrise: 12, sunset: 12 }   // noche polar
  const H0 = Math.acos(cosH0) / RAD / 15
  return { sunrise: 12 - H0, sunset: 12 + H0 }
}

/** Trayectoria solar completa de un día (puntos cada `step` horas). */
export function sunPathForDay(lat: number, dayOfYear: number, step = 0.5): Array<{ h: number; pos: SunPos }> {
  const out: Array<{ h: number; pos: SunPos }> = []
  const { sunrise, sunset } = sunTimes(lat, dayOfYear)
  for (let h = Math.floor(sunrise); h <= Math.ceil(sunset); h += step) {
    const pos = solarPosition(lat, dayOfYear, h)
    if (pos) out.push({ h, pos })
  }
  return out
}

/**
 * Vector de sombra en pantalla (px SVG) para un objeto de altura `heightPx`
 * dado el sol. Apunta en dirección CONTRARIA al sol.
 * Longitud = altura / tan(elevación).
 */
export function shadowVector(azimuth: number, elevation: number, heightPx: number): [number, number] {
  if (elevation <= 1) elevation = 1 // sombras casi infinitas al amanecer/atardecer: recortar
  const len = heightPx / Math.tan(elevation * RAD)
  const az = azimuth * RAD
  // sol al este (az 90) → sombra hacia el oeste (-x); sol al norte → sombra al sur (+y)
  const dx = -Math.sin(az) * len
  const dy = Math.cos(az) * len
  return [dx, dy]
}

/** Etiqueta corta de fecha a partir del día del año. */
export function dayLabel(dayOfYear: number): string {
  const d = new Date(2026, 0, 1)
  d.setDate(dayOfYear)
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
}

/** Día del año de una fecha (mes 1-12, día 1-31). */
export function dayOfYear(month: number, day: number): number {
  const d = new Date(2026, month - 1, day)
  const start = new Date(2026, 0, 1)
  return Math.round((d.getTime() - start.getTime()) / 86400000) + 1
}

/** Envoltura convexa (monotone chain) para ≤ 8 puntos del rect de sombra. */
export function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const n = p.length
  if (n < 3) return p
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Array<[number, number]> = []
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop()
    lower.push(pt)
  }
  const upper: Array<[number, number]> = []
  for (let i = n - 1; i >= 0; i--) {
    const pt = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop()
    upper.push(pt)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}
