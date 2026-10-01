import type { FuelEntry, ID } from '../types/models'
import { monthKey, weekKey, yearKey } from '../lib/dates'
import { round2 } from '../lib/format'

/**
 * Fuel engine. MPG is NEVER "this odometer / this gallons".
 *
 * Tank-to-tank method:
 *   - A FULL fill-up with a valid odometer is an anchor.
 *   - For the next full fill-up:  miles = odo - anchorOdo,  gallons = every fill since the anchor
 *     (partial fills in between included, the anchor's own gallons excluded),  MPG = miles / gallons.
 *   - Anything that makes that unknowable (missing odometer on a full fill, an odometer that did not
 *     increase, an explicit "missed fill-up") breaks the chain and we wait for the next full tank
 *     instead of guessing.
 */

export type MpgStatus =
  | 'valid'       // MPG computed
  | 'baseline'    // first full tank with odometer: becomes the anchor; MPG is waiting for the next full tank
  | 'partial'     // partial fill: gallons are carried into the next full-tank calculation
  | 'noOdometer'  // full tank without odometer: chain broken
  | 'badOdometer' // odometer not higher than the previous full fill: chain broken
  | 'chainBreak'  // user flagged a missed fill-up before this one: this fill becomes a new baseline
  | 'suspect'     // computed but outside plausible MPG bounds: shown, excluded from averages

export interface FuelRow {
  entry: FuelEntry
  status: MpgStatus
  /** MPG for valid/suspect rows */
  mpg: number | null
  miles: number | null
  gallonsUsed: number | null
  segmentCost: number | null
  reason: string
}

export interface FuelStats {
  rows: FuelRow[]
  validCount: number
  currentMpg: number | null
  averageMpg: number | null
  bestMpg: number | null
  worstMpg: number | null
  totalGallons: number
  totalCost: number
  averagePrice: number | null
  /** Fuel cost per mile over the valid tank-to-tank segments only. */
  costPerMile: number | null
  validMiles: number
  /** 'ready' | 'waiting' (have a baseline, need another full tank) | 'empty' (nothing usable yet) */
  mpgState: 'ready' | 'waiting' | 'empty'
  message: string
}

export interface FuelOptions { mpgMin?: number; mpgMax?: number }

/** Fill in the missing member of {gallons, price/gal, total} when two are known. */
export function completeFuelAmounts(a: { gallons?: number | null; pricePerGallon?: number | null; totalPrice?: number | null }) {
  let { gallons, pricePerGallon, totalPrice } = a
  const has = (v: number | null | undefined): v is number => v != null && isFinite(v) && v > 0
  if (has(gallons) && has(pricePerGallon) && !has(totalPrice)) totalPrice = round2(gallons * pricePerGallon)
  else if (has(gallons) && has(totalPrice) && !has(pricePerGallon)) pricePerGallon = Math.round((totalPrice / gallons) * 1000) / 1000
  else if (has(totalPrice) && has(pricePerGallon) && !has(gallons)) gallons = Math.round((totalPrice / pricePerGallon) * 1000) / 1000
  return { gallons: gallons ?? null, pricePerGallon: pricePerGallon ?? null, totalPrice: totalPrice ?? null }
}

export function sortFuel(entries: FuelEntry[]): FuelEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    const ao = a.odometer ?? Infinity, bo = b.odometer ?? Infinity
    if (ao !== bo) return ao - bo
    return a.createdAt < b.createdAt ? -1 : 1
  })
}

export function analyzeFuel(entriesIn: FuelEntry[], opts: FuelOptions = {}): FuelStats {
  const mpgMin = opts.mpgMin ?? 8
  const mpgMax = opts.mpgMax ?? 45
  const entries = sortFuel(entriesIn)
  const rows: FuelRow[] = []

  let anchor: FuelEntry | null = null
  let gallonsSince = 0
  let costSince = 0

  for (const e of entries) {
    const row: FuelRow = { entry: e, status: 'partial', mpg: null, miles: null, gallonsUsed: null, segmentCost: null, reason: '' }

    if (e.missedPrevious) {
      // Fuel burned before this fill is unknown, so the old chain can't be trusted.
      anchor = null; gallonsSince = 0; costSince = 0
      row.reason = 'Previous fill-up(s) not logged – MPG chain restarted here. '
    }

    if (!e.full) {
      row.status = e.missedPrevious ? 'chainBreak' : 'partial'
      row.reason += anchor
        ? 'Partial fill – its gallons are included in the next full-tank MPG.'
        : 'Partial fill – MPG needs a full-tank baseline first.'
      if (anchor) { gallonsSince += e.gallons; costSince += e.totalPrice }
      rows.push(row)
      continue
    }

    // Full tank
    if (e.odometer == null) {
      row.status = 'noOdometer'
      row.reason += 'Full tank but no odometer – add the odometer reading to include this fill in MPG.'
      anchor = null; gallonsSince = 0; costSince = 0
      rows.push(row)
      continue
    }
    if (anchor && e.odometer <= (anchor.odometer as number)) {
      row.status = 'badOdometer'
      row.reason += `Odometer (${e.odometer.toLocaleString()}) is not higher than the previous full fill (${(anchor.odometer as number).toLocaleString()}) – check the entry.`
      anchor = null; gallonsSince = 0; costSince = 0
      rows.push(row)
      continue
    }
    if (!anchor) {
      row.status = e.missedPrevious ? 'chainBreak' : 'baseline'
      row.reason += 'Baseline full tank – MPG appears after the next full tank.'
      anchor = e; gallonsSince = 0; costSince = 0
      rows.push(row)
      continue
    }

    const miles = e.odometer - (anchor.odometer as number)
    const gallons = gallonsSince + e.gallons
    const mpg = gallons > 0 ? miles / gallons : null
    row.miles = miles
    row.gallonsUsed = gallons
    row.segmentCost = costSince + e.totalPrice
    row.mpg = mpg
    if (mpg == null || mpg < mpgMin || mpg > mpgMax) {
      row.status = 'suspect'
      row.reason = `${mpg == null ? 'No gallons' : mpg.toFixed(1) + ' MPG'} is outside the plausible ${mpgMin}–${mpgMax} range – excluded from averages. Check odometer/gallons or a missed fill-up.`
    } else {
      row.status = 'valid'
      row.reason = `${miles.toLocaleString()} mi ÷ ${gallons.toFixed(2)} gal`
    }
    anchor = e; gallonsSince = 0; costSince = 0
    rows.push(row)
  }

  const valid = rows.filter(r => r.status === 'valid')
  const validMiles = valid.reduce((s, r) => s + (r.miles ?? 0), 0)
  const validGallons = valid.reduce((s, r) => s + (r.gallonsUsed ?? 0), 0)
  const validCost = valid.reduce((s, r) => s + (r.segmentCost ?? 0), 0)
  const totalGallons = entries.reduce((s, e) => s + e.gallons, 0)
  const totalCost = entries.reduce((s, e) => s + e.totalPrice, 0)
  const mpgs = valid.map(r => r.mpg as number)

  const hasBaseline = anchor != null
  let mpgState: FuelStats['mpgState'] = valid.length ? 'ready' : hasBaseline ? 'waiting' : 'empty'
  let message = ''
  if (mpgState === 'waiting') message = 'Waiting for next full tank'
  else if (mpgState === 'empty') message = entries.length
    ? 'Log a full tank with its odometer reading to set a baseline'
    : 'Add your first fill-up to start tracking MPG'
  // After the latest valid MPG, a new baseline may be waiting; MPG stays 'ready' but current MPG is the last valid one.
  if (valid.length === 0 && mpgState === 'ready') mpgState = 'waiting'

  return {
    rows,
    validCount: valid.length,
    currentMpg: valid.length ? (valid[valid.length - 1].mpg as number) : null,
    averageMpg: validGallons > 0 ? validMiles / validGallons : null,
    bestMpg: mpgs.length ? Math.max(...mpgs) : null,
    worstMpg: mpgs.length ? Math.min(...mpgs) : null,
    totalGallons,
    totalCost,
    averagePrice: totalGallons > 0 ? totalCost / totalGallons : null,
    costPerMile: validMiles > 0 ? validCost / validMiles : null,
    validMiles,
    mpgState,
    message
  }
}

export type Bucket = 'week' | 'month' | 'year'

export function bucketKey(date: string, by: Bucket): string {
  return by === 'week' ? weekKey(date) : by === 'month' ? monthKey(date) : yearKey(date)
}

/** Total spend grouped by week / month / year, ascending by key. */
export function spendBy(items: Array<{ date: string; amount: number }>, by: Bucket): Array<{ key: string; total: number; count: number }> {
  const m = new Map<string, { total: number; count: number }>()
  for (const it of items) {
    const k = bucketKey(it.date, by)
    const cur = m.get(k) ?? { total: 0, count: 0 }
    cur.total += it.amount
    cur.count += 1
    m.set(k, cur)
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, v]) => ({ key, total: round2(v.total), count: v.count }))
}

export function fuelSpend(entries: FuelEntry[], by: Bucket) {
  return spendBy(entries.map(e => ({ date: e.date, amount: e.totalPrice })), by)
}

/** Simple case-insensitive search across the fields a person would remember. */
export function searchFuel(entries: FuelEntry[], q: string): FuelEntry[] {
  const t = q.trim().toLowerCase()
  if (!t) return entries
  return entries.filter(e =>
    [e.station, e.notes, e.date, e.fuelType, String(e.odometer ?? ''), e.gallons.toFixed(2), e.totalPrice.toFixed(2)]
      .some(f => f.toLowerCase().includes(t))
  )
}

export type FuelRowIndex = Map<ID, FuelRow>
export const indexRows = (rows: FuelRow[]): FuelRowIndex => new Map(rows.map(r => [r.entry.id, r]))
