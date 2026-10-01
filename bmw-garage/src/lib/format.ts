const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usd3 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3 })

export const n0 = (v: number) => nf0.format(v)
export const n1 = (v: number) => nf1.format(v)
export const n2 = (v: number) => nf2.format(v)
export const miles = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : nf0.format(Math.round(v)))
export const mpg = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : nf1.format(v))
export const mpg2 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : nf2.format(v))
export const money = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : usd2.format(v))
export const money0 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : usd0.format(v))
export const money3 = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : usd3.format(v))
export const signed = (v: number) => (v >= 0 ? '+' : '−') + nf0.format(Math.abs(Math.round(v)))

/** Round to cents without float noise. */
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

/** Parse user text into a number; accepts "65,482", "$12.50". Returns null when empty/invalid. */
export function parseNum(s: string | number | null | undefined): number | null {
  if (s == null) return null
  if (typeof s === 'number') return isFinite(s) ? s : null
  const t = s.replace(/[$,\s]/g, '')
  if (t === '') return null
  const v = Number(t)
  return isFinite(v) ? v : null
}
