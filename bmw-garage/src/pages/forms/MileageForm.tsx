import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { DateField, NumberField, TextField } from '../../components/forms'
import { useOverlay } from '../../components/overlays'
import { formatDate, isValidDateStr, todayStr } from '../../lib/dates'
import { miles, n0 } from '../../lib/format'
import { collectReadings, computeMileageStats } from '../../calc/mileage'

export default function MileageForm() {
  const { id } = useParams()
  const { data, derived, actions } = useGarage()
  const close = useCloseSheet(); const { toast, confirm } = useOverlay()
  const editing = id ? data.mileage.find(m => m.id === id) : undefined
  const [date, setDate] = useState(editing?.date ?? todayStr())
  const [odo, setOdo] = useState<number | null>(editing?.odometer ?? null)
  const [note, setNote] = useState(editing?.note ?? '')
  const [saving, setSaving] = useState(false)

  // Odometers only go up: compare with the neighbouring *other* readings.
  const problem = useMemo(() => {
    if (odo == null) return null
    if (odo <= 0) return 'Enter the odometer reading'
    const others = derived.readings.filter(r => r.valid && !(editing && r.refId === editing.id))
    const before = [...others].filter(r => r.date <= date).pop()
    const after = others.find(r => r.date > date)
    if (before && odo < before.odometer) return `Lower than ${miles(before.odometer)} mi recorded on ${formatDate(before.date)}`
    if (after && odo > after.odometer) return `Higher than ${miles(after.odometer)} mi recorded on ${formatDate(after.date)}`
    return null
  }, [odo, date, derived.readings, editing])
  const dateProblem = !isValidDateStr(date) ? 'Pick a valid date' : date > todayStr() ? 'Readings can’t be in the future' : null
  const jump = derived.currentOdo != null && odo != null && odo - derived.currentOdo > 5000 && date >= (derived.mileage.latest?.date ?? '')
  const canSave = odo != null && odo > 0 && !problem && !dateProblem

  async function save() {
    setSaving(true)
    try {
      await actions.save('mileage', { id: editing?.id, date, odometer: Math.round(odo!), note: note.trim() } as never)
      const after = computeMileageStats(collectReadings({ mileage: [...data.mileage.filter(m => m.id !== editing?.id), { id: 'x', date, odometer: Math.round(odo!), note: '', createdAt: '', updatedAt: '' }], fuel: data.fuel, services: data.services, vehicle: data.vehicle, settings: data.settings }), { window: data.settings.mileageWindow, vehicle: data.vehicle })
      toast(after.status === 'ok' ? `Saved · now averaging ${n0(after.weeklyAvg!)} mi/week` : 'Reading saved')
      close()
    } finally { setSaving(false) }
  }

  return (
    <FormSheet title={editing ? 'Edit reading' : 'Odometer reading'} onSave={save} saving={saving} canSave={canSave}
      danger={editing ? { label: 'Delete reading', onClick: async () => { if (await confirm({ title: 'Delete this reading?', confirmLabel: 'Delete', danger: true })) { await actions.remove('mileage', editing.id); toast('Reading deleted'); close() } } } : undefined}>
      <NumberField label="Odometer" value={odo} onChange={setOdo} suffix="mi" decimals={0} placeholder={derived.currentOdo != null ? n0(derived.currentOdo) : '65,482'} error={problem}
        hint={derived.currentOdo != null ? `Latest actual reading: ${miles(derived.currentOdo)} mi` : 'The number on your dashboard'} />
      <DateField label="Date" value={date} onChange={setDate} error={dateProblem} />
      {jump && <p className="hint warn">That’s {n0(odo! - derived.currentOdo!)} miles since the last reading – double-check the digits.</p>}
      <TextField label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. weekend trip, after oil change" />
      <p className="hint">Enter readings whenever you happen to look at the odometer. The app works out your pace from them – it never invents a reading.</p>
    </FormSheet>
  )
}
