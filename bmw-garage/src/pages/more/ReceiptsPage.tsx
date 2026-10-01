import { useMemo, useState } from 'react'
import { useGarage } from '../../hooks/garage'
import { formatDate } from '../../lib/dates'
import { money } from '../../lib/format'
import { Button, Card, Empty, PageHead, Pill } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useSheet } from '../../components/nav'
import { AttachmentImage, Lightbox } from '../../components/Photos'

export default function ReceiptsPage() {
  const { data } = useGarage()
  const sheet = useSheet()
  const [q, setQ] = useState('')
  const [view, setView] = useState<string | null>(null)
  const linked = useMemo(() => {
    const s = new Set<string>()
    data.services.forEach(x => x.receiptIds.forEach(i => s.add(i)))
    data.mods.forEach(x => x.receiptIds.forEach(i => s.add(i)))
    data.parts.forEach(x => x.receiptIds.forEach(i => s.add(i)))
    return s
  }, [data.services, data.mods, data.parts])
  const t = q.trim().toLowerCase()
  const list = [...data.receipts].filter(r => !t || [r.title, r.vendor, r.notes, r.date].some(x => x.toLowerCase().includes(t))).sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <div className="stack-lg">
      <PageHead back="/more" eyebrow="Library" title="Receipts" right={<Button sm icon="camera" onClick={() => sheet('/add/receipt')}>Add</Button>} />
      {data.receipts.length > 0 && <div className="search"><Icon name="search" /><input className="input" placeholder="Search vendor, title, notes" value={q} onChange={e => setQ(e.target.value)} inputMode="search" /></div>}
      {list.length === 0 ? <Card><Empty icon="receipt" title={data.receipts.length ? 'No matches' : 'No receipts yet'} text="Snap a photo of a receipt and attach it to a service, part or mod." action={!data.receipts.length ? <Button icon="camera" onClick={() => sheet('/add/receipt')}>Add receipt</Button> : undefined} /></Card> : (
        <div className="receipt-grid">
          {list.map(r => (
            <div className="card receipt-card" key={r.id}>
              <div className="pic"><AttachmentImage id={r.attachmentId} onClick={() => setView(r.attachmentId)} /></div>
              <button className="meta" style={{ textAlign: 'left', width: '100%' }} onClick={() => sheet(`/edit/receipt/${r.id}`)}>
                <div className="h3 truncate" style={{ fontSize: 14 }}>{r.title || 'Receipt'}</div>
                <div className="xs muted truncate">{r.vendor || '—'}</div>
                <div className="spread xs" style={{ marginTop: 6 }}><span className="faint">{r.date ? formatDate(r.date) : ''}</span><b>{r.amount != null ? money(r.amount) : ''}</b></div>
                <div className="row" style={{ marginTop: 8, gap: 6 }}>{linked.has(r.id) ? <Pill tone="good">Linked</Pill> : <Pill tone="avg">Unlinked</Pill>}{r.demo && <Pill tone="demo">Demo</Pill>}</div>
              </button>
            </div>
          ))}
        </div>
      )}
      {view && <Lightbox id={view} onClose={() => setView(null)} />}
    </div>
  )
}
