/**
 * Live vehicle data seam. NOTHING is simulated: the only provider that ships is `Offline`, which
 * reports "not connected" and returns null for every channel. When an OBD-II adapter (BLE ELM327 /
 * vLinker / OBDLink via Web Bluetooth, or a bridge server) is added later it only has to implement
 * `VehicleTelemetryProvider` and be registered with `setTelemetryProvider()`; the UI already renders
 * whatever channels the provider returns and shows "—" for the rest.
 */
export type TelemetryStatus = 'not-connected' | 'connecting' | 'connected' | 'error'

export interface TelemetryReading { value: number; unit: string; timestamp: number }

export interface VehicleTelemetryProvider {
  readonly id: string
  readonly label: string
  status(): TelemetryStatus
  connect(): Promise<void>
  disconnect(): Promise<void>
  getRPM(): Promise<TelemetryReading | null>
  getVehicleSpeed(): Promise<TelemetryReading | null>
  getThrottle(): Promise<TelemetryReading | null>
  getCoolantTemperature(): Promise<TelemetryReading | null>
  getOilTemperature(): Promise<TelemetryReading | null>
  getIAT(): Promise<TelemetryReading | null>
  getBoost(): Promise<TelemetryReading | null>
  getBatteryVoltage(): Promise<TelemetryReading | null>
}

export const TELEMETRY_CHANNELS = [
  { key: 'rpm', label: 'Engine speed', unit: 'rpm', read: (p: VehicleTelemetryProvider) => p.getRPM() },
  { key: 'speed', label: 'Vehicle speed', unit: 'mph', read: (p: VehicleTelemetryProvider) => p.getVehicleSpeed() },
  { key: 'throttle', label: 'Throttle', unit: '%', read: (p: VehicleTelemetryProvider) => p.getThrottle() },
  { key: 'coolant', label: 'Coolant temp', unit: '°F', read: (p: VehicleTelemetryProvider) => p.getCoolantTemperature() },
  { key: 'oil', label: 'Oil temp', unit: '°F', read: (p: VehicleTelemetryProvider) => p.getOilTemperature() },
  { key: 'iat', label: 'Intake air temp', unit: '°F', read: (p: VehicleTelemetryProvider) => p.getIAT() },
  { key: 'boost', label: 'Boost', unit: 'psi', read: (p: VehicleTelemetryProvider) => p.getBoost() },
  { key: 'battery', label: 'Battery', unit: 'V', read: (p: VehicleTelemetryProvider) => p.getBatteryVoltage() }
] as const

const none = async () => null

export const OfflineTelemetryProvider: VehicleTelemetryProvider = {
  id: 'offline',
  label: 'No adapter',
  status: () => 'not-connected',
  connect: async () => { throw new Error('No OBD adapter support is installed yet.') },
  disconnect: async () => {},
  getRPM: none, getVehicleSpeed: none, getThrottle: none, getCoolantTemperature: none,
  getOilTemperature: none, getIAT: none, getBoost: none, getBatteryVoltage: none
}

let current: VehicleTelemetryProvider = OfflineTelemetryProvider
export const getTelemetryProvider = () => current
export const setTelemetryProvider = (p: VehicleTelemetryProvider) => { current = p }
