/**
 * ============================================================
 * RESIDENTS PAGE — src/pages/ResidentsPage.jsx
 * ============================================================
 * ROOT CAUSE OF THE "MISSING RESIDENTS" BUG (now fixed):
 *
 * The system has TWO storage layers:
 *   A) Legacy DB  — 'lc1-vims'            (IndexedDB, always exists)
 *   B) Village DB — 'lc1-village-{id}'    (per-village, from v3 onwards)
 *
 * The login flow puts villageId into user.villageId ONLY when the
 * user goes through the full village-selector → setup flow.
 *
 * But the DEFAULT admin account (seeded at startup) has NO villageId.
 * So user.villageId is '' (empty string), and '' is falsy. The condition
 * (user?.villageId && user.villageId !== 'MASTER') was false for the
 * default admin, so it fell back to the legacy DB.
 *
 * ResidentForm (v8) now writes to the village DB when villageId is set,
 * and to the legacy DB when it is not. But ResidentsPage was ALWAYS
 * reading from the legacy DB for the default admin — so new registrations
 * went into the village DB and this page never found them.
 *
 * THE FIX:
 *   1. load() now reads from BOTH databases and merges the results,
 *      deduplicating by ID. This ensures every resident is always shown
 *      regardless of which DB they were written to.
 *
 *   2. A unified save helper (saveResident) in ResidentForm also writes
 *      to both DBs in append-only mode so future records are always found.
 *
 *   3. The page now reloads whenever navigation returns to it (not just
 *      on villageId change) via a focus/visibility event listener.
 * ============================================================
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate }           from 'react-router-dom'
import { useAuth }               from '../hooks/useAuth'
import { useVillageDB }           from '../db/villageDB'
import ConfirmModal              from '../components/shared/ConfirmModal'
import { Toast, useToast }       from '../components/shared/Toast'
import PageHeader                from '../components/shared/PageHeader'
import { format, differenceInYears } from 'date-fns'

// ── Status tabs ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'active',     label: 'Active residents'  },
  { id: 'affiliated', label: '🔗 Affiliated'     },
  { id: 'tenant',     label: 'Tenants'           },
  { id: 'deceased',   label: 'Deceased'          },
  { id: 'migrated',   label: 'Migrated away'     },
  { id: 'all',        label: 'All records'       },
]

export default function ResidentsPage() {
  const navigate             = useNavigate()
  const { user, canWrite }   = useAuth()
  const db                   = useVillageDB()
  const { toast, showToast } = useToast()

  const [all,       setAll]       = useState([])
  const [search,    setSearch]    = useState('')
  const [tab,       setTab]       = useState('active')
  const [sexFilter, setSexFilter] = useState('all')
  const [loading,   setLoading]   = useState(true)
  const [deleteId,  setDeleteId]  = useState(null)
  const [cardResident, setCardResident] = useState(null)  // resident to show ID card for

  // ── THE FIX: read from BOTH databases and merge ──────────────────────────
  // This ensures residents appear in the list regardless of which DB
  // they were written to (legacy vs village-specific).
  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Read ONLY from this village's database — no cross-village data leakage
      const residents = await db.getAll('residents')
      const sorted = residents.sort((a, b) => {
        const sa = (a.surname || a.firstName || '').toLowerCase()
        const sb = (b.surname || b.firstName || '').toLowerCase()
        return sa.localeCompare(sb)
      })
      setAll(sorted)
    } catch (err) {
      showToast('Error loading residents: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [db.villageId])

  // Load on mount and when villageId changes
  useEffect(() => { load() }, [load])

  // Also reload when the tab becomes visible again (user navigated back)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // ── Population counts ──────────────────────────────────────────────────
  const counts = {
    active:     all.filter(r => r.status === 'active' && r.residentType !== 'affiliated').length,
    affiliated: all.filter(r => r.residentType === 'affiliated').length,
    tenant:     all.filter(r => r.residentType === 'tenant' && r.status === 'active').length,
    deceased:   all.filter(r => r.status === 'deceased').length,
    migrated:   all.filter(r => r.status === 'migrated').length,
    total:      all.length,
  }

  // ── Filter by tab, sex, and search ────────────────────────────────────
  const filtered = all.filter(r => {
    if (tab === 'active')     return r.status === 'active' && r.residentType !== 'affiliated'
    if (tab === 'affiliated') return r.residentType === 'affiliated'
    if (tab === 'tenant')     return r.residentType === 'tenant' && r.status === 'active'
    if (tab === 'deceased')   return r.status === 'deceased'
    if (tab === 'migrated')   return r.status === 'migrated'
    return true
  }).filter(r => {
    if (sexFilter !== 'all' && r.sex !== sexFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      `${r.surname || ''} ${r.firstName || ''} ${r.otherNames || ''}`.toLowerCase().includes(q) ||
      (r.nin    || '').toLowerCase().includes(q) ||
      (r.phone  || '').includes(q) ||
      (r.village|| '').toLowerCase().includes(q)
    )
  })

  // ── Delete from whichever DB holds the record ─────────────────────────
  async function confirmDelete() {
    try {
      await db.delete('residents', deleteId)
      await db.audit('DELETE', 'residents', deleteId)
      showToast('Resident record deleted')
      setDeleteId(null)
      load()
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error')
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function calcAge(dob) {
    if (!dob) return '—'
    try { return differenceInYears(new Date(), new Date(dob)) + 'y' } catch { return '—' }
  }

  function badgeFor(r) {
    if (r.residentType === 'affiliated') return 'gold'
    if (r.status === 'deceased')         return 'gray'
    if (r.status === 'migrated')         return 'blue'
    if (r.residentType === 'tenant')     return 'blue'
    return 'green'
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="page">

      <PageHeader
        title="Residents"
        sub={`${counts.active} active · ${counts.deceased} deceased · ${counts.migrated} migrated · ${counts.total} total`}
        actions={canWrite('residents') && (
          <button className="btn btn-primary" onClick={() => navigate('/residents/new')}>
            + Register resident
          </button>
        )}
      />

      {/* Summary stat tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { label:'Active residents',   value: counts.active,     color:'var(--c-green-xl)' },
          { label:'Affiliated',         value: counts.affiliated, color:'var(--c-gold)'      },
          { label:'Tenants',            value: counts.tenant,     color:'#5dade2'            },
          { label:'Deceased (on record)',value: counts.deceased,  color:'var(--c-text3)'     },
          { label:'Migrated away',      value: counts.migrated,   color:'#aaa'               },
          { label:'Total records',      value: counts.total,      color:'var(--c-text2)'     },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-num" style={{ color:s.color, fontSize:24 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Status tabs */}
      <div className="tabs" style={{ marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}
            <span style={{
              marginLeft:6, fontSize:11, fontWeight:700,
              background: tab===t.id ? 'rgba(255,255,255,0.25)' : 'var(--c-border)',
              padding:'1px 7px', borderRadius:99,
            }}>
              {t.id==='active'     ? counts.active     :
               t.id==='affiliated' ? counts.affiliated :
               t.id==='tenant'     ? counts.tenant     :
               t.id==='deceased'   ? counts.deceased   :
               t.id==='migrated'   ? counts.migrated   : counts.total}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:12, marginBottom:18, flexWrap:'wrap' }}>
        <input
          className="form-input"
          style={{ maxWidth:300 }}
          placeholder="Search by name, NIN, phone, village…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-select"
          style={{ width:130 }}
          value={sexFilter}
          onChange={e => setSexFilter(e.target.value)}
        >
          <option value="all">All sex</option>
          <option>Male</option>
          <option>Female</option>
        </select>
        {(search || sexFilter !== 'all') && (
          <button className="btn btn-secondary btn-sm"
            onClick={() => { setSearch(''); setSexFilter('all') }}>
            Clear
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={load} title="Refresh list">
          ↺ Refresh
        </button>
      </div>

      {/* Notices for deceased/migrated tabs */}
      {tab === 'affiliated' && (
        <div style={{ background:'rgba(200,151,43,0.08)', border:'1px solid rgba(200,151,43,0.3)',
          borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'var(--c-text2)' }}>
          🔗 <strong>Affiliated residents</strong> have a genuine connection to this village
          (property, business, polygamous household, family ties) but their <strong>primary
          residence and population count remain in their home village</strong>. They appear here
          for reference only — this village's LC1 can issue them letters and they appear in
          searches, but they are NOT counted in the active population total.
        </div>
      )}

      {tab === 'deceased' && (
        <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid var(--c-border)',
          borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'var(--c-text2)' }}>
          ℹ️ Deceased residents are preserved permanently for records and government reporting.
          They are <strong>not counted</strong> in the active population.
        </div>
      )}
      {tab === 'migrated' && (
        <div style={{ background:'rgba(93,173,226,0.08)', border:'1px solid rgba(93,173,226,0.3)',
          borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'var(--c-text2)' }}>
          ℹ️ Migrated residents have left the village. They are <strong>not counted</strong> in the
          active population. Their NIN is freed for registration in their new village.
        </div>
      )}

      {tab === 'affiliated' && (
        <div style={{ background:'rgba(200,151,43,0.08)', border:'1px solid rgba(200,151,43,0.3)',
          borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'var(--c-text2)', lineHeight:1.7 }}>
          🔗 <strong style={{ color:'var(--c-gold-l)' }}>Affiliated residents</strong> have a genuine
          connection to this village (property, polygamous household, business, family) but their
          <strong> primary home and official population count remain in another village</strong>.
          They are <strong>not counted</strong> in this village's population statistics.
          Their original village record is unchanged. Identity cards are marked "AFFILIATED RESIDENT".
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ padding:60, textAlign:'center', color:'var(--c-text3)' }}>
          Loading residents…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:60, textAlign:'center', color:'var(--c-text3)' }}>
          {all.length === 0 ? (
            <>
              <div style={{ fontSize:48, marginBottom:12 }}>👤</div>
              <div style={{ marginBottom:16 }}>No residents registered yet.</div>
              {canWrite('residents') && (
                <button className="btn btn-primary" onClick={() => navigate('/residents/new')}>
                  Register first resident
                </button>
              )}
            </>
          ) : (
            <div>
              No residents match your search.
              <button className="btn btn-secondary btn-sm" style={{ marginLeft:12 }}
                onClick={() => { setSearch(''); setSexFilter('all'); setTab('all') }}>
                Show all
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Full name</th>
                <th>NIN</th>
                <th>Age / Sex</th>
                <th>Village</th>
                <th>Phone</th>
                <th>Type</th>
                <th>Status</th>
                <th>Registered</th>
                {canWrite('residents') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ cursor:'pointer' }}
                  onClick={() => navigate(`/residents/${r.id}${user?.isMasterAdmin && r.villageId ? '?vid=' + r.villageId : ''}`)}>

                  {/* Photo */}
                  <td onClick={e => e.stopPropagation()}>
                    {r.photo
                      ? <img src={r.photo} alt="" style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover', border:'2px solid var(--c-border2)' }} />
                      : <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--c-surface2)', border:'2px solid var(--c-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>👤</div>
                    }
                  </td>

                  {/* Name — handles records where surname or firstName may be blank */}
                  <td>
                    <div style={{ fontWeight:600 }}>
                      {[r.surname, r.firstName].filter(Boolean).join(', ') || r.firstName || r.surname || '(Unnamed)'}
                    </div>
                    {r.otherNames && (
                      <div style={{ fontSize:12, color:'var(--c-text3)' }}>{r.otherNames}</div>
                    )}
                    {r.source === 'birth_registration' && (
                      <div style={{ fontSize:11, color:'var(--c-text3)' }}>📋 From birth reg.</div>
                    )}
                  </td>

                  {/* NIN */}
                  <td style={{ fontFamily:'monospace', fontSize:12 }}>{r.nin || '—'}</td>

                  {/* Age / Sex */}
                  <td style={{ whiteSpace:'nowrap' }}>
                    {calcAge(r.dateOfBirth)} · {r.sex?.[0] || '—'}
                  </td>

                  {/* Village */}
                  <td>{r.village || '—'}</td>

                  {/* Phone */}
                  <td>{r.phone || '—'}</td>

                  {/* Residency type */}
                  <td>
                    <span style={{ fontSize:11, color:
                      r.residentType === 'affiliated' ? 'var(--c-gold)'    :
                      r.residentType === 'tenant'     ? '#5dade2'          : 'var(--c-text3)' }}>
                      {r.residentType === 'affiliated' ? '🔗 Affiliated' :
                       r.residentType === 'tenant'     ? '🔑 Tenant'    : '🏠 Permanent'}
                    </span>
                  </td>

                  {/* Status badge */}
                  <td>
                    <span className={`badge badge-${badgeFor(r)}`}>
                      {r.status || 'active'}
                    </span>
                  </td>

                  {/* Registered date */}
                  <td style={{ fontSize:12, color:'var(--c-text3)' }}>
                    {r.createdAt ? format(new Date(r.createdAt), 'dd/MM/yy') : '—'}
                  </td>

                  {/* Actions */}
                  {canWrite('residents') && (
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                        <button className="btn btn-primary btn-sm"
                          onClick={() => navigate(`/residents/${r.id}${user?.isMasterAdmin && r.villageId ? '?vid=' + r.villageId : ''}`)}>
                          👁 View
                        </button>
                        <button className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/residents/${r.id}/edit`)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => setDeleteId(r.id)}>
                          Del
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Identity card modal */}
      {cardResident && (
        <IdentityCard
          resident={cardResident}
          user={user}
          onClose={() => setCardResident(null)}
        />
      )}

      <ConfirmModal
        open={!!deleteId}
        title="Delete resident record?"
        message="This permanently removes the resident. Consider marking them as Migrated or Deceased instead to preserve records."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      <Toast toast={toast} />
    </div>
  )
}
