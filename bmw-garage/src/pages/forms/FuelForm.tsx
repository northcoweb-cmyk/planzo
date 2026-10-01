import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import type { FuelGrade } from '../../types/models'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { DateField, NumberField, SelectField, TextArea, TextField, Toggle } from '../../components/forms'
import { Pill } from '../../components/ui'
import { useOverlay } from '../../components/overlays'
import { FUEL_TYPES } from './helpers'
import { analyzeFuel, completeFuelAmounts } from '../../calc/fuel'
import { isValidDateStr, todayStr } from '../../lib/dates'
import { miles, money, mpg, round2 } from '../../lib/format'

type Key = 'g' | 'p' | 't'

export default function FuelForm() {
  const { id } = useParams()
  const { data, derived, actions } = useGarage()
  const close = useCloseSheet(); const { toast, confirm } = useOverlay()
  const e = id ? data.fuel.find(f => f.id === id) : undefined

  const [date, setDate] = useState(e?.date ?? todayStr())
  const [odo, setOdo] = useState<number | null>(e?.odometer ?? null)
  const [gallons, setGallons] = useState<number | null>(e?.gallons ?? null)
  const [ppg, setPpg] = useState<number | null>(e?.pricePerGallon ?? null)
  const [total, setTotal] = useState<number | null>(e?.totalPrice ?? null)
  const [recent, setRecent] = useState<Key[]>(e ? ['g', 'p'] : [])
  const [fuelType, setFuelType] = useState<FuelGrade>(e?.fuelType ?? data.settings.defaultFuelType)
  const [station, setStation] = useState(e?.station ?? '')
  const [full, setFull] = useState(e?.full ?? true)
  const [missed, setMissed] = useState(e?.missedPrevious ?? false)
  const [notes, setNotes] = useState(e?.notes ?? '')
  const [saving, setSaving] = useState(false)

  /** Two of {gallons, $/gal, total} determine the third: the field you touched least recently is auto-filled. */
  function touch(k: Key, set: (v: number | null) => void, v: number | null) {
    set(v)
    const nextRecent = [k, ...recent.filter(x => x !== k)].slice(0, 2) as Key[]
    setRecent(nextRecent)
    if (nextRecent.length < 2) return
    const auto = (['g', 'p', 't'] as Key[]).find(x => !nextRecent.includes(x))!
    const cur = { g: k === 'g' ? v : gallons, p: k === 'p' ? v : ppg, t: k === 't' ? v : total }
    const r = completeFuelAmounts({ gallons: auto === 'g' ? null : cur.g, pricePerGallon: auto === 'p' ? null : cur.p, totalPrice: auto === 't' ? null : cur.t })
    if (auto === 'g' && r.gallons != null) setGallons(r.gallons)
    if (auto === 'p' && r.pricePerGallon != null) setPpg(r.pricePerGallon)
    if (auto === 't' && r.totalPrice != null) setTotal(r.totalPrice)
  }
  const autoKey = recent.length === 2 ? (['g', 'p', 't'] as Key[]).find(x => !recent.includes(x)) : undefined
  const auto = (k: Key) => (autoKey === k ? 'auto-calculated' : undefined)

  const stations = useMemo(() => [...new Set(data.fuel.map(f => f.station).filter(Boolean))].slice(0, 8), [data.fuel])
  const dateProblem = !isValidDateStr(date) ? 'Pick a valid date' : date > todayStr() ? 'Date is in the future' : null
  const odoProblem = odo != null && odo <= 0 ? 'Enter the odometer reading' : null

  // Live MPG preview using the real engine.
  const preview = useMemo(() => {
    if (!gallons || gallons <= 0) return null
    const candidate = { id: e?.id ?? '__new', date, odometer: odo, gallons, pricePerGallon: ppg ?? 0, totalPrice: total ?? 0, fuelType, station, full, missedPrevious: missed, notes, createdAt: '9999', updatedAt: '' }
    const r = analyzeFuel([...data.fuel.filter(f => f.id !== e?.id), candidate], { mpgMin: data.settings.mpgMin, mpgMax: data.settings.mpgMax })
    return r.rows.find(x => x.entry.id === candidate.id) ?? null
  }, [data.fuel, data.settings, e?.id, date, odo, gallons, ppg, total, fuelType, station, full, missed, notes])

  const canSave = !!gallons && gallons > 0 && total != null && total >= 0 && !dateProblem && !odoProblem

  async function save() {
    setSaving(true)
    try {
      const g = gallons!
      const t = total ?? round2(g * (ppg ?? 0))
      const p = ppg ?? (g > 0 ? Math.round((t / g) * 1000) / 1000 : 0)
      await actions.save('fuel', { id: e?.id, date, odometer: odo == null ? null : Math.round(odo), gallons: g, pricePerGallon: p, totalPrice: t, fuelType, station: station.trim(), full, missedPrevious: missed, notes: notes.trim() } as never)
      toast('Fill-up saved')
      close()
    } finally { setSaving(false) }
  }

  return (
    <FormSheet title={e ? 'Edit fill-up' : 'Add fuel'} onSave={save} saving={saving} canSave={canSave}
      danger={e ? { label: 'Delete fill-up', onClick: async () => { if (await confirm({ title: 'Delete this fill-up?', message: 'MPG for neighbouring fill-ups is recalculated.', confirmLabel: 'Delete', danger: true })) { await actions.remove('fuel', e.id); toast('Fill-up deleted'); close() } } } : undefined}>
      <div className="grid2">
        <DateField label="Date" value={date} onChange={setDate} error={dateProblem} />
        <NumberField label="Odometer" value={odo} onChange={setOdo} suffix="mi" decimals={0} error={odoProblem} placeholder={derived.currentOdo != null ? String(Math.round(derived.currentOdo)) : ''} />
      </div>
      <p className="hint" style={{ marginTop: -8 }}>Odometer is needed for MPG. {derived.currentOdo != null ? `Latest known: ${miles(derived.currentOdo)} mi.` : ''}</p>
      <div className="grid2">
        <NumberField label="Gallons" value={gallons} onChange={v => touch('g', setGallons, v)} decimals={3} hint={auto('g')} />
        <NumberField label="Price / gal" value={ppg} onChange={v => touch('p', setPpg, v)} prefix="$" decimals={3} hint={auto('p')} />
      </div>
      <NumberField label="Total price" value={total} onChange={v => touch('t', setTotal, v)} prefix="$" decimals={2} hint={auto('t') ?? 'Enter any two of gallons, price/gal and total – the third is calculated'} />
      <Toggle label="Full tank" sub="Filled to the pump’s automatic click-off. Only full tanks anchor MPG." checked={full} onChange={setFull} />

      {preview && (
        <div className="banner info" style={{ alignItems: 'flex-start' }} aria-live="polite">
          <div className="grow">
            <div className="spread" style={{ marginBottom: 4 }}><b>MPG for this fill-up</b>
              {preview.status === 'valid' ? <Pill tone="actual">{mpg(preview.mpg)} MPG</Pill> : preview.status === 'suspect' ? <Pill tone="warn">{mpg(preview.mpg)} MPG?</Pill> : <Pill tone="avg">Not yet</Pill>}</div>
            <div className="small muted">{preview.reason || 'Waiting for the next full tank.'}</div>
          </div>
        </div>
      )}

      <SelectField label="Fuel type" value={fuelType} onChange={setFuelType} options={FUEL_TYPES as never} />
      <TextField label="Station" value={station} onChange={setStation} placeholder="Where did you fill up?" list="stations" />
      <datalist id="stations">{stations.map(s => <option key={s} value={s} />)}</datalist>
      <Toggle label="I skipped logging a fill-up before this" sub="Restarts the MPG chain here so missing gallons can’t inflate MPG." checked={missed} onChange={setMissed} />
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
      <p className="hint">Total: {money(total)}{gallons && total ? ` · ${money(total / gallons)}/gal` : ''}</p>
    </FormSheet>
  )
}
