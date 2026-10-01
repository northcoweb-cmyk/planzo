import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { DateField, NumberField, SelectField, TextArea, TextField } from '../../components/forms'
import { AttachmentImage, Lightbox, PhotoPicker } from '../../components/Photos'
import { useOverlay } from '../../components/overlays'
import { getOcrProvider } from '../../lib/ocr'
import { formatDate, todayStr } from '../../lib/dates'

export default function ReceiptForm() {
  const { id } = useParams()
  const { data, actions } = useGarage()
  const close = useCloseSheet(); const { toast, confirm } = useOverlay()
  const e = id ? data.receipts.find(r => r.id === id) : undefined

  // Which record (if any) currently holds this receipt
  const current = e
    ? data.services.find(s => s.receiptIds.includes(e.id)) ? `service:${data.services.find(s => s.receiptIds.includes(e.id))!.id}`
      : data.parts.find(p => p.receiptIds.includes(e.id)) ? `part:${data.parts.find(p => p.receiptIds.includes(e.id))!.id}`
        : data.mods.find(m => m.receiptIds.includes(e.id)) ? `mod:${data.mods.find(m => m.receiptIds.includes(e.id))!.id}` : ''
    : ''

  const [photo, setPhoto] = useState<string[]>(e ? [e.attachmentId] : [])
  const [title, setTitle] = useState(e?.title ?? '')
  const [vendor, setVendor] = useState(e?.vendor ?? '')
  const [date, setDate] = useState(e?.date ?? todayStr())
  const [amount, setAmount] = useState<number | null>(e?.amount ?? null)
  const [notes, setNotes] = useState(e?.notes ?? '')
  const [link, setLink] = useState(current)
  const [saving, setSaving] = useState(false)
  const [big, setBig] = useState(false)
  const ocr = getOcrProvider()

  const options = [
    { value: '', label: 'Not attached to anything' },
    ...data.services.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map(s => ({ value: `service:${s.id}`, label: `Service · ${s.title} (${formatDate(s.date)})` })),
    ...data.parts.map(p => ({ value: `part:${p.id}`, label: `Part · ${p.name}` })),
    ...data.mods.map(m => ({ value: `mod:${m.id}`, label: `Mod · ${m.name}` }))
  ]

  async function save() {
    setSaving(true)
    try {
      const attachmentId = photo[0]
      const r = await actions.save('receipts', { id: e?.id, attachmentId, title: title.trim() || 'Receipt', vendor: vendor.trim(), date, amount, notes: notes.trim(), ocr: e?.ocr ?? { status: 'none' } } as never)
      // (re)link: remove from everything, then add to the chosen record
      for (const s of data.services) if (s.receiptIds.includes(r.id) && link !== `service:${s.id}`) await actions.save('services', { ...s, receiptIds: s.receiptIds.filter(x => x !== r.id) })
      for (const p of data.parts) if (p.receiptIds.includes(r.id) && link !== `part:${p.id}`) await actions.save('parts', { ...p, receiptIds: p.receiptIds.filter(x => x !== r.id) })
      for (const m of data.mods) if (m.receiptIds.includes(r.id) && link !== `mod:${m.id}`) await actions.save('mods', { ...m, receiptIds: m.receiptIds.filter(x => x !== r.id) })
      const [kind, rid] = link.split(':')
      if (kind === 'service') { const s = data.services.find(x => x.id === rid); if (s && !s.receiptIds.includes(r.id)) await actions.save('services', { ...s, receiptIds: [...s.receiptIds, r.id] }) }
      if (kind === 'part') { const p = data.parts.find(x => x.id === rid); if (p && !p.receiptIds.includes(r.id)) await actions.save('parts', { ...p, receiptIds: [...p.receiptIds, r.id] }) }
      if (kind === 'mod') { const m = data.mods.find(x => x.id === rid); if (m && !m.receiptIds.includes(r.id)) await actions.save('mods', { ...m, receiptIds: [...m.receiptIds, r.id] }) }
      toast('Receipt saved'); close()
    } finally { setSaving(false) }
  }

  return (
    <FormSheet title={e ? 'Receipt' : 'Add receipt'} onSave={save} saving={saving} canSave={photo.length > 0}
      danger={e ? { label: 'Delete receipt', onClick: async () => { if (await confirm({ title: 'Delete this receipt?', message: 'The photo is deleted and the receipt is detached from any service, part or mod.', confirmLabel: 'Delete', danger: true })) { await actions.removeReceipt(e.id); toast('Receipt deleted'); close() } } } : undefined}>
      {e ? (
        <div className="thumb big" style={{ aspectRatio: '3/4', maxHeight: 360 }}><AttachmentImage id={e.attachmentId} onClick={() => setBig(true)} /></div>
      ) : <PhotoPicker label="Photo of receipt" single value={photo} onChange={setPhoto} />}
      <TextField label="Title" value={title} onChange={setTitle} placeholder="e.g. Oil change – BMW of …" />
      <TextField label="Vendor" value={vendor} onChange={setVendor} />
      <div className="grid2"><DateField label="Date" value={date} onChange={setDate} /><NumberField label="Total" value={amount} onChange={setAmount} prefix="$" /></div>
      <SelectField label="Attach to" value={link} onChange={setLink} options={options} />
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
      <p className="hint">Receipt details are typed in by hand. {ocr.available() ? `Auto-read is available (${ocr.name}).` : 'The app is OCR-ready – an on-device text reader can be plugged in later without changing these fields.'}</p>
      {big && e && <Lightbox id={e.attachmentId} onClose={() => setBig(false)} />}
    </FormSheet>
  )
}
