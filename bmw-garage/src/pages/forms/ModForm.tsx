import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import type { ModStatus } from '../../types/models'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { ChipMulti, DateField, NumberField, SelectField, TextArea, TextField } from '../../components/forms'
import { PhotoPicker } from '../../components/Photos'
import { Segmented } from '../../components/ui'
import { useOverlay } from '../../components/overlays'
import { useReceiptEditor } from './helpers'
import { todayStr } from '../../lib/dates'

const CATS = ['Exterior', 'Interior', 'Engine', 'Exhaust', 'Intake', 'Tune', 'Wheels & Tires', 'Suspension', 'Brakes', 'Lighting', 'Electronics', 'Other']

export default function ModForm() {
  const { id } = useParams()
  const { data, derived, actions } = useGarage()
  const close = useCloseSheet(); const { toast } = useOverlay()
  const e = id ? data.mods.find(m => m.id === id) : undefined
  const [name, setName] = useState(e?.name ?? '')
  const [status, setStatus] = useState<ModStatus>(e?.status ?? 'installed')
  const [category, setCategory] = useState(e?.category ?? 'Exterior')
  const [brand, setBrand] = useState(e?.brand ?? '')
  const [partName, setPartName] = useState(e?.partName ?? '')
  const [price, setPrice] = useState<number | null>(e?.price ?? null)
  const [labor, setLabor] = useState<number | null>(e?.laborCost ?? null)
  const [installDate, setInstallDate] = useState(e?.installDate ?? '')
  const [installMileage, setInstallMileage] = useState<number | null>(e?.installMileage ?? null)
  const [shopId, setShopId] = useState(e?.shopId ?? '')
  const [url, setUrl] = useState(e?.productUrl ?? '')
  const [instructions, setInstructions] = useState(e?.instructions ?? '')
  const [notes, setNotes] = useState(e?.notes ?? '')
  const [partIds, setPartIds] = useState<string[]>(e?.partIds ?? [])
  const [images, setImages] = useState<string[]>(e?.imageIds ?? [])
  const rc = useReceiptEditor(e?.receiptIds ?? [])
  const [saving, setSaving] = useState(false)
  const urlBad = url.trim() !== '' && !/^https?:\/\/\S+\.\S+/i.test(url.trim())

  async function save() {
    setSaving(true)
    try {
      const receiptIds = await rc.commit({ title: name.trim(), vendor: brand.trim(), date: installDate || todayStr(), amount: price })
      await actions.save('mods', {
        id: e?.id, name: name.trim(), status, category, brand: brand.trim(), partName: partName.trim(), price, laborCost: labor,
        installDate: status === 'planned' ? '' : installDate, installMileage: status === 'planned' ? null : installMileage == null ? null : Math.round(installMileage),
        shopId: shopId || null, productUrl: url.trim(), instructions: instructions.trim(), notes: notes.trim(), partIds, imageIds: images, receiptIds
      } as never)
      toast('Mod saved'); close()
    } finally { setSaving(false) }
  }

  return (
    <FormSheet title={e ? 'Edit mod' : 'Add mod'} onSave={save} saving={saving} canSave={name.trim().length > 0 && !urlBad}>
      <Segmented value={status} onChange={setStatus} options={[{ value: 'installed', label: 'Installed' }, { value: 'planned', label: 'Planned' }, { value: 'removed', label: 'Removed' }]} />
      <TextField label="Name" value={name} onChange={setName} placeholder="e.g. Black kidney grilles" />
      <SelectField label="Category" value={category} onChange={setCategory} options={[...new Set([category, ...CATS])].map(c => ({ value: c, label: c }))} />
      <div className="grid2"><TextField label="Brand" value={brand} onChange={setBrand} /><TextField label="Part" value={partName} onChange={setPartName} placeholder="Part name / number" /></div>
      <div className="grid2"><NumberField label="Price" value={price} onChange={setPrice} prefix="$" /><NumberField label="Labor cost" value={labor} onChange={setLabor} prefix="$" /></div>
      {status !== 'planned' && <div className="grid2"><DateField label="Install date" value={installDate} onChange={setInstallDate} /><NumberField label="Install mileage" value={installMileage} onChange={setInstallMileage} suffix="mi" decimals={0} placeholder={derived.currentOdo != null ? String(Math.round(derived.currentOdo)) : ''} /></div>}
      <SelectField label="Installed by" value={shopId} onChange={setShopId} options={[{ value: '', label: 'DIY / not recorded' }, ...data.shops.map(s => ({ value: s.id, label: s.name }))]} />
      <TextField label="Product link" value={url} onChange={setUrl} placeholder="https://…" inputMode="url" autoCapitalize="none" error={urlBad ? 'Enter a full link starting with https://' : null} />
      {data.parts.length > 0 && <ChipMulti label="Related parts" options={data.parts.map(p => ({ value: p.id, label: p.name }))} value={partIds} onChange={setPartIds} hint="Parts and mods are separate records you can link." />}
      <PhotoPicker label="Photos" value={images} onChange={setImages} />
      <PhotoPicker label="Receipt" value={rc.attachmentIds} onChange={rc.setAttachmentIds} />
      <TextArea label="Installation instructions" value={instructions} onChange={setInstructions} rows={3} />
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
    </FormSheet>
  )
}
