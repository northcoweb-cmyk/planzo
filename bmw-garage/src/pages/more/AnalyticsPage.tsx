import { useMemo } from 'react'
import { useGarage } from '../../hooks/garage'
import { serviceSpend, costPerMile } from '../../calc/costs'
import { fuelSpend } from '../../calc/fuel'
import { projectAhead } from '../../calc/mileage'
import { daysBetween, formatDateShort, formatMonth, parseDate } from '../../lib/dates'
import { money, money0, money3, mpg, n0, miles, n1 } from '../../lib/format'
import { Banner, Card, Pill, Section } from '../../components/ui'
import { BarChart, LineChart, SpendBar } from '../../components/charts'
import { PageHead } from '../../components/ui'

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return <Card pad="sm"><div className="eyebrow">{label}</div><div className="num-md" style={{ marginTop: 6 }}>{value}</div>{sub && <div className="xs faint" style={{ marginTop: 4 }}>{sub}</div>}</Card>
}

export default function AnalyticsPage() {
  const { data, derived } = useGarage()
  const { mileage: m, fuel: f, ownership: o } = derived
  const hasAny = data.fuel.length + data.services.length + data.mileage.length + data.mods.length + data.parts.length > 0

  const odo = useMemo(() => derived.readings.filter(r => r.valid).map(r => ({ x: parseDate(r.date).getTime(), y: r.odometer })), [derived.readings])
  const mpgSeries = useMemo(() => f.rows.filter(r => r.status === 'valid').map(r => ({ x: parseDate(r.entry.date).getTime(), y: r.mpg as number })), [f.rows])
  const fuelM = useMemo(() => fuelSpend(data.fuel, 'month').slice(-12), [data.fuel])
  const maintSvc = useMemo(() => data.services.filter(s => s.kind !== 'modification'), [data.services])
  const maintM = useMemo(() => serviceSpend(maintSvc, 'month').slice(-12), [maintSvc])
  const maintY = useMemo(() => serviceSpend(maintSvc, 'year'), [maintSvc])
  const maintTotal = derived.maintenanceSpend
  const monthsSpan = maintSvc.length > 1 ? Math.max(1, daysBetween([...maintSvc].sort((a, b) => (a.date < b.date ? -1 : 1))[0].date, derived.today) / 30.4375) : 1
  const milesBase = m.sincePurchase ?? (m.latest && derived.readings[0] ? m.latest.odometer - derived.readings[0].odometer : null)
  const maintCpm = costPerMile(o.maintenance + o.repairs, milesBase)
  const totalCpm = costPerMile(o.total, milesBase)

  if (!hasAny) return <div className="stack-lg"><PageHead back="/more" eyebrow="Insights" title="Analytics" /><Banner tone="info" icon="chart">Analytics appear as you log mileage, fuel and service. Nothing is charted until there’s real data.</Banner></div>

  const spendParts = [
    { label: 'Fuel', value: o.fuel, color: '#4a93ff' }, { label: 'Maintenance', value: o.maintenance, color: '#8fc0ff' },
    { label: 'Repairs', value: o.repairs, color: '#c9d6ea' }, { label: 'Mods', value: o.mods + o.serviceModifications, color: '#1c69d4' }, { label: 'Parts', value: o.parts, color: '#5a6a85' }
  ]

  return (
    <div className="stack-lg">
      <PageHead back="/more" eyebrow="Insights" title="Analytics" />

      <Card>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Total cost of ownership</div>
        <div className="num-xl">{money0(o.total)}</div>
        <div style={{ margin: '16px 0 12px' }}><SpendBar parts={spendParts} /></div>
        <div className="legend">{spendParts.filter(p => p.value > 0).map(p => <span key={p.label}><i style={{ background: p.color }} />{p.label} {money0(p.value)}</span>)}</div>
        <p className="xs faint" style={{ marginTop: 12 }}>Each dollar is counted once – parts that appear on a service invoice or a mod aren’t added again. Planned mods aren’t counted until installed. Purchase price is excluded.</p>
        {totalCpm != null && <div className="spread" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--stroke)' }}><span className="muted small">All running costs per mile</span><b className="num">{money3(totalCpm)}</b></div>}
      </Card>

      <Section title="Mileage" action={m.status === 'ok' ? <Pill tone="avg">Average</Pill> : undefined}>
        <div className="grid2">
          <Tile label="Odometer" value={<>{miles(derived.currentOdo)}<span className="unit">mi</span></>} sub={<Pill tone="actual">Actual</Pill>} />
          <Tile label="Since purchase" value={m.sincePurchase != null ? <>{n0(m.sincePurchase)}<span className="unit">mi</span></> : '—'} sub={m.sincePurchase == null ? 'needs purchase mileage' : undefined} />
          <Tile label="Last 7 days" value={m.milesLast7 != null ? n0(m.milesLast7) : '—'} sub="actual readings" />
          <Tile label="Last 30 days" value={m.milesLast30 != null ? n0(m.milesLast30) : '—'} sub="actual readings" />
          <Tile label="Avg weekly" value={m.weeklyAvg != null ? n0(m.weeklyAvg) : '—'} sub={m.status === 'ok' ? `${m.windowUsed === 'all' ? 'all history' : m.windowUsed + '-day window'}` : 'collecting history'} />
          <Tile label="Avg monthly" value={m.monthlyAvg != null ? n0(m.monthlyAvg) : '—'} />
          <Tile label="Projected +30d" value={m.status === 'ok' ? <>{miles(projectAhead(m, 30, derived.today))}</> : '—'} sub={m.status === 'ok' ? <Pill tone="projected">Projected</Pill> : 'collecting history'} />
          <Tile label="Readings" value={derived.readings.filter(r => r.valid).length} sub={derived.readings.some(r => !r.valid) ? `${derived.readings.filter(r => !r.valid).length} ignored` : undefined} />
        </div>
        {odo.length >= 2 && <div style={{ marginTop: 14 }}><Card><LineChart series={[{ name: 'Odometer', points: odo, area: true }]} yFormat={v => n0(v)} xFormat={x => formatDateShort(new Date(x).toISOString().slice(0, 10))} tipFormat={p => <>{miles(p.y)} mi<small>{formatDateShort(new Date(p.x).toISOString().slice(0, 10))}</small></>} /></Card></div>}
      </Section>

      <Section title="Fuel">
        <div className="grid2">
          <Tile label="Average MPG" value={f.averageMpg != null ? mpg(f.averageMpg) : '—'} sub={f.averageMpg == null ? f.message : `best ${mpg(f.bestMpg)} · worst ${mpg(f.worstMpg)}`} />
          <Tile label="Fuel cost" value={money0(f.totalCost)} sub={`${n0(f.totalGallons)} gal`} />
          <Tile label="Cost per mile" value={f.costPerMile != null ? money3(f.costPerMile) : '—'} sub="fuel only" />
          <Tile label="Avg price" value={f.averagePrice != null ? money(f.averagePrice) : '—'} sub="per gallon" />
        </div>
        {mpgSeries.length >= 2 && <div style={{ marginTop: 14 }}><Card><div className="eyebrow" style={{ marginBottom: 10 }}>MPG over time</div><LineChart series={[{ name: 'MPG', points: mpgSeries, area: true }]} minSpan={8} yFormat={v => n1(v)} xFormat={x => formatDateShort(new Date(x).toISOString().slice(0, 10))} tipFormat={p => <>{n1(p.y)} MPG<small>{formatDateShort(new Date(p.x).toISOString().slice(0, 10))}</small></>} /></Card></div>}
        {fuelM.length > 0 && <div style={{ marginTop: 14 }}><Card><div className="eyebrow" style={{ marginBottom: 10 }}>Fuel spend by month</div><BarChart data={fuelM.map(s => ({ key: s.key, label: formatMonth(s.key), value: s.total }))} valueFormat={money0} /></Card></div>}
      </Section>

      <Section title="Maintenance & service">
        <div className="grid2">
          <Tile label="Spent (maint + repairs)" value={money0(maintTotal)} />
          <Tile label="Per month" value={maintSvc.length ? money0(maintTotal / monthsSpan) : '—'} sub="since first record" />
          <Tile label="Services" value={data.services.length} />
          <Tile label="Cost per mile" value={maintCpm != null ? money3(maintCpm) : '—'} sub="maintenance + repairs" />
          <Tile label="Upcoming" value={derived.maint.filter(e => e.status === 'dueSoon').length} sub="due soon" />
          <Tile label="Overdue" value={derived.maintGroups.overdue.length} />
        </div>
        {maintM.length > 0 && <div style={{ marginTop: 14 }}><Card><div className="eyebrow" style={{ marginBottom: 10 }}>Service spend by month</div><BarChart data={maintM.map(s => ({ key: s.key, label: formatMonth(s.key), value: s.total }))} valueFormat={money0} /></Card></div>}
        {maintY.length > 1 && <div style={{ marginTop: 14 }}><Card><div className="eyebrow" style={{ marginBottom: 10 }}>Per year</div><BarChart data={maintY.map(s => ({ key: s.key, label: s.key, value: s.total }))} valueFormat={money0} /></Card></div>}
      </Section>

      <Section title="Mods & parts">
        <div className="grid2">
          <Tile label="Mods spending" value={money0(o.mods)} sub={`${data.mods.filter(x => x.status === 'installed').length} installed · ${data.mods.filter(x => x.status === 'planned').length} planned`} />
          <Tile label="Parts spending" value={money0(o.parts)} sub="parts not tied to a service or mod" />
        </div>
      </Section>
    </div>
  )
}
