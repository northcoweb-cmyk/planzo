import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGarage } from '../hooks/garage'
import type { Reminder } from '../types/models'
import type { ReminderEval } from '../calc/reminders'
import { addDays } from '../lib/dates'
import { Banner, Button, Card, Chips, Empty, Pill, Section } from '../components/ui'
import { Icon } from '../components/Icon'
import { useSheet } from '../components/nav'
import { useOverlay } from '../components/overlays'
import { MaintRowLink } from './shared'

type Tab = 'active' | 'overdue' | 'completed'

const tone = (s: ReminderEval['state']) => (s === 'overdue' ? 'bad' : s === 'dueSoon' ? 'warn' : s === 'completed' ? 'good' : s === 'snoozed' ? 'avg' : 'avg')
const text = (s: ReminderEval['state']) => ({ overdue: 'Overdue', dueSoon: 'Due soon', completed: 'Done', snoozed: 'Snoozed', upcoming: 'Upcoming' }[s])

export default function RemindersPage() {
  const { data, derived, actions } = useGarage()
  const sheet = useSheet(); const { confirm, toast } = useOverlay()
  const [tab, setTab] = useState<Tab>('active')
  const [snooze, setSnooze] = useState<Reminder | null>(null)
  const all = derived.reminders
  const overdue = all.filter(r => r.state === 'overdue')
  const active = all.filter(r => r.state === 'upcoming' || r.state === 'dueSoon' || r.state === 'snoozed')
  const done = all.filter(r => r.state === 'completed')
  const shown = tab === 'active' ? active : tab === 'overdue' ? overdue : done
  const alerts = derived.maint.filter(e => e.status === 'overdue' || e.status === 'dueSoon')

  const order = (a: ReminderEval, b: ReminderEval) => (a.remainingDays ?? 1e9) - (b.remainingDays ?? 1e9) || (a.remainingMiles ?? 1e9) - (b.remainingMiles ?? 1e9)

  async function complete(r: Reminder) { await actions.save('reminders', { ...r, completedAt: new Date().toISOString(), snoozedUntil: '' }); toast('Reminder completed') }
  async function reopen(r: Reminder) { await actions.save('reminders', { ...r, completedAt: '' }); toast('Reminder reopened') }
  async function doSnooze(r: Reminder, days: number) { await actions.save('reminders', { ...r, snoozedUntil: addDays(derived.today, days) }); setSnooze(null); toast(`Snoozed ${days} day${days > 1 ? 's' : ''}`) }

  return (
    <div className="stack-lg">
      <header className="page-head"><div className="grow"><div className="eyebrow">Stay ahead</div><h1 className="h1">Reminders</h1></div><Button sm icon="plus" onClick={() => sheet('/add/reminder')}>Add</Button></header>
      <Chips value={tab} onChange={setTab} options={[{ value: 'active', label: 'Active', count: active.length }, { value: 'overdue', label: 'Overdue', count: overdue.length }, { value: 'completed', label: 'Completed', count: done.length }]} />

      {tab === 'active' && alerts.length > 0 && (
        <Section title="From maintenance">
          <div className="card list">{alerts.map(e => <MaintRowLink key={e.item.id} e={e} />)}</div>
          <p className="xs faint" style={{ margin: '8px 4px 0' }}>Calculated automatically from your service history and intervals – no reminder needed.</p>
        </Section>
      )}
      {tab === 'overdue' && overdue.length === 0 && derived.maintGroups.overdue.length > 0 && (
        <Banner tone="warn" icon="warn" action={<Link to="/logs/maintenance" className="btn ghost sm">View</Link>}>{derived.maintGroups.overdue.length} maintenance item{derived.maintGroups.overdue.length > 1 ? 's are' : ' is'} overdue.</Banner>
      )}

      <Section title={tab === 'completed' ? 'Completed reminders' : 'Your reminders'}>
        {shown.length === 0 ? (
          <Card><Empty icon="bell" title={tab === 'overdue' ? 'Nothing overdue' : tab === 'completed' ? 'Nothing completed yet' : 'No reminders'} text="Set a reminder by mileage, by date, or both." action={tab === 'active' ? <Button icon="plus" onClick={() => sheet('/add/reminder')}>Add reminder</Button> : undefined} /></Card>
        ) : (
          <div className="stack">
            {[...shown].sort(order).map(ev => {
              const r = ev.reminder
              return (
                <Card key={r.id} pad="sm" className={ev.state === 'overdue' ? 'accent' : ''}>
                  <div className="spread" style={{ alignItems: 'flex-start', padding: '2px 4px' }}>
                    <div className="grow"><div className="h3">{r.title}</div><div className="small muted" style={{ marginTop: 3 }}>{ev.label}</div>{r.notes && <div className="xs faint" style={{ marginTop: 6 }}>{r.notes}</div>}</div>
                    <Pill tone={tone(ev.state)} dot>{text(ev.state)}</Pill>
                  </div>
                  <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
                    {ev.state === 'completed' ? <button className="textbtn" onClick={() => reopen(r)}><Icon name="rotate" width={16} height={16} />Reopen</button> : <>
                      <button className="textbtn" onClick={() => complete(r)}><Icon name="check" width={16} height={16} />Complete</button>
                      <button className="textbtn" onClick={() => setSnooze(r)}><Icon name="clock" width={16} height={16} />Snooze</button>
                      {r.maintenanceItemId && data.maintItems.some(i => i.id === r.maintenanceItemId) && <button className="textbtn" onClick={() => sheet(`/add/service?item=${r.maintenanceItemId}`)}><Icon name="wrench" width={16} height={16} />Log service</button>}
                    </>}
                    <span className="grow" />
                    <button className="textbtn" onClick={() => sheet(`/edit/reminder/${r.id}`)} aria-label="Edit"><Icon name="edit" width={16} height={16} /></button>
                    <button className="textbtn bad" aria-label="Delete" onClick={async () => { if (await confirm({ title: 'Delete reminder?', message: r.title, confirmLabel: 'Delete', danger: true })) { await actions.remove('reminders', r.id); toast('Reminder deleted') } }}><Icon name="trash" width={16} height={16} /></button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </Section>

      {snooze && (
        <div className="dialog-wrap" role="dialog" aria-modal="true" aria-label="Snooze">
          <div className="sheet-backdrop" onClick={() => setSnooze(null)} />
          <div className="dialog"><h3>Snooze “{snooze.title}”</h3><p>Hidden from Active until then. Overdue items always stay visible.</p>
            <div className="actions">
              {[[1, 'Tomorrow'], [3, '3 days'], [7, '1 week'], [30, '1 month']].map(([d, l]) => <Button key={d} variant="ghost" onClick={() => doSnooze(snooze, d as number)}>{l}</Button>)}
              <Button variant="ghost" onClick={() => setSnooze(null)}>Cancel</Button>
            </div></div>
        </div>
      )}
    </div>
  )
}
