import type { DateStr, MaintenanceItem, MaintenanceRecord, Settings } from '../types/models'
import { addMonths, daysBetween, formatDate } from '../lib/dates'
import { miles } from '../lib/format'
import { estimateDateForOdometer, type MileageStats } from './mileage'

/**
 * Maintenance engine. Everything is derived from MaintenanceRecords ("last performed") plus the
 * item's editable interval; it will say "unknown" rather than claim something is due without data.
 */

export type MaintStatus = 'overdue' | 'dueSoon' | 'good' | 'unknown' | 'condition' | 'disabled'

export interface LastPerformed { date: DateStr; mileage: number | null; recordId: string; cost: number | null }

export interface MaintEval {
  item: MaintenanceItem
  last: LastPerformed | null
  nextDueMileage: number | null
  nextDueDate: DateStr | null
  remainingMiles: number | null
  remainingDays: number | null
  /** Projected date the mileage interval runs out at the current driving rate (labelled PROJECTED in the UI). */
  projectedDueDate: DateStr | null
  status: MaintStatus
  /** 0..1+ share of the interval used (max of mileage/time), for progress rings. */
  used: number | null
  /** Plain-language trail of how the status was derived. */
  reasons: string[]
}

export interface MaintContext {
  currentMileage: number | null
  today: DateStr
  stats?: MileageStats | null
  settings: Pick<Settings, 'dueSoonMiles' | 'dueSoonDays'>
}

export function lastPerformed(records: MaintenanceRecord[]): LastPerformed | null {
  if (records.length === 0) return null
  const sorted = [...records].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return (b.mileage ?? -1) - (a.mileage ?? -1)
  })
  const r = sorted[0]
  return { date: r.date, mileage: r.mileage, recordId: r.id, cost: r.cost }
}

/** Next-due mileage = last performed mileage + interval. Null if either is missing. */
export function nextDueMileage(lastMileage: number | null, intervalMiles: number | null): number | null {
  if (lastMileage == null || intervalMiles == null || intervalMiles <= 0) return null
  return lastMileage + intervalMiles
}

export function nextDueDate(lastDate: DateStr | null, intervalMonths: number | null): DateStr | null {
  if (!lastDate || intervalMonths == null || intervalMonths <= 0) return null
  return addMonths(lastDate, intervalMonths)
}

export function evaluateItem(item: MaintenanceItem, records: MaintenanceRecord[], ctx: MaintContext): MaintEval {
  const base: MaintEval = {
    item, last: null, nextDueMileage: null, nextDueDate: null, remainingMiles: null, remainingDays: null,
    projectedDueDate: null, status: 'unknown', used: null, reasons: []
  }
  if (!item.enabled) return { ...base, status: 'disabled', reasons: ['Tracking turned off for this item'] }

  const last = lastPerformed(records)
  base.last = last
  const hasMiles = item.intervalMiles != null && item.intervalMiles > 0
  const hasMonths = item.intervalMonths != null && item.intervalMonths > 0

  if (!hasMiles && !hasMonths) {
    return { ...base, status: 'condition', reasons: ['Condition-based: no fixed interval. Inspect at each service.'] }
  }
  if (!last) {
    return { ...base, status: 'unknown', reasons: ['No service recorded yet, so a due date can’t be calculated. Add when it was last done.'] }
  }

  const reasons: string[] = []
  const nm = hasMiles ? nextDueMileage(last.mileage, item.intervalMiles) : null
  const nd = hasMonths ? nextDueDate(last.date, item.intervalMonths) : null
  let remMiles: number | null = null
  let remDays: number | null = null
  let milesRank = 0 // 0 good, 1 soon, 2 overdue
  let daysRank = 0
  let usedM: number | null = null
  let usedD: number | null = null

  if (hasMiles) {
    if (nm == null) reasons.push('Mileage interval can’t be checked: the last record has no mileage.')
    else if (ctx.currentMileage == null) reasons.push('Mileage interval can’t be checked: no current odometer reading yet.')
    else {
      remMiles = nm - ctx.currentMileage
      usedM = (item.intervalMiles! - remMiles) / item.intervalMiles!
      milesRank = remMiles < 0 ? 2 : remMiles <= ctx.settings.dueSoonMiles ? 1 : 0
      reasons.push(`Mileage: last at ${miles(last.mileage)} + ${miles(item.intervalMiles)} mi interval = due at ${miles(nm)} mi (${remMiles < 0 ? miles(-remMiles) + ' mi over' : miles(remMiles) + ' mi left'}).`)
    }
  }
  if (hasMonths) {
    if (nd == null) reasons.push('Time interval can’t be checked: the last record has no date.')
    else {
      remDays = daysBetween(ctx.today, nd)
      const totalDays = daysBetween(last.date, nd)
      usedD = totalDays > 0 ? (totalDays - remDays) / totalDays : null
      daysRank = remDays < 0 ? 2 : remDays <= ctx.settings.dueSoonDays ? 1 : 0
      reasons.push(`Time: last on ${formatDate(last.date)} + ${item.intervalMonths} mo = due ${formatDate(nd)} (${remDays < 0 ? -remDays + ' days over' : remDays + ' days left'}).`)
    }
  }

  const checked = (remMiles != null ? 1 : 0) + (remDays != null ? 1 : 0)
  if (checked === 0) return { ...base, last, nextDueMileage: nm, nextDueDate: nd, status: 'unknown', reasons }

  const rank = Math.max(milesRank, daysRank)
  const status: MaintStatus = rank === 2 ? 'overdue' : rank === 1 ? 'dueSoon' : 'good'
  const usedVals = [usedM, usedD].filter((v): v is number => v != null)
  const projectedDueDate = nm != null && ctx.stats ? estimateDateForOdometer(ctx.stats, nm) : null
  if (projectedDueDate && status !== 'overdue') reasons.push(`At your current driving rate the mileage interval runs out around ${formatDate(projectedDueDate)} (projected).`)

  return {
    ...base, last, nextDueMileage: nm, nextDueDate: nd, remainingMiles: remMiles, remainingDays: remDays,
    projectedDueDate, status, used: usedVals.length ? Math.max(...usedVals) : null, reasons
  }
}

export function evaluateAll(items: MaintenanceItem[], records: MaintenanceRecord[], ctx: MaintContext): MaintEval[] {
  const byItem = new Map<string, MaintenanceRecord[]>()
  for (const r of records) {
    const arr = byItem.get(r.itemId) ?? []
    arr.push(r)
    byItem.set(r.itemId, arr)
  }
  return items.map(it => evaluateItem(it, byItem.get(it.id) ?? [], ctx))
}

const RANK: Record<MaintStatus, number> = { overdue: 0, dueSoon: 1, good: 2, unknown: 3, condition: 4, disabled: 5 }

/** Urgency order, then closest remaining miles/days. */
export function sortByUrgency(evals: MaintEval[]): MaintEval[] {
  const score = (e: MaintEval) => {
    const m = e.remainingMiles != null ? e.remainingMiles / 100 : Infinity // ~100 mi per day equivalent
    const d = e.remainingDays ?? Infinity
    return Math.min(m, d)
  }
  return [...evals].sort((a, b) => RANK[a.status] - RANK[b.status] || score(a) - score(b))
}

export interface MaintGroups {
  overdue: MaintEval[]
  /** dueSoon + good, soonest first */
  upcoming: MaintEval[]
  /** items we have no history for, plus condition-based inspections */
  recommended: MaintEval[]
}

export function groupMaintenance(evals: MaintEval[]): MaintGroups {
  const s = sortByUrgency(evals)
  return {
    overdue: s.filter(e => e.status === 'overdue'),
    upcoming: s.filter(e => e.status === 'dueSoon' || e.status === 'good'),
    recommended: s.filter(e => e.status === 'unknown' || e.status === 'condition')
  }
}
