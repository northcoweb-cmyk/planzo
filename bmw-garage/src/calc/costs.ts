import type { Mod, Part, ServiceRecord } from '../types/models'
import { round2 } from '../lib/format'
import { spendBy } from './fuel'

/** Total of a service invoice: explicit total if set, else the sum of line items. */
export function serviceTotal(s: Pick<ServiceRecord, 'lineItems' | 'totalOverride'>): number {
  if (s.totalOverride != null) return round2(s.totalOverride)
  return round2(s.lineItems.reduce((t, l) => t + (l.cost || 0), 0))
}

export const modTotal = (m: Pick<Mod, 'price' | 'laborCost'>) => round2((m.price ?? 0) + (m.laborCost ?? 0))
export const partTotal = (p: Pick<Part, 'price' | 'quantity'>) => round2((p.price ?? 0) * (p.quantity || 1))

export interface Ownership {
  fuel: number
  maintenance: number
  repairs: number
  serviceModifications: number
  mods: number
  parts: number
  total: number
}

/**
 * Total cost of ownership with each dollar counted once:
 *   - fuel                      = fuel fill-ups
 *   - maintenance / repairs     = service invoices (their line items already include parts bought at the shop)
 *   - mods                      = mod price + labor for installed/removed mods (planned = not spent yet)
 *   - parts                     = ONLY parts not already referenced by a service or a mod
 */
export function ownershipCosts(a: { fuelTotal: number; services: ServiceRecord[]; mods: Mod[]; parts: Part[] }): Ownership {
  const usedPartIds = new Set<string>()
  a.services.forEach(s => {
    s.partIds.forEach(id => usedPartIds.add(id))
    s.lineItems.forEach(l => l.partId && usedPartIds.add(l.partId))
  })
  a.mods.forEach(m => m.partIds.forEach(id => usedPartIds.add(id)))
  const by = (k: ServiceRecord['kind']) => round2(a.services.filter(s => s.kind === k).reduce((t, s) => t + serviceTotal(s), 0))
  const maintenance = by('maintenance')
  const repairs = by('repair')
  const serviceModifications = by('modification')
  const mods = round2(a.mods.filter(m => m.status !== 'planned').reduce((t, m) => t + modTotal(m), 0))
  const parts = round2(a.parts.filter(p => !usedPartIds.has(p.id)).reduce((t, p) => t + partTotal(p), 0))
  const fuel = round2(a.fuelTotal)
  return { fuel, maintenance, repairs, serviceModifications, mods, parts, total: round2(fuel + maintenance + repairs + serviceModifications + mods + parts) }
}

export function serviceSpend(services: ServiceRecord[], by: 'week' | 'month' | 'year') {
  return spendBy(services.map(s => ({ date: s.date, amount: serviceTotal(s) })), by)
}

/** Cost per mile; null when there are no miles to divide by. */
export function costPerMile(cost: number, milesDriven: number | null): number | null {
  if (milesDriven == null || milesDriven <= 0) return null
  return cost / milesDriven
}
