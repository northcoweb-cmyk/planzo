import { useMemo, useState } from 'react'
import { useGarage } from '../../hooks/garage'
import { fuelSpend, searchFuel, sortFuel, type Bucket } from '../../calc/fuel'
import { formatDate, formatDateShort, formatMonth, parseDate } from '../../lib/dates'
import { miles, money, money0, money3, mpg, n0, n1 } from '../../lib/format'
import { Banner, Button, Card, Chips, Empty, Pill, Section } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { SubTabs, useSheet } from '../../components/nav'
import { BarChart, LineChart } from '../../components/charts'
import { FuelRowLink } from '../shared'

export const LOGS_TABS = [{ to: '/logs/fuel', label: 'Fuel' }, { to: '/logs/service', label: 'Service' }, { to: '/logs/maintenance', label: 'Maintenance' }]

export default function FuelPage() {
  const { data, derived } = useGarage()
  const sheet = useSheet()
  const f = derived.fuel
  const [q, setQ] = useState('')
  const [by, setBy] = useState<Bucket>('month')

  const list = useMemo(() => searchFuel(sortFuel(data.fuel), q).reverse(), [data.fuel, q])
  const mpgSeries = useMemo(() => f.rows.filter(r => r.status === 'valid').map(r => ({ x: parseDate(r.entry.date).getTime(), y: r.mpg as number })), [f.rows])
  const spend = useMemo(() => fuelSpend(data.fuel, by).slice(-12), [data.fuel, by])
  const label = (k: string) => by === 'month' ? formatMonth(k) : by === 'year' ? k : formatDateShort(k)

  return (
    <div className="stack-lg">
      <header className="page-head"><div className="grow"><div className="eyebrow">Logs</div><h1 className="h1">Fuel</h1></div><Button sm icon="plus" onClick={() => sheet('/add/fuel')}>Add fill</Button></header>
      <SubTabs items={LOGS_TABS} />

      {data.fuel.length === 0 ? (
        <Card><Empty icon="fuel" title="No fill-ups yet" text="Log each fill-up with its odometer reading. MPG is calculated tank-to-tank, never from a single fill." action={<Button icon="plus" onClick={() => sheet('/add/fuel')}>Add first fill-up</Button>} /></Card>
      ) : (
        <>
          <Card>
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div><div className="eyebrow" style={{ marginBottom: 8 }}>Current MPG</div>
                {f.currentMpg != null ? <div className="num-xl">{mpg(f.currentMpg)}<span className="unit">MPG</span></div> : <div className="num-lg faint">—</div>}</div>
              {f.mpgState === 'ready' ? <Pill tone="actual">Calculated</Pill> : <Pill tone="avg">Waiting</Pill>}
            </div>
            {f.mpgState !== 'ready' ? (
              <p className="small muted" style={{ marginTop: 12 }}><b>{f.message}.</b> MPG needs two full-tank fill-ups with odometer readings (miles between them ÷ gallons added).</p>
            ) : (
              <div className="grid3" style={{ marginTop: 16 }}>
                <div className="metric"><div className="v">{mpg(f.averageMpg)}</div><div className="l">Average</div></div>
                <div className="metric"><div className="v good">{mpg(f.bestMpg)}</div><div className="l">Best</div></div>
                <div className="metric"><div className="v">{mpg(f.worstMpg)}</div><div className="l">Worst</div></div>
              </div>
            )}
            {f.mpgState === 'ready' && f.rows.some(r => r.status === 'baseline' || r.status === 'partial') && f.rows[f.rows.length - 1].status !== 'valid' && (
              <p className="xs faint" style={{ marginTop: 12 }}>Latest fill-up isn’t a completed tank-to-tank pair yet – MPG updates at your next full tank.</p>
            )}
          </Card>

          <div className="grid2">
            <Card pad="sm"><div className="eyebrow">Total fuel</div><div className="num-md" style={{ marginTop: 6 }}>{money0(f.totalCost)}</div><div className="xs faint" style={{ marginTop: 4 }}>{n0(f.totalGallons)} gal</div></Card>
            <Card pad="sm"><div className="eyebrow">Avg price</div><div className="num-md" style={{ marginTop: 6 }}>{f.averagePrice != null ? money(f.averagePrice) : '—'}</div><div className="xs faint" style={{ marginTop: 4 }}>per gallon</div></Card>
            <Card pad="sm"><div className="eyebrow">Cost per mile</div><div className="num-md" style={{ marginTop: 6 }}>{f.costPerMile != null ? money3(f.costPerMile) : '—'}</div><div className="xs faint" style={{ marginTop: 4 }}>{f.validMiles ? `over ${n0(f.validMiles)} valid mi` : 'needs a valid tank'}</div></Card>
            <Card pad="sm"><div className="eyebrow">Fill-ups</div><div className="num-md" style={{ marginTop: 6 }}>{data.fuel.length}</div><div className="xs faint" style={{ marginTop: 4 }}>{f.validCount} with MPG</div></Card>
          </div>

          {mpgSeries.length >= 2 && (
            <Section title="MPG over time">
              <Card><LineChart series={[{ name: 'MPG', points: mpgSeries, area: true }]} minSpan={8} yFormat={v => n1(v)} xFormat={x => formatDateShort(new Date(x).toISOString().slice(0, 10))}
                tipFormat={p => <>{n1(p.y)} MPG<small>{formatDate(new Date(p.x).toISOString().slice(0, 10))}</small></>} /></Card>
            </Section>
          )}

          {spend.length > 0 && (
            <Section title="Fuel spending" action={<Chips value={by} onChange={setBy} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />}>
              <Card><BarChart data={spend.map(s => ({ key: s.key, label: label(s.key), value: s.total }))} valueFormat={v => money0(v)} tipLabel={d => `${d.label} · ${spend.find(s => s.key === d.key)?.count} fill-ups`} /></Card>
            </Section>
          )}

          <Section title={`History · ${list.length}`}>
            <div className="search" style={{ marginBottom: 12 }}><Icon name="search" /><input className="input" placeholder="Search station, notes, date, odometer…" value={q} onChange={e => setQ(e.target.value)} inputMode="search" aria-label="Search fuel history" /></div>
            {f.rows.some(r => r.status === 'noOdometer' || r.status === 'badOdometer' || r.status === 'suspect') && !q && (
              <div style={{ marginBottom: 10 }}><Banner tone="warn" icon="warn">Some fill-ups can’t be used for MPG (missing/odd odometer or implausible MPG). They’re flagged below; tap one to correct it.</Banner></div>
            )}
            {list.length === 0 ? <Card pad="sm"><p className="small muted">No fill-ups match “{q}”.</p></Card> : (
              <div className="card list">{list.map(e => <FuelRowLink key={e.id} f={e} row={derived.fuelRows.get(e.id)} onOpen={() => sheet(`/edit/fuel/${e.id}`)} />)}</div>
            )}
            <p className="xs faint" style={{ margin: '10px 4px 0' }}>Last full tank odometer: {(() => { const r = [...f.rows].reverse().find(x => x.entry.full && x.entry.odometer != null); return r ? miles(r.entry.odometer) + ' mi' : '—' })()}</p>
          </Section>
        </>
      )}
    </div>
  )
}
