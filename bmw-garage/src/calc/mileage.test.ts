import { describe, expect, it } from 'vitest'
import { collectReadings, computeMileageStats, estimateDateForOdometer, odometerAt, projectAhead, projectOdometer, type Reading } from './mileage'
import { addDays } from '../lib/dates'
import type { MileageEntry } from '../types/models'

const T = '2025-10-01T00:00:00.000Z'
let n = 0
const m = (date: string, odometer: number): MileageEntry => ({ id: 'm' + n++, date, odometer, note: '', createdAt: T, updatedAt: T })
const stats = (entries: MileageEntry[], window: 'auto' | 7 | 30 | 90 = 'auto') =>
  computeMileageStats(collectReadings({ mileage: entries }), { window })

describe('mileage engine', () => {
  const latestDate = '2025-10-01'
  // 69.7 mi/day for 40 days ending at 65,482
  const steady = Array.from({ length: 9 }, (_, i) => {
    const daysBack = 40 - i * 5
    return m(addDays(latestDate, -daysBack), Math.round(65482 - 69.7 * daysBack))
  }).concat([m(latestDate, 65482)])

  it('computes daily / weekly / monthly averages from actual readings', () => {
    const s = stats(steady)
    expect(s.status).toBe('ok')
    expect(s.latest!.odometer).toBe(65482)
    expect(s.dailyAvg!).toBeCloseTo(69.7, 0)
    expect(s.weeklyAvg!).toBeCloseTo(488, -1)
    expect(s.monthlyAvg!).toBeCloseTo(69.7 * 30.4375, -1)
    expect(s.windowUsed).toBe(30)
  })

  it('projects = latest actual + daily avg x days (and labels nothing as actual)', () => {
    const s = stats(steady)
    expect(projectAhead(s, 7)!).toBeCloseTo(65970, -1)
    expect(projectAhead(s, 30)!).toBeCloseTo(65482 + 69.7 * 30, -1)
    expect(projectOdometer(s, addDays(latestDate, 7))!).toBeCloseTo(65970, -1)
    // a date in the past never projects below the latest actual reading
    expect(projectOdometer(s, addDays(latestDate, -3))).toBe(65482)
  })

  it('actual miles in the last 7 days come from readings, not the projection', () => {
    const s = stats(steady)
    expect(s.milesLast7!).toBeCloseTo(488, -1)
    expect(s.milesLast30!).toBeCloseTo(69.7 * 30, -1)
  })

  it('says "collecting history" instead of guessing with too little data', () => {
    expect(stats([]).status).toBe('insufficient')
    const one = stats([m('2025-10-01', 65000)])
    expect(one.status).toBe('insufficient')
    expect(one.message).toMatch(/Collecting mileage history/)
    expect(one.dailyAvg).toBeNull()
    expect(projectAhead(one, 7)).toBeNull()
    const sameWeek = stats([m('2025-10-01', 65000), m('2025-10-02', 65070)])
    expect(sameWeek.status).toBe('insufficient')
  })

  it('falls back to a shorter window when history is short', () => {
    const s = stats([m('2025-09-20', 64000), m('2025-10-01', 64770)]) // 11 days, 70/day
    expect(s.status).toBe('ok')
    expect(s.windowUsed).toBe(7)
    expect(s.dailyAvg!).toBeCloseTo(70, 0)
    const s2 = stats([m('2025-09-27', 64000), m('2025-10-01', 64280)]) // 4 days
    expect(s2.windowUsed).toBe('all')
    expect(s2.dailyAvg!).toBeCloseTo(70, 0)
  })

  it('honours an explicit window and recalibrates when a new reading is entered', () => {
    const before = stats(steady)
    const faster = [...steady, m(addDays(latestDate, 7), 65482 + 7 * 100)]
    const after = stats(faster)
    expect(after.latest!.odometer).toBe(66182)
    expect(after.dailyAvg!).toBeGreaterThan(before.dailyAvg!)
    expect(stats(steady, 7).windowUsed).toBe(7)
    expect(stats(steady, 90).windowUsed).toBe(30) // 90 not available with 40 days -> auto choice
  })

  it('flags readings that make the odometer go backwards and keeps them out of the averages', () => {
    const bad = [...steady, m(addDays(latestDate, -2), 99999)] // typo: absurdly high, earlier than the latest
    const readings = collectReadings({ mileage: bad })
    const flagged = readings.filter(r => !r.valid)
    expect(flagged).toHaveLength(1)
    expect(flagged[0].odometer).toBe(99999)
    expect(computeMileageStats(readings).latest!.odometer).toBe(65482)
  })

  it('uses fuel + service odometers as extra readings but manual readings win conflicts', () => {
    const fuel = [{ id: 'f1', date: '2025-09-25', odometer: 1, gallons: 10, pricePerGallon: 4, totalPrice: 40, fuelType: 'premium', station: '', full: true, missedPrevious: false, notes: '', createdAt: T, updatedAt: T }] as never
    const r = collectReadings({ mileage: steady, fuel })
    expect(r.find(x => x.source === 'fuel')!.valid).toBe(false)
    const r2 = collectReadings({ mileage: steady, fuel, settings: { useFuelAndServiceReadings: false } })
    expect(r2.some(x => x.source === 'fuel')).toBe(false)
  })

  it('interpolates the odometer between readings and estimates when a mileage will be reached', () => {
    const rs: Reading[] = collectReadings({ mileage: [m('2025-09-01', 1000), m('2025-09-11', 1100)] })
    expect(odometerAt(rs, '2025-09-06')).toBe(1050)
    expect(odometerAt(rs, '2025-08-01')).toBeNull()
    const s = stats(steady)
    const eta = estimateDateForOdometer(s, 65482 + 697)
    expect(eta).toBe(addDays(latestDate, 10))
    expect(estimateDateForOdometer(s, 60000)).toBeNull()
  })

  it('reports miles since purchase', () => {
    const s = computeMileageStats(collectReadings({ mileage: steady, vehicle: { purchaseDate: '2025-01-01', purchaseMileage: 52300 } }), { vehicle: { purchaseMileage: 52300 } })
    expect(s.sincePurchase).toBe(65482 - 52300)
  })
})
