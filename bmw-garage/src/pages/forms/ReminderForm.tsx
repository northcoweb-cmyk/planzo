import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { DateField, NumberField, SelectField, TextArea, TextField } from '../../components/forms'
import { useOverlay } from '../../components/overlays'
import { miles } from '../../lib/format'

export default function ReminderForm() {
  const { id } = useParams()
  const { data, derived, actions } = useGarage()
  const close = useCloseSheet(); const { toast } = useOverlay()
  const e = id ? data.reminders.find(r => r.id === id) : undefined
  const [title, setTitle] = useState(e?.title ?? '')
  const [dueMileage, setDueMileage] = useState<number | null>(e?.dueMileage ?? null)
  const [dueDate, setDueDate] = useState(e?.dueDate ?? '')
  const [itemId, setItemId] = useState(e?.maintenanceItemId ?? '')
  const [notes, setNotes] = useState(e?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const hasDue = dueMileage != null || dueDate !== ''
  const pastMiles = dueMileage != null && derived.currentOdo != null && dueMileage <= derived.currentOdo

  async function save() {
    setSaving(true)
    try {
      await actions.save('reminders', { id: e?.id, title: title.trim(), dueMileage: dueMileage == null ? null : Math.round(dueMileage), dueDate, notes: notes.trim(), maintenanceItemId: itemId || null, completedAt: e?.completedAt ?? '', snoozedUntil: e?.snoozedUntil ?? '' } as never)
      toast('Reminder saved'); close()
    } finally { setSaving(false) }
  }

  return (
    <FormSheet title={e ? 'Edit reminder' : 'Add reminder'} onSave={save} saving={saving} canSave={title.trim().length > 0 && hasDue}>
      <TextField label="Reminder" value={title} onChange={setTitle} placeholder="e.g. Oil change" />
      <SelectField label="Related maintenance item" value={itemId} onChange={v => { setItemId(v); if (!title.trim() && v) setTitle(derived.itemsById.get(v)?.name ?? '') }} options={[{ value: '', label: 'None' }, ...data.maintItems.map(i => ({ value: i.id, label: i.name }))]} />
      <NumberField label="Due at mileage" value={dueMileage} onChange={setDueMileage} suffix="mi" decimals={0} error={pastMiles ? 'That mileage has already passed' : null}
        hint={derived.currentOdo != null ? `Current actual: ${miles(derived.currentOdo)} mi` : 'Mileage-based reminders need an odometer reading to count down'} />
      <DateField label="Due on date" value={dueDate} onChange={setDueDate} hint="Set a mileage, a date, or both – whichever comes first triggers it." />
      {!hasDue && <p className="hint err">Add a due mileage or a due date.</p>}
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
    </FormSheet>
  )
}
