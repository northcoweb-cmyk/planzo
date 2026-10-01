import { useId, useRef, useState, type ReactNode } from 'react'

const W = 360

export interface Pt { x: number; y: number }
export interface Series { name: string; points: Pt[]; dashed?: boolean; color?: string; area?: boolean }

function niceRange(min: number, max: number, minSpan = 0): [number, number] {
  if (!isFinite(min) || !isFinite(max)) return [0, 1]
  if (max - min < minSpan) { const mid = (max + min) / 2; min = mid - minSpan / 2; max = mid + minSpan / 2 }
  if (min === max) { const d = Math.abs(min) * 0.05 || 1; return [min - d, max + d] }
  const pad = (max - min) * 0.12
  return [min - pad, max + pad]
}

/** Smooth-ish path (monotone-ish via Catmull-Rom → cubic Bezier), kept simple and lightweight. */
function pathFor(pts: Array<[number, number]>): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const t = 0.18
    const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t
    const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

export function LineChart({ series, height = 190, yFormat = (v: number) => String(Math.round(v)), xFormat, yMin, yMax, tipFormat, yTicks = 3, xTicks = 4, minSpan = 0 }: {
  series: Series[]; height?: number; yFormat?: (v: number) => string; xFormat: (x: number) => string; yMin?: number; yMax?: number
  tipFormat?: (p: Pt, s: Series) => ReactNode; yTicks?: number; xTicks?: number; minSpan?: number
}) {
  const uid = useId().replace(/:/g, '')
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null)
  const all = series.flatMap(s => s.points)
  if (all.length < 1) return null
  const L = 42, R = 10, T = 12, B = 24
  const xs = all.map(p => p.x), ys = all.map(p => p.y)
  let x0 = Math.min(...xs), x1 = Math.max(...xs)
  if (x0 === x1) { x0 -= 1; x1 += 1 }
  const [ay, by] = niceRange(Math.min(...ys), Math.max(...ys), minSpan)
  const y0 = yMin ?? ay, y1 = yMax ?? by
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R)
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (height - T - B)

  const ticksY = Array.from({ length: yTicks }, (_, i) => y0 + ((y1 - y0) * i) / (yTicks - 1))
  const ticksX = Array.from({ length: xTicks }, (_, i) => x0 + ((x1 - x0) * i) / (xTicks - 1))

  const solid = series.find(s => !s.dashed) ?? series[0]
  function onMove(e: React.PointerEvent) {
    const box = ref.current!.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    let best = { s: 0, i: 0, d: Infinity }
    series.forEach((s, si) => s.points.forEach((p, i) => { const d = Math.abs(sx(p.x) - px); if (d < best.d) best = { s: si, i, d } }))
    setHover({ s: best.s, i: best.i })
  }
  const hp = hover ? series[hover.s].points[hover.i] : null

  return (
    <div className="chart" ref={ref} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img">
        <defs>
          <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4a93ff" stopOpacity="0.32" /><stop offset="100%" stopColor="#4a93ff" stopOpacity="0" />
          </linearGradient>
          <filter id={`f${uid}`} x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="2.4" /></filter>
        </defs>
        {ticksY.map((v, i) => (
          <g key={i}><line className="grid-line" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} /><text className="axis" x={L - 8} y={sy(v) + 3.5} textAnchor="end">{yFormat(v)}</text></g>
        ))}
        {ticksX.map((v, i) => (
          <text key={i} className="axis" x={sx(v)} y={height - 6} textAnchor={i === 0 ? 'start' : i === xTicks - 1 ? 'end' : 'middle'}>{xFormat(v)}</text>
        ))}
        {series.map((s, si) => {
          const pts = s.points.map(p => [sx(p.x), sy(p.y)] as [number, number])
          const d = pathFor(pts)
          const col = s.color ?? '#4a93ff'
          return (
            <g key={si}>
              {s.area && pts.length > 1 && <path d={`${d} L${pts[pts.length - 1][0]},${height - B} L${pts[0][0]},${height - B} Z`} fill={`url(#g${uid})`} />}
              {!s.dashed && pts.length > 1 && <path d={d} fill="none" stroke={col} strokeWidth="4" opacity="0.5" filter={`url(#f${uid})`} />}
              <path d={d} fill="none" stroke={col} strokeWidth={s.dashed ? 2 : 2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '5 5' : undefined} />
              {!s.dashed && pts.length <= 40 && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={pts.length > 20 ? 2 : 3} fill="#0a0c10" stroke={col} strokeWidth="1.6" />)}
            </g>
          )
        })}
        {hp && <g><line x1={sx(hp.x)} x2={sx(hp.x)} y1={T} y2={height - B} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" /><circle cx={sx(hp.x)} cy={sy(hp.y)} r="5" fill="#fff" stroke="#4a93ff" strokeWidth="2.5" /></g>}
      </svg>
      {hp && hover && (
        <div className="tip" style={{ left: `${(sx(hp.x) / W) * 100}%`, top: `${(sy(hp.y) / height) * 100}%` }}>
          {tipFormat ? tipFormat(hp, series[hover.s]) : <>{yFormat(hp.y)}<small>{xFormat(hp.x)}</small></>}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend" style={{ marginTop: 6 }}>
          {series.map((s, i) => <span key={i}><i className={s.dashed ? 'dash' : ''} style={s.dashed ? undefined : { background: s.color ?? '#4a93ff' }} />{s.name}</span>)}
        </div>
      )}
      {solid && null}
    </div>
  )
}

export interface BarDatum { key: string; label: string; value: number }

export function BarChart({ data, height = 170, valueFormat = (v: number) => String(Math.round(v)), tipLabel }: {
  data: BarDatum[]; height?: number; valueFormat?: (v: number) => string; tipLabel?: (d: BarDatum) => string
}) {
  const [sel, setSel] = useState<number | null>(null)
  const uid = useId().replace(/:/g, '')
  if (data.length === 0) return null
  const L = 8, R = 8, T = 22, B = 22
  const max = Math.max(...data.map(d => d.value), 1)
  const bw = (W - L - R) / data.length
  const gap = Math.min(10, bw * 0.28)
  const hl = sel ?? data.length - 1
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img">
        <defs>
          <linearGradient id={`b${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6aa8ff" /><stop offset="100%" stopColor="#1c69d4" /></linearGradient>
          <linearGradient id={`d${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(255,255,255,.22)" /><stop offset="100%" stopColor="rgba(255,255,255,.08)" /></linearGradient>
        </defs>
        <line className="grid-line" x1={L} x2={W - R} y1={height - B} y2={height - B} />
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * (height - T - B))
          const x = L + i * bw + gap / 2
          const w = bw - gap
          return (
            <g key={d.key} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
              <rect x={L + i * bw} y={0} width={bw} height={height} fill="transparent" />
              <rect x={x} y={height - B - h} width={w} height={h} rx={Math.min(7, w / 2)} fill={i === hl ? `url(#b${uid})` : `url(#d${uid})`} style={i === hl ? { filter: 'drop-shadow(0 0 8px rgba(60,130,255,.5))' } : undefined} />
              {(data.length <= 8 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && <text className="axis" x={x + w / 2} y={height - 6} textAnchor="middle">{d.label}</text>}
              {i === hl && <text x={x + w / 2} y={Math.max(12, height - B - h - 7)} textAnchor="middle" fill="#f3f5f8" fontSize="11.5" fontWeight="650" fontFamily="var(--font)">{valueFormat(d.value)}</text>}
            </g>
          )
        })}
      </svg>
      {tipLabel && <div className="small muted center" style={{ marginTop: 4 }}>{tipLabel(data[hl])}</div>}
    </div>
  )
}

export function Spark({ values, height = 38, color = '#4a93ff' }: { values: number[]; height?: number; color?: string }) {
  if (values.length < 2) return null
  const w = 120
  const min = Math.min(...values), max = Math.max(...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, 3 + (1 - (v - min) / (max - min || 1)) * (height - 6)] as [number, number])
  return <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none"><path d={pathFor(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
}

export function SpendBar({ parts }: { parts: Array<{ label: string; value: number; color: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (total <= 0) return null
  return (
    <>
      <div className="spendbar" role="img" aria-label="Spending breakdown">
        {parts.filter(p => p.value > 0).map(p => <i key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
    </>
  )
}
