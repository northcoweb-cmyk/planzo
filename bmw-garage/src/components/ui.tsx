import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

export function PageHead({ eyebrow, title, right, back }: { eyebrow?: string; title: ReactNode; right?: ReactNode; back?: string | true }) {
  const nav = useNavigate()
  return (
    <>
      {back && (
        <button className="back" onClick={() => (back === true ? nav(-1) : nav(back))} aria-label="Back">
          <Icon name="chevronLeft" /> Back
        </button>
      )}
      <header className="page-head">
        <div className="grow">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1 className="h1">{title}</h1>
        </div>
        {right}
      </header>
    </>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="section-title">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Card({ children, className = '', pad = true, to, onClick, accent }: { children: ReactNode; className?: string; pad?: boolean | 'sm'; to?: string; onClick?: () => void; accent?: boolean }) {
  const cls = `card ${pad === true ? 'pad' : pad === 'sm' ? 'pad-sm' : ''} ${to || onClick ? 'press' : ''} ${accent ? 'accent' : ''} ${className}`
  if (to) return <Link to={to} className={cls}>{children}</Link>
  if (onClick) return <button className={cls} onClick={onClick}>{children}</button>
  return <div className={cls}>{children}</div>
}

export function Stat({ icon, label, value, unit, sub, to }: { icon?: IconName; label: string; value: ReactNode; unit?: string; sub?: ReactNode; to?: string }) {
  return (
    <Card to={to} className="stat">
      <div className="label">{icon && <Icon name={icon} />}{label}</div>
      <div className="num-lg">{value}{unit && <span className="unit">{unit}</span>}</div>
      {sub && <div className="sub">{sub}</div>}
    </Card>
  )
}

export type PillTone = 'actual' | 'projected' | 'avg' | 'good' | 'warn' | 'bad' | 'demo' | ''
export function Pill({ tone = '', children, dot }: { tone?: PillTone; children: ReactNode; dot?: boolean }) {
  return <span className={`pill ${tone}`}>{dot && <i className="dotc" />}{children}</span>
}

export const DemoPill = () => <Pill tone="demo">Demo</Pill>

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'danger' | 'danger-ghost'; sm?: boolean; block?: boolean; icon?: IconName }>(
  ({ variant, sm, block, icon, className = '', children, type = 'button', ...rest }, ref) => (
    <button ref={ref} type={type} className={`btn ${variant ?? ''} ${sm ? 'sm' : ''} ${block ? 'block' : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} />}{children}
    </button>
  )
)

export function IconButton({ icon, label, onClick, to, badge }: { icon: IconName; label: string; onClick?: () => void; to?: string; badge?: number }) {
  const inner = <><Icon name={icon} />{badge ? <span className="dot">{badge > 9 ? '9+' : badge}</span> : null}</>
  if (to) return <Link to={to} className="iconbtn" aria-label={label}>{inner}</Link>
  return <button className="iconbtn" aria-label={label} onClick={onClick}>{inner}</button>
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; count?: number }> }) {
  return (
    <div className="chips">
      {options.map(o => (
        <button key={o.value} className={`chip ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="art"><Icon name={icon} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Row({ icon, tone, title, sub, value, to, onClick, chevron = true, right }: {
  icon?: IconName; tone?: 'good' | 'warn' | 'bad'; title: ReactNode; sub?: ReactNode; value?: ReactNode; to?: string; onClick?: () => void; chevron?: boolean; right?: ReactNode
}) {
  const inner = (
    <>
      {icon && <span className={`ic ${tone ?? ''}`}><Icon name={icon} /></span>}
      <span className="grow"><span className="t" style={{ display: 'block' }}>{title}</span>{sub && <span className="s" style={{ display: 'block' }}>{sub}</span>}</span>
      {value != null && <span className="v">{value}</span>}
      {right}
      {(to || onClick) && chevron && <Icon name="chevron" className="chev" />}
    </>
  )
  if (to) return <Link to={to} className="li">{inner}</Link>
  if (onClick) return <button className="li" onClick={onClick}>{inner}</button>
  return <div className="li">{inner}</div>
}

export function Bar({ value, tone = '' }: { value: number; tone?: 'good' | 'warn' | 'bad' | '' }) {
  return <div className={`bar ${tone}`}><i style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} /></div>
}

export function Ring({ value, tone, label }: { value: number; tone: 'good' | 'warn' | 'bad' | 'blue'; label?: ReactNode }) {
  const r = 18, c = 2 * Math.PI * r
  const col = tone === 'good' ? 'var(--good)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--blue-2)'
  return (
    <div className="ring">
      <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={col} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * Math.min(1, Math.max(0.03, value))} ${c}`} style={{ filter: `drop-shadow(0 0 4px ${col})` }} /></svg>
      <div className="c">{label}</div>
    </div>
  )
}

export function Banner({ tone = 'info', icon = 'info', children, action }: { tone?: 'info' | 'warn' | 'demo'; icon?: IconName; children: ReactNode; action?: ReactNode }) {
  return <div className={`banner ${tone}`}><Icon name={icon} width={20} height={20} /><div className="grow">{children}</div>{action}</div>
}
