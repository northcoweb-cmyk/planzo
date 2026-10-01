import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { partTotal } from '../../calc/costs'
import { formatDate } from '../../lib/dates'
import { miles, money } from '../../lib/format'
import { Banner, Button, Card, DemoPill, Section } from '../../components/ui'
import { useSheet } from '../../components/nav'
import { AttachmentImage, Lightbox } from '../../components/Photos'
import { useOverlay } from '../../components/overlays'
import { Icon } from '../../components/Icon'

export default function PartDetail() {
  const { id } = useParams()
  const { data, derived, actions } = useGarage()
  const nav = useNavigate(); const sheet = useSheet(); const { confirm, toast } = useOverlay()
  const [view, setView] = useState<string | null>(null)
  const p = data.parts.find(x => x.id === id)
  if (!p) return <Banner tone="warn" icon="warn" action={<Button sm variant="ghost" onClick={() => nav('/car/parts')}>Back</Button>}>Part not found.</Banner>
  const usedIn = data.services.filter(s => s.partIds.includes(p.id) || s.lineItems.some(l => l.partId === p.id))
  const usedMods = data.mods.filter(m => m.partIds.includes(p.id))
  const rows: Array<[string, React.ReactNode]> = [
    ['Brand', p.brand || '—'], ['Part number', p.partNumber || '—'], ['Supplier', p.supplier || '—'],
    ['Price', p.price != null ? money(p.price) : '—'], ['Quantity', String(p.quantity)], ['Total', p.price != null ? <b>{money(partTotal(p))}</b> : '—'],
    ['Purchased', p.purchaseDate ? formatDate(p.purchaseDate) : '—'], ['Installed', p.installDate ? formatDate(p.installDate) : '—'], ['Install mileage', p.mileage != null ? `${miles(p.mileage)} mi` : '—'], ['Warranty', p.warranty || '—']
  ]
  return (
    <div className="stack-lg">
      <button className="back" onClick={() => nav('/car/parts')}><Icon name="chevronLeft" />Parts</button>
      <div><div className="row" style={{ marginBottom: 8 }}>{p.demo && <DemoPill />}</div><h1 className="h1">{p.name}</h1></div>
      {p.imageIds.length > 0 && <div className="thumbs">{p.imageIds.map(i => <div className="thumb" key={i} style={{ width: 110, height: 110 }}><AttachmentImage id={i} onClick={() => setView(i)} /></div>)}</div>}
      <Card pad="sm"><dl className="kv-list" style={{ margin: 0, padding: '0 4px' }}>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></Card>
      {p.url && <a className="btn ghost" href={p.url} target="_blank" rel="noopener noreferrer"><Icon name="link" />Open product page</a>}
      {(usedIn.length > 0 || usedMods.length > 0) && <Section title="Installed in"><div className="card list">
        {usedIn.map(s => <Link key={s.id} to={`/logs/service/${s.id}`} className="li"><span className="ic"><Icon name="wrench" /></span><span className="grow"><span className="t" style={{ display: 'block' }}>{s.title}</span><span className="s" style={{ display: 'block' }}>{formatDate(s.date)}</span></span><Icon name="chevron" className="chev" /></Link>)}
        {usedMods.map(m => <Link key={m.id} to={`/car/mods/${m.id}`} className="li"><span className="ic"><Icon name="tag" /></span><span className="grow"><span className="t" style={{ display: 'block' }}>{m.name}</span><span className="s" style={{ display: 'block' }}>Mod</span></span><Icon name="chevron" className="chev" /></Link>)}
      </div></Section>}
      {p.notes && <Section title="Notes"><Card pad="sm"><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</p></Card></Section>}
      {p.receiptIds.length > 0 && <Section title="Receipts"><div className="thumbs">{p.receiptIds.map(r => { const rc = derived.receiptsById.get(r); return rc ? <div className="thumb" key={r}><AttachmentImage id={rc.attachmentId} onClick={() => setView(rc.attachmentId)} /></div> : null })}</div></Section>}
      <div className="grid2">
        <Button variant="ghost" icon="edit" onClick={() => sheet(`/edit/part/${p.id}`)}>Edit</Button>
        <Button variant="danger-ghost" icon="trash" onClick={async () => { if (await confirm({ title: 'Delete this part?', confirmLabel: 'Delete', danger: true })) { await actions.remove('parts', p.id); toast('Part deleted'); nav('/car/parts', { replace: true }) } }}>Delete</Button>
      </div>
      {view && <Lightbox id={view} onClose={() => setView(null)} />}
    </div>
  )
}
