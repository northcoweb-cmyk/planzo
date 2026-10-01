import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import type { MaintenanceCategory } from '../../types/models'
import { CATEGORIES, MAINTENANCE_CATALOG } from '../../data/maintenanceCatalog'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { NumberField, SelectField, TextArea, TextField, Toggle } from '../../components/forms'
import { useOverlay } from '../../components/overlays'

export default function IntervalForm() {
  const { id } = useParams()
  const { data, actions } = useGarage()
  const close = useCloseSheet(); const { toast, confirm } = useOverlay()
  const e = id ? data.maintItems.find(i => i.id === id) : undefined
  const def = e ? MAINTENANCE_CATALOG.find(c => c.key === e.key) : undefined
  const [name, setName] = useState(e?.name ?? '')
  const [category, setCategory] = useState<MaintenanceCategory>(e?.category ?? 'Other')
  const [miles, setMiles] = useState<number | null>(e?.intervalMiles ?? null)
  const [months, setMonths] = useState<number | null>(e?.intervalMonths ?? null)
  const [enabled, setEnabled] = useState(e?.enabled ?? true)
  const [notes, setNotes] = useState(e?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const bad = (miles != null && miles <= 0) || (months != null && months <= 0)

  async function save() {
    setSaving(true)
    try {
      const m = miles == null ? null : Math.round(miles), mo = months == null ? null : Math.round(months)
      const changed = def ? (m !== def.intervalMiles || mo !== def.intervalMonths) : true
      const basis = m == null && mo == null ? 'condition' : changed ? 'custom' : 'typical'
      await actions.save('maintItems', { id: e?.id, key: e?.key ?? '', name: name.trim(), category, intervalMiles: m, intervalMonths: mo, basis, enabled, notes: notes.trim() } as never)
      toast('Interval saved'); close()
    } finally { setSaving(false) }
  }
  return (
    <FormSheet title={e ? 'Edit interval' : 'Custom item'} onSave={save} saving={saving} canSave={name.trim().length > 0 && !bad}
      danger={e && !e.key ? { label: 'Delete item', onClick: async () => { if (await confirm({ title: 'Delete this item?', message: 'Its history records are deleted too.', confirmLabel: 'Delete', danger: true })) { for (const r of data.maintRecords.filter(x => x.itemId === e.id)) await actions.remove('maintRecords', r.id); await actions.remove('maintItems', e.id); toast('Item deleted'); close() } } } : undefined}>
      <TextField label="Name" value={name} onChange={setName} placeholder="e.g. Oil filter housing gasket" />
      <SelectField label="Category" value={category} onChange={setCategory} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
      <div className="grid2"><NumberField label="Every" value={miles} onChange={setMiles} suffix="mi" decimals={0} /><NumberField label="Or every" value={months} onChange={setMonths} suffix="mo" decimals={0} /></div>
      <p className="hint" style={{ marginTop: -8 }}>Use miles, months, or both (whichever comes first). Leave both empty for condition-based items you only inspect.{def && <> Typical: {[def.intervalMiles ? `${def.intervalMiles.toLocaleString()} mi` : '', def.intervalMonths ? `${def.intervalMonths} mo` : ''].filter(Boolean).join(' / ') || 'condition-based'}.</>}</p>
      <Toggle label="Track this item" sub="Turn off to hide it from due calculations" checked={enabled} onChange={setEnabled} />
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
    </FormSheet>
  )
}
