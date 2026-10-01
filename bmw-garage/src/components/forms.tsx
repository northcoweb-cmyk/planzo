import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { parseNum } from '../lib/format'

export function Field({ label, hint, error, children, htmlFor }: { label?: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <div className="hint err" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { label?: string; hint?: ReactNode; error?: string | null; value: string; onChange: (v: string) => void }
export function TextField({ label, hint, error, value, onChange, ...rest }: TextProps) {
  const id = useId()
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} className="input" value={value} onChange={e => onChange(e.target.value)} aria-invalid={!!error} autoComplete="off" {...rest} />
    </Field>
  )
}

interface NumProps {
  label?: string; hint?: ReactNode; error?: string | null; value: number | null; onChange: (v: number | null) => void
  prefix?: string; suffix?: string; placeholder?: string; decimals?: number; allowNegative?: boolean
}
/** Number input that keeps the raw text while typing (so "12." and "1,2" aren't mangled), commits a number. */
export function NumberField({ label, hint, error, value, onChange, prefix, suffix, placeholder, decimals = 2 }: NumProps) {
  const id = useId()
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    // external change (e.g. auto-calculated total) -> resync unless it equals what the user typed
    if (parseNum(text) !== value) setText(value == null ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className={`input-affix ${suffix ? 'suf' : ''}`}>
        {prefix && <span className="pre">{prefix}</span>}
        <input
          id={id} className="input" inputMode={decimals > 0 ? 'decimal' : 'numeric'} placeholder={placeholder} value={text} aria-invalid={!!error}
          onChange={e => {
            const t = e.target.value.replace(/[^0-9.,-]/g, '')
            setText(t)
            onChange(parseNum(t))
          }}
          onBlur={() => { const v = parseNum(text); if (v != null) setText(String(decimals >= 0 ? Math.round(v * 10 ** decimals) / 10 ** decimals : v)) }}
        />
        {suffix && <span className="suf">{suffix}</span>}
      </div>
    </Field>
  )
}

export function DateField({ label, value, onChange, error, hint }: { label?: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: ReactNode }) {
  const id = useId()
  return (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      <input id={id} className="input" type="date" value={value} onChange={e => onChange(e.target.value)} aria-invalid={!!error} />
    </Field>
  )
}

export function SelectField<T extends string>({ label, value, onChange, options, hint }: { label?: string; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; hint?: ReactNode }) {
  const id = useId()
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} className="select" value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

export function TextArea({ label, value, onChange, placeholder, rows }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id}>
      <textarea id={id} className="textarea" rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </Field>
  )
}

export function Toggle({ label, sub, checked, onChange }: { label: string; sub?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div className="grow"><div className="t">{label}</div>{sub && <div className="s">{sub}</div>}</div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} />
    </div>
  )
}

/** Multi-select as tappable chips (e.g. maintenance items performed). */
export function ChipMulti({ label, options, value, onChange, hint }: { label?: string; options: Array<{ value: string; label: string }>; value: string[]; onChange: (v: string[]) => void; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
        {options.map(o => {
          const on = value.includes(o.value)
          return (
            <button type="button" key={o.value} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== o.value) : [...value, o.value])}>
              {o.label}
            </button>
          )
        })}
      </div>
    </Field>
  )
}
