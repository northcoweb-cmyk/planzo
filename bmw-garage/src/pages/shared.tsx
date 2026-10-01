import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { FuelEntry, MaintenanceItem, ServiceRecord } from '../types/models'
import type { MaintEval, MaintStatus } from '../calc/maintenance'
import type { FuelRow } from '../calc/fuel'
import { serviceTotal } from '../calc/costs'
import { formatDate, formatDateShort } from '../lib/dates'
import { miles, money, mpg } from '../lib/format'
import { Icon, type IconName } from '../components/Icon'
import { Pill, Ring, Row, type PillTone } from '../components/ui'

export const maintTone = (s: MaintStatus): 'good' | 'warn' | 'bad' | 'blue' =>
  s === 'overdue' ? 'bad' : s === 'dueSoon' ? 'warn' : s === 'good' ? 'good' : 'blue'

export function maintPill(e: MaintEval): { tone: PillTone; text: string } {
  switch (e.status) {
    case 'overdue': return { tone: 'bad', text: 'Overdue' }
    case 'dueSoon': return { tone: 'warn', text: 'Due soon' }
    case 'good': return { tone: 'good', text: 'Good' }
    case 'unknown': return { tone: '', text: 'No record' }
    case 'condition': return { tone: '', text: 'Inspect' }
    default: return { tone: '', text: 'Off' }
  }
}

/** One-line plain-English status, e.g. "Due in 918 mi" / "982 mi overdue". */
export function maintDetail(e: MaintEval): string {
  const bits: string[] = []
  if (e.remainingMiles != null) bits.push(e.remainingMiles < 0 ? `${miles(-e.remainingMiles)} mi overdue` : `${miles(e.remainingMiles)} mi left`)
  if (e.remainingDays != null) bits.push(e.remainingDays < 0 ? `${-e.remainingDays} days overdue` : `${e.remainingDays} days left`)
  if (bits.length) return bits.join(' · ')
  if (e.status === 'unknown') return 'Log when it was last done'
  if (e.status === 'condition') return 'Condition-based'
  return ''
}

export function MaintRowLink({ e }: { e: MaintEval }) {
  const pill = maintPill(e)
  const used = e.used != null ? Math.max(0, Math.min(1, e.used)) : 0
  return (
    <Link to={`/logs/maintenance/${e.item.id}`} className="li">
      <Ring value={e.used != null ? used : 0.03} tone={maintTone(e.status)} label={<Icon name="wrench" width={16} height={16} />} />
      <span className="grow">
        <span className="t" style={{ display: 'block' }}>{e.item.name}</span>
        <span className="s" style={{ display: 'block' }}>{maintDetail(e)}</span>
      </span>
      <Pill tone={pill.tone}>{pill.text}</Pill>
      <Icon name="chevron" className="chev" />
    </Link>
  )
}

export const kindIcon: Record<ServiceRecord['kind'], IconName> = { maintenance: 'wrench', repair: 'shield', modification: 'tag' }
export const kindLabel: Record<ServiceRecord['kind'], string> = { maintenance: 'Maintenance', repair: 'Repair', modification: 'Modification' }

export function ServiceRowLink({ s, shopName }: { s: ServiceRecord; shopName?: string }) {
  return (
    <Row
      to={`/logs/service/${s.id}`} icon={kindIcon[s.kind]} title={s.title}
      sub={`${formatDate(s.date)}${s.mileage != null ? ' · ' + miles(s.mileage) + ' mi' : ''}${shopName ? ' · ' + shopName : ''}`}
      value={money(serviceTotal(s))}
    />
  )
}

export function FuelMpgBadge({ row }: { row?: FuelRow }) {
  if (!row) return null
  switch (row.status) {
    case 'valid': return <Pill tone="actual">{mpg(row.mpg)} MPG</Pill>
    case 'suspect': return <Pill tone="warn">{mpg(row.mpg)} MPG?</Pill>
    case 'baseline': return <Pill tone="avg">Baseline</Pill>
    case 'partial': return <Pill tone="avg">Partial</Pill>
    case 'chainBreak': return <Pill tone="avg">New baseline</Pill>
    case 'noOdometer': return <Pill tone="warn">No odometer</Pill>
    case 'badOdometer': return <Pill tone="bad">Check odometer</Pill>
  }
}

export function FuelRowLink({ f, row, onOpen }: { f: FuelEntry; row?: FuelRow; onOpen: () => void }) {
  return (
    <button className="li" onClick={onOpen}>
      <span className="ic"><Icon name="fuel" /></span>
      <span className="grow">
        <span className="t" style={{ display: 'block' }}>{f.gallons.toFixed(2)} gal · {money(f.totalPrice)}</span>
        <span className="s" style={{ display: 'block' }}>{formatDateShort(f.date)}{f.odometer != null ? ` · ${miles(f.odometer)} mi` : ''}{f.station ? ` · ${f.station}` : ''}</span>
      </span>
      <FuelMpgBadge row={row} />
    </button>
  )
}

export function SectionCard({ children }: { children: ReactNode }) { return <div className="card list">{children}</div> }

export const itemName = (items: Map<string, MaintenanceItem>, id: string) => items.get(id)?.name ?? 'Unknown item'
