import { useState } from 'react'
import { useGarage } from '../../hooks/garage'
import type { ServiceKind } from '../../types/models'
import { serviceTotal } from '../../calc/costs'
import { formatDate } from '../../lib/dates'
import { miles, money } from '../../lib/format'
import { Button, Card, Chips, Empty } from '../../components/ui'
import { SubTabs, useSheet } from '../../components/nav'
import { Link } from 'react-router-dom'
import { Pill } from '../../components/ui'
import { kindLabel } from '../shared'
import { LOGS_TABS } from './FuelPage'

type F = 'all' | ServiceKind

export default function ServicePage() {
  const { data, derived } = useGarage()
  const sheet = useSheet()
  const [f, setF] = useState<F>('all')
  const all = [...data.services].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.mileage ?? 0) - (a.mileage ?? 0)))
  const list = all.filter(s => f === 'all' || s.kind === f)
  const n = (k: ServiceKind) => data.services.filter(s => s.kind === k).length
  return (
    <div className="stack-lg">
      <header className="page-head"><div className="grow"><div className="eyebrow">Logs</div><h1 className="h1">Service history</h1></div><Button sm icon="plus" onClick={() => sheet('/add/service')}>Add</Button></header>
      <SubTabs items={LOGS_TABS} />
      <Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All', count: all.length }, { value: 'maintenance', label: 'Maintenance', count: n('maintenance') }, { value: 'repair', label: 'Repairs', count: n('repair') }, { value: 'modification', label: 'Modifications', count: n('modification') }]} />
      {list.length === 0 ? (
        <Card><Empty icon="wrench" title={all.length ? 'Nothing in this filter' : 'No service records'} text="Record services with parts, labor, shop and the receipt photo." action={!all.length ? <Button icon="plus" onClick={() => sheet('/add/service')}>Add service</Button> : undefined} /></Card>
      ) : (
        <div className="timeline">
          {list.map(s => {
            const shop = s.shopId ? derived.shopsById.get(s.shopId)?.name : ''
            return (
              <div className="tl-item" key={s.id}>
                <div className="xs faint" style={{ marginBottom: 6, letterSpacing: '.04em' }}>{formatDate(s.date)}{s.mileage != null ? ` · ${miles(s.mileage)} mi` : ''}</div>
                <Link to={`/logs/service/${s.id}`} className="card press pad-sm" style={{ padding: 16 }}>
                  <div className="spread" style={{ alignItems: 'flex-start' }}>
                    <div className="grow"><div className="h3">{s.title}</div><div className="small muted" style={{ marginTop: 3 }}>{shop || 'No shop'}{s.lineItems.length ? ` · ${s.lineItems.length} item${s.lineItems.length > 1 ? 's' : ''}` : ''}</div></div>
                    <div style={{ textAlign: 'right' }}><div className="num-md">{money(serviceTotal(s))}</div></div>
                  </div>
                  <div className="row" style={{ marginTop: 10, gap: 8 }}>
                    <Pill tone={s.kind === 'repair' ? 'warn' : s.kind === 'modification' ? 'projected' : 'avg'}>{kindLabel[s.kind]}</Pill>
                    {s.receiptIds.length > 0 && <Pill tone="avg">Receipt</Pill>}
                    {s.demo && <Pill tone="demo">Demo</Pill>}
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
