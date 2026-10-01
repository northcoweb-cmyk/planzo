/** VIN helpers. We never invent VIN data: we only validate what the user typed. */
const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

export function normalizeVin(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export type VinCheck = { ok: boolean; message: string }

export function checkVin(raw: string): VinCheck {
  const vin = normalizeVin(raw)
  if (!vin) return { ok: true, message: '' }
  if (vin.length !== 17) return { ok: false, message: `VINs are 17 characters (${vin.length} entered)` }
  if (/[IOQ]/.test(vin)) return { ok: false, message: 'VINs never contain the letters I, O or Q' }
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const c = vin[i]
    const v = /\d/.test(c) ? Number(c) : TRANSLIT[c]
    sum += v * WEIGHTS[i]
  }
  const r = sum % 11
  const expected = r === 10 ? 'X' : String(r)
  if (vin[8] !== expected) return { ok: false, message: 'Check digit does not match – double-check the VIN' }
  return { ok: true, message: 'Valid VIN' }
}
