import { Component, Suspense, lazy, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { GarageProvider, useGarage } from './hooks/garage'
import { OverlayProvider } from './components/overlays'
import { DemoBanner, Rail, ScrollArea, TabBar } from './components/nav'
import { Button } from './components/ui'
import { HomePage } from './pages/HomePage'

const CarPage = lazy(() => import('./pages/car/CarPage'))
const MileagePage = lazy(() => import('./pages/car/MileagePage'))
const ModsPage = lazy(() => import('./pages/car/ModsPage'))
const ModDetail = lazy(() => import('./pages/car/ModDetail'))
const PartsPage = lazy(() => import('./pages/car/PartsPage'))
const PartDetail = lazy(() => import('./pages/car/PartDetail'))
const ViewerPage = lazy(() => import('./pages/car/ViewerPage'))
const TelemetryPage = lazy(() => import('./pages/car/TelemetryPage'))
const FuelPage = lazy(() => import('./pages/logs/FuelPage'))
const ServicePage = lazy(() => import('./pages/logs/ServicePage'))
const ServiceDetail = lazy(() => import('./pages/logs/ServiceDetail'))
const MaintenancePage = lazy(() => import('./pages/logs/MaintenancePage'))
const MaintenanceDetail = lazy(() => import('./pages/logs/MaintenanceDetail'))
const RemindersPage = lazy(() => import('./pages/RemindersPage'))
const MorePage = lazy(() => import('./pages/more/MorePage'))
const AnalyticsPage = lazy(() => import('./pages/more/AnalyticsPage'))
const ReceiptsPage = lazy(() => import('./pages/more/ReceiptsPage'))
const ShopsPage = lazy(() => import('./pages/more/ShopsPage'))
const SettingsPage = lazy(() => import('./pages/more/SettingsPage'))
const IntervalsPage = lazy(() => import('./pages/more/IntervalsPage'))
const DataPage = lazy(() => import('./pages/more/DataPage'))
const FormRoutes = lazy(() => import('./pages/forms/FormRoutes'))

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="boot" style={{ padding: 28, textAlign: 'center' }}>
        <div className="stack" style={{ alignItems: 'center', maxWidth: 360 }}>
          <h2 className="h2">Something went wrong</h2>
          <p className="muted small">{this.state.err.message}</p>
          <p className="faint xs">Your data is stored on this device and has not been touched.</p>
          <Button onClick={() => location.reload()}>Reload</Button>
        </div>
      </div>
    )
  }
}

function Fallback() { return <div className="stack"><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 220 }} /></div> }

function MainRoutes({ location }: { location: ReturnType<typeof useLocation> }) {
  return (
    <Routes location={location}>
      <Route path="/" element={<HomePage />} />
      <Route path="/car" element={<CarPage />} />
      <Route path="/car/mileage" element={<MileagePage />} />
      <Route path="/car/mods" element={<ModsPage />} />
      <Route path="/car/mods/:id" element={<ModDetail />} />
      <Route path="/car/parts" element={<PartsPage />} />
      <Route path="/car/parts/:id" element={<PartDetail />} />
      <Route path="/car/telemetry" element={<TelemetryPage />} />
      <Route path="/logs" element={<Navigate to="/logs/fuel" replace />} />
      <Route path="/logs/fuel" element={<FuelPage />} />
      <Route path="/logs/service" element={<ServicePage />} />
      <Route path="/logs/service/:id" element={<ServiceDetail />} />
      <Route path="/logs/maintenance" element={<MaintenancePage />} />
      <Route path="/logs/maintenance/:id" element={<MaintenanceDetail />} />
      <Route path="/reminders" element={<RemindersPage />} />
      <Route path="/more" element={<MorePage />} />
      <Route path="/more/analytics" element={<AnalyticsPage />} />
      <Route path="/more/receipts" element={<ReceiptsPage />} />
      <Route path="/more/shops" element={<ShopsPage />} />
      <Route path="/more/settings" element={<SettingsPage />} />
      <Route path="/more/settings/intervals" element={<IntervalsPage />} />
      <Route path="/more/settings/data" element={<DataPage />} />
      {/* sheets opened directly (PWA shortcuts / reload) render Home underneath */}
      <Route path="/add/*" element={<HomePage />} />
      <Route path="/edit/*" element={<HomePage />} />
      <Route path="/car/3d" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function Shell() {
  const location = useLocation()
  const bg = (location.state as { bg?: ReturnType<typeof useLocation> } | null)?.bg
  const isSheet = /^\/(add|edit)\//.test(location.pathname)
  const isViewer = location.pathname === '/car/3d'
  const mainLoc = (isSheet || isViewer) && bg ? bg : location
  return (
    <div className="app">
      <Rail />
      <ScrollArea>
        <DemoBanner />
        <div className="page" key={mainLoc.pathname}>
          <Suspense fallback={<Fallback />}><MainRoutes location={mainLoc} /></Suspense>
        </div>
      </ScrollArea>
      <TabBar />
      <Suspense fallback={null}>
        {isSheet && <FormRoutes />}
        {isViewer && <ViewerPage />}
      </Suspense>
    </div>
  )
}

function Gate() {
  const { ready, error } = useGarage()
  if (error) return <div className="boot" style={{ padding: 28, textAlign: 'center' }}><div className="stack" style={{ alignItems: 'center', maxWidth: 360 }}><h2 className="h2">Can’t open local storage</h2><p className="muted small">{error}</p><p className="faint xs">Private Browsing and some in-app browsers block IndexedDB. Open BMW Garage in Safari, or add it to your Home Screen.</p></div></div>
  if (!ready) return <div className="boot" aria-label="Loading"><div className="mark" /></div>
  return <Shell />
}

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <GarageProvider>
          <OverlayProvider>
            <Gate />
          </OverlayProvider>
        </GarageProvider>
      </HashRouter>
    </ErrorBoundary>
  )
}
