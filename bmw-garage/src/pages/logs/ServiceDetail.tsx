import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { serviceTotal } from '../../calc/costs'
import { formatDateLong } from '../../lib/dates'
import { miles, money } from '../../lib/format'
import { Banner, Button, Card, DemoPill, Pill, Section } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useSheet } from '../../components/nav'
import { AttachmentImage, Lightbox } from '../../components/Photos'
import { useOverlay } from '../../components/overlays'
import { kindLabel } from '../shared'

export default function ServiceDetail() {
  const { id } = useParams()
  const { data, derived, actions } = useGarage()
  const nav = useNavigate(); const sheet = useSheet(); const { confirm, toast } = useOverlay()
  const [view, setView] = useState<string | null>(null)
  const s = data.services.find(x => x.id === id)
  if (!s) return <Banner tone="warn" icon="warn" action={<Button sm variant="ghost" onClick={() => nav('/logs/service')}>Back</Button>}>Service record not found.</Banner>
  const shop = s.shopId ? derived.shopsById.get(s.shopId) : null
  const receipts = s.receiptIds.map(r => derived.receiptsById.get(r)).filter(Boolean)
  const items = s.maintenanceItemIds.map(i => derived.itemsById.get(i)?.name).filter(Boolean)
  const parts = s.partIds.map(p => derived.partsById.get(p)).filter(Boolean)
  const itemsSum = s.lineItems.reduce((t, l) => t + l.cost, 0)
  return (
    <div className="stack-lg">
      <button className="back" onClick={() => nav('/logs/service')}><Icon name="chevronLeft" />Service history</button>
      <div>
        <div className="row" style={{ marginBottom: 8 }}><Pill tone="avg">{kindLabel[s.kind]}</Pill>{s.demo && <DemoPill />}</div>
        <h1 className="h1">{s.title}</h1>
        <p className="muted" style={{ marginTop: 6 }}>{formatDateLong(s.date)}{s.mileage != null ? ` · ${miles(s.mileage)} mi` : ''}</p>
      </div>

      <Card>
        {s.lineItems.length > 0 ? (
          <div>
            {s.lineItems.map(l => (
              <div className="spread" key={l.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--stroke)' }}>
                <div className="grow"><div style={{ fontWeight: 600 }}>{l.name}</div><div className="xs faint" style={{ textTransform: 'capitalize' }}>{l.type}</div></div>
                <div className="num">{money(l.cost)}</div>
              </div>
            ))}
            {s.totalOverride != null && Math.abs(s.totalOverride - itemsSum) > 0.005 && <div className="spread small muted" style={{ padding: '10px 0' }}><span>Items subtotal</span><span>{money(itemsSum)}</span></div>}
          </div>
        ) : <p className="small muted">No itemised lines – total entered directly.</p>}
        <div className="spread" style={{ paddingTop: 14 }}><span className="eyebrow">Total</span><span className="num-lg">{money(serviceTotal(s))}</span></div>
      </Card>

      <Card pad="sm"><dl className="kv-list" style={{ margin: 0, padding: '0 4px' }}>
        <div><dt>Shop</dt><dd>{shop?.name ?? '—'}</dd></div>
        {shop?.phone && <div><dt>Phone</dt><dd>{shop.phone}</dd></div>}
        <div><dt>Maintenance items</dt><dd>{items.length ? items.join(', ') : '—'}</dd></div>
      </dl></Card>

      {parts.length > 0 && <Section title="Parts used"><div className="card list">{parts.map(p => p && <Link key={p.id} to={`/car/parts/${p.id}`} className="li"><span className="ic"><Icon name="cube" /></span><span className="grow"><span className="t" style={{ display: 'block' }}>{p.name}</span><span className="s" style={{ display: 'block' }}>{[p.brand, p.quantity > 1 ? `×${p.quantity}` : ''].filter(Boolean).join(' · ')}</span></span><Icon name="chevron" className="chev" /></Link>)}</div></Section>}
      {s.notes && <Section title="Notes"><Card pad="sm"><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{s.notes}</p></Card></Section>}

      {(receipts.length > 0 || s.attachmentIds.length > 0) && (
        <Section title="Receipts & attachments">
          <div className="thumbs">
            {receipts.map(r => r && <div className="thumb" key={r.id} style={{ width: 120, height: 150 }}><AttachmentImage id={r.attachmentId} onClick={() => setView(r.attachmentId)} /></div>)}
            {s.attachmentIds.map(a => <div className="thumb" key={a} style={{ width: 120, height: 150 }}><AttachmentImage id={a} onClick={() => setView(a)} /></div>)}
          </div>
          {receipts[0] && <div style={{ marginTop: 12 }}><Button block variant="ghost" icon="receipt" onClick={() => setView(receipts[0]!.attachmentId)}>View receipt</Button></div>}
        </Section>
      )}

      <div className="grid2">
        <Button variant="ghost" icon="edit" onClick={() => sheet(`/edit/service/${s.id}`)}>Edit</Button>
        <Button variant="danger-ghost" icon="trash" onClick={async () => {
          if (await confirm({ title: 'Delete this service record?', message: 'Maintenance “last performed” dates from this service are removed too. Receipts stay in your library.', confirmLabel: 'Delete', danger: true })) { await actions.removeService(s.id); toast('Service deleted'); nav('/logs/service', { replace: true }) }
        }}>Delete</Button>
      </div>
      {view && <Lightbox id={view} onClose={() => setView(null)} />}
    </div>
  )
}
