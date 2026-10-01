import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { FormSheet, useCloseSheet } from '../../components/Sheet'
import { TextArea, TextField, Toggle } from '../../components/forms'
import { useOverlay } from '../../components/overlays'

export default function ShopForm() {
  const { id } = useParams()
  const { data, actions } = useGarage()
  const close = useCloseSheet(); const { toast, confirm } = useOverlay()
  const e = id ? data.shops.find(s => s.id === id) : undefined
  const [name, setName] = useState(e?.name ?? '')
  const [address, setAddress] = useState(e?.address ?? '')
  const [phone, setPhone] = useState(e?.phone ?? '')
  const [website, setWebsite] = useState(e?.website ?? '')
  const [hours, setHours] = useState(e?.hours ?? '')
  const [notes, setNotes] = useState(e?.notes ?? '')
  const [favorite, setFavorite] = useState(e?.favorite ?? data.shops.length === 0)
  const [saving, setSaving] = useState(false)
  const siteBad = website.trim() !== '' && !/^https?:\/\/\S+\.\S+/i.test(website.trim())
  const used = e ? data.services.filter(s => s.shopId === e.id).length : 0

  async function save() {
    setSaving(true)
    try { await actions.save('shops', { id: e?.id, name: name.trim(), address: address.trim(), phone: phone.trim(), website: website.trim(), hours: hours.trim(), notes: notes.trim(), favorite } as never); toast('Shop saved'); close() } finally { setSaving(false) }
  }
  return (
    <FormSheet title={e ? 'Edit shop' : 'Add shop'} onSave={save} saving={saving} canSave={name.trim().length > 0 && !siteBad}
      danger={e ? { label: 'Delete shop', onClick: async () => { if (await confirm({ title: 'Delete this shop?', message: used ? `${used} service record${used > 1 ? 's' : ''} will keep their data but no longer show a shop.` : undefined, confirmLabel: 'Delete', danger: true })) { for (const s of data.services.filter(x => x.shopId === e.id)) await actions.save('services', { ...s, shopId: null }); for (const m of data.mods.filter(x => x.shopId === e.id)) await actions.save('mods', { ...m, shopId: null }); await actions.remove('shops', e.id); toast('Shop deleted'); close() } } } : undefined}>
      <TextField label="Shop name" value={name} onChange={setName} placeholder="e.g. BMW of …" />
      <TextField label="Address" value={address} onChange={setAddress} />
      <TextField label="Phone" value={phone} onChange={setPhone} inputMode="tel" />
      <TextField label="Website" value={website} onChange={setWebsite} inputMode="url" autoCapitalize="none" placeholder="https://…" error={siteBad ? 'Enter a full link starting with https://' : null} />
      <TextField label="Hours" value={hours} onChange={setHours} placeholder="Mon–Fri 8–5" />
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
      <Toggle label="Favorite" sub="Pre-selected on new service records" checked={favorite} onChange={setFavorite} />
    </FormSheet>
  )
}
