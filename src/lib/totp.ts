// ============================================================
// JARUMY APP — TOTP real (RFC 6238 / RFC 4226) para 2FA.
// Solo usa node:crypto (createHmac sha1 + randomBytes). Pensado
// para rutas API de Next.js (lado servidor); sin 'use client'.
// ============================================================

import { createHmac, randomBytes } from 'node:crypto'

// alfabeto base32 estándar (RFC 4648) — sin relleno '='
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * Genera un secreto TOTP aleatorio codificado en base32 (A-Z2-7),
 * sin relleno. `lengthBytes` debe estar entre 10 y 64 (20 bytes =
 * 160 bits es el estándar de Google Authenticator).
 */
export function generateTotpSecret(lengthBytes = 20): string {
  const n = Math.max(10, Math.min(64, Math.floor(lengthBytes)))
  const buf = randomBytes(n)
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

/** Decodifica base32 (RFC 4648, tolera minúsculas y relleno) a Buffer. */
export function base32Decode(s: string): Buffer {
  const clean = (s ?? '').toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/**
 * Código TOTP de `digits` dígitos para el instante actual con un
 * desplazamiento opcional en ms. Truncado dinámico del RFC 4226:
 * offset = último byte & 0xf; código = (UInt32BE(offset) & 0x7fffffff) % 10^digits.
 */
export function totpCode(secretBase32: string, timeStepOffsetMs = 0, step = 30, digits = 6): string {
  const key = base32Decode(secretBase32)
  if (key.length === 0) throw new Error('Secreto TOTP vacío o base32 inválido')
  const counter = Math.floor((Date.now() + timeStepOffsetMs) / 1000 / step)
  // contador de 8 bytes big-endian
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  msg.writeUInt32BE(counter % 2 ** 32, 4)
  const digest = createHmac('sha1', key).update(msg).digest()
  const offset = digest[digest.length - 1] & 0xf
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits
  return code.toString().padStart(digits, '0')
}

/** Comparación en tiempo ~constante (XOR acumulado, sin corte anticipado). */
const safeEqualStr = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifica un código TOTP con tolerancia de ±1 ventana (±30 s),
 * como un lector de autenticador real.
 */
export function verifyTotp(secretBase32: string, code: string): boolean {
  const clean = (code ?? '').replace(/\D/g, '')
  if (clean.length !== 6) return false
  // ventana actual −1 · 0 · +1
  for (const offsetMs of [0, -30000, 30000]) {
    if (safeEqualStr(totpCode(secretBase32, offsetMs), clean)) return true
  }
  return false
}

/** URI otpauth:// para registrar el secreto en apps de autenticador. */
export function otpauthUri(secretBase32: string, account: string, issuer = 'Jarumy'): string {
  return [
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`,
    `?secret=${encodeURIComponent(secretBase32)}`,
    `&issuer=${encodeURIComponent(issuer)}`,
    '&algorithm=SHA1&digits=6&period=30',
  ].join('')
}
