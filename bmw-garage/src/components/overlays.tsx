import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './ui'
import { Icon } from './Icon'

interface ConfirmOpts {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** The user must type this exact text before the confirm button is enabled (for destructive actions). */
  requireText?: string
}
interface Toast { id: number; text: string; tone: 'ok' | 'err' }

interface OverlayApi {
  toast: (text: string, tone?: 'ok' | 'err') => void
  confirm: (o: ConfirmOpts) => Promise<boolean>
}
const Ctx = createContext<OverlayApi | null>(null)

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = useState('')
  const seq = useRef(0)

  const toast = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = ++seq.current
    setToasts(t => [...t, { id, text, tone }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'err' ? 5200 : 2600)
  }, [])
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => { setTyped(''); setDlg({ ...o, resolve }) }), [])
  const api = useMemo(() => ({ toast, confirm }), [toast, confirm])
  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null) }

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={`toast ${t.tone === 'err' ? 'err' : ''}`}><Icon name={t.tone === 'err' ? 'warn' : 'check'} width={18} height={18} />{t.text}</div>)}
      </div>
      {dlg && (
        <div className="dialog-wrap" role="alertdialog" aria-modal="true" aria-label={dlg.title}>
          <div className="sheet-backdrop" onClick={() => close(false)} />
          <div className="dialog">
            <h3>{dlg.title}</h3>
            {dlg.message && <p>{dlg.message}</p>}
            {dlg.requireText && (
              <div className="field" style={{ marginBottom: 16 }}>
                <label>Type <b style={{ color: 'var(--text)' }}>{dlg.requireText}</b> to confirm</label>
                <input className="input" value={typed} onChange={e => setTyped(e.target.value)} autoCapitalize="characters" autoCorrect="off" autoComplete="off" />
              </div>
            )}
            <div className="actions">
              <Button variant={dlg.danger ? 'danger' : undefined} disabled={!!dlg.requireText && typed.trim() !== dlg.requireText} onClick={() => close(true)}>{dlg.confirmLabel ?? 'Confirm'}</Button>
              <Button variant="ghost" onClick={() => close(false)}>{dlg.cancelLabel ?? 'Cancel'}</Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useOverlay(): OverlayApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useOverlay outside provider')
  return c
}

/** Esc-to-close helper for overlays. */
export function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') fn() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fn])
}
