import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import FuelForm from './FuelForm'
import MileageForm from './MileageForm'
import ServiceForm from './ServiceForm'
import ModForm from './ModForm'
import PartForm from './PartForm'
import ReceiptForm from './ReceiptForm'
import ReminderForm from './ReminderForm'
import ShopForm from './ShopForm'
import IntervalForm from './IntervalForm'
import VehicleForm from './VehicleForm'

/** Sheets render over the page (see App.tsx). `key` forces a fresh form state per record. */
export default function FormRoutes() {
  const loc = useLocation()
  return (
    <Routes location={loc}>
      <Route path="/add/fuel" element={<FuelForm key={loc.key} />} />
      <Route path="/edit/fuel/:id" element={<FuelForm key={loc.key} />} />
      <Route path="/add/mileage" element={<MileageForm key={loc.key} />} />
      <Route path="/edit/mileage/:id" element={<MileageForm key={loc.key} />} />
      <Route path="/add/service" element={<ServiceForm key={loc.key} />} />
      <Route path="/edit/service/:id" element={<ServiceForm key={loc.key} />} />
      <Route path="/add/mod" element={<ModForm key={loc.key} />} />
      <Route path="/edit/mod/:id" element={<ModForm key={loc.key} />} />
      <Route path="/add/part" element={<PartForm key={loc.key} />} />
      <Route path="/edit/part/:id" element={<PartForm key={loc.key} />} />
      <Route path="/add/receipt" element={<ReceiptForm key={loc.key} />} />
      <Route path="/edit/receipt/:id" element={<ReceiptForm key={loc.key} />} />
      <Route path="/add/reminder" element={<ReminderForm key={loc.key} />} />
      <Route path="/edit/reminder/:id" element={<ReminderForm key={loc.key} />} />
      <Route path="/add/shop" element={<ShopForm key={loc.key} />} />
      <Route path="/edit/shop/:id" element={<ShopForm key={loc.key} />} />
      <Route path="/add/interval" element={<IntervalForm key={loc.key} />} />
      <Route path="/edit/interval/:id" element={<IntervalForm key={loc.key} />} />
      <Route path="/edit/vehicle" element={<VehicleForm key={loc.key} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
