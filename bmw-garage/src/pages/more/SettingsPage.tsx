import { useGarage } from '../../hooks/garage'
import type { FuelGrade, Settings } from '../../types/models'
import { vehicleTitle } from '../../data/vehicleDefaults'
import { Banner, Card, PageHead, Row, Section, Button } from '../../components/ui'
import { NumberField, SelectField, Toggle } from '../../components/forms'
import { useOverlay } from '../../components/overlays'
import { useSheet } from '../../components/nav'

export default function SettingsPage() {
  const { data, dataset, actions } = useGarage()
  const s = data.settings
  const sheet = useSheet(); const { confirm, toast } = useOverlay()
  const put = (patch: Partial<Settings>) => void actions.saveSettings(patch)

  async function toggleNotify(on: boolean) {
    if (on) {
      if (typeof Notification === 'undefined') { toast('Notifications aren’t available here. On iPhone, add the app to your Home Screen first.', 'err'); return }
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (perm !== 'granted') { toast('Notification permission was not granted', 'err'); return }
    }
    put({ notifyOnOpen: on })
  }

  async function reset() {
    const ok = await confirm({
      title: dataset === 'demo' ? 'Reset demo data?' : 'Erase ALL garage data?',
      message: dataset === 'demo' ? 'Demo data is regenerated. Your real garage is not affected.'
        : 'This permanently deletes every mileage reading, fuel fill-up, service, mod, part, reminder, shop and receipt photo on this device. Export a backup first – this cannot be undone.',
      confirmLabel: dataset === 'demo' ? 'Reset demo' : 'Erase everything', danger: true, requireText: dataset === 'demo' ? undefined : 'RESET'
    })
    if (ok) { await actions.resetAll(); toast(dataset === 'demo' ? 'Demo data reset' : 'Garage erased') }
  }

  return (
    <div className="stack-lg">
      <PageHead back="/more" eyebrow="BMW Garage" title="Settings" />

      <Section title="Vehicle"><div className="card list"><Row icon="car" title={vehicleTitle(data.vehicle)} sub="VIN, plate, purchase details, color" onClick={() => sheet('/edit/vehicle')} /></div></Section>

      <Section title="Mileage">
        <Card><div className="form">
          <SelectField label="Rate window" value={String(s.mileageWindow) as 'auto'} onChange={v => put({ mileageWindow: (v === 'auto' ? 'auto' : Number(v)) as Settings['mileageWindow'] })}
            options={[{ value: 'auto', label: 'Automatic (recommended)' }, { value: '7' as 'auto', label: '7 days' }, { value: '30' as 'auto', label: '30 days' }, { value: '90' as 'auto', label: '90 days' }]}
            hint="Automatic uses the last 30 days when available, else 7 days, else all history. If a chosen window is longer than your history, automatic is used." />
          <Toggle label="Use fuel & service odometers" sub="Fuel fill-ups and services that include an odometer value also count as mileage readings." checked={s.useFuelAndServiceReadings} onChange={v => put({ useFuelAndServiceReadings: v })} />
        </div></Card>
      </Section>

      <Section title="Fuel">
        <Card><div className="form">
          <SelectField label="Default fuel type" value={s.defaultFuelType} onChange={(v: FuelGrade) => put({ defaultFuelType: v })}
            options={[{ value: 'premium', label: 'Premium' }, { value: 'midgrade', label: 'Midgrade' }, { value: 'regular', label: 'Regular' }, { value: 'e85', label: 'E85' }, { value: 'other', label: 'Other' }]} />
          <div className="grid2">
            <NumberField label="Min plausible MPG" value={s.mpgMin} onChange={v => v != null && v > 0 && put({ mpgMin: v })} decimals={0} />
            <NumberField label="Max plausible MPG" value={s.mpgMax} onChange={v => v != null && v > 0 && put({ mpgMax: v })} decimals={0} />
          </div>
          <p className="hint">MPG outside this range is flagged as suspect (usually a typo or a missed fill-up) and left out of averages.</p>
        </div></Card>
      </Section>

      <Section title="Maintenance">
        <Card><div className="form">
          <div className="grid2">
            <NumberField label="Due soon within" value={s.dueSoonMiles} onChange={v => v != null && v >= 0 && put({ dueSoonMiles: v })} suffix="mi" decimals={0} />
            <NumberField label="…or within" value={s.dueSoonDays} onChange={v => v != null && v >= 0 && put({ dueSoonDays: v })} suffix="days" decimals={0} />
          </div>
        </div></Card>
        <div className="card list" style={{ marginTop: 12 }}><Row icon="sliders" title="Maintenance intervals" sub="Edit mileage / time interval for every item" to="/more/settings/intervals" /></div>
      </Section>

      <Section title="Notifications">
        <Card>
          <Toggle label="Remind me when I open the app" sub="Shows a notification on launch if something is overdue." checked={s.notifyOnOpen} onChange={toggleNotify} />
          <Banner tone="info" icon="info">iPhone web apps can’t schedule background notifications without a push server, so reminders appear as badges in the app (and on launch if enabled). Add BMW Garage to your Home Screen first.</Banner>
        </Card>
      </Section>

      <Section title="Data management">
        <div className="card list"><Row icon="database" title="Data & backup" sub="Export, import, storage status" to="/more/settings/data" /></div>
      </Section>

      <Section title="Danger zone">
        <Card className="accent" pad>
          <h3 className="h3" style={{ marginBottom: 6, color: 'var(--bad)' }}>{dataset === 'demo' ? 'Reset demo data' : 'Erase all data'}</h3>
          <p className="small muted" style={{ marginBottom: 14 }}>{dataset === 'demo' ? 'Regenerates the example records.' : 'Deletes everything stored on this device. You’ll be asked to type RESET to confirm.'}</p>
          <Button variant="danger-ghost" block icon="trash" onClick={reset}>{dataset === 'demo' ? 'Reset demo data' : 'Erase all data…'}</Button>
        </Card>
      </Section>
    </div>
  )
}
