import { useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { useGarage } from '../hooks/garage'
import { Banner, Button, Segmented } from './ui'

/** Open a form sheet over the current page (keeps the page mounted + its scroll position). */
export function useSheet() {
  const nav = useNavigate()
  const loc = useLocation()
  return (to: string) => nav(to, { state: { bg: { pathname: loc.pathname, search: loc.search, hash: loc.hash, key: loc.key } } })
}

const TABS: Array<{ to: string; label: string; icon: IconName; match: string[] }> = [
  { to: '/', label: 'Home', icon: 'home', match: ['/'] },
  { to: '/car', label: 'Car', icon: 'car', match: ['/car'] },
  { to: '/logs', label: 'Logs', icon: 'logs', match: ['/logs'] },
  { to: '/reminders', label: 'Reminders', icon: 'bell', match: ['/reminders'] },
  { to: '/more', label: 'More', icon: 'grid', match: ['/more'] }
]

function isOn(path: string, t: (typeof TABS)[number]) {
  return t.to === '/' ? path === '/' : t.match.some(m => path === m || path.startsWith(m + '/'))
}

function TabLinks({ cls }: { cls: string }) {
  const { pathname } = useLocation()
  const { derived } = useGarage()
  return (
    <>
      {TABS.map(t => {
        const on = isOn(pathname, t)
        return (
          <NavLink key={t.to} to={t.to === '/logs' ? '/logs/fuel' : t.to} className={`${cls} ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
            {t.to === '/reminders' && derived.attentionCount > 0 && <span className="dot" aria-label={`${derived.attentionCount} need attention`}>{derived.attentionCount}</span>}
          </NavLink>
        )
      })}
    </>
  )
}

export function TabBar() {
  return <nav className="tabbar" aria-label="Main"><TabLinks cls="tab" /></nav>
}

export function Rail() {
  return (
    <nav className="rail" aria-label="Main">
      <div className="brand"><Logo /> BMW Garage</div>
      <TabLinks cls="tab" />
    </nav>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="#4a93ff" strokeWidth="2.2" />
      <path d="M16 6.5v19M6.5 16h19" stroke="rgba(255,255,255,.28)" strokeWidth="1.2" />
      <path d="M16 6.5A9.5 9.5 0 0 1 25.5 16H16z M16 25.5A9.5 9.5 0 0 1 6.5 16H16z" fill="#2f7be6" />
    </svg>
  )
}

export function SubTabs({ items }: { items: Array<{ to: string; label: string }> }) {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const current = [...items].sort((a, b) => b.to.length - a.to.length).find(i => pathname === i.to || pathname.startsWith(i.to + '/'))?.to ?? items[0].to
  return <div style={{ marginBottom: 16 }}><Segmented value={current} onChange={v => nav(v, { replace: true })} options={items.map(i => ({ value: i.to, label: i.label }))} /></div>
}

/** Scroll container; resets to top when the top-level section changes. */
export function ScrollArea({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const section = pathname.split('/')[1] + '/' + (pathname.split('/')[2] ?? '')
  useEffect(() => { ref.current?.scrollTo({ top: 0 }) }, [section])
  return <main className="scroll" ref={ref}><div className="container">{children}</div></main>
}

export function DemoBanner() {
  const { demoActive, actions } = useGarage()
  if (!demoActive) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <Banner tone="demo" icon="info" action={<Button sm variant="ghost" onClick={() => actions.switchDataset('live')}>Exit demo</Button>}>
        <b>Demo data</b> – example records in a separate database. Your real garage is untouched.
      </Banner>
    </div>
  )
}
