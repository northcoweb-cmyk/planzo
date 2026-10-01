import { describe, expect, it } from 'vitest'
import { analyzeFuel, completeFuelAmounts, fuelSpend, searchFuel } from './fuel'
import type { FuelEntry } from '../types/models'

let n = 0
const f = (p: Partial<FuelEntry> & { date: string; gallons: number }): FuelEntry => ({
  id: 'f' + n++, odometer: null, pricePerGallon: 4, totalPrice: Math.round(p.gallons * 4 * 100) / 100, fuelType: 'premium',
  station: '', full: true, missedPrevious: false, notes: '', createdAt: '2025-01-01T00:00:' + String(n).padStart(2, '0') + 'Z', updatedAt: '', ...p
})

describe('MPG', () => {
  it('matches the worked example: 64,900 -> 65,180 = 280 mi, 13.0 gal = 21.54 MPG', () => {
    const s = analyzeFuel([
      f({ date: '2025-09-20', odometer: 64900, gallons: 12 }),
      f({ date: '2025-09-27', odometer: 65180, gallons: 13.0 })
    ])
    const last = s.rows[1]
    expect(last.status).toBe('valid')
    expect(last.miles).toBe(280)
    expect(last.mpg!).toBeCloseTo(21.54, 2)
    expect(s.currentMpg!).toBeCloseTo(21.54, 2)
  })

  it('never computes MPG from a single fill-up: waits for the next full tank', () => {
    const s = analyzeFuel([f({ date: '2025-09-20', odometer: 64900, gallons: 12 })])
    expect(s.rows[0].status).toBe('baseline')
    expect(s.rows[0].mpg).toBeNull()
    expect(s.currentMpg).toBeNull()
    expect(s.mpgState).toBe('waiting')
    expect(s.message).toBe('Waiting for next full tank')
    expect(analyzeFuel([]).mpgState).toBe('empty')
  })

  it('includes partial fills in the following full-tank calculation', () => {
    const s = analyzeFuel([
      f({ date: '2025-09-01', odometer: 1000, gallons: 10 }),
      f({ date: '2025-09-04', odometer: 1100, gallons: 4, full: false }),
      f({ date: '2025-09-08', odometer: 1300, gallons: 10 })
    ])
    expect(s.rows[1].status).toBe('partial')
    // 300 miles / (4 partial + 10 final) gallons
    expect(s.rows[2].mpg!).toBeCloseTo(300 / 14, 5)
    expect(s.rows[2].gallonsUsed).toBe(14)
  })

  it('a partial fill before any full baseline cannot create MPG', () => {
    const s = analyzeFuel([f({ date: '2025-09-01', odometer: 1000, gallons: 5, full: false }), f({ date: '2025-09-05', odometer: 1100, gallons: 9 })])
    expect(s.rows[1].status).toBe('baseline')
    expect(s.currentMpg).toBeNull()
  })

  it('breaks the chain on a missed fill-up instead of inflating MPG', () => {
    const s = analyzeFuel([
      f({ date: '2025-09-01', odometer: 1000, gallons: 10 }),
      f({ date: '2025-09-08', odometer: 1210, gallons: 10 }),
      f({ date: '2025-09-22', odometer: 1800, gallons: 12, missedPrevious: true }),
      f({ date: '2025-09-29', odometer: 2020, gallons: 10 })
    ])
    expect(s.rows[2].status).toBe('chainBreak')
    expect(s.rows[2].mpg).toBeNull()
    expect(s.rows[3].mpg!).toBeCloseTo(22, 5)
    expect(s.validCount).toBe(2)
  })

  it('handles missing and non-increasing odometers without producing nonsense', () => {
    const s = analyzeFuel([
      f({ date: '2025-09-01', odometer: 1000, gallons: 10 }),
      f({ date: '2025-09-08', odometer: null, gallons: 10 }),
      f({ date: '2025-09-15', odometer: 1400, gallons: 10 }),
      f({ date: '2025-09-20', odometer: 1300, gallons: 10 }),
      f({ date: '2025-09-27', odometer: 1620, gallons: 11 })
    ])
    expect(s.rows[1].status).toBe('noOdometer')
    expect(s.rows[2].status).toBe('baseline') // chain was broken by the odometer-less full tank
    expect(s.rows[3].status).toBe('badOdometer')
    expect(s.rows[4].status).toBe('baseline')
    expect(s.validCount).toBe(0)
  })

  it('flags implausible MPG as suspect and keeps it out of the averages', () => {
    const s = analyzeFuel([
      f({ date: '2025-09-01', odometer: 1000, gallons: 10 }),
      f({ date: '2025-09-08', odometer: 1220, gallons: 10 }), // 22
      f({ date: '2025-09-15', odometer: 3220, gallons: 10 }) // 200 mpg: typo
    ])
    expect(s.rows[2].status).toBe('suspect')
    expect(s.averageMpg!).toBeCloseTo(22, 5)
    expect(s.bestMpg!).toBeCloseTo(22, 5)
  })

  it('computes average (distance-weighted), best, worst, totals and cost per mile', () => {
    const s = analyzeFuel([
      f({ date: '2025-09-01', odometer: 1000, gallons: 10, pricePerGallon: 4, totalPrice: 40 }),
      f({ date: '2025-09-08', odometer: 1200, gallons: 10, pricePerGallon: 4, totalPrice: 40 }), // 20 mpg
      f({ date: '2025-09-15', odometer: 1500, gallons: 10, pricePerGallon: 5, totalPrice: 50 }) // 30 mpg
    ])
    expect(s.bestMpg).toBe(30)
    expect(s.worstMpg).toBe(20)
    expect(s.averageMpg!).toBeCloseTo(500 / 20, 5) // 25, not mean-of-means
    expect(s.currentMpg).toBe(30)
    expect(s.totalGallons).toBe(30)
    expect(s.totalCost).toBe(130)
    expect(s.averagePrice!).toBeCloseTo(130 / 30, 5)
    // cost over the two valid segments: (40 + 50) / 500 miles
    expect(s.costPerMile!).toBeCloseTo(90 / 500, 5)
  })

  it('sorts out-of-order entries chronologically', () => {
    const s = analyzeFuel([
      f({ date: '2025-09-08', odometer: 1200, gallons: 10 }),
      f({ date: '2025-09-01', odometer: 1000, gallons: 10 })
    ])
    expect(s.rows[1].mpg).toBe(20)
  })
})

describe('fuel amounts / spend / search', () => {
  it('derives the missing one of gallons / price / total', () => {
    expect(completeFuelAmounts({ gallons: 13, pricePerGallon: 3.999 }).totalPrice).toBe(51.99)
    expect(completeFuelAmounts({ gallons: 10, totalPrice: 40 }).pricePerGallon).toBe(4)
    expect(completeFuelAmounts({ pricePerGallon: 4, totalPrice: 40 }).gallons).toBe(10)
    expect(completeFuelAmounts({ gallons: 10 }).totalPrice).toBeNull()
  })

  it('totals fuel spending by week / month / year', () => {
    const e = [f({ date: '2025-08-30', gallons: 10, totalPrice: 40 }), f({ date: '2025-09-02', gallons: 10, totalPrice: 41 }), f({ date: '2025-09-10', gallons: 10, totalPrice: 42.5 }), f({ date: '2026-01-02', gallons: 10, totalPrice: 50 })]
    expect(fuelSpend(e, 'month')).toEqual([{ key: '2025-08', total: 40, count: 1 }, { key: '2025-09', total: 83.5, count: 2 }, { key: '2026-01', total: 50, count: 1 }])
    expect(fuelSpend(e, 'year').map(x => x.total)).toEqual([123.5, 50])
    const wk = fuelSpend(e, 'week')
    expect(wk.map(x => x.key)).toEqual(['2025-08-25', '2025-09-01', '2025-09-08', '2025-12-29']) // weeks start Monday
  })

  it('searches station, notes, date and numbers', () => {
    const e = [f({ date: '2025-09-02', gallons: 10, station: 'Shell Main St' }), f({ date: '2025-09-09', gallons: 11, station: 'Costco', notes: 'road trip' })]
    expect(searchFuel(e, 'shell')).toHaveLength(1)
    expect(searchFuel(e, 'trip')).toHaveLength(1)
    expect(searchFuel(e, '2025-09')).toHaveLength(2)
    expect(searchFuel(e, '')).toHaveLength(2)
  })
})
