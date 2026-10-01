import { useGarage } from '../../hooks/garage'
import { MAINTENANCE_CATALOG, CATEGORIES } from '../../data/maintenanceCatalog'
import { n0 } from '../../lib/format'
import { Banner, Button, Card, PageHead, Pill } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useSheet } from '../../components/nav'
import { useOverlay } from '../../components/overlays'

export default function IntervalsPage() {
  const { data, actions } = useGarage()
  const sheet = useSheet(); const { confirm, toast } = useOverlay()
  const summary = (i: (typeof data.maintItems)[number]) => [i.intervalMiles ? `${n0(i.intervalMiles)} mi` : '', i.intervalMonths ? `${i.intervalMonths} mo` : ''].filter(Boolean).join(' / ') || 'Condition-based'
  async function restore() {
    if (!(await confirm({ title: 'Restore typical intervals?', message: 'Resets every built-in item to its typical interval. Custom items and your service history are kept.', confirmLabel: 'Restore' }))) return
    for (const c of MAINTENANCE_CATALOG) {
      const it = data.maintItems.find(i => i.key === c.key)
      if (it) await actions.save('maintItems', { ...it, intervalMiles: c.intervalMiles, intervalMonths: c.intervalMonths, basis: c.basis })
    }
    toast('Intervals restored')
  }
  return (
    <div className="stack-lg">
      <PageHead back="/more/settings" eyebrow="Settings" title="Maintenance intervals" right={<Button sm icon="plus" onClick={() => sheet('/add/interval')}>Custom</Button>} />
      <Banner tone="info" icon="info">Starting values are <b>typical</b> intervals for an N55 X3 – not a substitute for your owner’s manual or the car’s Condition Based Service. Change any of them; due dates update instantly.</Banner>
      {CATEGORIES.map(cat => {
        const items = data.maintItems.filter(i => i.category === cat)
        if (!items.length) return null
        return (
          <section key={cat}>
            <h2 className="eyebrow" style={{ margin: '0 4px 10px' }}>{cat}</h2>
            <div className="card list">
              {items.map(i => (
                <button key={i.id} className="li" onClick={() => sheet(`/edit/interval/${i.id}`)} style={{ opacity: i.enabled ? 1 : 0.5 }}>
                  <span className="grow"><span className="t" style={{ display: 'block' }}>{i.name}</span><span className="s" style={{ display: 'block' }}>{summary(i)}</span></span>
                  {i.basis === 'custom' && <Pill tone="projected">Custom</Pill>}{!i.enabled && <Pill tone="avg">Off</Pill>}
                  <Icon name="chevron" className="chev" />
                </button>
              ))}
            </div>
          </section>
        )
      })}
      <Card pad="sm"><Button block variant="ghost" icon="reset" onClick={restore}>Restore typical intervals</Button></Card>
    </div>
  )
}
