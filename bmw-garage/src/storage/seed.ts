import type { GarageDB } from './db'
import { newVehicle } from '../data/vehicleDefaults'
import { catalogItems } from '../data/maintenanceCatalog'
import { defaultSettings } from '../data/settingsDefaults'

/** First-run bootstrap for a *live* database: only structural defaults, zero fake history. */
export async function ensureBaseline(db: GarageDB): Promise<void> {
  if (await db.getMeta<boolean>('baseline-v1')) return
  const [veh, sett, items] = await Promise.all([db.getAll('vehicle'), db.getAll('settings'), db.getAll('maintItems')])
  if (veh.length === 0) await db.put('vehicle', newVehicle())
  if (sett.length === 0) await db.put('settings', defaultSettings())
  if (items.length === 0) await db.putMany('maintItems', catalogItems())
  await db.setMeta('baseline-v1', true)
}
