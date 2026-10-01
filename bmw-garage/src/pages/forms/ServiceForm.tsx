import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import type { LineItemType, ServiceKind, ServiceLineItem } from '../../types/models'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { ChipMulti, DateField, NumberField, SelectField, TextArea, TextField } from '../../components/forms'
import { PhotoPicker } from '../../components/Photos'
import { Button, Segmented } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useOverlay } from '../../components/overlays'
import { useReceiptEditor } from './helpers'
import { uid } from '../../lib/id'
import { isValidDateStr, todayStr } from '../../lib/dates'
import { miles, money, round2 } from '../../lib/format'

const LINE_TYPES: Array<{ value: LineItemType; label: string }> = [{ value: 'part', label: 'Part' }, { value: 'labor', label: 'Labor' }, { value: 'fee', label: 'Fee / tax' }, { value: 'other', label: 'Other' }]

export default function ServiceForm() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const { data, derived, actions } = useGarage()
  const close = useCloseSheet(); const { toast, confirm } = useOverlay()
  const e = id ? data.services.find(s => s.id === id) : undefined
  const preItem = sp.get('item') ? data.maintItems.find(i => i.id === sp.get('item')) : undefined

  const [kind, setKind] = useState<ServiceKind>(e?.kind ?? 'maintenance')
  const [title, setTitle] = useState(e?.title ?? preItem?.name ?? '')
  const [date, setDate] = useState(e?.date ?? todayStr())
  const [mileage, setMileage] = useState<number | null>(e?.mileage ?? null)
  const [shopId, setShopId] = useState(e?.shopId ?? data.shops.find(s => s.favorite)?.id ?? '')
  const [lines, setLines] = useState<ServiceLineItem[]>(e?.lineItems ?? [])
  const [override, setOverride] = useState<number | null>(e?.totalOverride ?? null)
  const [itemIds, setItemIds] = useState<string[]>(e?.maintenanceItemIds ?? (preItem ? [preItem.id] : []))
  const [partIds, setPartIds] = useState<string[]>(e?.partIds ?? [])
  const [notes, setNotes] = useState(e?.notes ?? '')
  const [attachIds, setAttachIds] = useState<string[]>(e?.attachmentIds ?? [])
  const rc = useReceiptEditor(e?.receiptIds ?? [])
  const [saving, setSaving] = useState(false)

  const sum = useMemo(() => round2(lines.reduce((t, l) => t + (l.cost || 0), 0)), [lines])
  const total = override ?? sum
  const dateProblem = !isValidDateStr(date) ? 'Pick a valid date' : date > todayStr() ? 'Date is in the future' : null
  const canSave = title.trim().length > 0 && !dateProblem
  const setLine = (i: number, p: Partial<ServiceLineItem>) => setLines(ls => ls.map((l, k) => (k === i ? { ...l, ...p } : l)))

  function pickItems(ids: string[]) {
    setItemIds(ids)
    if (!title.trim() && ids.length === 1) setTitle(derived.itemsById.get(ids[0])?.name ?? '')
  }

  async function save() {
    setSaving(true)
    try {
      const shopName = shopId ? derived.shopsById.get(shopId)?.name ?? '' : ''
      const receiptIds = await rc.commit({ title: title.trim(), vendor: shopName, date, amount: total > 0 ? total : null })
      const clean = lines.filter(l => l.name.trim() || l.cost).map(l => ({ ...l, name: l.name.trim() || 'Item', cost: round2(l.cost || 0) }))
      await actions.saveService({
        id: e?.id, date, mileage: mileage == null ? null : Math.round(mileage), title: title.trim(), kind, lineItems: clean,
        totalOverride: override, shopId: shopId || null, partIds, maintenanceItemIds: itemIds, receiptIds, attachmentIds: attachIds, notes: notes.trim()
      } as never)
      toast(itemIds.length ? `Service saved · ${itemIds.length} maintenance item${itemIds.length > 1 ? 's' : ''} updated` : 'Service saved')
      close()
    } finally { setSaving(false) }
  }

  return (
    <FormSheet title={e ? 'Edit service' : 'Add service'} onSave={save} saving={saving} canSave={canSave}
      danger={e ? { label: 'Delete service', onClick: async () => { if (await confirm({ title: 'Delete this service?', message: 'Linked “last performed” dates are removed too.', confirmLabel: 'Delete', danger: true })) { await actions.removeService(e.id); toast('Service deleted'); close() } } } : undefined}>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'maintenance', label: 'Maintenance' }, { value: 'repair', label: 'Repair' }, { value: 'modification', label: 'Mod' }]} />
      <TextField label="Title" value={title} onChange={setTitle} placeholder="e.g. Spark plugs + cabin filter" />
      <div className="grid2">
        <DateField label="Date" value={date} onChange={setDate} error={dateProblem} />
        <NumberField label="Mileage" value={mileage} onChange={setMileage} suffix="mi" decimals={0} placeholder={derived.currentOdo != null ? String(Math.round(derived.currentOdo)) : ''} />
      </div>
      <SelectField label="Shop" value={shopId} onChange={setShopId} options={[{ value: '', label: 'No shop / DIY' }, ...data.shops.map(s => ({ value: s.id, label: s.name }))]}
        hint={data.shops.length === 0 ? 'Add shops under More → Shops' : undefined} />

      {kind !== 'modification' && data.maintItems.length > 0 && (
        <ChipMulti label="Maintenance items performed" options={data.maintItems.filter(i => i.enabled).map(i => ({ value: i.id, label: i.name }))} value={itemIds} onChange={pickItems}
          hint="Selected items get this date + mileage as their new “last performed”." />
      )}

      <div className="field">
        <span className="lab">Line items</span>
        <div className="stack" style={{ gap: 12 }}>
          {lines.map((l, i) => (
            <div key={l.id} className="card pad-sm" style={{ padding: 12 }}>
              <div className="stack" style={{ gap: 10 }}>
                <input className="input" placeholder="Description" value={l.name} onChange={ev => setLine(i, { name: ev.target.value })} aria-label="Line description" />
                <div className="row" style={{ gap: 10 }}>
                  <select className="select" style={{ flex: 1 }} value={l.type} onChange={ev => setLine(i, { type: ev.target.value as LineItemType })} aria-label="Line type">{LINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                  <div className="input-affix" style={{ flex: 1 }}><span className="pre">$</span><input className="input" inputMode="decimal" placeholder="0.00" value={l.cost || ''} onChange={ev => setLine(i, { cost: Number(ev.target.value.replace(/[^0-9.]/g, '')) || 0 })} aria-label="Line cost" /></div>
                  <button type="button" className="iconbtn" aria-label="Remove line" onClick={() => setLines(ls => ls.filter((_, k) => k !== i))}><Icon name="trash" /></button>
                </div>
                {l.type === 'part' && data.parts.length > 0 && (
                  <select className="select" value={l.partId ?? ''} onChange={ev => { setLine(i, { partId: ev.target.value || undefined }); if (ev.target.value && !partIds.includes(ev.target.value)) setPartIds([...partIds, ev.target.value]) }} aria-label="Linked part">
                    <option value="">Not linked to a saved part</option>{data.parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
          <div className="row wrap" style={{ gap: 8 }}>
            <Button sm variant="ghost" icon="plus" onClick={() => setLines(ls => [...ls, { id: uid(), name: '', type: 'part', cost: 0 }])}>Part</Button>
            <Button sm variant="ghost" icon="plus" onClick={() => setLines(ls => [...ls, { id: uid(), name: 'Labor', type: 'labor', cost: 0 }])}>Labor</Button>
          </div>
        </div>
      </div>
      <NumberField label="Invoice total (optional)" value={override} onChange={setOverride} prefix="$" hint={override == null ? `Leave blank to use the items sum (${money(sum)})` : `Items sum is ${money(sum)}`} />
      <div className="spread card pad-sm" style={{ padding: '12px 16px' }}><span className="eyebrow">Total</span><span className="num-md">{money(total)}</span></div>

      {data.parts.length > 0 && <ChipMulti label="Parts used" options={data.parts.map(p => ({ value: p.id, label: p.name }))} value={partIds} onChange={setPartIds} />}
      <PhotoPicker label="Receipt photos" value={rc.attachmentIds} onChange={rc.setAttachmentIds} />
      <PhotoPicker label="Other attachments" value={attachIds} onChange={setAttachIds} />
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={3} />
      {mileage != null && <p className="hint">Mileage {miles(mileage)} mi also counts as an odometer reading.</p>}
    </FormSheet>
  )
}
