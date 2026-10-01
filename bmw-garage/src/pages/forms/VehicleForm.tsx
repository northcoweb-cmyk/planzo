import { useState } from 'react'
import { useGarage } from '../../hooks/garage'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { DateField, NumberField, TextArea, TextField } from '../../components/forms'
import { Banner, Button } from '../../components/ui'
import { useOverlay } from '../../components/overlays'
import { checkVin, normalizeVin } from '../../lib/vin'
import { getVinDecoder, type DecodedVin } from '../../services/vinDecoder'

export default function VehicleForm() {
  const { data, derived, actions } = useGarage()
  const close = useCloseSheet(); const { toast } = useOverlay()
  const v = data.vehicle
  const [f, setF] = useState({ ...v })
  const set = <K extends keyof typeof f>(k: K, val: (typeof f)[K]) => setF(s => ({ ...s, [k]: val }))
  const [saving, setSaving] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const [decoded, setDecoded] = useState<DecodedVin | null>(null)
  const vin = checkVin(f.vin)

  async function decode() {
    setDecoding(true); setDecoded(null)
    try { setDecoded(await getVinDecoder().decode(f.vin)) } catch (e) { toast(e instanceof Error ? e.message : 'VIN lookup failed (are you offline?)', 'err') } finally { setDecoding(false) }
  }
  function apply() {
    if (!decoded) return
    setF(s => ({ ...s, ...Object.fromEntries(Object.entries(decoded.fields).filter(([, x]) => x !== undefined && x !== '')) }))
    setDecoded(null); toast('Applied – review the fields, then Save')
  }
  async function save() {
    setSaving(true)
    try {
      await actions.saveVehicle({ ...f, vin: normalizeVin(f.vin), plate: f.plate.trim().toUpperCase(), year: Math.round(f.year || v.year), horsepower: f.horsepower, purchaseMileage: f.purchaseMileage == null ? null : Math.round(f.purchaseMileage) })
      toast('Vehicle saved'); close()
    } finally { setSaving(false) }
  }
  return (
    <FormSheet title="Vehicle" onSave={save} saving={saving} canSave={f.make.trim().length > 0 && f.model.trim().length > 0 && vin.ok}>
      <div className="form-section">
        <div className="grid2"><NumberField label="Year" value={f.year} onChange={x => set('year', x ?? 0)} decimals={0} /><TextField label="Make" value={f.make} onChange={x => set('make', x)} /></div>
        <div className="grid2"><TextField label="Model" value={f.model} onChange={x => set('model', x)} /><TextField label="Trim" value={f.trim} onChange={x => set('trim', x)} /></div>
        <TextField label="Generation" value={f.generation} onChange={x => set('generation', x)} />
        <TextField label="Engine" value={f.engine} onChange={x => set('engine', x)} />
        <div className="grid2"><TextField label="Drivetrain" value={f.drivetrain} onChange={x => set('drivetrain', x)} /><TextField label="Transmission" value={f.transmission} onChange={x => set('transmission', x)} /></div>
        <div className="grid2"><TextField label="Color" value={f.color} onChange={x => set('color', x)} /><TextField label="Color code" value={f.colorCode} onChange={x => set('colorCode', x)} /></div>
        <div className="grid2"><NumberField label="Horsepower (stock)" value={f.horsepower} onChange={x => set('horsepower', x)} decimals={0} suffix="hp" /><TextField label="Fuel" value={f.fuelType} onChange={x => set('fuelType', x)} /></div>
      </div>
      <div className="form-section">
        <TextField label="VIN" value={f.vin} onChange={x => set('vin', x.toUpperCase())} autoCapitalize="characters" spellCheck={false} maxLength={20}
          error={vin.ok ? null : vin.message} hint={vin.ok && vin.message ? vin.message : 'Optional. Never guessed – only what you type.'} />
        <Button variant="ghost" sm icon="shield" disabled={decoding || normalizeVin(f.vin).length !== 17 || !vin.ok} onClick={decode}>{decoding ? 'Looking up…' : 'Decode VIN (online)'}</Button>
        {decoded && (
          <Banner tone="info" icon="info" action={<Button sm onClick={apply}>Apply</Button>}>
            <b>Found:</b> {decoded.details.map(([k, x]) => `${k}: ${x}`).join(' · ') || 'no details'}.{decoded.errors[0] && <> <span className="warn">{decoded.errors[0]}</span></>}
            <div className="xs faint">Suggestions only – nothing changes until you tap Apply, then Save.</div>
          </Banner>
        )}
        <TextField label="License plate" value={f.plate} onChange={x => set('plate', x.toUpperCase())} autoCapitalize="characters" />
      </div>
      <div className="form-section">
        <div className="grid2"><DateField label="Purchase date" value={f.purchaseDate} onChange={x => set('purchaseDate', x)} /><NumberField label="Purchase mileage" value={f.purchaseMileage} onChange={x => set('purchaseMileage', x)} suffix="mi" decimals={0} /></div>
        <div className="grid2"><NumberField label="Purchase price" value={f.purchasePrice} onChange={x => set('purchasePrice', x)} prefix="$" decimals={0} /><NumberField label="Est. value" value={f.estimatedValue} onChange={x => { set('estimatedValue', x); if (x != null) set('valueUpdatedAt', derived.today) }} prefix="$" decimals={0} hint="Optional, manual" /></div>
        <TextArea label="Notes" value={f.notes} onChange={x => set('notes', x)} rows={2} />
      </div>
    </FormSheet>
  )
}
