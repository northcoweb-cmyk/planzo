import { useCallback, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from './ui'
import { useEscape } from './overlays'

/** Close a route-based sheet: go back if it was opened from inside the app, else land on Home. */
export function useCloseSheet() {
  const nav = useNavigate()
  const loc = useLocation()
  return useCallback(() => {
    if ((loc.state as { bg?: unknown } | null)?.bg) nav(-1)
    else nav('/', { replace: true })
  }, [nav, loc.state])
}

export function FormSheet({ title, onSave, saveLabel = 'Save', saving, canSave = true, children, danger }: {
  title: string; onSave: () => void | Promise<void>; saveLabel?: string; saving?: boolean; canSave?: boolean; children: ReactNode
  danger?: { label: string; onClick: () => void }
}) {
  const close = useCloseSheet()
  useEscape(close)
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop" onClick={close} />
      <form className="sheet" onSubmit={e => { e.preventDefault(); if (canSave && !saving) void onSave() }} noValidate>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <button type="button" className="textbtn l" onClick={close}>Cancel</button>
          <div className="ttl">{title}</div>
          <span className="r" />
        </div>
        <div className="sheet-body">
          <div className="form">
            {children}
            {danger && <Button variant="danger-ghost" onClick={danger.onClick} className="block">{danger.label}</Button>}
          </div>
        </div>
        <div className="sheet-foot">
          <Button type="submit" disabled={!canSave || saving}>{saving ? 'Saving…' : saveLabel}</Button>
        </div>
      </form>
    </div>
  )
}
