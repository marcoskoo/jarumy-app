// Pruebas TOTP (RFC 6238/4226): vector de referencia de RFC y
// verificación con tolerancia de ±1 ventana.
import { describe, expect, it, vi } from 'vitest'
import { generateTotpSecret, base32Decode, totpCode, verifyTotp, otpauthUri } from '../src/lib/totp'

describe('TOTP RFC 6238 — 2FA real', () => {
  it('genera secretos base32 válidos (A-Z2-7, sin relleno)', () => {
    const s = generateTotpSecret(20)
    expect(s).toMatch(/^[A-Z2-7]+$/)
    expect(base32Decode(s).length).toBe(20) // 160 bits
  })

  it('vector de referencia RFC 4226 (HMAC-SHA1, contador 0..3)', () => {
    // El apéndice RFC 4226 usa la clave ASCII "12345678901234567890".
    // totpCode usa Date.now()/step como contador; fijamos el reloj para
    // obtener contadores deterministas.
    const secret = base32EncodeAscii('12345678901234567890')
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583']
    for (let counter = 0; counter < 8; counter++) {
      const t = counter * 30_000
      vi.setSystemTime(t)
      expect(totpCode(secret)).toBe(expected[counter])
    }
    vi.useRealTimers()
  })

  it('verifica el código actual y rechaza uno inventado', () => {
    const s = generateTotpSecret()
    const code = totpCode(s)
    expect(verifyTotp(s, code)).toBe(true)
    expect(verifyTotp(s, '000000')).toBe(false)
  })

  it('tolera desfase de ±30 s (una ventana)', () => {
    const s = generateTotpSecret()
    const code = totpCode(s)
    vi.setSystemTime(Date.now() + 25_000)
    expect(verifyTotp(s, code)).toBe(true)
    vi.setSystemTime(Date.now() + 90_000) // 3 ventanas: fuera de tolerancia
    expect(verifyTotp(s, code)).toBe(false)
    vi.useRealTimers()
  })

  it('URI otpauth:// bien formada', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'jperez')
    expect(uri).toContain('otpauth://totp/Jarumy:jperez')
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(uri).toContain('period=30')
  })
})

/** codifica ASCII → base32 (para usar los vectores del RFC) */
function base32EncodeAscii(ascii: string): string {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0, out = ''
  for (const ch of ascii) {
    value = (value << 8) | ch.charCodeAt(0)
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}
