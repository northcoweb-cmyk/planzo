import { useCallback, useEffect, useRef, useState } from 'react'
import { useCloseSheet } from '../../components/Sheet'
import { Icon } from '../../components/Icon'
import { Chips, Segmented, Button } from '../../components/ui'
import { useEscape } from '../../components/overlays'
import { Toggle } from '../../components/forms'
import { ACTIVE_MODEL, MODE_LABEL, MODE_MISSING, VIEWER_MODELS, type ViewerMode } from '../../data/viewerModels'

export default function ViewerPage() {
  const close = useCloseSheet()
  useEscape(close)
  const model = VIEWER_MODELS[ACTIVE_MODEL]
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<ViewerMode>('exterior')
  const [view, setView] = useState('3/4')
  const [auto, setAuto] = useState(false)
  const [plateHidden, setPlateHidden] = useState(false)
  const [immersive, setImmersive] = useState(false)

  const send = useCallback((cmd: string, arg?: unknown) => {
    frame.current?.contentWindow?.postMessage({ t: 'x3', cmd, arg }, '*')
  }, [])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.data?.t === 'x3' && e.data.evt === 'ready') setReady(true) }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setImmersive(false) }
    document.addEventListener('fullscreenchange', onFs)
    return () => { document.removeEventListener('fullscreenchange', onFs); if (document.fullscreenElement) void document.exitFullscreen?.() }
  }, [])

  async function toggleImmersive() {
    const next = !immersive
    setImmersive(next)
    // iPhone Safari only allows the Fullscreen API on <video>; the CSS immersive layout covers it. Desktop/iPad get true fullscreen.
    try { if (next) await document.documentElement.requestFullscreen?.(); else if (document.fullscreenElement) await document.exitFullscreen() } catch { /* not supported */ }
  }

  const def = model.modes[mode]
  const pickMode = (m: ViewerMode) => {
    setMode(m)
    if (model.modes[m]?.views) { const first = model.modes[m]!.views![0]; setView(first); send('view', first) }
    if (model.modes[m]?.details) { setView(model.modes[m]!.details![0]); send('detail', model.modes[m]!.details![0]) }
  }

  return (
    <div className="viewer-page" role="dialog" aria-modal="true" aria-label="3D viewer">
      {!immersive && (
        <div className="viewer-top">
          <button className="iconbtn" onClick={close} aria-label="Close 3D viewer"><Icon name="x" /></button>
          <div className="center"><div className="eyebrow">3D viewer</div><div className="h3">{model.label}</div></div>
          <div className="row" style={{ gap: 8 }}>
            <button className="iconbtn" onClick={() => { send('reset'); setView('3/4'); setMode('exterior') }} aria-label="Reset camera"><Icon name="reset" /></button>
            <button className="iconbtn" onClick={toggleImmersive} aria-label="Fullscreen"><Icon name="expand" /></button>
          </div>
        </div>
      )}
      <div className="viewer-stage">
        <iframe ref={frame} title="Interactive 3D BMW X3" src={`${import.meta.env.BASE_URL}${model.src}`} allow="fullscreen" onLoad={() => setTimeout(() => setReady(true), 4000)} />
        {!ready && <div className="viewer-na"><div className="mark boot-mark" style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,.14)', borderTopColor: 'var(--blue-2)', animation: 'spin .9s linear infinite' }} /></div>}
        {def == null && (
          <div className="viewer-na" style={{ background: 'rgba(6,7,10,.72)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
            <div className="stack" style={{ alignItems: 'center', maxWidth: 320 }}>
              <div className="empty"><div className="art"><Icon name={mode === 'engine' ? 'engine' : 'seat'} /></div><h3>{MODE_LABEL[mode]} model not available</h3><p>{MODE_MISSING[mode]}</p></div>
              <Button variant="ghost" onClick={() => pickMode('exterior')}>Back to exterior</Button>
            </div>
          </div>
        )}
        {immersive && (
          <div style={{ position: 'absolute', top: 'calc(var(--sat) + 10px)', right: 12, zIndex: 4 }}>
            <button className="iconbtn" onClick={toggleImmersive} aria-label="Exit fullscreen"><Icon name="x" /></button>
          </div>
        )}
        <div className="viewer-hint" style={{ opacity: ready && !immersive ? 1 : 0 }}>Drag to orbit · Pinch to zoom · Double-tap to close in</div>
      </div>
      {!immersive && (
        <div className="viewer-ctl">
          <Segmented value={mode} onChange={pickMode} options={(Object.keys(MODE_LABEL) as ViewerMode[]).map(m => ({ value: m, label: MODE_LABEL[m] }))} />
          {def?.views && (
            <>
              <Chips value={view} onChange={v => { setView(v); send('view', v) }} options={def.views.map(v => ({ value: v, label: v }))} />
              <div className="row" style={{ gap: 18 }}>
                <div className="grow"><Toggle label="Auto-rotate" checked={auto} onChange={v => { setAuto(v); send('auto', v) }} /></div>
                <div className="grow"><Toggle label="Hide plate" checked={plateHidden} onChange={v => { setPlateHidden(v); send('plate', v) }} /></div>
              </div>
            </>
          )}
          {def?.details && <Chips value={view} onChange={v => { setView(v); send('detail', v) }} options={def.details.map(v => ({ value: v, label: v }))} />}
        </div>
      )}
    </div>
  )
}
