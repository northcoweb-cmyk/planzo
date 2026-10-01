import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { formatDate } from '../../lib/dates'
import { miles } from '../../lib/format'
import { Banner, Button, Card, Chips, Empty, Row } from '../../components/ui'
import { SubTabs, useSheet } from '../../components/nav'
import { MaintRowLink } from '../shared'
import { LOGS_TABS } from './FuelPage'

type Tab = 'upcoming' | 'overdue' | 'completed' | 'recommended'

export default function MaintenancePage() {
  const { data, derived } = useGarage()
  const sheet = useSheet()
  const g = derived.maintGroups
  const [tab, setTab] = useState<Tab>(g.overdue.length ? 'overdue' : 'upcoming')
  const records = [...data.maintRecords].sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <div className="stack-lg">
      <header className="page-head"><div className="grow"><div className="eyebrow">Logs</div><h1 className="h1">Maintenance</h1></div><Button sm icon="plus" onClick={() => sheet('/add/service')}>Log</Button></header>
      <SubTabs items={LOGS_TABS} />
      {derived.currentOdo == null && <Banner tone="info" icon="gauge" action={<Button sm variant="ghost" onClick={() => sheet('/add/mileage')}>Add</Button>}>Add an odometer reading so mileage-based due dates can be checked.</Banner>}
      <Chips value={tab} onChange={setTab} options={[
        { value: 'upcoming', label: 'Upcoming', count: g.upcoming.length }, { value: 'overdue', label: 'Overdue', count: g.overdue.length },
        { value: 'completed', label: 'Completed', count: records.length }, { value: 'recommended', label: 'Recommended', count: g.recommended.length }]} />

      {tab === 'upcoming' && (g.upcoming.length ? <div className="card list">{g.upcoming.map(e => <MaintRowLink key={e.item.id} e={e} />)}</div>
        : <Card><Empty icon="wrench" title="Nothing scheduled" text="Log a service for an item and its next due date appears here." /></Card>)}
      {tab === 'overdue' && (g.overdue.length ? <div className="card list">{g.overdue.map(e => <MaintRowLink key={e.item.id} e={e} />)}</div>
        : <Card><Empty icon="shield" title="Nothing overdue" text="Items past their mileage or time interval appear here." /></Card>)}
      {tab === 'completed' && (records.length ? (
        <div className="card list">{records.map(r => {
          const it = derived.itemsById.get(r.itemId)
          return <Row key={r.id} to={r.serviceId ? `/logs/service/${r.serviceId}` : `/logs/maintenance/${r.itemId}`} icon="check" tone="good" title={it?.name ?? 'Item'} sub={`${formatDate(r.date)}${r.mileage != null ? ' · ' + miles(r.mileage) + ' mi' : ''}`} />
        })}</div>) : <Card><Empty icon="check" title="No completed maintenance" text="Completed items appear here when you log a service." /></Card>)}
      {tab === 'recommended' && (
        <>
          <Banner tone="info" icon="info">These items have no service record yet, or are condition-based (inspect, don’t replace on a schedule). Nothing is called “due” without data – open one to record when it was last done.</Banner>
          {g.recommended.length ? <div className="card list">{g.recommended.map(e => <MaintRowLink key={e.item.id} e={e} />)}</div> : <Card><Empty icon="check" title="All tracked items have history" /></Card>}
        </>
      )}
      <Link to="/more/settings/intervals" className="textbtn" style={{ alignSelf: 'center' }}>Edit maintenance intervals</Link>
    </div>
  )
}
