import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { modTotal } from '../../calc/costs'
import { formatDate } from '../../lib/dates'
import { miles, money } from '../../lib/format'
import { Banner, Button, Card, DemoPill, Pill, Section } from '../../components/ui'
import { useSheet } from '../../components/nav'
import { AttachmentImage, Lightbox } from '../../components/Photos'
import { useOverlay } from '../../components/overlays'
import { modLabel, modTone } from './ModsPage'
import { Icon } from '../../components/Icon'

export default function ModDetail() {
  const { id } = useParams()
  const { data, derived, actions } = useGarage()
  const nav = useNavigate(); const sheet = useSheet(); const { confirm, toast } = useOverlay()
  const [view, setView] = useState<string | null>(null)
  const m = data.mods.find(x => x.id === id)
  if (!m) return <Banner tone="warn" icon="warn" action={<Button sm variant="ghost" onClick={() => nav('/car/mods')}>Back</Button>}>Mod not found.</Banner>
  const shop = m.shopId ? derived.shopsById.get(m.shopId) : null
  const parts = m.partIds.map(pid => derived.partsById.get(pid)).filter(Boolean)
  const rows: Array<[string, React.ReactNode]> = [
    ['Brand', m.brand || '—'], ['Part', m.partName || '—'], ['Category', m.category || '—'],
    ['Part price', m.price != null ? money(m.price) : '—'], ['Labor', m.laborCost != null ? money(m.laborCost) : '—'], ['Total', modTotal(m) > 0 ? <b>{money(modTotal(m))}</b> : '—'],
    ['Install date', m.installDate ? formatDate(m.installDate) : '—'], ['Install mileage', m.installMileage != null ? `${miles(m.installMileage)} mi` : '—'], ['Shop', shop?.name ?? '—']
  ]
  return (
    <div className="stack-lg">
      <button className="back" onClick={() => nav('/car/mods')}><Icon name="chevronLeft" />Mods</button>
      <div>
        <div className="row" style={{ marginBottom: 8 }}><Pill tone={modTone(m.status)}>{modLabel[m.status]}</Pill>{m.demo && <DemoPill />}</div>
        <h1 className="h1">{m.name}</h1>
      </div>
      {m.imageIds.length > 0 && (
        <div className="thumbs">{m.imageIds.map(i => <div className="thumb" key={i} style={{ width: m.imageIds.length === 1 ? '100%' : 110, height: m.imageIds.length === 1 ? 220 : 110 }}><AttachmentImage id={i} onClick={() => setView(i)} /></div>)}</div>
      )}
      <Card pad="sm"><dl className="kv-list" style={{ margin: 0, padding: '0 4px' }}>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></Card>
      {m.productUrl && <a className="btn ghost" href={m.productUrl} target="_blank" rel="noopener noreferrer"><Icon name="link" />Open product page</a>}
      {parts.length > 0 && <Section title="Parts used"><div className="card list">{parts.map(p => p && <Link key={p.id} to={`/car/parts/${p.id}`} className="li"><span className="ic"><Icon name="cube" /></span><span className="grow"><span className="t" style={{ display: 'block' }}>{p.name}</span><span className="s" style={{ display: 'block' }}>{p.brand}{p.quantity > 1 ? ` · ×${p.quantity}` : ''}</span></span><Icon name="chevron" className="chev" /></Link>)}</div></Section>}
      {m.instructions && <Section title="Installation instructions"><Card pad="sm"><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{m.instructions}</p></Card></Section>}
      {m.notes && <Section title="Notes"><Card pad="sm"><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{m.notes}</p></Card></Section>}
      {m.receiptIds.length > 0 && <Section title="Receipts"><div className="thumbs">{m.receiptIds.map(r => { const rc = derived.receiptsById.get(r); return rc ? <div className="thumb" key={r}><AttachmentImage id={rc.attachmentId} onClick={() => setView(rc.attachmentId)} /></div> : null })}</div></Section>}
      <div className="grid2">
        <Button variant="ghost" icon="edit" onClick={() => sheet(`/edit/mod/${m.id}`)}>Edit</Button>
        <Button variant="danger-ghost" icon="trash" onClick={async () => { if (await confirm({ title: 'Delete this mod?', message: 'Photos and receipts stay in your library; the mod record is removed.', confirmLabel: 'Delete', danger: true })) { await actions.remove('mods', m.id); toast('Mod deleted'); nav('/car/mods', { replace: true }) } }}>Delete</Button>
      </div>
      {view && <Lightbox id={view} onClose={() => setView(null)} />}
    </div>
  )
}
