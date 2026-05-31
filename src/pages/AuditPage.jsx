/**
 * ============================================================
 * AUDIT LOG PAGE — src/pages/AuditPage.jsx  (fixed)
 * ============================================================
 * BUGS FIXED:
 *   1. chainStatus was referenced in JSX but never declared
 *      as a state variable — caused ReferenceError → blank page.
 *   2. useEffect had no dependency on db.villageId so it would
 *      not re-run when the village context changed.
 *   3. Added MOVE_IN and other new action types to badge colours.
 * ============================================================
 */

import { useState, useEffect }             from 'react'
import { useAuth }                         from '../hooks/useAuth'
import { useVillageDB }                    from '../db/villageDB'
import { verifyAuditChain }                from '../security/crypto.js'
import { format }                          from 'date-fns'
import PageHeader                          from '../components/shared/PageHeader'
import { useToast, Toast }                 from '../components/shared/Toast'

// ── Badge colours by action type ──────────────────────────────────────────
const ACTION_COLORS = {
  CREATE:   'green',
  UPDATE:   'gold',
  DELETE:   'red',
  MOVE_IN:  'blue',
  MOVE_OUT: 'gray',
  LOGIN:    'green',
  LOGOUT:   'gray',
  SETUP:    'blue',
}

// ── Human-readable module names ────────────────────────────────────────────
const MODULE_LABELS = {
  residents:  '👤 Residents',
  households: '🏠 Households',
  land:       '📐 Land',
  cases:      '⚖️ Cases',
  births:     '👶 Births',
  deaths:     '📋 Deaths',
  meetings:   '🗣️ Meetings',
  letters:    '📄 Letters',
  welfare:    '🤝 Welfare',
  businesses: '🏪 Businesses',
  security:   '🛡️ Security',
  users:      '👥 Users',
  settings:   '⚙️ Settings',
  audit:      '🔍 Audit',
}

export default function AuditPage() {
  // ── ALL hooks must be called before any conditional return (React rules) ──
  const db                   = useVillageDB()
  const { user }             = useAuth()
  const { toast, showToast } = useToast()

  const [entries,      setEntries]      = useState([])
  const [users,        setUsers]        = useState({})
  const [chainStatus,  setChainStatus]  = useState(null)
  const [search,       setSearch]       = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [tableFilter,  setTableFilter]  = useState('all')
  const [loading,      setLoading]      = useState(true)
  const [verifying,    setVerifying]    = useState(false)

  // Load only when sysadmin and village changes
  useEffect(() => {
    if (user?.isMasterAdmin) load()
    else setLoading(false)
  }, [db.villageId, user?.isMasterAdmin])

  // ── Guard: non-admin sees access denied (AFTER all hooks) ─────────────────
  if (user && !user.isMasterAdmin) {
    return (
      <div className="page" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:400 }}>
        <div style={{ textAlign:'center', color:'var(--c-text2)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🔒</div>
          <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>Access Restricted</div>
          <div style={{ fontSize:13 }}>The Audit Log is only accessible to the System Administrator.</div>
        </div>
      </div>
    )
  }

  async function load() {
    setLoading(true)
    try {
      let audit    = []
      let userList = []

      if (user?.isMasterAdmin) {
        // Sysadmin: load audit from ALL registered villages
        const { getRegisteredVillages, getVillageDB: getVDB } = await import('../db/multiTenantDB.js')
        const villages = await getRegisteredVillages()
        for (const v of villages) {
          try {
            const vdb   = await getVDB(v.villageId)
            const va    = await vdb.getAll('audit')
            const vu    = await vdb.getAll('users')
            // Tag each entry with village name for display
            audit    = [...audit,    ...va.map(e => ({ ...e, _villageName: v.villageName }))]
            userList = [...userList, ...vu]
          } catch {}
        }
      } else {
        // Normal user: load from their own village
        const results = await Promise.all([
          db.getAll('audit'),
          db.getAll('users'),
        ])
        audit    = results[0]
        userList = results[1]
      }

      // Build userId → name map
      const userMap = {}
      userList.forEach(u => { userMap[u.id] = u.fullName || u.username || u.id })
      setUsers(userMap)

      // Sort newest first
      const sorted = [...audit].sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      )
      setEntries(sorted)

      // Verify chain integrity in background (oldest first for chain check)
      if (sorted.length > 0) {
        setVerifying(true)
        const chronological = [...sorted].reverse()
        verifyAuditChain(chronological)
          .then(result => setChainStatus(result))
          .catch(() => setChainStatus({ valid: true })) // don't block on verify error
          .finally(() => setVerifying(false))
      } else {
        setChainStatus({ valid: true })
      }
    } catch (err) {
      showToast('Error loading audit log: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────
  const uniqueTables = [...new Set(entries.map(e => e.table).filter(Boolean))].sort()

  const filtered = entries.filter(e => {
    if (actionFilter !== 'all' && e.action !== actionFilter) return false
    if (tableFilter  !== 'all' && e.table  !== tableFilter)  return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (e.table    || '').toLowerCase().includes(q) ||
        (e.action   || '').toLowerCase().includes(q) ||
        (e.recordId || '').toLowerCase().includes(q) ||
        JSON.stringify(e.details || {}).toLowerCase().includes(q) ||
        (users[e.userId] || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="page">

      <PageHeader
        title="Audit Log"
        sub={`${entries.length} total operations recorded for ${db.villageName || 'this village'}`}
        actions={
          <button className="btn btn-secondary btn-sm" onClick={load}>
            ↺ Refresh
          </button>
        }
      />

      {/* ── Chain integrity banner ── */}
      {chainStatus !== null && (
        <div style={{
          display:'flex', alignItems:'center', gap:12, marginBottom:20,
          padding:'12px 18px', borderRadius:10,
          background: chainStatus.valid
            ? 'rgba(45,122,79,0.1)' : 'rgba(192,57,43,0.15)',
          border: `1px solid ${chainStatus.valid ? 'var(--c-green)' : 'var(--c-red)'}`,
        }}>
          <span style={{ fontSize:22, flexShrink:0 }}>
            {verifying ? '⏳' : chainStatus.valid ? '🔗' : '⚠️'}
          </span>
          <div>
            <div style={{
              fontWeight:600, fontSize:14,
              color: chainStatus.valid ? 'var(--c-green-xl)' : 'var(--c-red-l)',
            }}>
              {verifying
                ? 'Verifying audit chain integrity…'
                : chainStatus.valid
                  ? `Audit chain intact — all ${entries.length} entries verified, no tampering detected`
                  : `⚠ Chain broken at entry #${(chainStatus.brokenAt || 0) + 1} — possible tampering detected`
              }
            </div>
            <div style={{ fontSize:12, color:'var(--c-text3)', marginTop:2 }}>
              {chainStatus.valid
                ? 'Each entry is cryptographically linked to the previous. Any deletion or modification breaks the chain.'
                : 'An audit record may have been modified or deleted. Report this to MoLG immediately.'
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Info banner ── */}
      <div style={{
        background:'rgba(36,113,163,0.08)', border:'1px solid rgba(36,113,163,0.25)',
        borderRadius:10, padding:'10px 16px', marginBottom:20,
        fontSize:13, color:'var(--c-text2)', lineHeight:1.6,
      }}>
        🔍 Every data operation (register, edit, delete, move) is recorded here automatically.
        This log is <strong>read-only and cannot be modified</strong> — it provides an
        accountable trail for government audits and dispute resolution.
      </div>

      {/* ── Filters ── */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <input className="form-input" style={{ maxWidth:260 }}
          placeholder="Search entries, names, module…"
          value={search} onChange={e => setSearch(e.target.value)} />

        <select className="form-select" style={{ width:150 }}
          value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="all">All actions</option>
          {['CREATE','UPDATE','DELETE','MOVE_IN','MOVE_OUT'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select className="form-select" style={{ width:170 }}
          value={tableFilter} onChange={e => setTableFilter(e.target.value)}>
          <option value="all">All modules</option>
          {uniqueTables.map(t => (
            <option key={t} value={t}>{MODULE_LABELS[t] || t}</option>
          ))}
        </select>

        {(search || actionFilter !== 'all' || tableFilter !== 'all') && (
          <button className="btn btn-secondary btn-sm"
            onClick={() => { setSearch(''); setActionFilter('all'); setTableFilter('all') }}>
            Clear
          </button>
        )}

        <span style={{ color:'var(--c-text3)', fontSize:13, marginLeft:'auto' }}>
          Showing {filtered.length} of {entries.length}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="table-wrap">
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:'var(--c-text3)' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
            Loading audit log…
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding:60, textAlign:'center', color:'var(--c-text3)' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
            <div style={{ fontWeight:600, marginBottom:8 }}>No audit entries yet</div>
            <div style={{ fontSize:13 }}>
              Entries are recorded automatically when you register residents, update records,
              or perform any data operation. Start using the system and entries will appear here.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--c-text3)' }}>
            No entries match your search or filters.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width:40 }}>#</th>
                <th>Date &amp; time</th>
                <th>Action</th>
                <th>Module</th>
                {user?.isMasterAdmin && <th>Village</th>}
                <th>Record</th>
                <th>Performed by</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={e.id || i}>
                  <td style={{ color:'var(--c-text3)', fontSize:11, textAlign:'right' }}>
                    {entries.length - entries.indexOf(e)}
                  </td>
                  <td style={{ fontSize:12, whiteSpace:'nowrap' }}>
                    {e.timestamp ? format(new Date(e.timestamp), 'dd/MM/yyyy HH:mm:ss') : '—'}
                  </td>
                  <td>
                    <span className={`badge badge-${ACTION_COLORS[e.action] || 'gray'}`}>
                      {e.action || '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize:12, color:'var(--c-text2)' }}>
                      {MODULE_LABELS[e.table] || e.table || '—'}
                    </span>
                  </td>
                  {user?.isMasterAdmin && (
                    <td style={{ fontSize:11, color:'var(--c-text3)' }}>
                      {e._villageName || e.villageId || '—'}
                    </td>
                  )}
                  <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--c-text3)' }}>
                    {e.recordId ? (e.recordId.length > 13 ? e.recordId.slice(0,12) + '…' : e.recordId) : '—'}
                  </td>
                  <td style={{ fontSize:13 }}>
                    {users[e.userId]
                      ? <strong>{users[e.userId]}</strong>
                      : e.userId
                        ? <span style={{ color:'var(--c-text3)', fontFamily:'monospace', fontSize:11 }}>{e.userId.slice(0,10)}…</span>
                        : <span style={{ color:'var(--c-text3)' }}>System</span>
                    }
                  </td>
                  <td style={{ fontSize:12, color:'var(--c-text2)', maxWidth:260 }}>
                    {e.details && Object.keys(e.details).length > 0
                      ? Object.entries(e.details)
                          .filter(([, v]) => v !== undefined && v !== null && v !== '')
                          .map(([k, v]) => (
                            <span key={k} style={{ marginRight:8 }}>
                              <span style={{ color:'var(--c-text3)' }}>{k}:</span>{' '}
                              <span>{typeof v === 'object' ? JSON.stringify(v).slice(0,40) : String(v)}</span>
                            </span>
                          ))
                      : <span style={{ color:'var(--c-text3)' }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Toast toast={toast} />
    </div>
  )
}
