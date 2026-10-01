import type { DateStr } from '../types/models'

const MS_DAY = 86_400_000

/** Parse YYYY-MM-DD as a *local* calendar date at noon (DST-proof). */
export function parseDate(d: DateStr): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, (m || 1) - 1, day || 1, 12, 0, 0, 0)
}

export function toDateStr(d: Date): DateStr {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr(now: Date = new Date()): DateStr {
  return toDateStr(now)
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / MS_DAY)
}

export function addDays(d: DateStr, n: number): DateStr {
  const dt = parseDate(d)
  dt.setDate(dt.getDate() + n)
  return toDateStr(dt)
}

/** Add calendar months, clamping to month end (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: DateStr, n: number): DateStr {
  const dt = parseDate(d)
  const day = dt.getDate()
  dt.setDate(1)
  dt.setMonth(dt.getMonth() + n)
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  dt.setDate(Math.min(day, last))
  return toDateStr(dt)
}

export function monthKey(d: DateStr): string { return d.slice(0, 7) }
export function yearKey(d: DateStr): string { return d.slice(0, 4) }

/** ISO-ish week key: the Monday of the week, as a date string. */
export function weekKey(d: DateStr): DateStr {
  const dt = parseDate(d)
  const dow = (dt.getDay() + 6) % 7 // Monday = 0
  dt.setDate(dt.getDate() - dow)
  return toDateStr(dt)
}

const fmtShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const fmtLong = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const fmtMed = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'short' })

export const formatDateShort = (d: DateStr) => (d ? fmtShort.format(parseDate(d)) : '—')
export const formatDateLong = (d: DateStr) => (d ? fmtLong.format(parseDate(d)) : '—')
export const formatDate = (d: DateStr) => (d ? fmtMed.format(parseDate(d)) : '—')
/** 'Sep' within the current year, otherwise "Sep ’25" (never the ambiguous 'Sep 25'). */
export const formatMonth = (k: string) => fmtMonth.format(parseDate(k + '-01')) + (k.slice(0, 4) === String(new Date().getFullYear()) ? '' : ` ’${k.slice(2, 4)}`)

export function isValidDateStr(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  return toDateStr(parseDate(d)) === d
}
