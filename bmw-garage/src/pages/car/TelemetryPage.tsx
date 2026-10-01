import { useNavigate } from 'react-router-dom'
import { Banner, Card, Pill } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { TELEMETRY_CHANNELS, getTelemetryProvider } from '../../services/telemetry'

export default function TelemetryPage() {
  const nav = useNavigate()
  const p = getTelemetryProvider()
  const status = p.status()
  return (
    <div className="stack-lg">
      <button className="back" onClick={() => nav('/car')}><Icon name="chevronLeft" />Car</button>
      <header className="page-head"><div className="grow"><div className="eyebrow">Vehicle data</div><h1 className="h1">Telemetry</h1></div><Pill tone={status === 'connected' ? 'good' : ''}>{status === 'connected' ? 'Connected' : 'Not connected'}</Pill></header>
      <Banner tone="info" icon="bolt"><b>No live data yet.</b> This screen is ready for an OBD-II adapter, but nothing is connected, so no values are shown – and none are simulated. Mileage and fuel economy elsewhere in the app come only from the readings and fill-ups you enter.</Banner>
      <div className="gauge-grid">
        {TELEMETRY_CHANNELS.map(c => (
          <div className="gauge" key={c.key}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{c.label}</div>
            <div className="v">—<span className="unit">{c.unit}</span></div>
          </div>
        ))}
      </div>
      <Card pad="sm">
        <div className="h3" style={{ marginBottom: 6 }}>Adapter</div>
        <p className="small muted">Provider: <b>{p.label}</b>. A future provider (Bluetooth ELM327 / OBDLink, or a bridge) only needs to implement <code>VehicleTelemetryProvider</code> (RPM, speed, throttle, coolant, oil, IAT, boost, battery) and register itself – the dashboard above fills in automatically.</p>
      </Card>
    </div>
  )
}
