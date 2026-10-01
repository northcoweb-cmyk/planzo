import { useState } from 'react'
import { useGarage } from '../../hooks/garage'
import { todayStr } from '../../lib/dates'

/**
 * Receipts attached through a form: photos are stored immediately (so they survive a crash) but the
 * Receipt records are only created / removed when the form is saved.
 */
export function useReceiptEditor(initialReceiptIds: string[]) {
  const { derived, actions } = useGarage()
  type Item = { receiptId?: string; attachmentId: string }
  const [items, setItems] = useState<Item[]>(() =>
    initialReceiptIds.map(id => derived.receiptsById.get(id)).filter(Boolean).map(r => ({ receiptId: r!.id, attachmentId: r!.attachmentId })))
  const attachmentIds = items.map(i => i.attachmentId)
  const setAttachmentIds = (next: string[]) =>
    setItems(cur => [...cur.filter(i => next.includes(i.attachmentId)), ...next.filter(a => !cur.some(i => i.attachmentId === a)).map(a => ({ attachmentId: a }))])

  /** Persist: create Receipt records for new photos, delete removed ones. Returns the final receipt ids. */
  async function commit(meta: { title: string; vendor: string; date: string; amount: number | null }): Promise<string[]> {
    const keep = new Set(items.map(i => i.receiptId).filter(Boolean) as string[])
    for (const id of initialReceiptIds) if (!keep.has(id)) await actions.removeReceipt(id)
    const ids: string[] = []
    for (const it of items) {
      if (it.receiptId) { ids.push(it.receiptId); continue }
      const r = await actions.save('receipts', { attachmentId: it.attachmentId, title: meta.title || 'Receipt', vendor: meta.vendor, date: meta.date || todayStr(), amount: meta.amount, notes: '', ocr: { status: 'none' } })
      ids.push(r.id)
    }
    return ids
  }
  return { attachmentIds, setAttachmentIds, commit, count: items.length }
}

export const FUEL_TYPES = [
  { value: 'premium', label: 'Premium' }, { value: 'midgrade', label: 'Midgrade' }, { value: 'regular', label: 'Regular' },
  { value: 'e85', label: 'E85' }, { value: 'diesel', label: 'Diesel' }, { value: 'other', label: 'Other' }
] as const
