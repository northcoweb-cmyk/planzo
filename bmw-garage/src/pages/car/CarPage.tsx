import { Link } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import { vehicleTitle } from '../../data/vehicleDefaults'
import { formatDate } from '../../lib/dates'
import { miles, money0, n0 } from '../../lib/format'
import { Button, Card, Pill, Row, Section } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { SubTabs, useSheet } from '../../components/nav'
import { getTelemetryProvider } from '../../services/telemetry'

export const CAR_TABS = [
  { to: '/car', label: 'Overview' }, { to: '/car/mileage', label: 'Mileage' }, { to: '/car/mods', label: 'Mods' }, { to: '/car/parts', label: 'Parts' }
]

const HERO = `${import.meta.env.BASE_URL}hero/x3-hero.webp`

function KV({ k, v }: { k: string; v: React.ReactNode }) { return <div><dt>{k}</dt><dd>{v}</dd></div> }
const set = (s: string | number | null | undefined, f?: (x: never) => string) => (s === '' || s == null ? <span className="faint">Not set</span> : f ? f(s as never) : String(s))

export default function CarPage() {
  const { data, derived } = useGarage()
  const sheet = useSheet()
  const v = data.vehicle
  const tp = getTelemetryProvider()
  const since = derived.mileage.sincePurchase
  return (
    <div className="stack-lg">
      <header className="page-head"><div className="grow"><div className="eyebrow">My vehicle</div><h1 className="h1">{v.model} {v.trim}</h1></div>
        <button className="iconbtn" aria-label="Edit vehicle" onClick={() => sheet('/edit/vehicle')}><Icon name="edit" /></button></header>
      <SubTabs items={CAR_TABS} />

      <Card pad={false} className="hero" onClick={() => sheet('/car/3d')}>
        <div className="hero-stage" style={{ aspectRatio: '16/9' }}>
          <img src={HERO} alt="" loading="lazy" decoding="async" />
          <span className="hero-badge"><Icon name="cube3d" /> Open 3D viewer</span>
        </div>
      </Card>

      <Section title="Vehicle" action={<button className="link textbtn" onClick={() => sheet('/edit/vehicle')}>Edit</button>}>
        <Card pad="sm">
          <dl className="kv-list" style={{ margin: 0, padding: '0 4px' }}>
            <KV k="Vehicle" v={vehicleTitle(v)} />
            <KV k="Generation" v={v.generation} />
            <KV k="Engine" v={v.engine} />
            <KV k="Drivetrain" v={v.drivetrain} />
            <KV k="Transmission" v={v.transmission} />
            <KV k="Mileage" v={derived.currentOdo != null ? <>{miles(derived.currentOdo)} mi <Pill tone="actual">Actual</Pill></> : set('')} />
            <KV k="Color" v={`${v.color}${v.colorCode ? ` (${v.colorCode})` : ''}`} />
            <KV k="Horsepower" v={v.horsepower != null ? `${v.horsepower} hp (stock)` : set('')} />
            <KV k="Fuel" v={v.fuelType} />
            <KV k="VIN" v={set(v.vin)} />
            <KV k="License plate" v={set(v.plate)} />
          </dl>
        </Card>
      </Section>

      <Section title="Ownership">
        <Card pad="sm">
          <dl className="kv-list" style={{ margin: 0, padding: '0 4px' }}>
            <KV k="Purchase date" v={set(v.purchaseDate, formatDate as never)} />
            <KV k="Purchase mileage" v={v.purchaseMileage != null ? `${miles(v.purchaseMileage)} mi` : set('')} />
            <KV k="Purchase price" v={v.purchasePrice != null ? money0(v.purchasePrice) : set('')} />
            <KV k="Miles since purchase" v={since != null ? `${n0(since)} mi` : <span className="faint">Needs purchase mileage</span>} />
            <KV k="Estimated value" v={v.estimatedValue != null ? <>{money0(v.estimatedValue)}{v.valueUpdatedAt && <span className="xs faint"> · {formatDate(v.valueUpdatedAt)}</span>}</> : set('')} />
          </dl>
        </Card>
        {v.notes && <p className="small muted" style={{ margin: '10px 4px 0' }}>{v.notes}</p>}
      </Section>

      <Section title="Vehicle data">
        <div className="card list">
          <Row to="/car/telemetry" icon="bolt" title="Live telemetry" sub={`OBD / ECU data · ${tp.label}`} right={<Pill tone="">Not connected</Pill>} />
        </div>
      </Section>

      <div className="grid2">
        <Button variant="ghost" onClick={() => sheet('/edit/vehicle')} icon="edit">Edit vehicle</Button>
        <Link to="/car/mileage" className="btn ghost"><Icon name="gauge" />Mileage</Link>
      </div>
      <Row icon="shield" title="VIN decoding" sub="Add your VIN in Edit vehicle, then tap Decode to look up factory specs (online)." chevron={false} />
    </div>
  )
}
