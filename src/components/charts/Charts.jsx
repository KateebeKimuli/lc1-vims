/**
 * ============================================================
 * CHART COMPONENTS — src/components/charts/Charts.jsx
 * ============================================================
 * Pure SVG/React chart components — zero dependencies, fully
 * offline, fast to render.
 *
 * Exports:
 *   BarChart         — vertical bar chart with labels
 *   HorizontalBar    — horizontal bar for rankings
 *   DonutChart       — donut/pie for proportions
 *   AgePyramid       — population age pyramid (male/female)
 *   TrendLine        — sparkline trend chart
 *   StatCard         — coloured stat tile with sparkline
 *
 * All charts use CSS variables so they work in both light and
 * dark mode automatically.
 * ============================================================
 */

import { useMemo } from 'react'

// ── Colour palette for charts ──────────────────────────────────────────────
const PALETTE = [
  '#2D7A4F', // green
  '#3498DB', // blue
  '#E67E22', // orange
  '#9B59B6', // purple
  '#E74C3C', // red
  '#1ABC9C', // teal
  '#F39C12', // gold
  '#2ECC71', // lime
]

// ─────────────────────────────────────────────────────────────────────────
// BAR CHART
// ─────────────────────────────────────────────────────────────────────────
export function BarChart({ data = [], height = 200, color = '#2D7A4F', title }) {
  const max    = Math.max(...data.map(d => d.value), 1)
  const w      = 100 / data.length
  const pad    = 1.5  // gap between bars (%)

  return (
    <div>
      {title && <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>{title}</div>}
      <svg viewBox={`0 0 100 ${height + 30}`} style={{ width:'100%', overflow:'visible' }}>
        {data.map((d, i) => {
          const barH  = Math.max((d.value / max) * height, 1)
          const x     = i * w + pad / 2
          const barW  = w - pad
          const y     = height - barH

          return (
            <g key={i}>
              {/* Bar */}
              <rect
                x={`${x}%`}
                y={y}
                width={`${barW}%`}
                height={barH}
                fill={d.color || color}
                rx="2"
                opacity="0.9"
              />
              {/* Value label on top */}
              {d.value > 0 && (
                <text
                  x={`${x + barW / 2}%`}
                  y={y - 3}
                  textAnchor="middle"
                  fontSize="7"
                  fill="var(--c-text2)"
                >
                  {d.value}
                </text>
              )}
              {/* X-axis label */}
              <text
                x={`${x + barW / 2}%`}
                y={height + 16}
                textAnchor="middle"
                fontSize="6.5"
                fill="var(--c-text3)"
              >
                {d.label?.slice(0, 8)}
              </text>
            </g>
          )
        })}
        {/* Baseline */}
        <line x1="0" y1={height} x2="100%" y2={height} stroke="var(--c-border2)" strokeWidth="0.5" />
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// HORIZONTAL BAR CHART
// ─────────────────────────────────────────────────────────────────────────
export function HorizontalBar({ data = [], title }) {
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div>
      {title && <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>{title}</div>}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:90, fontSize:12, color:'var(--c-text2)', textAlign:'right', flexShrink:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {d.label}
            </div>
            <div style={{ flex:1, height:18, background:'var(--c-surface2)', borderRadius:4, overflow:'hidden' }}>
              <div style={{
                height:'100%',
                width:`${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 0)}%`,
                background: d.color || PALETTE[i % PALETTE.length],
                borderRadius:4,
                transition:'width 0.4s ease',
                display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:4,
              }}>
                {d.value > 0 && (d.value / max) > 0.15 && (
                  <span style={{ fontSize:10, color:'#fff', fontWeight:600 }}>{d.value}</span>
                )}
              </div>
            </div>
            <div style={{ width:28, fontSize:11, color:'var(--c-text3)', textAlign:'right', flexShrink:0 }}>
              {d.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// DONUT CHART
// ─────────────────────────────────────────────────────────────────────────
export function DonutChart({ data = [], size = 140, title, centerLabel }) {
  const total   = data.reduce((s, d) => s + d.value, 0)
  const r       = 40
  const cx      = 50
  const cy      = 50
  const circ    = 2 * Math.PI * r

  // Compute arc segments
  const segments = useMemo(() => {
    let cumulative = 0
    return data.map((d, i) => {
      const pct    = total ? d.value / total : 0
      const offset = circ * (1 - cumulative)
      const dash   = circ * pct
      cumulative  += pct
      return { ...d, offset, dash, color: d.color || PALETTE[i % PALETTE.length], pct }
    })
  }, [data, total])

  return (
    <div>
      {title && <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>{title}</div>}
      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
        {/* Donut SVG */}
        <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
          <svg viewBox="0 0 100 100" style={{ width:'100%', height:'100%', transform:'rotate(-90deg)' }}>
            {/* Background ring */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--c-border)" strokeWidth="14" />
            {/* Segments */}
            {segments.map((s, i) => (
              <circle
                key={i}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeDasharray={`${s.dash} ${circ - s.dash}`}
                strokeDashoffset={s.offset}
                strokeLinecap="butt"
              />
            ))}
          </svg>
          {/* Centre label */}
          <div style={{
            position:'absolute', inset:0,
            display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center',
          }}>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--c-text)' }}>
              {centerLabel ?? total}
            </div>
            <div style={{ fontSize:9, color:'var(--c-text3)' }}>total</div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
          {segments.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:s.color, flexShrink:0 }} />
              <div style={{ fontSize:12, color:'var(--c-text2)', flex:1 }}>{s.label}</div>
              <div style={{ fontSize:11, color:'var(--c-text3)', fontWeight:600 }}>
                {s.value} <span style={{ fontWeight:400 }}>({Math.round(s.pct * 100)}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// AGE PYRAMID
// ─────────────────────────────────────────────────────────────────────────
export function AgePyramid({ residents = [], title = 'Population age pyramid' }) {
  const AGE_GROUPS = ['0–4','5–14','15–24','25–34','35–44','45–54','55–64','65+']

  const counts = useMemo(() => {
    const active = residents.filter(r => r.status === 'active' || r.residentType === 'tenant')
    return AGE_GROUPS.map(g => {
      const [lo, hi] = g === '65+' ? [65, 999] : g.split('–').map(Number)
      const inGroup  = (r) => {
        if (!r.dateOfBirth) return false
        const age = Math.floor((Date.now() - new Date(r.dateOfBirth)) / (365.25 * 24 * 3600 * 1000))
        return age >= lo && age <= hi
      }
      return {
        label: g,
        male:   active.filter(r => r.sex === 'Male'   && inGroup(r)).length,
        female: active.filter(r => r.sex === 'Female' && inGroup(r)).length,
      }
    }).reverse()  // oldest at top
  }, [residents])

  const maxVal = Math.max(...counts.flatMap(c => [c.male, c.female]), 1)
  const barW   = 45  // % of half-width

  return (
    <div>
      <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>
        {title}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', justifyContent:'center', gap:20, marginBottom:10, fontSize:11 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:10, height:10, borderRadius:2, background:'#3498DB' }} />
          <span style={{ color:'var(--c-text2)' }}>Male</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:10, height:10, borderRadius:2, background:'#E91E8C' }} />
          <span style={{ color:'var(--c-text2)' }}>Female</span>
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
        {counts.map((c, i) => {
          const mPct = (c.male   / maxVal) * barW
          const fPct = (c.female / maxVal) * barW
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:0 }}>
              {/* Male bar (extends left) */}
              <div style={{ flex:1, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:9, color:'var(--c-text3)' }}>{c.male || ''}</span>
                <div style={{ width:`${mPct}%`, minWidth: c.male > 0 ? 2 : 0, height:14,
                  background:'#3498DB', borderRadius:'2px 0 0 2px', transition:'width 0.3s' }} />
              </div>
              {/* Age label */}
              <div style={{ width:36, textAlign:'center', fontSize:9, color:'var(--c-text2)', flexShrink:0 }}>
                {c.label}
              </div>
              {/* Female bar (extends right) */}
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:4 }}>
                <div style={{ width:`${fPct}%`, minWidth: c.female > 0 ? 2 : 0, height:14,
                  background:'#E91E8C', borderRadius:'0 2px 2px 0', transition:'width 0.3s' }} />
                <span style={{ fontSize:9, color:'var(--c-text3)' }}>{c.female || ''}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// TREND SPARKLINE
// ─────────────────────────────────────────────────────────────────────────
export function TrendLine({ data = [], color = '#2D7A4F', height = 40, width = 120 }) {
  if (data.length < 2) return null

  const max  = Math.max(...data, 1)
  const min  = Math.min(...data, 0)
  const rng  = max - min || 1
  const step = width / (data.length - 1)

  const points = data.map((v, i) => {
    const x = i * step
    const y = height - ((v - min) / rng) * height
    return `${x},${y}`
  }).join(' ')

  const areaPoints = `0,${height} ${points} ${(data.length - 1) * step},${height}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height, display:'block' }}>
      <polygon points={areaPoints} fill={color} opacity="0.15" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// STAT CARD WITH TREND
// ─────────────────────────────────────────────────────────────────────────
export function StatCard({ label, value, trend = [], color = '#2D7A4F', icon, onClick, sub }) {
  const trendDir = trend.length >= 2
    ? trend[trend.length-1] > trend[trend.length-2] ? '↑' : trend[trend.length-1] < trend[trend.length-2] ? '↓' : '→'
    : ''

  return (
    <div
      className="stat-card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', position:'relative', overflow:'hidden' }}
    >
      {/* Sparkline background */}
      {trend.length >= 2 && (
        <div style={{ position:'absolute', bottom:0, right:0, opacity:0.4 }}>
          <TrendLine data={trend} color={color} height={50} width={100} />
        </div>
      )}

      <div style={{ position:'relative' }}>
        {icon && <div style={{ fontSize:22, marginBottom:4 }}>{icon}</div>}
        <div style={{ fontSize:28, fontWeight:800, color, lineHeight:1 }}>{value}</div>
        {sub && <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:2 }}>{sub}</div>}
        <div style={{ fontSize:12, color:'var(--c-text2)', marginTop:4 }}>
          {label}
          {trendDir && (
            <span style={{ marginLeft:6, color: trendDir==='↑' ? '#2D7A4F' : trendDir==='↓' ? '#E74C3C' : 'var(--c-text3)' }}>
              {trendDir}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
