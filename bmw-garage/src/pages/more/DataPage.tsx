import { useEffect, useRef, useState } from 'react'
import { useGarage } from '../../hooks/garage'
import { ImportError, exportCsv, CSV_KINDS, downloadText, parseSnapshot, type CsvKind, type Snapshot } from '../../storage/backup'
import { formatDate } from '../../lib/dates'
import { Banner, Button, Card, PageHead, Pill, Row, Section } from '../../components/ui'
import { useOverlay } from '../../components/overlays'
import { STORE_NAMES } from '../../types/models'
import { GarageDB } from '../../storage/db'

const stamp = () => new Date().toISOString().slice(0, 10)
const LABEL: Record<string, string> = { mileage: 'mileage readings', fuel: 'fill-ups', maintItems: 'maintenance items', maintRecords: 'maintenance records', services: 'services', receipts: 'receipts', attachments: 'photos', mods: 'mods', parts: 'parts', reminders: 'reminders', shops: 'shops' }

export default function DataPage() {
  const { data, dataset, persisted, actions } = useGarage()
  const { toast, confirm } = useOverlay()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Snapshot | null>(null)
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator

  useEffect(() => { navigator.storage?.estimate?.().then(e => e.usage != null && e.quota != null && setUsage({ used: e.usage, quota: e.quota })).catch(() => {}) }, [data])

  async function exportJson(share = false) {
    setBusy(true)
    try {
      const text = await actions.exportAll()
      const name = `bmw-garage-${dataset === 'demo' ? 'DEMO-' : ''}backup-${stamp()}.json`
      if (share) {
        const f = new File([text], name, { type: 'application/json' })
        if ((navigator as Navigator).canShare?.({ files: [f] })) { await (navigator as Navigator).share({ files: [f], title: 'BMW Garage backup' }); toast('Backup shared'); return }
      }
      downloadText(name, text)
      toast('Backup downloaded')
    } catch (e) { if ((e as Error).name !== 'AbortError') toast(e instanceof Error ? e.message : 'Export failed', 'err') } finally { setBusy(false) }
  }

  async function csv(kind: CsvKind) {
    // Use a throwaway connection so the CSV reflects exactly what is stored.
    const db = await GarageDB.open(dataset)
    try { downloadText(`bmw-garage-${kind}-${stamp()}.csv`, await exportCsv(db, kind), 'text/csv') } finally { db.close() }
    toast('CSV downloaded')
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    try { setPending(parseSnapshot(await f.text())) } catch (e) { toast(e instanceof ImportError ? e.message : 'Could not read that file', 'err') }
    if (file.current) file.current.value = ''
  }

  async function doImport(mode: 'merge' | 'replace') {
    if (!pending) return
    if (mode === 'replace' && !(await confirm({ title: 'Replace everything?', message: 'All current data on this device is deleted and replaced with the backup. Export a backup of the current data first if unsure.', confirmLabel: 'Replace all data', danger: true }))) return
    setBusy(true)
    try {
      const sum = await actions.importBackup(JSON.stringify(pending), mode)
      toast(`Imported ${Object.values(sum.counts).reduce((a, b) => a + (b ?? 0), 0)} records${sum.blobs ? ` + ${sum.blobs} photos` : ''}`)
      setPending(null)
    } catch (e) { toast(e instanceof Error ? e.message : 'Import failed', 'err') } finally { setBusy(false) }
  }

  const mb = (n: number) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB'
  const last = data.settings.lastBackupAt

  return (
    <div className="stack-lg">
      <PageHead back="/more/settings" eyebrow="Settings" title="Data & backup" />

      <Card>
        <div className="spread"><div><div className="eyebrow" style={{ marginBottom: 6 }}>Storage</div><div className="h3">IndexedDB on this device</div></div>
          <Pill tone={persisted ? 'good' : 'warn'}>{persisted ? 'Protected' : persisted === false ? 'Not protected' : 'Checking'}</Pill></div>
        <p className="small muted" style={{ marginTop: 10 }}>{persisted ? 'Your browser has promised not to evict this data when space is low.' : 'The browser hasn’t guaranteed persistence. Installing to the Home Screen and keeping regular backups is the safest setup.'}</p>
        {usage && <p className="xs faint" style={{ marginTop: 6 }}>Using {mb(usage.used)} of {mb(usage.quota)} available.</p>}
        <p className="xs faint" style={{ marginTop: 6 }}>{STORE_NAMES.filter(n => n in LABEL).map(n => ({ n, c: (data as unknown as Record<string, unknown[]>)[n]?.length ?? 0 })).filter(x => x.c).map(x => `${x.c} ${LABEL[x.n]}`).join(' · ') || 'No records yet'}</p>
      </Card>

      <Section title="Back up">
        <Card>
          <p className="small muted" style={{ marginBottom: 14 }}>One JSON file with <b>everything</b> – vehicle, history, settings and receipt photos. {last ? <>Last backup: <b>{formatDate(last.slice(0, 10))}</b>.</> : 'You haven’t made a backup yet.'}</p>
          <div className="stack" style={{ gap: 10 }}>
            <Button block icon="download" disabled={busy} onClick={() => exportJson(false)}>Export backup (JSON)</Button>
            {canShare && <Button block variant="ghost" icon="upload" disabled={busy} onClick={() => exportJson(true)}>Share / save to Files…</Button>}
          </div>
        </Card>
      </Section>

      <Section title="Export spreadsheets (CSV)">
        <div className="card list">{CSV_KINDS.map(c => <Row key={c.kind} icon="download" title={c.label} onClick={() => csv(c.kind)} chevron={false} right={<span className="blue small">CSV</span>} />)}</div>
      </Section>

      <Section title="Restore">
        <Card>
          <p className="small muted" style={{ marginBottom: 14 }}>Import a BMW Garage backup (.json). Nothing changes until you choose how to apply it.</p>
          <Button block variant="ghost" icon="upload" disabled={busy} onClick={() => file.current?.click()}>Choose backup file…</Button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => onFile(e.target.files?.[0])} />
        </Card>
      </Section>

      <Section title="Maintenance">
        <div className="card list"><Row icon="image" title="Clean up unused photos" sub="Removes photos that no record uses" chevron={false} onClick={async () => { const n = await actions.pruneUnusedPhotos(); toast(n ? `Removed ${n} unused photo${n > 1 ? 's' : ''}` : 'No unused photos') }} /></div>
      </Section>

      {pending && (
        <div className="dialog-wrap" role="dialog" aria-modal="true" aria-label="Import backup">
          <div className="sheet-backdrop" onClick={() => setPending(null)} />
          <div className="dialog">
            <h3>Import this backup?</h3>
            <p>
              Made {pending.exportedAt ? formatDate(pending.exportedAt.slice(0, 10)) : 'on an unknown date'}{pending.dataset === 'demo' ? ' (demo data)' : ''}:{' '}
              {STORE_NAMES.filter(n => n in LABEL).map(n => ({ n, c: pending.data[n].length })).filter(x => x.c).map(x => `${x.c} ${LABEL[x.n]}`).join(', ') || 'no records'}.
            </p>
            <Banner tone="info" icon="info"><b>Merge</b> adds new records and keeps whichever copy is newer. <b>Replace</b> wipes this device first.</Banner>
            <div className="actions" style={{ marginTop: 16 }}>
              <Button disabled={busy} onClick={() => doImport('merge')}>Merge into current data</Button>
              <Button variant="danger-ghost" disabled={busy} onClick={() => doImport('replace')}>Replace everything…</Button>
              <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
