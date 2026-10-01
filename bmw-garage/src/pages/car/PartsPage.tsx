import { useState } from 'react'
import { useGarage } from '../../hooks/garage'
import { partTotal } from '../../calc/costs'
import { formatDate } from '../../lib/dates'
import { money, miles } from '../../lib/format'
import { Button, Card, Empty, Row } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { SubTabs, useSheet } from '../../components/nav'
import { CAR_TABS } from './CarPage'

export default function PartsPage() {
  const { data } = useGarage()
  const sheet = useSheet()
  const [q, setQ] = useState('')
  const t = q.trim().toLowerCase()
  const list = data.parts.filter(p => !t || [p.name, p.brand, p.partNumber, p.supplier].some(x => x.toLowerCase().includes(t))).sort((a, b) => (b.installDate || b.purchaseDate).localeCompare(a.installDate || a.purchaseDate))
  return (
    <div className="stack-lg">
      <header className="page-head"><div className="grow"><div className="eyebrow">My vehicle</div><h1 className="h1">Parts</h1></div>
        <Button sm icon="plus" onClick={() => sheet('/add/part')}>Add</Button></header>
      <SubTabs items={CAR_TABS} />
      {data.parts.length > 0 && <div className="search"><Icon name="search" /><input className="input" placeholder="Search parts, brands, part numbers" value={q} onChange={e => setQ(e.target.value)} inputMode="search" /></div>}
      {list.length === 0 ? <Card><Empty icon="cube" title={data.parts.length ? 'No matches' : 'No parts yet'} text="Log part numbers, suppliers, warranty and where each part was installed." action={!data.parts.length ? <Button icon="plus" onClick={() => sheet('/add/part')}>Add a part</Button> : undefined} /></Card> : (
        <div className="card list">
          {list.map(p => <Row key={p.id} to={`/car/parts/${p.id}`} icon="cube" title={p.name}
            sub={[p.brand, p.installDate ? `Installed ${formatDate(p.installDate)}` : p.purchaseDate ? `Bought ${formatDate(p.purchaseDate)}` : '', p.mileage != null ? `${miles(p.mileage)} mi` : ''].filter(Boolean).join(' · ')}
            value={p.price != null ? <>{money(partTotal(p))}{p.quantity > 1 && <div className="xs faint">{p.quantity} × {money(p.price)}</div>}</> : undefined} />)}
        </div>
      )}
    </div>
  )
}
