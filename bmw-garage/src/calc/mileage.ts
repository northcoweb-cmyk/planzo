import type { DateStr, FuelEntry, ID, MileageEntry, ServiceRecord, Settings, Vehicle } from '../types/models'
import { addDays, daysBetween } from '../lib/dates'

/**
 * Mileage engine.
 *
 *   ACTUAL    = odometer readings the user entered (or that came with a fuel/service record).
 *   PROJECTED = latestActual + averageDaily x days. Never presented as a reading.
 *
 * Nothing here knows about fuel level; this is strictly an odometer-history model.
 */

export type ReadingSource = 'manual' | 'fuel' | 'service' | 'purchase'

export interface Reading {
  date: DateStr
  odometer: number
  source: ReadingSource
  refId?: ID
  /** False when the value contradicts the rest of the history (e.g. odometer goes backwards). */
  valid: boolean
  issue?: string
}

export const MIN_SPAN_DAYS = 3

export interface CollectInput {
  mileage: MileageEntry[]
  fuel?: FuelEntry[]
  services?: ServiceRecord[]
  vehicle?: Pick<Vehicle, 'purchaseDate' | 'purchaseMileage'> | null
  settings?: Pick<Settings, 'useFuelAndServiceReadings'> | null
}

/** Gather every known odometer value, sort chronologically and flag contradictions. */
export function collectReadings(input: CollectInput): Reading[] {
  const raw: Reading[] = []
  for (const m of input.mileage) raw.push({ date: m.date, odometer: m.odometer, source: 'manual', refId: m.id, valid: true })
  const useExtra = input.settings?.useFuelAndServiceReadings ?? true
  if (useExtra) {
    for (const f of input.fuel ?? []) {
      if (f.odometer != null) raw.push({ date: f.date, odometer: f.odometer, source: 'fuel', refId: f.id, valid: true })
    }
    for (const s of input.services ?? []) {
      if (s.mileage != null) raw.push({ date: s.date, odometer: s.mileage, source: 'service', refId: s.id, valid: true })
    }
  }
  const v = input.vehicle
  if (v && v.purchaseDate && v.purchaseMileage != null) {
    raw.push({ date: v.purchaseDate, odometer: v.purchaseMileage, source: 'purchase', valid: true })
  }
  return validateReadings(raw)
}

const WEIGHT: Record<ReadingSource, number> = { manual: 3, purchase: 3, service: 2, fuel: 1.5 }

/**
 * An odometer can never go down. Find the heaviest non-decreasing subsequence (deliberate manual
 * readings outweigh fuel/service ones) and flag everything else, so a single typo cannot poison
 * the averages and the user can see exactly which entry disagrees.
 */
export function validateReadings(raw: Reading[]): Reading[] {
  const r = raw
    .map(x => ({ ...x, valid: true, issue: undefined as string | undefined }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.odometer - b.odometer))
  const n = r.length
  if (n === 0) return r
  const best = new Array<number>(n).fill(0)
  const prev = new Array<number>(n).fill(-1)
  for (let i = 0; i < n; i++) {
    best[i] = WEIGHT[r[i].source]
    for (let j = 0; j < i; j++) {
      if (r[j].odometer <= r[i].odometer && best[j] + WEIGHT[r[i].source] > best[i]) {
        best[i] = best[j] + WEIGHT[r[i].source]
        prev[i] = j
      }
    }
  }
  let end = 0
  for (let i = 1; i < n; i++) if (best[i] > best[end]) end = i
  const keep = new Set<number>()
  for (let i = end; i !== -1; i = prev[i]) keep.add(i)
  r.forEach((x, i) => {
    if (!keep.has(i)) {
      x.valid = false
      x.issue = 'Conflicts with other readings (odometer would go backwards) – ignored in averages'
    }
  })
  return r
}

export interface RateWindow { days: number; milesPerDay: number }

export interface MileageStats {
  status: 'ok' | 'insufficient'
  /** Why we have no rate yet – shown to the user instead of a made-up number. */
  message: string
  latest: Reading | null
  validCount: number
  dailyAvg: number | null
  weeklyAvg: number | null
  monthlyAvg: number | null
  /** The window the rate is based on: 7/30/90 rolling days, or 'all' (whole short history). */
  windowUsed: 7 | 30 | 90 | 'all' | null
  windowDays: number | null
  windows: { d7: RateWindow | null; d30: RateWindow | null; d90: RateWindow | null }
  /** Actual miles over the trailing 7 days ending at the latest reading (interpolated between readings). */
  milesLast7: number | null
  milesLast30: number | null
  sincePurchase: number | null
  historyDays: number
}

/** Linear interpolation of the odometer on a date, only inside the known range. */
export function odometerAt(readings: Reading[], date: DateStr): number | null {
  const v = readings.filter(r => r.valid)
  if (v.length === 0) return null
  if (date < v[0].date || date > v[v.length - 1].date) return null
  for (let i = 0; i < v.length; i++) {
    if (v[i].date === date) {
      // several readings on the same day: use the last one
      let k = i
      while (k + 1 < v.length && v[k + 1].date === date) k++
      return v[k].odometer
    }
    if (v[i].date > date) {
      const a = v[i - 1], b = v[i]
      const span = daysBetween(a.date, b.date)
      if (span <= 0) return b.odometer
      return a.odometer + ((b.odometer - a.odometer) * daysBetween(a.date, date)) / span
    }
  }
  return null
}

export function computeMileageStats(
  readings: Reading[],
  opts: { window?: 'auto' | 7 | 30 | 90; vehicle?: Pick<Vehicle, 'purchaseMileage'> | null } = {}
): MileageStats {
  const valid = readings.filter(r => r.valid)
  const empty: MileageStats = {
    status: 'insufficient', message: 'Add an odometer reading to start tracking', latest: null, validCount: valid.length,
    dailyAvg: null, weeklyAvg: null, monthlyAvg: null, windowUsed: null, windowDays: null,
    windows: { d7: null, d30: null, d90: null }, milesLast7: null, milesLast30: null, sincePurchase: null, historyDays: 0
  }
  if (valid.length === 0) return empty
  const latest = valid[valid.length - 1]
  const first = valid[0]
  const historyDays = daysBetween(first.date, latest.date)
  const sincePurchase = opts.vehicle?.purchaseMileage != null ? latest.odometer - opts.vehicle.purchaseMileage : null

  const rateFor = (days: number): RateWindow | null => {
    if (historyDays < days) return null
    const start = odometerAt(valid, addDays(latest.date, -days))
    if (start == null) return null
    return { days, milesPerDay: Math.max(0, (latest.odometer - start) / days) }
  }
  const windows = { d7: rateFor(7), d30: rateFor(30), d90: rateFor(90) }
  const base: MileageStats = { ...empty, latest, sincePurchase, historyDays, windows }
  base.milesLast7 = windows.d7 ? windows.d7.milesPerDay * 7 : null
  base.milesLast30 = windows.d30 ? windows.d30.milesPerDay * 30 : null

  if (historyDays < MIN_SPAN_DAYS) {
    return {
      ...base,
      message: valid.length < 2
        ? 'Collecting mileage history – add another reading in a few days'
        : 'Collecting mileage history – readings need to span at least 3 days'
    }
  }

  const pref = opts.window ?? 'auto'
  let used: 7 | 30 | 90 | 'all'
  let rate: RateWindow
  const pick = (d: 7 | 30 | 90) => ({ used: d, rate: (d === 7 ? windows.d7 : d === 30 ? windows.d30 : windows.d90)! })
  if (pref !== 'auto' && rateFor(pref)) {
    const p = pick(pref); used = p.used; rate = p.rate
  } else if (windows.d30) {
    const p = pick(30); used = p.used; rate = p.rate
  } else if (windows.d7) {
    const p = pick(7); used = p.used; rate = p.rate
  } else {
    used = 'all'
    rate = { days: historyDays, milesPerDay: Math.max(0, (latest.odometer - first.odometer) / historyDays) }
  }
  const daily = rate.milesPerDay
  // With very short histories the 7-day / 30-day numbers are the whole history
  const out: MileageStats = {
    ...base, status: 'ok', message: '', dailyAvg: daily, weeklyAvg: daily * 7, monthlyAvg: daily * 30.4375,
    windowUsed: used, windowDays: rate.days
  }
  return out
}

/** Projected odometer on a future (or current) date. Returns null if there is no rate yet. */
export function projectOdometer(stats: MileageStats, onDate: DateStr): number | null {
  if (stats.status !== 'ok' || !stats.latest || stats.dailyAvg == null) return null
  const days = Math.max(0, daysBetween(stats.latest.date, onDate))
  return stats.latest.odometer + stats.dailyAvg * days
}

/** Projected odometer N days after `from` (default: after the latest reading). */
export function projectAhead(stats: MileageStats, daysAhead: number, from?: DateStr): number | null {
  if (stats.status !== 'ok' || !stats.latest || stats.dailyAvg == null) return null
  const sinceLatest = from ? Math.max(0, daysBetween(stats.latest.date, from)) : 0
  return stats.latest.odometer + stats.dailyAvg * (sinceLatest + daysAhead)
}

/** Date the car is projected to reach a given odometer value. Null when already reached or no rate. */
export function estimateDateForOdometer(stats: MileageStats, odometer: number): DateStr | null {
  if (stats.status !== 'ok' || !stats.latest || !stats.dailyAvg || stats.dailyAvg <= 0) return null
  if (odometer <= stats.latest.odometer) return null
  const days = Math.ceil((odometer - stats.latest.odometer) / stats.dailyAvg)
  return addDays(stats.latest.date, days)
}

/** Best-known current odometer for status calculations: the latest ACTUAL reading. */
export function currentActualMileage(stats: MileageStats): number | null {
  return stats.latest?.odometer ?? null
}
