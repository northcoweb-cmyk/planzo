import type { DateStr, Reminder } from '../types/models'
import { daysBetween, formatDate } from '../lib/dates'
import { miles } from '../lib/format'

export type ReminderState = 'completed' | 'snoozed' | 'overdue' | 'dueSoon' | 'upcoming'

export interface ReminderEval {
  reminder: Reminder
  state: ReminderState
  remainingMiles: number | null
  remainingDays: number | null
  label: string
}

export function evaluateReminder(
  r: Reminder,
  ctx: { currentMileage: number | null; today: DateStr; dueSoonMiles: number; dueSoonDays: number }
): ReminderEval {
  const remM = r.dueMileage != null && ctx.currentMileage != null ? r.dueMileage - ctx.currentMileage : null
  const remD = r.dueDate ? daysBetween(ctx.today, r.dueDate) : null
  const parts: string[] = []
  if (remM != null) parts.push(remM < 0 ? `${miles(-remM)} mi overdue` : `Due in ${miles(remM)} mi`)
  else if (r.dueMileage != null) parts.push(`At ${miles(r.dueMileage)} mi`)
  if (remD != null) parts.push(remD < 0 ? `${-remD} d overdue` : remD === 0 ? 'Due today' : `Due ${formatDate(r.dueDate)}`)
  const label = parts.join(' · ') || 'No due date'

  if (r.completedAt) return { reminder: r, state: 'completed', remainingMiles: remM, remainingDays: remD, label: 'Completed' }
  const overdue = (remM != null && remM < 0) || (remD != null && remD < 0)
  const soon = (remM != null && remM <= ctx.dueSoonMiles) || (remD != null && remD <= ctx.dueSoonDays)
  if (r.snoozedUntil && r.snoozedUntil > ctx.today && !overdue) {
    return { reminder: r, state: 'snoozed', remainingMiles: remM, remainingDays: remD, label: `Snoozed until ${formatDate(r.snoozedUntil)}` }
  }
  const state: ReminderState = overdue ? 'overdue' : soon ? 'dueSoon' : 'upcoming'
  return { reminder: r, state, remainingMiles: remM, remainingDays: remD, label }
}
