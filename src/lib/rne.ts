// ============================================================
// JARUMY APP — Constantes normativas compartidas (RNE Perú).
// Única fuente de verdad para los límites usados por MÁS DE UN
// módulo de análisis: normativa.ts y evacuation.ts validan la
// misma cifra, evitando que un plano pase un check y falle otro.
// ============================================================

/** RNE A.130 — distancia máxima de recorrido hasta la salida (vivienda, sin rociadores). */
export const MAX_TRAVEL_M = 25

/** RNE A.130 — aforo por puerta: 0.8 personas por cm de ancho libre. */
export const PERSONS_PER_CM = 0.8

/** RNE A.130 (Tabla 2) — ancho mínimo de puertas y salidas. */
export const MIN_EXIT_DOOR_M = 0.9

/** RNE A.010 art. 12 — ancho mínimo de puerta de acceso accesible. */
export const MIN_ACCESS_DOOR_M = 0.9

/** RNE A.010 — ancho mínimo de puertas interiores. */
export const MIN_INTERIOR_DOOR_M = 0.7
