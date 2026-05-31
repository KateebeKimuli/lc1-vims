/**
 * ============================================================
 * GLOBAL SEARCH — src/components/shared/GlobalSearch.jsx
 * ============================================================
 * Searches across residents, cases, letters, businesses,
 * welfare records, and meetings simultaneously.
 * Triggered by Ctrl+K or the search icon in the sidebar.
 * ============================================================
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate }                  from 'react-router-dom'
import { useVillageDB }                 from '../../db/villageDB'

// Module-scope result item — stable identity, no focus loss
function ResultItem({ result, onSelect }) {
  return (
    <div
      style={{
        padding:      '10px 14px',
        borderRadius: 8,
        cursor:       'pointer',
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        transition:   'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      onClick={() => onSelect(result)}
    >
      <span style={{ fontSize:20, flexShrink:0 }}>{result.icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:13, color:'var(--c-text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {result.title}
        </div>
        <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:1 }}>
          {result.sub}
        </div>
      </div>
      <span style={{ fontSize:10, color:'var(--c-text3)', flexShrink:0 }}>
        {result.module}
      </span>
    </div>
  )
}

export default function GlobalSearch({ onClose }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const db       = useVillageDB()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  // Focus the input when the search modal opens
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  // Run search when query changes (debounced 250ms)
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return }
    const timer = setTimeout(() => runSearch(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  async function runSearch(q) {
    setLoading(true)
    const ql = q.toLowerCase()
    const found = []

    try {
      // ── Search residents ──────────────────────────────────────────
      const residents = await db.getAll('residents')
      residents.filter(r =>
        `${r.surname} ${r.firstName} ${r.otherNames||''}`.toLowerCase().includes(ql) ||
        (r.nin||'').toLowerCase().includes(ql) ||
        (r.phone||'').includes(ql)
      ).slice(0,5).forEach(r => found.push({
        id:     r.id,
        icon:   r.photo ? '🖼️' : '👤',
        title:  `${r.surname} ${r.firstName}`,
        sub:    `${r.nin||'no NIN'} · ${r.village||''} · ${r.status||'active'}`,
        module: 'Resident',
        path:   `/residents/${r.id}`,
      }))

      // ── Search cases ──────────────────────────────────────────────
      const cases = await db.getAll('cases')
      cases.filter(c =>
        (c.caseNumber||'').toLowerCase().includes(ql) ||
        (c.complainantName||'').toLowerCase().includes(ql) ||
        (c.category||'').toLowerCase().includes(ql)
      ).slice(0,3).forEach(c => found.push({
        id:     c.id,
        icon:   '⚖️',
        title:  `Case ${c.caseNumber||c.id?.slice(0,6)} — ${c.category||''}`,
        sub:    `${c.complainantName||''} · ${c.status||'open'}`,
        module: 'Case',
        path:   `/cases`,
      }))

      // ── Search letters ────────────────────────────────────────────
      const letters = await db.getAll('letters')
      letters.filter(l =>
        (l.residentName||'').toLowerCase().includes(ql) ||
        (l.referenceNumber||'').toLowerCase().includes(ql) ||
        (l.type||'').toLowerCase().includes(ql)
      ).slice(0,3).forEach(l => found.push({
        id:     l.id,
        icon:   '📄',
        title:  `${l.type||'Letter'} — ${l.residentName||''}`,
        sub:    `Ref: ${l.referenceNumber||'—'} · ${l.issuedAt ? new Date(l.issuedAt).toLocaleDateString() : ''}`,
        module: 'Letter',
        path:   `/letters`,
      }))

      // ── Search businesses ──────────────────────────────────────────
      const bizs = await db.getAll('businesses')
      bizs.filter(b =>
        (b.name||'').toLowerCase().includes(ql) ||
        (b.ownerName||'').toLowerCase().includes(ql)
      ).slice(0,3).forEach(b => found.push({
        id:     b.id,
        icon:   '🏪',
        title:  b.name || 'Business',
        sub:    `Owner: ${b.ownerName||'—'} · ${b.type||''}`,
        module: 'Business',
        path:   `/businesses`,
      }))

      // ── Search welfare ─────────────────────────────────────────────
      const welf = await db.getAll('welfare')
      welf.filter(w =>
        (w.beneficiaryName||'').toLowerCase().includes(ql) ||
        (w.programType||'').toLowerCase().includes(ql)
      ).slice(0,3).forEach(w => found.push({
        id:     w.id,
        icon:   '🤝',
        title:  w.beneficiaryName || 'Welfare record',
        sub:    `${w.programType||''} · ${w.status||''}`,
        module: 'Welfare',
        path:   `/welfare`,
      }))

    } catch { /* search errors are non-critical */ }

    setResults(found)
    setLoading(false)
  }

  function handleSelect(result) {
    navigate(result.path)
    onClose()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         9998,
        background:     'rgba(0,0,0,0.6)',
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'center',
        paddingTop:     '10vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:   'var(--c-surface)',
          borderRadius: 'var(--r-xl)',
          width:        '100%',
          maxWidth:     560,
          margin:       '0 20px',
          overflow:     'hidden',
          boxShadow:    '0 24px 60px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', borderBottom:'1px solid var(--c-border)' }}>
          <span style={{ fontSize:20, flexShrink:0 }}>🔍</span>
          <input
            ref={inputRef}
            className="form-input"
            style={{ border:'none', background:'transparent', fontSize:16, flex:1, outline:'none', padding:0 }}
            placeholder="Search residents, cases, letters, businesses…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <span style={{ fontSize:12, color:'var(--c-text3)' }}>Searching…</span>}
          <kbd style={{ fontSize:11, color:'var(--c-text3)', background:'var(--c-surface2)', padding:'2px 6px', borderRadius:4 }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight:400, overflowY:'auto', padding:'8px 6px' }}>
          {query.length >= 2 && results.length === 0 && !loading && (
            <div style={{ padding:'24px 0', textAlign:'center', color:'var(--c-text3)', fontSize:13 }}>
              No results for "{query}"
            </div>
          )}
          {query.length < 2 && (
            <div style={{ padding:'20px 14px', color:'var(--c-text3)', fontSize:13, lineHeight:1.7 }}>
              Type at least 2 characters to search across:<br/>
              Residents · Cases · Letters · Businesses · Welfare records
            </div>
          )}
          {results.map(r => (
            <ResultItem key={r.id} result={r} onSelect={handleSelect} />
          ))}
        </div>

        {results.length > 0 && (
          <div style={{ padding:'8px 18px', borderTop:'1px solid var(--c-border)', fontSize:11, color:'var(--c-text3)' }}>
            {results.length} result{results.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
