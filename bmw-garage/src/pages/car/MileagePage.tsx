import { useMemo, useState } from 'react'
import { useGarage } from '../../hooks/garage'
import { addDays, daysBetween, formatDate, formatDateShort, parseDate } from '../../lib/dates'
import { miles, n0, n1 } from '../../lib/format'
import { projectAhead, projectOdometer, type Reading } from '../../calc/mileage'
import { Button, Banner, Card, Pill, Row, Section } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { SubTabs, useSheet } from '../../components/nav'
import { LineChart } from '../../components/charts'
import { DateField } from '../../components/forms'
import { CAR_TABS } from './CarPage'

const srcLabel = { manual: 'Reading', fuel: 'From fuel fill', service: 'From service', purchase: 'Purchase' } as const

export default function MileagePage() {
  const { derived } = useGarage()
  const sheet = useSheet()
  const m = derived.mileage
  const [target, setTarget] = useState(addDays(derived.today, 90))
  const [showAll, setShowAll] = useState(false)

  const chartSeries = useMemo(() => {
    const valid = derived.readings.filter(r => r.valid)
    if (valid.length < 2) return []
    const pts = valid.map(r => ({ x: parseDate(r.date).getTime(), y: r.odometer }))
    const series = [{ name: 'Actual', points: pts, area: true }]
    if (m.status === 'ok' && m.latest) {
      const end = addDays(derived.today > m.latest.date ? derived.today : m.latest.date, 30)
      series.push({ name: 'Projected', dashed: true, area: false, points: [
        { x: parseDate(m.latest.date).getTime(), y: m.latest.odometer },
        { x: parseDate(end).getTime(), y: projectOdometer(m, end)! }
      ] } as never)
    }
    return series
  }, [derived.readings, derived.today, m])

  const full = [...derived.readings].reverse()
  const list = showAll ? full : full.slice(0, 10)
  const open = (r: Reading) => {
    if (r.source === 'manual' && r.refId) sheet(`/edit/mileage/${r.refId}`)
    else if (r.source === 'fuel' && r.refId) sheet(`/edit/fuel/${r.refId}`)
    else if (r.source === 'service' && r.refId) sheet(`/edit/service/${r.refId}`)
    else if (r.source === 'purchase') sheet('/edit/vehicle')
  }
  const invalid = derived.readings.filter(r => !r.valid).length

  return (
    <div className="stack-lg">
      <header className="page-head"><div className="grow"><div className="eyebrow">My vehicle</div><h1 className="h1">Mileage</h1></div></header>
      <SubTabs items={CAR_TABS} />

      <Card>
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div><div className="eyebrow" style={{ marginBottom: 8 }}>Odometer</div>
            <div className="num-xl">{derived.currentOdo != null ? miles(derived.currentOdo) : '—'}<span className="unit">mi</span></div></div>
          <div style={{ textAlign: 'right' }}>{derived.currentOdo != null && <><Pill tone="actual">Actual</Pill><div className="xs faint" style={{ marginTop: 6 }}>{formatDate(m.latest!.date)}</div></>}</div>
        </div>
        <div style={{ marginTop: 16 }}><Button block icon="plus" onClick={() => sheet('/add/mileage')}>Add odometer reading</Button></div>
      </Card>

      {m.status !== 'ok' ? (
        <Banner tone="info" icon="clock"><b>Collecting mileage history.</b> {m.message}. Projections appear once there are readings spanning at least 3 days – nothing is estimated until then.</Banner>
      ) : (
        <>
          <Section title="Driving rate" action={<Pill tone="avg">Average</Pill>}>
            <div className="grid3">
              <Card pad="sm"><div className="num-md">{n0(m.dailyAvg!)}</div><div className="xs faint" style={{ marginTop: 4 }}>mi / day</div></Card>
              <Card pad="sm"><div className="num-md">{n0(m.weeklyAvg!)}</div><div className="xs faint" style={{ marginTop: 4 }}>mi / week</div></Card>
              <Card pad="sm"><div className="num-md">{n0(m.monthlyAvg!)}</div><div className="xs faint" style={{ marginTop: 4 }}>mi / month</div></Card>
            </div>
            <p className="xs faint" style={{ margin: '10px 4px 0' }}>
              Based on the {m.windowUsed === 'all' ? `whole ${m.historyDays}-day history` : `last ${m.windowUsed} days`} of actual readings ({formatDateShort(addDays(m.latest!.date, -(m.windowDays ?? 0)))} → {formatDateShort(m.latest!.date)}).
              {m.windows.d7 && <> 7-day: {n0(m.windows.d7.milesPerDay * 7)}/wk</>}{m.windows.d30 && <> · 30-day: {n0(m.windows.d30.milesPerDay * 7)}/wk</>}{m.windows.d90 && <> · 90-day: {n0(m.windows.d90.milesPerDay * 7)}/wk</>}
            </p>
          </Section>

          <Section title="Projection" action={<Pill tone="projected">Projected</Pill>}>
            <Card pad="sm">
              <div className="list">
                <Row title="Estimated today" sub={m.latest!.date === derived.today ? 'Same as latest reading' : `${daysBetween(m.latest!.date, derived.today)} days since latest reading`} value={`${miles(projectOdometer(m, derived.today))} mi`} chevron={false} />
                <Row title="7 days from now" value={`${miles(projectAhead(m, 7, derived.today))} mi`} chevron={false} />
                <Row title="30 days from now" value={`${miles(projectAhead(m, 30, derived.today))} mi`} chevron={false} />
              </div>
              <div style={{ padding: '10px 16px 6px' }}>
                <DateField label="Pick a date" value={target} onChange={setTarget} />
                <div className="spread" style={{ marginTop: 12 }}><span className="muted small">Projected on {target ? formatDate(target) : '—'}</span><span className="num-md blue">{target ? miles(projectOdometer(m, target)) : '—'} mi</span></div>
              </div>
            </Card>
            <p className="xs faint" style={{ margin: '10px 4px 0' }}>Projection = latest actual reading + average miles/day × days. It is not a reading – enter a real odometer value any time and everything recalibrates.</p>
          </Section>
        </>
      )}

      {chartSeries.length > 0 && (
        <Section title="Odometer over time">
          <Card><LineChart series={chartSeries} yFormat={v => n0(v)} xFormat={x => formatDateShort(new Date(x).toISOString().slice(0, 10))}
            tipFormat={(p, s) => <>{miles(p.y)} mi<small>{s.name} · {formatDate(new Date(p.x).toISOString().slice(0, 10))}</small></>} /></Card>
        </Section>
      )}

      <Section title={`Readings · ${full.length}`}>
        {invalid > 0 && <div style={{ marginBottom: 10 }}><Banner tone="warn" icon="warn"><b>{invalid} reading{invalid > 1 ? 's' : ''} ignored.</b> An odometer can’t go down, so conflicting values are left out of averages. Tap one to fix it.</Banner></div>}
        {list.length === 0 ? <Card pad="sm"><p className="small muted">No readings yet.</p></Card> : (
          <div className="card list">
            {list.map((r, i) => (
              <Row key={i} onClick={() => open(r)} icon={r.valid ? 'gauge' : 'warn'} tone={r.valid ? undefined : 'warn'}
                title={`${miles(r.odometer)} mi`} sub={<>{formatDate(r.date)} · {srcLabel[r.source]}{r.issue && <span className="warn"> · ignored</span>}</>}
                right={r.source === 'manual' ? undefined : <Pill tone="avg">{r.source}</Pill>} />
            ))}
          </div>
        )}
        {full.length > 10 && <div style={{ marginTop: 10 }}><Button block variant="ghost" sm onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${full.length}`}</Button></div>}
        <p className="xs faint" style={{ margin: '10px 4px 0' }}>Fuel and service entries with an odometer value also count as readings (turn off in Settings → Mileage). <Icon name="info" width={12} height={12} /> avg {n1(m.dailyAvg ?? 0)} mi/day</p>
      </Section>
    </div>
  )
}
