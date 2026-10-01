import { useGarage } from '../../hooks/garage'
import { daysBetween, formatDate, todayStr } from '../../lib/dates'
import { Banner, Button, Row } from '../../components/ui'
import { Link } from 'react-router-dom'

export default function MorePage() {
  const { data, dataset, actions } = useGarage()
  const has = data.mileage.length + data.fuel.length + data.services.length + data.mods.length + data.parts.length > 0
  const last = data.settings.lastBackupAt
  const stale = has && dataset === 'live' && (!last || daysBetween(last.slice(0, 10), todayStr()) > 30)
  return (
    <div className="stack-lg">
      <header className="page-head"><div className="grow"><div className="eyebrow">BMW Garage</div><h1 className="h1">More</h1></div></header>
      {stale && <Banner tone="warn" icon="download" action={<Link to="/more/settings/data" className="btn ghost sm">Back up</Link>}><b>{last ? `Last backup ${formatDate(last.slice(0, 10))}.` : 'No backup yet.'}</b> Your history lives on this device – export a JSON copy.</Banner>}
      <div className="card list">
        <Row to="/more/analytics" icon="chart" title="Analytics" sub="Mileage, fuel, maintenance and cost of ownership" />
        <Row to="/more/receipts" icon="receipt" title="Receipts" sub={`${data.receipts.length} saved`} />
        <Row to="/more/shops" icon="shop" title="Shops" sub={`${data.shops.length} saved`} />
        <Row to="/car/telemetry" icon="bolt" title="Vehicle data" sub="OBD telemetry · not connected" />
      </div>
      <div className="card list">
        <Row to="/more/settings" icon="sliders" title="Settings" sub="Vehicle, mileage, fuel, intervals, notifications" />
        <Row to="/more/settings/data" icon="database" title="Data & backup" sub="Export, import and storage" />
      </div>
      <div className="card pad">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Data set</div>
        {dataset === 'demo'
          ? <><p className="small muted" style={{ marginBottom: 12 }}>You’re viewing <b>demo data</b> – clearly labelled example records in a separate database.</p><Button block variant="ghost" onClick={() => actions.switchDataset('live')}>Back to my data</Button></>
          : <><p className="small muted" style={{ marginBottom: 12 }}>Want to see the app full of example data? Demo mode uses a separate database, so your real records are never touched or mixed in.</p><Button block variant="ghost" onClick={() => actions.switchDataset('demo')}>Explore with demo data</Button></>}
      </div>
      <p className="xs faint center">BMW Garage · data stays on this device · v1.0</p>
    </div>
  )
}
