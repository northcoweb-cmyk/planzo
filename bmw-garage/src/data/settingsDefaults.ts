import type { Settings } from '../types/models'
import { nowIso } from '../lib/id'

export const SETTINGS_ID = 'settings'

export function defaultSettings(): Settings {
  const t = nowIso()
  return {
    id: SETTINGS_ID,
    mileageWindow: 'auto',
    useFuelAndServiceReadings: true,
    mpgMin: 8,
    mpgMax: 45,
    dueSoonMiles: 1000,
    dueSoonDays: 30,
    defaultFuelType: 'premium',
    notifyOnOpen: false,
    lastBackupAt: '',
    onboardingDismissed: false,
    createdAt: t,
    updatedAt: t
  }
}
