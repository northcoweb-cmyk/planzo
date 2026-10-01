import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { DateField, NumberField, TextArea, TextField } from '../../components/forms'
import { PhotoPicker } from '../../components/Photos'
import { useOverlay } from '../../components/overlays'
import { useReceiptEditor } from './helpers'
import { todayStr } from '../../lib/dates'
import { money } from '../../lib/format'

export default function PartForm() {
  const { id } = useParams()
  const { data, derived, actions } = useGarage()
  const close = useCloseSheet(); const { toast } = useOverlay()
  const e = id ? data.parts.find(p => p.id === id) : undefined
  const [name, setName] = useState(e?.name ?? '')
  const [partNumber, setPartNumber] = useState(e?.partNumber ?? '')
  const [brand, setBrand] = useState(e?.brand ?? '')
  const [supplier, setSupplier] = useState(e?.supplier ?? '')
  const [price, setPrice] = useState<number | null>(e?.price ?? null)
  const [qty, setQty] = useState<number | null>(e?.quantity ?? 1)
  const [purchaseDate, setPurchaseDate] = useState(e?.purchaseDate ?? '')
  const [installDate, setInstallDate] = useState(e?.installDate ?? '')
  const [mileage, setMileage] = useState<number | null>(e?.mileage ?? null)
  const [warranty, setWarranty] = useState(e?.warranty ?? '')
  const [url, setUrl] = useState(e?.url ?? '')
  const [notes, setNotes] = useState(e?.notes ?? '')
  const [images, setImages] = useState<string[]>(e?.imageIds ?? [])
  const rc = useReceiptEditor(e?.receiptIds ?? [])
  const [saving, setSaving] = useState(false)
  const urlBad = url.trim() !== '' && !/^https?:\/\/\S+\.\S+/i.test(url.trim())

  async function save() {
    setSaving(true)
    try {
      const receiptIds = await rc.commit({ title: name.trim(), vendor: supplier.trim(), date: purchaseDate || todayStr(), amount: price != null ? price * (qty || 1) : null })
      await actions.save('parts', {
        id: e?.id, name: name.trim(), partNumber: partNumber.trim(), brand: brand.trim(), supplier: supplier.trim(), price, quantity: Math.max(1, Math.round(qty || 1)),
        purchaseDate, installDate, mileage: mileage == null ? null : Math.round(mileage), warranty: warranty.trim(), url: url.trim(), notes: notes.trim(), imageIds: images, receiptIds
      } as never)
      toast('Part saved'); close()
    } finally { setSaving(false) }
  }

  return (
    <FormSheet title={e ? 'Edit part' : 'Add part'} onSave={save} saving={saving} canSave={name.trim().length > 0 && !urlBad}>
      <TextField label="Part name" value={name} onChange={setName} placeholder="e.g. N55 spark plugs" />
      <div className="grid2"><TextField label="Brand" value={brand} onChange={setBrand} /><TextField label="Part number" value={partNumber} onChange={setPartNumber} autoCapitalize="characters" /></div>
      <TextField label="Supplier" value={supplier} onChange={setSupplier} placeholder="Where you bought it" />
      <div className="grid2"><NumberField label="Unit price" value={price} onChange={setPrice} prefix="$" /><NumberField label="Quantity" value={qty} onChange={setQty} decimals={0} /></div>
      {price != null && (qty ?? 1) > 1 && <p className="hint" style={{ marginTop: -8 }}>Total {money(price * (qty || 1))}</p>}
      <div className="grid2"><DateField label="Purchased" value={purchaseDate} onChange={setPurchaseDate} /><DateField label="Installed" value={installDate} onChange={setInstallDate} /></div>
      <NumberField label="Mileage at install" value={mileage} onChange={setMileage} suffix="mi" decimals={0} placeholder={derived.currentOdo != null ? String(Math.round(derived.currentOdo)) : ''} />
      <TextField label="Warranty" value={warranty} onChange={setWarranty} placeholder="e.g. 2 years / lifetime" />
      <TextField label="Product link" value={url} onChange={setUrl} placeholder="https://…" inputMode="url" autoCapitalize="none" error={urlBad ? 'Enter a full link starting with https://' : null} />
      <PhotoPicker label="Photos" value={images} onChange={setImages} />
      <PhotoPicker label="Receipt" value={rc.attachmentIds} onChange={rc.setAttachmentIds} />
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
    </FormSheet>
  )
}
