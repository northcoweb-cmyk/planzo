import { Link, useNavigate, useParams } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { formatDate } from '../../lib/dates'
import { miles, money, n0 } from '../../lib/format'
import { Banner, Button, Card, Pill, Ring, Row, Section } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useSheet } from '../../components/nav'
import { maintDetail, maintPill, maintTone } from '../shared'

export default function MaintenanceDetail() {
  const { id } = useParams()
  const { data, derived } = useGarage()
  const nav = useNavigate(); const sheet = useSheet()
  const e = derived.maint.find(x => x.item.id === id)
  if (!e) return <Banner tone="warn" icon="warn" action={<Button sm variant="ghost" onClick={() => nav('/logs/maintenance')}>Back</Button>}>Maintenance item not found.</Banner>
  const it = e.item
  const pill = maintPill(e)
  const history = data.maintRecords.filter(r => r.itemId === it.id).sort((a, b) => (a.date < b.date ? 1 : -1))
  const interval = [it.intervalMiles ? `${n0(it.intervalMiles)} mi` : '', it.intervalMonths ? `${it.intervalMonths} months` : ''].filter(Boolean).join(' or ') || 'Condition-based'
  return (
    <div className="stack-lg">
      <button className="back" onClick={() => nav('/logs/maintenance')}><Icon name="chevronLeft" />Maintenance</button>
      <div className="row" style={{ gap: 16 }}>
        <div style={{ transform: 'scale(1.5)', transformOrigin: 'left center', marginRight: 18 }}><Ring value={e.used != null ? Math.max(0, Math.min(1, e.used)) : 0.03} tone={maintTone(e.status)} label={<Icon name="wrench" width={16} height={16} />} /></div>
        <div className="grow"><div className="eyebrow" style={{ marginBottom: 6 }}>{it.category}</div><h1 className="h1" style={{ fontSize: 28 }}>{it.name}</h1></div>
      </div>
      <div className="row"><Pill tone={pill.tone} dot>{pill.text}</Pill><span className="small muted">{maintDetail(e)}</span></div>

      <Card pad="sm"><dl className="kv-list" style={{ margin: 0, padding: '0 4px' }}>
        <div><dt>Interval</dt><dd>{interval}{it.basis === 'typical' ? <div className="xs faint">typical – editable</div> : it.basis === 'custom' ? <div className="xs blue">custom</div> : null}</dd></div>
        <div><dt>Last performed</dt><dd>{e.last ? <>{formatDate(e.last.date)}{e.last.mileage != null && <div className="xs faint">{miles(e.last.mileage)} mi</div>}</> : '—'}</dd></div>
        <div><dt>Current mileage</dt><dd>{derived.currentOdo != null ? <>{miles(derived.currentOdo)} mi <Pill tone="actual">Actual</Pill></> : '—'}</dd></div>
        <div><dt>Next due (mileage)</dt><dd>{e.nextDueMileage != null ? `${miles(e.nextDueMileage)} mi` : '—'}</dd></div>
        <div><dt>Next due (date)</dt><dd>{e.nextDueDate ? formatDate(e.nextDueDate) : '—'}</dd></div>
        {e.projectedDueDate && <div><dt>Projected to hit mileage</dt><dd><Pill tone="projected">Projected</Pill> {formatDate(e.projectedDueDate)}</dd></div>}
        {it.notes && <div><dt>Notes</dt><dd style={{ fontWeight: 500 }}>{it.notes}</dd></div>}
      </dl></Card>

      <Section title="How this is calculated">
        <Card pad="sm"><ul style={{ margin: 0, padding: '2px 4px 2px 20px', display: 'flex', flexDirection: 'column', gap: 10 }} className="small muted">{e.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></Card>
        <p className="xs faint" style={{ margin: '8px 4px 0' }}>Status uses your latest <b>actual</b> odometer reading, not a projection.</p>
      </Section>

      <div className="grid2">
        <Button icon="check" onClick={() => sheet(`/add/service?item=${it.id}`)}>Mark done</Button>
        <Button variant="ghost" icon="sliders" onClick={() => sheet(`/edit/interval/${it.id}`)}>Edit interval</Button>
      </div>

      <Section title={`History · ${history.length}`}>
        {history.length ? <div className="card list">{history.map(r => <Row key={r.id} to={r.serviceId ? `/logs/service/${r.serviceId}` : undefined} icon="check" tone="good" title={formatDate(r.date)} sub={r.mileage != null ? `${miles(r.mileage)} mi` : 'No mileage recorded'} value={r.cost != null ? money(r.cost) : undefined} chevron={!!r.serviceId} />)}</div>
          : <Card pad="sm"><p className="small muted">No history yet. <Link className="blue" to="/logs/service">See all services</Link></p></Card>}
      </Section>
    </div>
  )
}
