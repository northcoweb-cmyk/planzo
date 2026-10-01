import { describe, expect, it } from 'vitest'
import { evaluateItem, groupMaintenance, evaluateAll, nextDueDate, nextDueMileage } from './maintenance'
import { collectReadings, computeMileageStats } from './mileage'
import type { MaintenanceItem, MaintenanceRecord } from '../types/models'
import { ownershipCosts, serviceTotal, costPerMile } from './costs'
import { evaluateReminder } from './reminders'

const T = ''
const item = (o: Partial<MaintenanceItem>): MaintenanceItem => ({ id: 'i', key: '', name: 'Engine Oil', category: 'Engine', intervalMiles: 7500, intervalMonths: null, basis: 'typical', enabled: true, notes: '', createdAt: T, updatedAt: T, ...o })
const rec = (o: Partial<MaintenanceRecord>): MaintenanceRecord => ({ id: 'r' + Math.random(), itemId: 'i', date: '2025-07-01', mileage: 63000, cost: null, serviceId: null, notes: '', createdAt: T, updatedAt: T, ...o })
const settings = { dueSoonMiles: 1000, dueSoonDays: 30 }
const ctx = (currentMileage: number | null, today = '2025-10-01') => ({ currentMileage, today, settings })

describe('maintenance due calculation', () => {
  it('oil: last 63,000 + 7,500 = 70,500; at 65,482 it is GOOD with 5,018 mi left', () => {
    const e = evaluateItem(item({}), [rec({})], ctx(65482))
    expect(nextDueMileage(63000, 7500)).toBe(70500)
    expect(e.nextDueMileage).toBe(70500)
    expect(e.remainingMiles).toBe(5018)
    expect(e.status).toBe('good')
    expect(e.reasons.join(' ')).toMatch(/70,500/)
  })

  it('turns due-soon inside the threshold and overdue past it', () => {
    const at = (last: number) => evaluateItem(item({}), [rec({ mileage: last })], ctx(65482))
    expect(at(59000).status).toBe('good') // due 66,500: 1,018 mi left, just outside the 1,000 mi window
    expect(at(59000).remainingMiles).toBe(1018)
    expect(at(58900).status).toBe('dueSoon') // due 66,400: 918 left
    const over = at(57000) // due 64,500
    expect(over.status).toBe('overdue')
    expect(over.remainingMiles).toBe(-982)
  })

  it('time-based intervals: brake fluid every 24 months', () => {
    const brake = item({ name: 'Brake Fluid', intervalMiles: null, intervalMonths: 24 })
    expect(nextDueDate('2025-09-13', 24)).toBe('2027-09-13')
    expect(evaluateItem(brake, [rec({ date: '2025-09-13', mileage: 63200 })], ctx(65482, '2026-10-01')).status).toBe('good')
    expect(evaluateItem(brake, [rec({ date: '2025-09-13' })], ctx(65482, '2027-08-20')).status).toBe('dueSoon')
    expect(evaluateItem(brake, [rec({ date: '2025-09-13' })], ctx(65482, '2027-10-01')).status).toBe('overdue')
  })

  it('uses whichever of mileage/time is worse when an item has both', () => {
    const oil = item({ intervalMiles: 7500, intervalMonths: 12 })
    const e = evaluateItem(oil, [rec({ date: '2024-06-01', mileage: 63000 })], ctx(65482, '2025-10-01'))
    expect(e.status).toBe('overdue') // time ran out even though mileage is fine
    expect(e.remainingMiles).toBeGreaterThan(0)
  })

  it('does NOT claim something is due without data', () => {
    expect(evaluateItem(item({}), [], ctx(65482)).status).toBe('unknown')
    expect(evaluateItem(item({}), [rec({ mileage: null })], ctx(65482)).status).toBe('unknown')
    expect(evaluateItem(item({}), [rec({})], ctx(null)).status).toBe('unknown')
    expect(evaluateItem(item({ intervalMiles: null }), [rec({})], ctx(65482)).status).toBe('condition')
    expect(evaluateItem(item({ enabled: false }), [rec({})], ctx(65482)).status).toBe('disabled')
    // date-only evaluation is still allowed, and says what it could not check
    const e = evaluateItem(item({ intervalMiles: 7500, intervalMonths: 12 }), [rec({ mileage: null, date: '2025-09-01' })], ctx(65482))
    expect(e.status).toBe('good')
    expect(e.reasons.join(' ')).toMatch(/can’t be checked/)
  })

  it('uses the most recent record as "last performed" and projects the due date', () => {
    const readings = collectReadings({ mileage: [
      { id: 'a', date: '2025-09-01', odometer: 64000, note: '', createdAt: T, updatedAt: T },
      { id: 'b', date: '2025-10-01', odometer: 66100, note: '', createdAt: T, updatedAt: T }] })
    const stats = computeMileageStats(readings)
    const e = evaluateItem(item({}), [rec({ date: '2025-01-01', mileage: 50000 }), rec({ date: '2025-08-01', mileage: 63000 })], { ...ctx(66100), stats })
    expect(e.last!.mileage).toBe(63000)
    // 70,500 - 66,100 = 4,400 mi at ~70.0 mi/day => ~63 days after the latest reading
    expect(e.projectedDueDate).toBe('2025-12-03')
    expect(e.projectedDueDate! > '2025-10-01').toBe(true)
  })

  it('groups into overdue / upcoming / recommended', () => {
    const items = [item({ id: 'a', name: 'A' }), item({ id: 'b', name: 'B' }), item({ id: 'c', name: 'C' })]
    const recs = [rec({ itemId: 'a', mileage: 50000 }), rec({ itemId: 'b', mileage: 63000 })]
    const g = groupMaintenance(evaluateAll(items, recs, ctx(65482)))
    expect(g.overdue.map(e => e.item.id)).toEqual(['a'])
    expect(g.upcoming.map(e => e.item.id)).toEqual(['b'])
    expect(g.recommended.map(e => e.item.id)).toEqual(['c'])
  })
})

describe('costs', () => {
  const svc = (o: object) => ({ lineItems: [], totalOverride: null, ...o }) as never
  it('service total = line items or explicit total', () => {
    expect(serviceTotal(svc({ lineItems: [{ cost: 284 }, { cost: 42 }, { cost: 86 }] }))).toBe(412)
    expect(serviceTotal(svc({ lineItems: [{ cost: 1 }], totalOverride: 99.5 }))).toBe(99.5)
  })
  it('cost per mile', () => {
    expect(costPerMile(100, 400)).toBe(0.25)
    expect(costPerMile(100, 0)).toBeNull()
    expect(costPerMile(100, null)).toBeNull()
  })
  it('ownership counts each dollar once (parts linked to a service/mod are not double counted)', () => {
    const services = [{ kind: 'maintenance', lineItems: [{ cost: 284, partId: 'p1' }, { cost: 86 }], totalOverride: null, partIds: ['p1'] }, { kind: 'repair', lineItems: [{ cost: 500 }], totalOverride: null, partIds: [] }] as never
    const mods = [{ status: 'installed', price: 300, laborCost: 100, partIds: ['p2'] }, { status: 'planned', price: 999, laborCost: null, partIds: [] }] as never
    const parts = [{ id: 'p1', price: 84, quantity: 1 }, { id: 'p2', price: 50, quantity: 2 }, { id: 'p3', price: 20, quantity: 3 }] as never
    const o = ownershipCosts({ fuelTotal: 1000, services, mods, parts })
    expect(o.maintenance).toBe(370)
    expect(o.repairs).toBe(500)
    expect(o.mods).toBe(400) // planned mod is not spent yet
    expect(o.parts).toBe(60) // only p3
    expect(o.total).toBe(1000 + 370 + 500 + 400 + 60)
  })
})

describe('reminders', () => {
  const r = (o: object) => ({ id: 'r', title: 'x', dueMileage: null, dueDate: '', notes: '', maintenanceItemId: null, completedAt: '', snoozedUntil: '', createdAt: '', updatedAt: '', ...o }) as never
  const c = { currentMileage: 65482, today: '2025-10-01', dueSoonMiles: 1000, dueSoonDays: 30 }
  it('classifies mileage / date reminders', () => {
    expect(evaluateReminder(r({ dueMileage: 66682 }), c).label).toBe('Due in 1,200 mi')
    expect(evaluateReminder(r({ dueMileage: 66682 }), c).state).toBe('upcoming')
    expect(evaluateReminder(r({ dueMileage: 66000 }), c).state).toBe('dueSoon')
    expect(evaluateReminder(r({ dueMileage: 65000 }), c).state).toBe('overdue')
    expect(evaluateReminder(r({ dueDate: '2025-09-20' }), c).state).toBe('overdue')
    expect(evaluateReminder(r({ dueDate: '2026-04-12' }), c).state).toBe('upcoming')
    expect(evaluateReminder(r({ dueMileage: 70000, dueDate: '2025-10-10' }), c).state).toBe('dueSoon')
    expect(evaluateReminder(r({ completedAt: '2025-09-01T00:00:00Z' }), c).state).toBe('completed')
    expect(evaluateReminder(r({ dueMileage: 66000, snoozedUntil: '2025-10-08' }), c).state).toBe('snoozed')
    expect(evaluateReminder(r({ dueMileage: 65000, snoozedUntil: '2025-10-08' }), c).state).toBe('overdue') // overdue ignores snooze
  })
})
