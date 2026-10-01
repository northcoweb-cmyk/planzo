/**
 * Two physically separate IndexedDB databases: 'live' (your real data) and 'demo' (clearly-labelled
 * example data). Demo mode can never contaminate or overwrite real records.
 */
export type DatasetId = 'live' | 'demo'
const KEY = 'bmwg.dataset'

export function getDataset(): DatasetId {
  try { return localStorage.getItem(KEY) === 'demo' ? 'demo' : 'live' } catch { return 'live' }
}
export function setDataset(d: DatasetId) {
  try { localStorage.setItem(KEY, d) } catch { /* private mode */ }
}
export const dbNameFor = (d: DatasetId) => (d === 'live' ? 'bmw-garage' : 'bmw-garage-demo')
