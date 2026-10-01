import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGarage } from '../../hooks/garage'
import type { Mod, ModStatus } from '../../types/models'
import { modTotal } from '../../calc/costs'
import { formatDate } from '../../lib/dates'
import { money0 } from '../../lib/format'
import { Button, Card, Chips, DemoPill, Empty, Pill } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { SubTabs, useSheet } from '../../components/nav'
import { AttachmentImage } from '../../components/Photos'
import { CAR_TABS } from './CarPage'

export const modTone = (s: ModStatus) => (s === 'installed' ? 'good' : s === 'planned' ? 'projected' : 'avg')
export const modLabel: Record<ModStatus, string> = { installed: 'Installed', planned: 'Planned', removed: 'Removed' }

export function ModCard({ m }: { m: Mod }) {
  return (
    <Link to={`/car/mods/${m.id}`} className="card press mod-card">
      <div className="pic">{m.imageIds[0] ? <AttachmentImage id={m.imageIds[0]} /> : <span className="ph"><Icon name="tag" /></span>}</div>
      <div className="body">
        <div className="spread" style={{ marginBottom: 6 }}><Pill tone={modTone(m.status)}>{modLabel[m.status]}</Pill>{m.demo && <DemoPill />}</div>
        <div className="h3">{m.name}</div>
        <div className="small muted truncate">{[m.brand, m.category].filter(Boolean).join(' · ') || '—'}</div>
        <div className="spread small" style={{ marginTop: 10 }}>
          <span className="faint">{m.installDate ? formatDate(m.installDate) : m.status === 'planned' ? 'Not installed yet' : ''}</span>
          <b>{modTotal(m) > 0 ? money0(modTotal(m)) : ''}</b>
        </div>
      </div>
    </Link>
  )
}

export default function ModsPage() {
  const { data } = useGarage()
  const sheet = useSheet()
  const [f, setF] = useState<'all' | ModStatus>('all')
  const count = (s: ModStatus) => data.mods.filter(m => m.status === s).length
  const list = data.mods.filter(m => f === 'all' || m.status === f).sort((a, b) => (b.installDate || '9999').localeCompare(a.installDate || '9999'))
  return (
    <div className="stack-lg">
      <header className="page-head"><div className="grow"><div className="eyebrow">My vehicle</div><h1 className="h1">Mods</h1></div>
        <Button sm icon="plus" onClick={() => sheet('/add/mod')}>Add</Button></header>
      <SubTabs items={CAR_TABS} />
      <Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All', count: data.mods.length }, { value: 'installed', label: 'Installed', count: count('installed') }, { value: 'planned', label: 'Planned', count: count('planned') }, { value: 'removed', label: 'Removed', count: count('removed') }]} />
      {list.length === 0 ? (
        <Card><Empty icon="tag" title={data.mods.length ? 'No mods in this filter' : 'No mods yet'} text="Track grilles, tunes, intakes, wheels – with photos, receipts and install details." action={<Button onClick={() => sheet('/add/mod')} icon="plus">Add a mod</Button>} /></Card>
      ) : <div className="grid2 grid-auto" style={{ gap: 14 }}>{list.map(m => <ModCard key={m.id} m={m} />)}</div>}
    </div>
  )
}
