# BMW Garage

A personal ownership dashboard for a **2017 BMW X3 xDrive35i (F25 LCI, N55)**, built as an installable iPhone PWA.
Mileage, fuel/MPG, maintenance, service history, receipts, mods, parts, reminders, analytics – plus the interactive 3D X3.

Everything is stored **on the device** in IndexedDB. There is no server, no account and no network dependency
(the only online feature is the optional "Decode VIN" button).

## Run

```bash
cd bmw-garage
npm install
npm run dev        # http://localhost:5173
npm test           # 44 unit tests (calculations, storage, backup/import)
npm run build      # typecheck + production build (+ service worker)
npm run e2e        # browser end-to-end run against the built app (needs Chromium)
```

## Put it on your iPhone

Service workers and "Add to Home Screen" need **HTTPS**. Host `dist/` on any static HTTPS host
(GitHub Pages, Netlify, Cloudflare Pages, your own server – the build uses relative paths, so a sub-path works), open the URL in
**Safari → Share → Add to Home Screen**. After the first load it works fully offline, 3D viewer included.
Then: **More → Data & backup → Export backup** now and then (iOS can evict web storage in rare cases; the app asks the browser for
persistent storage, but a JSON backup is the real safety net).

## What is real vs. not

| Area | Status |
|---|---|
| Mileage: readings → daily/weekly/monthly averages → projection | Real. **ACTUAL** (entered) vs **PROJECTED** (calculated) are always labelled; with <3 days of history it says "Collecting mileage history" instead of guessing |
| Fuel / MPG | Real tank-to-tank method (miles between full fills ÷ gallons since); partial fills, missed fills, bad/missing odometer and implausible MPG are handled and explained – never `miles ÷ this fill` |
| Maintenance | Real. Last-performed comes from records; mileage and/or time intervals (editable); says *unknown* rather than *due* without data. Starting intervals are **typical** values, not BMW's CBS |
| Service, receipts (camera/library), mods, parts, shops, reminders | Real CRUD with relations, photos stored in IndexedDB |
| Backup | JSON (everything + photos) export / import (merge or replace), CSV per collection |
| 3D viewer | Your existing photo-projected X3 viewer, unchanged, embedded; **Interior / Engine have no model** and say so |
| Live telemetry | **Not connected.** `VehicleTelemetryProvider` seam only; no values are simulated |
| Demo data | Separate database, every record flagged, permanent banner. Never mixed with real data |

## Structure

```
src/
  types/models.ts        data model (ids/relations; sync-ready: client uuids + updatedAt)
  calc/                  PURE business logic + tests: mileage, fuel, maintenance, reminders, costs
  storage/               IndexedDB wrapper (db.ts), backup/import/CSV, demo seed, dataset switch
  data/                  vehicle config, maintenance catalog, settings defaults, 3D model registry
  services/              telemetry provider seam, VIN decoder seam
  hooks/garage.tsx       state provider (loads stores, write-through actions, derived stats)
  components/            design-system primitives, charts (SVG), sheets, overlays, photo picker
  pages/                 home, car/, logs/, more/, forms/ (route-based sheets)
  styles/app.css         design tokens + components
public/viewer/           the standalone 3D viewer (built from ../x3-viewer)
scripts/                 make-assets.py (icons/splash), make-hero.mjs, sync-viewer.sh, e2e.mjs
```

### Swapping in a real 3D model
`src/data/viewerModels.ts` is a registry: a model is an embeddable page that understands
`postMessage({t:'x3', cmd:'view'|'detail'|'reset'|'auto'|'plate'})`. Point `src` at a glTF viewer page and fill `modes.interior/engine`.

### Adding live OBD data later
Implement `VehicleTelemetryProvider` (`src/services/telemetry.ts`) – e.g. Web Bluetooth ELM327, or a bridge – and call
`setTelemetryProvider()`. Add a cloud backend by mirroring `GarageDB`'s small interface; records already carry stable ids and `updatedAt`.

### Receipts / OCR
`src/lib/ocr.ts` defines `ReceiptOcrProvider` (none installed). Manual fields are always the source of truth.

## Notes / limits
- iPhone web apps cannot schedule background notifications without a push server, so reminders are in-app badges (+ optional on-launch notification).
- The 3D car is photo-projected from four reference photos; texture sharpness is limited by those photos' resolution.
