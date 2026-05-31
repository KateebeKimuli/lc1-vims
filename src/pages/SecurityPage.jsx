/**
 * ============================================================
 * SECURITY INCIDENTS PAGE — src/pages/SecurityPage.jsx
 * ============================================================
 * Records security incidents and crime reports at the village level.
 * The LC1 is the first line of response for community security
 * before escalation to police or higher authorities.
 *
 * This module allows officials to:
 *   - Log incidents as they are reported
 *   - Track escalation to police (with OB / Police reference number)
 *   - Monitor incident trends by type and location
 *   - Provide data to the District Security Committee
 *
 * Incident types covered:
 *   Theft | Assault | Domestic violence | Land invasion |
 *   Suspected theft | Mob justice | Vandalism | Other
 * ============================================================
 */

import { useState, useEffect }           from 'react'
import { useVillageDB }           from '../db/villageDB'
import RichTextEditor from '../components/shared/RichTextEditor'
import { v4 as uuidv4 }                  from 'uuid'
import { format }                        from 'date-fns'
import { useToast, Toast }               from '../components/shared/Toast'
import ConfirmModal                      from '../components/shared/ConfirmModal'
import PageHeader                        from '../components/shared/PageHeader'

// ── Incident type options ──────────────────────────────────────────────────
const INCIDENT_TYPES = [
  'Theft / Burglary',
  'Assault / Fighting',
  'Domestic violence',
  'Land invasion / Trespass',
  'Mob justice / Lynching',
  'Vandalism / Property damage',
  'Suspected criminal activity',
  'Threatening / Harassment',
  'Fraud / Swindling',
  'Missing person',
  'Found property / Person',
  'Other'
]

// ── Blank form ─────────────────────────────────────────────────────────────
const EMPTY = {
  type:           '',
  dateOccurred:   '',
  timeOccurred:   '',
  location:       '',        // where in the village it happened
  reportedBy:     '',        // name of person who reported
  reportedById:   '',        // link to resident record (optional)
  description:    '',        // full narrative of what happened
  suspectInfo:    '',        // any info about suspect(s)
  victimInfo:     '',        // victim name(s)
  escalated:      false,     // was it referred to police?
  policeStation:  '',        // which police station
  obNumber:       '',        // Police Occurrence Book reference
  status:         'open',    // open | under investigation | closed
  resolution:     '',        // outcome or action taken
}

export default function SecurityPage() {
  const db = useVillageDB()
  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [records,   setRecords]   = useState([])
  const [residents, setResidents] = useState([])
  const [modal,     setModal]     = useState(false)
  const [viewing,   setViewing]   = useState(null)  // record being viewed in detail
  const [form,      setForm]      = useState(EMPTY)
  const [editing,   setEditing]   = useState(null)
  const [deleteId,  setDeleteId]  = useState(null)
  const [search,    setSearch]    = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const { toast, showToast } = useToast()

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    const [sec, res] = await Promise.all([
      db.getAll('security'),
      db.getAll('residents')
    ])
    // Newest incidents first
    setRecords(sec.sort((a, b) => new Date(b.dateOccurred || b.createdAt) - new Date(a.dateOccurred || a.createdAt)))
    setResidents(res)
  }

  // ── Open new incident form ─────────────────────────────────────────────────
  function openNew() {
    setForm({
      ...EMPTY,
      dateOccurred: new Date().toISOString().slice(0, 10)
    })
    setEditing(null)
    setModal(true)
  }

  // ── Save incident ──────────────────────────────────────────────────────────
  async function save() {
    if (!form.type)          { showToast('Incident type is required', 'error'); return }
    if (!form.dateOccurred)  { showToast('Date occurred is required', 'error'); return }
    if (!form.description)   { showToast('Please provide a description', 'error'); return }

    const now    = new Date().toISOString()
    const record = {
      ...form,
      id:        editing || uuidv4(),
      createdAt: editing ? form.createdAt : now,
      updatedAt: now,
    }

    try {
      if (editing) await db.put('security', record)
      else         await db.add('security', record)
      showToast(editing ? 'Incident updated' : 'Incident logged')
      setModal(false); setEditing(null); setForm(EMPTY); load()
    } catch (err) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  // ── Delete incident ────────────────────────────────────────────────────────
  async function confirmDelete() {
    await db.delete('security', deleteId)
    showToast('Incident deleted')
    setDeleteId(null); load()
  }

  // ── Filter logic ───────────────────────────────────────────────────────────
  const filtered = records
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (r.type         || '').toLowerCase().includes(q) ||
        (r.location     || '').toLowerCase().includes(q) ||
        (r.reportedBy   || '').toLowerCase().includes(q) ||
        (r.description  || '').toLowerCase().includes(q)
      )
    })

  // ── Priority colour for incident types ────────────────────────────────────
  const typeColor = {
    'open':                 'red',
    'under investigation':  'gold',
    'closed':               'green',
  }

  // ── Summary counts ─────────────────────────────────────────────────────────
  const openCount      = records.filter(r => r.status === 'open').length
  const escalatedCount = records.filter(r => r.escalated).length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">

      <PageHeader
        title="Security Incidents"
        sub={`${openCount} open · ${records.length} total logged`}
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            + Log incident
          </button>
        }
      />

      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { label:'Total incidents',  value: records.length,  color:'var(--c-text2)' },
          { label:'Open / Active',    value: openCount,        color:'var(--c-red-l)' },
          { label:'Referred to police',value:escalatedCount,  color:'#5dade2' },
          { label:'Resolved',         value: records.filter(r=>r.status==='closed').length, color:'var(--c-green-xl)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-num" style={{ color:s.color, fontSize:28 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <input
          className="form-input"
          style={{ maxWidth: 280 }}
          placeholder="Search incidents…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-select"
          style={{ width:180 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="under investigation">Under investigation</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Table */}
            <div className="table-wrap">
        {filtered.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--c-text3)' }}>
            No incidents logged.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Location</th>
                <th>Reported by</th>
                <th>Escalated</th>
                <th>OB Number</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ cursor:'pointer' }} onClick={() => setViewing(r)}>
                  <td style={{ fontSize:13 }}>
                    {r.dateOccurred ? format(new Date(r.dateOccurred), 'dd/MM/yyyy') : '—'}
                    {r.timeOccurred && <span style={{ color:'var(--c-text3)', marginLeft:6 }}>{r.timeOccurred}</span>}
                  </td>
                  <td style={{ fontWeight:500 }}>{r.type || '—'}</td>
                  <td>{r.location || '—'}</td>
                  <td>{r.reportedBy || '—'}</td>
                  <td>
                    {r.escalated
                      ? <span className="badge badge-blue">✓ Referred</span>
                      : <span className="badge badge-gray">No</span>}
                  </td>
                  <td style={{ fontFamily:'monospace', fontSize:12 }}>{r.obNumber || '—'}</td>
                  <td>
                    <span className={`badge badge-${typeColor[r.status] || 'gray'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setForm({...EMPTY, ...r}); setEditing(r.id); setModal(true) }}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(r.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail view modal */}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:4 }}>
                  {viewing.dateOccurred ? format(new Date(viewing.dateOccurred), 'dd MMMM yyyy') : ''} {viewing.timeOccurred}
                </div>
                <h2 style={{ marginBottom:4 }}>{viewing.type}</h2>
                <span className="badge badge-gray">{viewing.location}</span>
              </div>
              <span className={`badge badge-${typeColor[viewing.status] || 'gray'}`} style={{ fontSize:13, padding:'6px 16px' }}>
                {viewing.status}
              </span>
            </div>

            {/* Key details grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 24px', marginBottom:16 }}>
              {[
                ['Reported by', viewing.reportedBy],
                ['Suspect info', viewing.suspectInfo],
                ['Victim info',  viewing.victimInfo],
                ['Police station', viewing.policeStation],
                ['OB Number', viewing.obNumber],
                ['Escalated to police', viewing.escalated ? 'Yes' : 'No'],
              ].filter(([,v]) => v).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:2 }}>{k}</div>
                  <div style={{ fontWeight:500 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            {viewing.description && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:4 }}>Description</div>
                <div className="rich-content" dangerouslySetInnerHTML={{ __html: viewing.description }} />
              </div>
            )}

            {/* Resolution */}
            {viewing.resolution && (
              <div style={{ background:'rgba(45,122,79,0.1)', borderRadius:8, padding:'12px 16px' }}>
                <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:4 }}>Resolution / Action taken</div>
                <div className="rich-content" dangerouslySetInnerHTML={{ __html: viewing.resolution }} />
              </div>
            )}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn btn-secondary" onClick={() => setViewing(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => {
                setForm(viewing); setEditing(viewing.id); setViewing(null); setModal(true)
              }}>
                Edit incident
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit form modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom:20 }}>
              {editing ? 'Edit incident' : 'Log security incident'}
            </h2>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Type, date, time */}
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Incident type *</label>
                  <select className="form-select" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option value="">Select…</option>
                    {INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date occurred *</label>
                  <input className="form-input" type="date" value={form.dateOccurred} onChange={e => setForm({...form, dateOccurred: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Time (approx.)</label>
                  <input className="form-input" type="time" value={form.timeOccurred} onChange={e => setForm({...form, timeOccurred: e.target.value})} />
                </div>
              </div>

              {/* Location and reported by */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Location in village</label>
                  <input className="form-input" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Zone, street, landmark" />
                </div>
                <div className="form-group">
                  <label className="form-label">Reported by</label>
                  <input className="form-input" value={form.reportedBy} onChange={e => setForm({...form, reportedBy: e.target.value})} placeholder="Name of reporting person" />
                </div>
              </div>

              {/* Victim and suspect */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Victim(s)</label>
                  <input className="form-input" value={form.victimInfo} onChange={e => setForm({...form, victimInfo: e.target.value})} placeholder="Name or description" />
                </div>
                <div className="form-group">
                  <label className="form-label">Suspect info</label>
                  <input className="form-input" value={form.suspectInfo} onChange={e => setForm({...form, suspectInfo: e.target.value})} placeholder="Name, description, or unknown" />
                </div>
              </div>

              {/* Full description */}
              <RichTextEditor
                label="Description *"
                value={form.description}
                onChange={html => setForm(prev => ({...prev, description: html}))}
                placeholder="Full narrative of what happened…"
                minHeight={120}
                required
              />

              {/* Police escalation */}
              <div className="card" style={{ background:'var(--c-surface2)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <input
                    type="checkbox"
                    id="escalated"
                    checked={form.escalated}
                    onChange={e => setForm({...form, escalated: e.target.checked})}
                    style={{ width:18, height:18, cursor:'pointer' }}
                  />
                  <label htmlFor="escalated" style={{ fontWeight:500, cursor:'pointer' }}>
                    Referred / escalated to police
                  </label>
                </div>
                {form.escalated && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Police station</label>
                      <input className="form-input" value={form.policeStation} onChange={e => setForm({...form, policeStation: e.target.value})} placeholder="e.g. Kyanja Police Post" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">OB / Reference number</label>
                      <input className="form-input" value={form.obNumber} onChange={e => setForm({...form, obNumber: e.target.value})} placeholder="e.g. OB 12/2024" />
                    </div>
                  </div>
                )}
              </div>

              {/* Status and resolution */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="open">Open</option>
                    <option value="under investigation">Under investigation</option>
                    <option value="closed">Closed / Resolved</option>
                  </select>
                </div>
              </div>

                <RichTextEditor
                label="Resolution / Action taken"
                value={form.resolution}
                onChange={html => setForm(prev => ({...prev, resolution: html}))}
                placeholder="What action was taken? What was the outcome?"
                minHeight={100}
              />

            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>
                {editing ? 'Save changes' : 'Log incident'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title="Delete incident record?"
        message="This will permanently remove this security incident record."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <Toast toast={toast} />
    </div>
  )
}
