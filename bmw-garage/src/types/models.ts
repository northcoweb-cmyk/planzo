/**
 * Data model. Every record is a plain JSON-serialisable object with a string id,
 * so it can be stored in IndexedDB today and synced to a cloud database later
 * without any change (ids are client-generated UUIDs, `updatedAt` supports
 * last-write-wins merging).
 *
 * Relations are by id only; nothing is duplicated:
 *   ServiceRecord.shopId        -> Shop
 *   ServiceRecord.receiptIds[]  -> Receipt   -> Attachment (image blob)
 *   ServiceRecord.partIds[]     -> Part
 *   MaintenanceRecord.itemId    -> MaintenanceItem
 *   MaintenanceRecord.serviceId -> ServiceRecord
 *   Mod.partIds[]               -> Part
 *   Mod.shopId / receiptIds / imageIds
 *   Part.receiptIds / imageIds
 *   Reminder.maintenanceItemId  -> MaintenanceItem
 */

export type ID = string
/** Calendar date, local, `YYYY-MM-DD` */
export type DateStr = string

export interface Entity {
  id: ID
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
}

export interface Vehicle extends Entity {
  year: number
  make: string
  model: string
  trim: string
  generation: string
  engine: string
  drivetrain: string
  transmission: string
  color: string
  colorCode: string
  horsepower: number | null // stock
  fuelType: string
  vin: string
  plate: string
  purchaseDate: DateStr | ''
  purchaseMileage: number | null
  purchasePrice: number | null
  estimatedValue: number | null
  valueUpdatedAt: DateStr | ''
  notes: string
}

/** A known odometer reading entered by the user. ACTUAL data, never a projection. */
export interface MileageEntry extends Entity {
  date: DateStr
  odometer: number
  note: string
  demo?: boolean
}

export type FuelGrade = 'regular' | 'midgrade' | 'premium' | 'e85' | 'diesel' | 'other'

export interface FuelEntry extends Entity {
  date: DateStr
  /** Odometer at the pump. Optional but required for MPG. */
  odometer: number | null
  gallons: number
  pricePerGallon: number
  totalPrice: number
  fuelType: FuelGrade
  station: string
  /** Tank was filled completely (to the pump's click-off). Only full fills anchor MPG. */
  full: boolean
  /** "I didn't log the fill-up(s) before this one" – breaks the MPG chain so it is never guessed. */
  missedPrevious: boolean
  notes: string
  demo?: boolean
}

export type MaintenanceCategory =
  | 'Engine' | 'Fluids' | 'Filters' | 'Brakes' | 'Drivetrain' | 'Tires & Wheels' | 'Electrical' | 'Body & Wipers' | 'Other'

/** A thing that needs periodic service, with an editable interval. */
export interface MaintenanceItem extends Entity {
  key: string // stable key for catalog items ('engine-oil'), '' for custom
  name: string
  category: MaintenanceCategory
  intervalMiles: number | null
  intervalMonths: number | null
  /** 'typical' = shipped suggestion (verify with owner's manual / CBS), 'custom' = user edited, 'condition' = inspect, no fixed interval */
  basis: 'typical' | 'custom' | 'condition'
  enabled: boolean
  notes: string
  demo?: boolean
}

/** One time an item was performed. "Last performed" is always derived from these. */
export interface MaintenanceRecord extends Entity {
  itemId: ID
  date: DateStr
  mileage: number | null
  cost: number | null
  serviceId: ID | null
  notes: string
  demo?: boolean
}

export type ServiceKind = 'maintenance' | 'repair' | 'modification'
export type LineItemType = 'part' | 'labor' | 'fee' | 'other'

export interface ServiceLineItem {
  id: ID
  name: string
  type: LineItemType
  cost: number
  partId?: ID
}

export interface ServiceRecord extends Entity {
  date: DateStr
  mileage: number | null
  title: string
  kind: ServiceKind
  lineItems: ServiceLineItem[]
  /** If set, overrides the sum of line items (e.g. only a total on the invoice). */
  totalOverride: number | null
  shopId: ID | null
  partIds: ID[]
  /** Maintenance items completed during this service (creates MaintenanceRecords). */
  maintenanceItemIds: ID[]
  receiptIds: ID[]
  attachmentIds: ID[]
  notes: string
  demo?: boolean
}

export type ReceiptLinkType = 'service' | 'part' | 'mod' | 'fuel' | 'none'

export interface OcrResult {
  status: 'none' | 'pending' | 'done' | 'failed'
  text?: string
  vendor?: string
  total?: number
  date?: DateStr
}

export interface Receipt extends Entity {
  attachmentId: ID
  title: string
  vendor: string
  date: DateStr | ''
  amount: number | null
  notes: string
  /** OCR-ready: filled later by a ReceiptOcrProvider; manual fields above always win. */
  ocr: OcrResult
  demo?: boolean
}

/** Attachment metadata. The binary lives in the separate `blobs` store so metadata stays light in memory. */
export interface Attachment extends Entity {
  name: string
  mime: string
  size: number
  width: number
  height: number
}

export type ModStatus = 'installed' | 'planned' | 'removed'

export interface Mod extends Entity {
  name: string
  category: string
  brand: string
  partName: string
  price: number | null
  installDate: DateStr | ''
  installMileage: number | null
  status: ModStatus
  notes: string
  productUrl: string
  instructions: string
  shopId: ID | null
  laborCost: number | null
  partIds: ID[]
  imageIds: ID[]
  receiptIds: ID[]
  demo?: boolean
}

export interface Part extends Entity {
  name: string
  partNumber: string
  brand: string
  supplier: string
  price: number | null
  quantity: number
  purchaseDate: DateStr | ''
  installDate: DateStr | ''
  mileage: number | null
  warranty: string
  url: string
  notes: string
  imageIds: ID[]
  receiptIds: ID[]
  demo?: boolean
}

export interface Reminder extends Entity {
  title: string
  dueMileage: number | null
  dueDate: DateStr | ''
  notes: string
  maintenanceItemId: ID | null
  completedAt: string | ''
  snoozedUntil: DateStr | ''
  demo?: boolean
}

export interface Shop extends Entity {
  name: string
  address: string
  phone: string
  website: string
  hours: string
  notes: string
  favorite: boolean
  demo?: boolean
}

export interface Settings extends Entity {
  /** Which rolling window drives the mileage rate. 'auto' picks the most reliable one. */
  mileageWindow: 'auto' | 7 | 30 | 90
  /** Count odometer values from fuel + service records as mileage readings. */
  useFuelAndServiceReadings: boolean
  /** MPG outside these bounds is flagged as suspect and excluded from averages. */
  mpgMin: number
  mpgMax: number
  /** "Due soon" thresholds */
  dueSoonMiles: number
  dueSoonDays: number
  defaultFuelType: FuelGrade
  notifyOnOpen: boolean
  lastBackupAt: string
  onboardingDismissed: boolean
}

export type StoreName =
  | 'vehicle' | 'mileage' | 'fuel' | 'maintItems' | 'maintRecords' | 'services'
  | 'receipts' | 'attachments' | 'mods' | 'parts' | 'reminders' | 'shops' | 'settings'

export interface StoreMap {
  vehicle: Vehicle
  mileage: MileageEntry
  fuel: FuelEntry
  maintItems: MaintenanceItem
  maintRecords: MaintenanceRecord
  services: ServiceRecord
  receipts: Receipt
  attachments: Attachment
  mods: Mod
  parts: Part
  reminders: Reminder
  shops: Shop
  settings: Settings
}

export const STORE_NAMES: StoreName[] = [
  'vehicle', 'mileage', 'fuel', 'maintItems', 'maintRecords', 'services',
  'receipts', 'attachments', 'mods', 'parts', 'reminders', 'shops', 'settings'
]
