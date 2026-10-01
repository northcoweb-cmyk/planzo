import { useRef, useState } from 'react'
import { useAttachmentUrl, useGarage } from '../hooks/garage'
import { Icon } from './Icon'
import { Button } from './ui'
import { useOverlay, useEscape } from './overlays'

export function AttachmentImage({ id, alt = '', onClick, className }: { id: string | null | undefined; alt?: string; onClick?: () => void; className?: string }) {
  const url = useAttachmentUrl(id)
  if (!url) return <div className={`skeleton ${className ?? ''}`} style={{ width: '100%', height: '100%' }} />
  return <img src={url} alt={alt} className={className} onClick={onClick} loading="lazy" decoding="async" draggable={false} style={onClick ? { cursor: 'zoom-in' } : undefined} />
}

export function Lightbox({ id, onClose }: { id: string; onClose: () => void }) {
  const url = useAttachmentUrl(id)
  useEscape(onClose)
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Image preview">
      <div className="bar">
        <span />
        <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      </div>
      <div className="pic" onClick={e => { if (e.target === e.currentTarget) onClose() }}>{url && <img src={url} alt="" />}</div>
    </div>
  )
}

/**
 * Attach photos. "Take photo" opens the iPhone camera, "Choose" opens the photo library / files.
 * Photos are resized and stored in IndexedDB immediately; the form just keeps the attachment ids.
 */
export function PhotoPicker({ value, onChange, single, label = 'Photos' }: { value: string[]; onChange: (ids: string[]) => void; single?: boolean; label?: string }) {
  const { actions } = useGarage()
  const { toast } = useOverlay()
  const cam = useRef<HTMLInputElement>(null)
  const lib = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<string | null>(null)

  async function handle(files: FileList | null) {
    if (!files || !files.length) return
    setBusy(true)
    try {
      const ids: string[] = []
      for (const f of Array.from(files).slice(0, single ? 1 : 8)) ids.push((await actions.addPhoto(f)).id)
      onChange(single ? ids : [...value, ...ids])
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add photo', 'err')
    } finally {
      setBusy(false)
      if (cam.current) cam.current.value = ''
      if (lib.current) lib.current.value = ''
    }
  }

  return (
    <div className="field">
      <span className="lab">{label}</span>
      {value.length > 0 && (
        <div className="thumbs">
          {value.map(id => (
            <div className="thumb" key={id}>
              <AttachmentImage id={id} onClick={() => setView(id)} />
              <button type="button" className="x" aria-label="Remove photo" onClick={() => onChange(value.filter(v => v !== id))}><Icon name="x" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="photo-actions">
        <Button sm variant="ghost" icon="camera" disabled={busy} onClick={() => cam.current?.click()}>Take photo</Button>
        <Button sm variant="ghost" icon="image" disabled={busy} onClick={() => lib.current?.click()}>{busy ? 'Adding…' : 'Choose'}</Button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => handle(e.target.files)} />
      <input ref={lib} type="file" accept="image/*" multiple={!single} hidden onChange={e => handle(e.target.files)} />
      {view && <Lightbox id={view} onClose={() => setView(null)} />}
    </div>
  )
}
