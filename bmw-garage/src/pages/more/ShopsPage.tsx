import { useGarage } from '../../hooks/garage'
import { serviceTotal } from '../../calc/costs'
import { money0 } from '../../lib/format'
import { Button, Card, Empty, PageHead, Pill } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useSheet } from '../../components/nav'

export default function ShopsPage() {
  const { data, actions } = useGarage()
  const sheet = useSheet()
  const shops = [...data.shops].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name))
  return (
    <div className="stack-lg">
      <PageHead back="/more" eyebrow="Library" title="Shops" right={<Button sm icon="plus" onClick={() => sheet('/add/shop')}>Add</Button>} />
      {shops.length === 0 ? <Card><Empty icon="shop" title="No shops saved" text="Save your dealer or local shop, then pick it on service records." action={<Button icon="plus" onClick={() => sheet('/add/shop')}>Add a shop</Button>} /></Card> : (
        <div className="stack">
          {shops.map(s => {
            const svc = data.services.filter(x => x.shopId === s.id)
            const spent = svc.reduce((t, x) => t + serviceTotal(x), 0)
            const maps = s.address ? `https://maps.apple.com/?q=${encodeURIComponent(s.name + ' ' + s.address)}` : ''
            return (
              <Card key={s.id}>
                <div className="spread" style={{ alignItems: 'flex-start' }}>
                  <div className="grow"><div className="h2">{s.name}</div>{s.address && <div className="small muted" style={{ marginTop: 3 }}>{s.address}</div>}</div>
                  <button className="iconbtn" aria-label={s.favorite ? 'Unfavorite' : 'Favorite'} aria-pressed={s.favorite} style={s.favorite ? { color: 'var(--warn)' } : undefined} onClick={() => actions.save('shops', { ...s, favorite: !s.favorite })}><Icon name="star" fill={s.favorite ? 'currentColor' : 'none'} /></button>
                </div>
                {(s.hours || s.notes) && <div className="small muted" style={{ marginTop: 8 }}>{s.hours}{s.hours && s.notes ? ' · ' : ''}{s.notes}</div>}
                <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
                  {s.phone && <a className="chip" href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" width={15} height={15} />Call</a>}
                  {maps && <a className="chip" href={maps} target="_blank" rel="noopener noreferrer"><Icon name="pin" width={15} height={15} />Map</a>}
                  {s.website && <a className="chip" href={s.website} target="_blank" rel="noopener noreferrer"><Icon name="globe" width={15} height={15} />Website</a>}
                  <button className="chip" onClick={() => sheet(`/edit/shop/${s.id}`)}><Icon name="edit" width={15} height={15} />Edit</button>
                </div>
                <div className="row" style={{ marginTop: 12, gap: 8 }}>{s.favorite && <Pill tone="warn">Favorite</Pill>}<Pill tone="avg">{svc.length} service{svc.length === 1 ? '' : 's'}{spent > 0 ? ` · ${money0(spent)}` : ''}</Pill>{s.demo && <Pill tone="demo">Demo</Pill>}</div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
