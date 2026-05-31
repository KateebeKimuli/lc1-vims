/**
 * AUTO SKETCH MAP — src/components/land/SketchMap.jsx
 * Draws a plot boundary automatically from dimension input.
 * User enters: 100x200x150x80 (feet) = top x right x bottom x left
 * Or: 100x200 = width x height (rectangle)
 * Neighbors entered on all 4 sides: N (top), E (right), S (bottom), W (left)
 */
import { useState, useEffect, useMemo, useRef } from 'react'

const SCALE = 2.2  // pixels per foot (fits most plots in the canvas)

function feetToPixels(ft) { return Math.round(ft * SCALE) }

// Build polygon points from 4 side lengths (feet)
// Returns array of {x, y} corner points (5 points for closed polygon)
function buildPolygon(topFt, rightFt, bottomFt, leftFt, canvasW, canvasH) {
  const top    = feetToPixels(topFt)
  const right  = feetToPixels(rightFt)
  const bottom = feetToPixels(bottomFt)
  const left   = feetToPixels(leftFt)
  const maxW   = Math.max(top, bottom)
  const maxH   = Math.max(right, left)
  const padX   = Math.max(20, (canvasW - maxW) / 2)
  const padY   = Math.max(40, (canvasH - maxH) / 2)

  // Place corners: top-left, top-right, bottom-right, bottom-left
  const p0 = { x: padX,           y: padY }           // top-left
  const p1 = { x: padX + top,     y: padY }           // top-right
  const p2 = { x: padX + bottom,  y: padY + right }   // bottom-right (follows right side)
  const p3 = { x: padX,           y: padY + left  }   // bottom-left (follows left side)
  return [p0, p1, p2, p3]
}

// Midpoint of two points
function mid(a, b) { return { x: (a.x+b.x)/2, y: (a.y+b.y)/2 } }

// Compass direction labels for each side
const SIDE_LABELS = ['N (Top)', 'E (Right)', 'S (Bottom)', 'W (Left)']
const SIDE_COLORS = ['#E74C3C','#3498DB','#2ECC71','#E67E22']
const BEARINGS    = ['North','East','South','West']

export default function SketchMap({ value, onChange, plotNumber='', ownerName='', village='' }) {
  const W = 520, H = 400
  const svgRef = useRef(null)

  // Parse existing saved data
  const [dims, setDims] = useState({ top:'', right:'', bottom:'', left:'', raw:'' })
  const [neighbors, setNeighbors] = useState({ N:'', E:'', S:'', W:'' })
  const [editSide,  setEditSide]  = useState(null)
  const [neighInput, setNeighInput] = useState('')

  // Load saved data
  useEffect(() => {
    if (!value) return
    try {
      const parser = new DOMParser()
      const doc    = parser.parseFromString(value, 'image/svg+xml')
      const root   = doc.querySelector('svg')
      if (!root) return
      const savedDims  = root.getAttribute('data-dims')
      const savedNeigh = root.getAttribute('data-neighbors')
      if (savedDims)  { const d = JSON.parse(savedDims);  setDims(d) }
      if (savedNeigh) { const n = JSON.parse(savedNeigh); setNeighbors(n) }
    } catch {}
  }, [])

  // Parse dimension string like "100x200x150x80"
  function parseDims(raw) {
    const parts = raw.replace(/\s/g,'').split(/[xX×,]/).map(Number).filter(n => !isNaN(n) && n > 0)
    if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] }
    if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] }
    if (parts.length === 4) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] }
    return null
  }

  // Handle dimension input
  function handleDimInput(raw) {
    const parsed = parseDims(raw)
    if (parsed) {
      const d = { ...parsed, raw }
      setDims(d)
    } else {
      setDims(prev => ({ ...prev, raw }))
    }
  }

  // Build and emit SVG whenever state changes
  useEffect(() => {
    const parsed = parseDims(dims.raw || `${dims.top}x${dims.right}x${dims.bottom}x${dims.left}`)
    if (!parsed || !parsed.top) return
    const svg = buildSVG(parsed, neighbors, plotNumber, ownerName, village, W, H)
    if (onChange) onChange(svg)
  }, [dims, neighbors, plotNumber, ownerName, village])

  function buildSVG(d, neigh, plotNo, owner, vill, w, h) {
    const pts  = buildPolygon(d.top, d.right, d.bottom, d.left, w, h)
    const [p0, p1, p2, p3] = pts
    const pStr = pts.map(p => `${p.x},${p.y}`).join(' ')
    const area  = Math.abs((d.top + d.bottom) * (d.right + d.left) / 4)  // approx sq ft
    const sqm   = (area * 0.0929).toFixed(1)
    const acres = (area / 43560).toFixed(4)

    const sides = [
      { p1: p0, p2: p1, dir: 'N', ft: d.top,    neigh: neigh.N, bearing: 'North' },
      { p1: p1, p2: p2, dir: 'E', ft: d.right,  neigh: neigh.E, bearing: 'East'  },
      { p1: p2, p2: p3, dir: 'S', ft: d.bottom, neigh: neigh.S, bearing: 'South' },
      { p1: p3, p2: p0, dir: 'W', ft: d.left,   neigh: neigh.W, bearing: 'West'  },
    ]

    const sideLabels = sides.map(s => {
      const m   = mid(s.p1, s.p2)
      const ang = Math.atan2(s.p2.y - s.p1.y, s.p2.x - s.p1.x) * 180 / Math.PI
      const rot = Math.abs(ang) > 90 ? ang + 180 : ang
      const label = `${s.ft}ft ${s.bearing}`
      const neigh = s.neigh || '(neighbour)'
      return `<g transform="translate(${m.x},${m.y}) rotate(${rot})">
        <rect x="-36" y="-18" width="72" height="20" rx="3" fill="white" opacity="0.88"/>
        <text x="0" y="-5" text-anchor="middle" font-size="8" font-weight="bold" fill="#004d00">${label}</text>
        <text x="0" y="6"  text-anchor="middle" font-size="7" fill="#555" font-style="italic">${neigh.slice(0,24)}</text>
      </g>`
    }).join('\n')

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"
      data-dims='${JSON.stringify({top:d.top,right:d.right,bottom:d.bottom,left:d.left,raw:dims.raw})}'
      data-neighbors='${JSON.stringify(neigh)}'>
      <!-- Background -->
      <rect width="${w}" height="${h}" fill="#FFFEF7"/>
      ${Array.from({length:14},(_,i)=>`<line x1="${i*40}" y1="0" x2="${i*40}" y2="${h}" stroke="#E8E8D8" stroke-width="0.5"/>`).join('')}
      ${Array.from({length:11},(_,i)=>`<line x1="0" y1="${i*40}" x2="${w}" y2="${i*40}" stroke="#E8E8D8" stroke-width="0.5"/>`).join('')}
      <rect x="1" y="1" width="${w-2}" height="${h-2}" fill="none" stroke="#ccc" stroke-width="1"/>
      <!-- Plot boundary -->
      <polygon points="${pStr}" fill="rgba(45,122,79,0.15)" stroke="#004d00" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Corner markers -->
      ${pts.map((p,i) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#004d00" stroke="white" stroke-width="1.5"/>
        <text x="${p.x}" y="${p.y+4}" text-anchor="middle" font-size="7" fill="white" font-weight="bold">${i+1}</text>`).join('\n')}
      <!-- Side labels -->
      ${sideLabels}
      <!-- Compass rose -->
      <g transform="translate(${w-52},50)">
        <circle r="22" fill="white" stroke="#333" stroke-width="1.5"/>
        <polygon points="0,-18 -5,2 5,2" fill="#111"/>
        <polygon points="0,18 -5,-2 5,-2" fill="white" stroke="#333" stroke-width="1"/>
        <line x1="-18" y1="0" x2="18" y2="0" stroke="#555" stroke-width="1"/>
        <text y="-22" text-anchor="middle" font-size="11" font-weight="bold" fill="#111">N</text>
        <text y="30"  text-anchor="middle" font-size="8"  fill="#555">S</text>
        <text x="22"  y="4" font-size="8" fill="#555">E</text>
        <text x="-26" y="4" font-size="8" fill="#555">W</text>
        <circle r="2.5" fill="#333"/>
      </g>
      <!-- Scale bar -->
      <g transform="translate(20,${h-28})">
        <rect x="0" y="-8" width="50" height="8" fill="#333"/>
        <rect x="50" y="-8" width="50" height="8" fill="white" stroke="#333" stroke-width="1"/>
        <text x="0"   y="6" font-size="8" fill="#333">0</text>
        <text x="50"  y="6" font-size="8" fill="#333" text-anchor="middle">50ft</text>
        <text x="100" y="6" font-size="8" fill="#333">100ft</text>
      </g>
      <!-- Title block -->
      <g transform="translate(${w-180},${h-70})">
        <rect width="175" height="66" fill="white" stroke="#333" stroke-width="1.5"/>
        <rect width="175" height="14" fill="#004d00"/>
        <text x="87" y="10" text-anchor="middle" font-size="8" fill="white" font-weight="bold">LC1 VILLAGE LAND SKETCH MAP</text>
        <text x="5" y="24" font-size="7" fill="#333" font-weight="bold">Plot No:</text>
        <text x="42" y="24" font-size="7" fill="#004d00" font-weight="bold">${plotNo||'—'}</text>
        <text x="5" y="34" font-size="7" fill="#333" font-weight="bold">Owner:</text>
        <text x="36" y="34" font-size="7" fill="#333">${(owner||'').slice(0,24)}</text>
        <text x="5" y="44" font-size="7" fill="#333" font-weight="bold">Area:</text>
        <text x="30" y="44" font-size="7" fill="#004d00">${area.toFixed(0)} sq.ft (${acres} acres)</text>
        <text x="5" y="54" font-size="7" fill="#333" font-weight="bold">Village:</text>
        <text x="38" y="54" font-size="7" fill="#333">${(vill||'').slice(0,22)}</text>
        <text x="5" y="62" font-size="7" fill="#888" font-style="italic">Not drawn to scale</text>
      </g>
    </svg>`
  }

  const parsed = parseDims(dims.raw || `${dims.top||0}x${dims.right||0}x${dims.bottom||0}x${dims.left||0}`)
  const hasValidDims = parsed && parsed.top > 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Dimension input */}
      <div style={{ background:'var(--c-surface2)', borderRadius:10, padding:14 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--c-text)', marginBottom:10 }}>
          Plot dimensions <span style={{ color:'var(--c-text3)', fontWeight:400 }}>(in feet)</span>
        </div>

        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', marginBottom:12 }}>
          <div className="form-group" style={{ flex:'0 0 auto' }}>
            <label className="form-label" style={{ fontSize:11 }}>Quick entry (e.g. 100x200 or 100x200x150x80)</label>
            <input className="form-input"
              value={dims.raw}
              onChange={e => handleDimInput(e.target.value)}
              placeholder="width × height  or  top × right × bottom × left"
              style={{ fontFamily:'monospace', letterSpacing:'0.05em', minWidth:280 }} />
            <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:3 }}>
              Format: <strong>TopSide × RightSide × BottomSide × LeftSide</strong> in feet
            </div>
          </div>
        </div>

        {/* Individual side inputs */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
          {[
            { key:'top',   label:'⬆ North (Top)',   color:'#E74C3C' },
            { key:'right', label:'➡ East (Right)',  color:'#3498DB' },
            { key:'bottom',label:'⬇ South (Bottom)',color:'#2ECC71' },
            { key:'left',  label:'⬅ West (Left)',   color:'#E67E22' },
          ].map(side => (
            <div key={side.key} className="form-group">
              <label className="form-label" style={{ fontSize:11, color:side.color, fontWeight:600 }}>
                {side.label}
              </label>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <input className="form-input"
                  type="number" min="1" value={dims[side.key]||''}
                  onChange={e => {
                    const val = Number(e.target.value)
                    const nd  = { ...dims, [side.key]: val }
                    setDims(nd)
                    const newRaw = `${nd.top||0}x${nd.right||0}x${nd.bottom||0}x${nd.left||0}`
                    setDims(prev => ({ ...prev, [side.key]: val, raw: newRaw }))
                  }}
                  style={{ flex:1 }} />
                <span style={{ fontSize:11, color:'var(--c-text3)', whiteSpace:'nowrap' }}>ft</span>
              </div>
            </div>
          ))}
        </div>

        {/* Area display */}
        {hasValidDims && (
          <div style={{ marginTop:10, padding:'6px 12px', background:'rgba(45,122,79,0.1)',
            border:'1px solid var(--c-green)', borderRadius:7, fontSize:12, color:'var(--c-green-xl)' }}>
            📐 Approximate area:{' '}
            <strong>{((parsed.top+parsed.bottom)/2 * (parsed.right+parsed.left)/2).toFixed(0)} sq.ft</strong>
            {' · '}
            <strong>{(((parsed.top+parsed.bottom)/2 * (parsed.right+parsed.left)/2) / 43560).toFixed(4)} acres</strong>
            {' · '}
            <strong>{(((parsed.top+parsed.bottom)/2 * (parsed.right+parsed.left)/2) * 0.0929).toFixed(1)} sq.m</strong>
          </div>
        )}
      </div>

      {/* Neighbor inputs */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
        {[
          { key:'N', label:'⬆ North neighbor', color:'#E74C3C' },
          { key:'E', label:'➡ East neighbor',  color:'#3498DB' },
          { key:'S', label:'⬇ South neighbor', color:'#2ECC71' },
          { key:'W', label:'⬅ West neighbor',  color:'#E67E22' },
        ].map(side => (
          <div key={side.key} className="form-group">
            <label className="form-label" style={{ fontSize:11, color:side.color, fontWeight:600 }}>
              {side.label}
            </label>
            <input className="form-input"
              value={neighbors[side.key]}
              onChange={e => setNeighbors(prev => ({ ...prev, [side.key]: e.target.value }))}
              placeholder="Name / road / swamp…" style={{ fontSize:12 }} />
          </div>
        ))}
      </div>

      {/* Map preview */}
      {hasValidDims ? (
        <div style={{ border:'2px solid var(--c-border)', borderRadius:8, overflow:'hidden' }}>
          <div style={{ padding:'6px 12px', background:'var(--c-surface2)', fontSize:12,
            color:'var(--c-text2)', borderBottom:'1px solid var(--c-border)' }}>
            🗺️ Sketch map preview — auto-generated from dimensions
          </div>
          <div dangerouslySetInnerHTML={{ __html: buildSVG(parsed, neighbors, plotNumber, ownerName, village, W, H) }}
            style={{ display:'block', width:'100%' }} />
        </div>
      ) : (
        <div style={{ border:'2px dashed var(--c-border)', borderRadius:8, padding:40,
          textAlign:'center', color:'var(--c-text3)' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📐</div>
          Enter plot dimensions above to auto-generate the sketch map
        </div>
      )}

      <div style={{ fontSize:11, color:'var(--c-text3)', lineHeight:1.7,
        padding:'8px 12px', background:'var(--c-surface2)', borderRadius:8 }}>
        <strong>How to enter dimensions:</strong>{' '}
        Use <code>Width × Height</code> for a rectangular plot (e.g. <code>100x200</code>){' '}
        or <code>Top × Right × Bottom × Left</code> for an irregular plot (e.g. <code>100x200x90x180</code>).
        All measurements in <strong>feet</strong>.
        The sketch map is automatically saved with the record and printed on the land title.
      </div>
    </div>
  )
}
