/**
 * 3D model registry. The app never knows how a model is rendered – it only knows where it lives and
 * which camera views / detail shots / modes it offers. To swap in a true 3D model (glTF viewer page,
 * a scan, an interior), add an entry here pointing at a page that implements the same tiny
 * postMessage API ({t:'x3', cmd:'view'|'detail'|'reset'|'auto'|'plate'}) – no other file changes.
 *
 * Modes with `null` have no model yet; the UI says so instead of faking one.
 */
export type ViewerMode = 'exterior' | 'interior' | 'engine' | 'details'

export interface ViewerModelDef {
  id: string
  label: string
  /** Relative to the app base. `embed=1` hides the viewer's own chrome. */
  src: string
  modes: Record<ViewerMode, { views?: string[]; details?: string[]; note?: string } | null>
}

export const VIEWER_MODELS: Record<string, ViewerModelDef> = {
  x3: {
    id: 'x3',
    label: '2017 BMW X3 xDrive35i',
    src: 'viewer/bmw-x3-viewer.html?embed=1&auto=0',
    modes: {
      exterior: { views: ['3/4', 'Front', 'Left', 'Rear', 'Right', 'Top'] },
      details: { details: ['Grille', 'Headlight', 'Taillight', 'Exhaust', 'Wheel', 'Badge'] },
      interior: null,
      engine: null
    }
  }
}

export const ACTIVE_MODEL = 'x3'
export const MODE_LABEL: Record<ViewerMode, string> = { exterior: 'Exterior', interior: 'Interior', engine: 'Engine', details: 'Details' }
export const MODE_MISSING: Record<ViewerMode, string> = {
  exterior: '', details: '',
  interior: 'There is no interior model yet – the photos supplied only show the exterior, and the app won’t invent one.',
  engine: 'There is no engine-bay model yet – the photos supplied only show the exterior, and the app won’t invent one.'
}
