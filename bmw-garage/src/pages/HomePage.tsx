import { Link } from 'react-router-dom'
import { useGarage } from '../hooks/garage'
import { vehicleShort } from '../data/vehicleDefaults'
import { projectAhead } from '../calc/mileage'
import { sortByUrgency } from '../calc/maintenance'
import { formatDate } from '../lib/dates'
import { miles, money0, mpg, n0, signed, money3 } from '../lib/format'
import { Icon, type IconName } from '../components/Icon'
import { Card, Pill, Row, Section, Stat, IconButton, Button } from '../components/ui'
import { Logo, useSheet } from '../components/nav'
import { FuelRowLink, MaintRowLink, SectionCard, ServiceRowLink } from './shared'

const HERO = `${import.meta.env.BASE_URL}hero/x3-hero.webp`

export function HomePage() {
  const { data, derived, dataset, actions } = useGarage()
  const sheet = useSheet()
  const { mileage: m, fuel, currentOdo } = derived
  const v = data.vehicle

  const projWeek = projectAhead(m, 7, derived.today)
  const attention = sortByUrgency(derived.maint.filter(e => e.status === 'overdue' || e.status === 'dueSoon' || e.status === 'good')).slice(0, 3)
  const upcomingN = derived.maint.filter(e => e.status === 'dueSoon').length
  const overdueN = derived.maintGroups.overdue.length
  const lastService = [...data.services].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const lastFuel = [...data.fuel].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.odometer ?? 0) - (a.odometer ?? 0)))[0]
  const activeMods = data.mods.filter(x => x.status === 'installed')
  const needsSetup = data.mileage.length === 0 && data.fuel.length === 0 && dataset === 'live'

  const quick: Array<{ label: string; icon: IconName; go: () => void }> = [
    { label: 'Add Fuel', icon: 'fuel', go: () => sheet('/add/fuel') },
    { label: 'Add Service', icon: 'wrench', go: () => sheet('/add/service') },
    { label: 'Add Receipt', icon: 'receipt', go: () => sheet('/add/receipt') },
    { label: 'Add Mod', icon: 'tag', go: () => sheet('/add/mod') },
    { label: 'View 3D', icon: 'cube3d', go: () => sheet('/car/3d') }
  ]

  return (
    <div className="stack-lg">
      <div className="spread" style={{ padding: '2px 2px 0' }}>
        <div className="row"><Logo /><span className="eyebrow" style={{ color: 'var(--text-2)' }}>BMW Garage</span></div>
        <IconButton icon="bell" label="Reminders" to="/reminders" badge={derived.attentionCount} />
      </div>

      {needsSetup && !data.settings.onboardingDismissed && (
        <Card accent>
          <div className="eyebrow blue" style={{ marginBottom: 8 }}>Get started</div>
          <h2 className="h2" style={{ marginBottom: 6 }}>Welcome to your garage</h2>
          <p className="muted small" style={{ marginBottom: 14 }}>Start with today’s odometer reading – everything else (weekly pace, projections, due dates) builds from real readings you enter.</p>
          <div className="stack" style={{ gap: 10 }}>
            <Button icon="gauge" onClick={() => sheet('/add/mileage')}>Enter odometer reading</Button>
            <div className="grid2">
              <Button variant="ghost" sm icon="fuel" onClick={() => sheet('/add/fuel')}>Log a fill-up</Button>
              <Button variant="ghost" sm icon="car" onClick={() => sheet('/edit/vehicle')}>Vehicle details</Button>
            </div>
            <div className="spread">
              <button className="textbtn" onClick={() => actions.switchDataset('demo')}>Explore with demo data</button>
              <button className="textbtn faint" onClick={() => actions.saveSettings({ onboardingDismissed: true })}>Dismiss</button>
            </div>
          </div>
        </Card>
      )}

      <div className="home-cols">
        <div className="stack-lg">
          {/* HERO */}
          <Card pad={false} className="hero">
            <button className="hero-stage" onClick={() => sheet('/car/3d')} aria-label="Open 3D viewer">
              <img src={HERO} alt={`${v.year} ${v.make} ${v.model} ${v.trim}`} decoding="async" fetchPriority="high" />
              <span className="hero-badge"><Icon name="cube3d" /> Explore in 3D</span>
            </button>
            <div className="hero-body">
              <div className="hero-name">
                <div><div className="h1">{vehicleShort(v)}</div><div className="hero-trim">{v.trim} · {v.generation}</div></div>
              </div>
              <div className="hero-odo">
                <div>
                  <div className="num-xl">{currentOdo != null ? miles(currentOdo) : '—'}<span className="unit">mi</span></div>
                </div>
                <div style={{ textAlign: 'right', paddingBottom: 6 }}>
                  {currentOdo != null ? (<><Pill tone="actual">Actual</Pill><div className="xs faint" style={{ marginTop: 6 }}>as of {formatDate(m.latest!.date)}</div></>) : <Button sm onClick={() => sheet('/add/mileage')}>Add reading</Button>}
                </div>
              </div>
              {m.status === 'ok' ? (
                <>
                  <div className="hero-metrics">
                    <div className="metric"><div className="v">{m.milesLast7 != null ? signed(m.milesLast7) : '—'} <span className="small muted">mi</span></div><div className="l">Last 7 days</div></div>
                    <div className="metric"><div className="v">{n0(m.weeklyAvg!)} <span className="small muted">mi/wk</span></div><div className="l">Average · {m.windowUsed === 'all' ? 'all history' : `${m.windowUsed}-day`}</div></div>
                  </div>
                  <div className="projline">
                    <div><div className="num-md">{miles(projWeek)}<span className="unit">mi</span></div><div className="xs faint" style={{ marginTop: 4 }}>Projected next week · ~{n0(m.dailyAvg!)} mi/day</div></div>
                    <Pill tone="projected">Projected</Pill>
                  </div>
                </>
              ) : (
                <div className="projline"><div className="small muted">{m.message}</div></div>
              )}
            </div>
          </Card>

          {/* QUICK ACTIONS */}
          <div className="quick" role="group" aria-label="Quick actions">
            {quick.map(q => (
              <button key={q.label} className="qa" onClick={q.go}><span className="ic"><Icon name={q.icon} /></span>{q.label}</button>
            ))}
          </div>
        </div>

        <div className="stack-lg">
          {/* STATS */}
          <div className="grid2">
            <Stat to="/logs/fuel" icon="fuel" label="Fuel economy"
              value={fuel.currentMpg != null ? mpg(fuel.currentMpg) : '—'} unit={fuel.currentMpg != null ? 'MPG' : undefined}
              sub={fuel.mpgState === 'ready' ? <>Avg <b>{mpg(fuel.averageMpg)}</b> · best {mpg(fuel.bestMpg)}</> : <span>{fuel.message}</span>} />
            <Stat to="/logs/maintenance" icon="wrench" label="Maintenance"
              value={overdueN + upcomingN > 0 ? overdueN + upcomingN : 'OK'}
              unit={overdueN + upcomingN > 0 ? (overdueN ? 'need attention' : 'upcoming') : undefined}
              sub={overdueN ? <span className="bad">{overdueN} overdue</span> : upcomingN ? <span className="warn">{upcomingN} due soon</span> : <span className="good">Nothing due</span>} />
            <Stat to="/more/analytics" icon="card" label="Fuel spend" value={money0(fuel.totalCost)}
              sub={fuel.costPerMile != null ? <>{money3(fuel.costPerMile)}/mi · {n0(fuel.totalGallons)} gal</> : <span>{n0(fuel.totalGallons)} gal logged</span>} />
            <Stat to="/car/mileage" icon="gauge" label="Monthly pace"
              value={m.monthlyAvg != null ? n0(m.monthlyAvg) : '—'} unit={m.monthlyAvg != null ? 'mi' : undefined}
              sub={m.monthlyAvg != null ? <>Estimated from {m.windowUsed === 'all' ? 'history' : `${m.windowUsed}-day average`}</> : <span>Collecting mileage history</span>} />
          </div>

          {/* MAINTENANCE */}
          <Section title="Maintenance status" action={<Link className="link" to="/logs/maintenance">All</Link>}>
            {attention.length > 0 ? (
              <SectionCard>{attention.map(e => <MaintRowLink key={e.item.id} e={e} />)}</SectionCard>
            ) : (
              <Card pad="sm"><p className="small muted">Log a service to see due dates – intervals are editable in Settings.</p></Card>
            )}
          </Section>
        </div>
      </div>

      <div className="home-cols">
        <Section title="Recent service" action={<Link className="link" to="/logs/service">History</Link>}>
          {lastService ? <SectionCard><ServiceRowLink s={lastService} shopName={lastService.shopId ? derived.shopsById.get(lastService.shopId)?.name : undefined} /></SectionCard>
            : <Card pad="sm" onClick={() => sheet('/add/service')}><p className="small muted">No service logged yet. <span className="blue">Add one</span></p></Card>}
        </Section>
        <Section title="Recent fuel fill" action={<Link className="link" to="/logs/fuel">Fuel log</Link>}>
          {lastFuel ? <SectionCard><FuelRowLink f={lastFuel} row={derived.fuelRows.get(lastFuel.id)} onOpen={() => sheet(`/edit/fuel/${lastFuel.id}`)} /></SectionCard>
            : <Card pad="sm" onClick={() => sheet('/add/fuel')}><p className="small muted">No fill-ups yet. <span className="blue">Add one</span></p></Card>}
        </Section>
      </div>

      <Section title="Active mods" action={<Link className="link" to="/car/mods">All mods</Link>}>
        {activeMods.length > 0 ? (
          <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
            {activeMods.map(mod => <Link key={mod.id} to={`/car/mods/${mod.id}`} className="chip"><Icon name="tag" width={15} height={15} />{mod.name}</Link>)}
          </div>
        ) : <Card pad="sm"><Row icon="tag" title="No installed mods" sub="Track modifications, parts and install details" to="/car/mods" /></Card>}
      </Section>
    </div>
  )
}
