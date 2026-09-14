// Pruebas TOTP (RFC 6238/4226): vector de referencia de RFC y
// verificación con tolerancia de ±1 ventana.
import { describe, expect, it, vi } from 'vitest'
import { generateTotpSecret, base32Decode, totpCode, totpNow, verifyTotp, otpauthUri } from '../src/lib/totp'

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

  it('totpNow: el código en vivo coincide con totpCode y la cuenta regresiva es 1..30', () => {
    const s = generateTotpSecret()
    const { code, secondsRemaining } = totpNow(s)
    expect(code).toMatch(/^\d{6}$/)
    expect(code).toBe(totpCode(s)) // mismo código que Google Authenticator
    expect(secondsRemaining).toBeGreaterThanOrEqual(1)
    expect(secondsRemaining).toBeLessThanOrEqual(30)
    // el código cambia con la ventana: reloj adelantado 35 s → otra ventana
    vi.setSystemTime(Date.now() + 35_000)
    const next = totpNow(s)
    expect(next.secondsRemaining).toBeGreaterThanOrEqual(1)
    vi.useRealTimers()
  })
})

describe('Hash de contraseñas — scrypt + sal aleatoria', () => {
  // import diferido: auth.ts depende de prisma/db; solo probamos el hash
  // (la importación de db no ejecuta consultas hasta su primer uso).
  it('hashPassword/verifyPassword: redondo correcto, rechaza incorrecta', async () => {
    const { hashPassword, verifyPassword } = await import('../src/lib/auth')
    const stored = hashPassword('Muro#2024Seguro')
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/) // sal:hash
    expect(stored).not.toContain('Muro#2024Seguro') // NUNCA texto plano
    expect(verifyPassword('Muro#2024Seguro', stored)).toBe(true)
    expect(verifyPassword('muro2024', stored)).toBe(false)
    expect(verifyPassword('', stored)).toBe(false)
    expect(verifyPassword('Muro#2024Seguro', 'formato-corrupto')).toBe(false)
  })

  it('cada hash usa sal única (dos hashes del mismo password difieren)', async () => {
    const { hashPassword, verifyPassword } = await import('../src/lib/auth')
    const a = hashPassword('MismaClave!9')
    const b = hashPassword('MismaClave!9')
    expect(a).not.toBe(b) // sal aleatoria distinta
    expect(verifyPassword('MismaClave!9', a)).toBe(true)
    expect(verifyPassword('MismaClave!9', b)).toBe(true)
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
