/**
 * ============================================================
 * BUSINESSES PAGE — src/pages/BusinessesPage.jsx
 * ============================================================
 * Village-level business and enterprise registration.
 * The LC1 office is the first point of contact for any business
 * operating within the village. This module allows officials to:
 *
 *   - Register businesses and their owners
 *   - Track operating status (active, closed, suspended)
 *   - Record business type and physical location
 *   - Issue basic LC1 business support letters
 *   - Link owners to their resident record
 *
 * Data from this module feeds into district revenue reporting
 * and market surveys by UBOS.
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

// ── Business category options ──────────────────────────────────────────────
const BIZ_TYPES = [
  'Retail shop / Duuka',
  'Restaurant / Food',
  'Salon / Barbershop',
  'Pharmacy / Drug shop',
  'Hardware / Construction',
  'Transport / Boda-boda stage',
  'Agri-business / Farm produce',
  'Clinic / Health facility',
  'School / Tutoring',
  'Workshop / Repairs',
  'Bar / Entertainment',
  'Market vendor / Stall',
  'Mobile money agent',
  'Contractor / Builder',
  'Other'
]

// ── Blank form template ────────────────────────────────────────────────────
const EMPTY = {
  businessName:  '',
  type:          '',
  ownerId:       '',
  ownerName:     '',
  phone:         '',
  location:      '',    // physical address within village
  village:       '',
  registrationNo:'',    // URSB or local reference number
  startDate:     '',
  employees:     '',    // number of employees
  status:        'active',
  notes:         '',
}

export default function BusinessesPage() {
  const db = useVillageDB()
  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [records,    setRecords]   = useState([])
  const [residents,  setResidents] = useState([])
  const [modal,      setModal]     = useState(false)
  const [form,       setForm]      = useState(EMPTY)
  const [editing,    setEditing]   = useState(null)
  const [deleteId,   setDeleteId]  = useState(null)
  const [search,     setSearch]    = useState('')
  const [typeFilter, setTypeFilter]= useState('all')

  const { toast, showToast } = useToast()

  // ── Load data on mount ─────────────────────────────────────────────────────
  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    const [biz, res] = await Promise.all([
      db.getAll('businesses'),
      db.getAll('residents')
    ])
    setRecords(biz.sort((a, b) => (a.businessName || '').localeCompare(b.businessName || '')))
    setResidents(res)
  }

  // ── Open form for new record ───────────────────────────────────────────────
  function openNew() {
    setForm({ ...EMPTY, startDate: new Date().toISOString().slice(0, 10) })
    setEditing(null)
    setModal(true)
  }

  // ── Save handler (create or update) ───────────────────────────────────────
  async function save() {
    if (!form.businessName.trim()) { showToast('Business name is required', 'error'); return }
    if (!form.type)                { showToast('Business type is required', 'error'); return }

    const now    = new Date().toISOString()
    const record = {
      ...form,
      id:        editing || uuidv4(),
      createdAt: editing ? form.createdAt : now,
      updatedAt: now,
    }

    try {
      if (editing) await db.put('businesses', record)
      else         await db.add('businesses', record)
      showToast(editing ? 'Business updated' : 'Business registered')
      setModal(false); setEditing(null); setForm(EMPTY); load()
    } catch (err) {
      showToast('Error: ' + err.message, 'error')
    }
  }

  // ── Delete handler ─────────────────────────────────────────────────────────
  async function confirmDelete() {
    await db.delete('businesses', deleteId)
    showToast('Business removed')
    setDeleteId(null); load()
  }

  // ── Auto-fill owner name when resident is selected ─────────────────────────
  function handleOwnerSelect(e) {
    const id = e.target.value
    const r  = residents.find(x => x.id === id)
    setForm({
      ...form,
      ownerId:   id,
      ownerName: r ? `${r.surname} ${r.firstName}` : '',
      phone:     r?.phone || form.phone,
    })
  }

  // ── Filter logic ──────────────────────────────────────────────────────────
  const filtered = records
    .filter(r => typeFilter === 'all' || r.type === typeFilter)
    .filter(r => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (r.businessName || '').toLowerCase().includes(q) ||
        (r.ownerName    || '').toLowerCase().includes(q) ||
        (r.location     || '').toLowerCase().includes(q)
      )
    })

  // ── Summary counts ────────────────────────────────────────────────────────
  const activeCount = records.filter(r => r.status === 'active').length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">

      <PageHeader
        title="Businesses"
        sub={`${activeCount} active · ${records.length} total registered`}
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            + Register business
          </button>
        }
      />

      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { label:'Total registered', value: records.length,  color:'var(--c-green-xl)' },
          { label:'Active',           value: activeCount,      color:'#00b894' },
          { label:'Closed / inactive',value: records.filter(r=>r.status!=='active').length, color:'var(--c-text3)' },
          { label:'Business types',   value: new Set(records.map(r=>r.type)).size, color:'#5dade2' },
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
          style={{ maxWidth: 260 }}
          placeholder="Search business or owner…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-select"
          style={{ width: 210 }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="all">All types</option>
          {BIZ_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
            <div className="table-wrap">
        {filtered.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--c-text3)' }}>
            {records.length === 0
              ? 'No businesses registered yet.'
              : 'No businesses match your search.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Business name</th>
                <th>Type</th>
                <th>Owner</th>
                <th>Phone</th>
                <th>Location</th>
                <th>Employees</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight:600 }}>{r.businessName}</td>
                  <td style={{ fontSize:13 }}>{r.type || '—'}</td>
                  <td>{r.ownerName || '—'}</td>
                  <td>{r.phone || '—'}</td>
                  <td>{r.location || '—'}</td>
                  <td>{r.employees || '—'}</td>
                  <td>
                    <span className={`badge badge-${
                      r.status === 'active' ? 'green' :
                      r.status === 'suspended' ? 'red' : 'gray'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
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

      {/* Add/Edit modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom:20 }}>
              {editing ? 'Edit business' : 'Register business'}
            </h2>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Business name and type */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Business name *</label>
                  <input className="form-input" value={form.businessName} onChange={e => setForm({...form, businessName: e.target.value})} placeholder="e.g. Mama Rose Shop" />
                </div>
                <div className="form-group">
                  <label className="form-label">Business type *</label>
                  <select className="form-select" value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option value="">Select type…</option>
                    {BIZ_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Owner selection */}
              <div className="form-group">
                <label className="form-label">Owner (select registered resident)</label>
                <select className="form-select" value={form.ownerId} onChange={handleOwnerSelect}>
                  <option value="">Select resident…</option>
                  {residents.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.surname} {r.firstName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contact and location */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="07XXXXXXXX" />
                </div>
                <div className="form-group">
                  <label className="form-label">Number of employees</label>
                  <input className="form-input" type="number" inputMode="numeric" min="0" max="9999" value={form.employees} onChange={e => setForm({...form, employees: e.target.value})} />
                </div>
              </div>

              {/* Address */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Physical location / address</label>
                  <input className="form-input" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Zone, plot, street" />
                </div>
                <div className="form-group">
                  <label className="form-label">Village</label>
                  <input className="form-input" value={form.village} onChange={e => setForm({...form, village: e.target.value})} />
                </div>
              </div>

              {/* Registration and dates */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Registration / permit number</label>
                  <input className="form-input" value={form.registrationNo} onChange={e => setForm({...form, registrationNo: e.target.value})} placeholder="URSB or local ref" />
                </div>
                <div className="form-group">
                  <label className="form-label">Date started</label>
                  <input className="form-input" type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
                </div>
              </div>

              {/* Status */}
              <div className="form-group">
                <label className="form-label">Operating status</label>
                <select className="form-select" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                  <option value="active">Active / Operating</option>
                  <option value="suspended">Suspended</option>
                  <option value="closed">Closed / Defunct</option>
                  <option value="pending">Pending registration</option>
                </select>
              </div>

              {/* Notes */}
              <RichTextEditor label="Notes" value={form.notes} onChange={html => setForm(prev => ({...prev, notes: html}))} placeholder="Any additional notes about this business…" minHeight={80} />

            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>
                {editing ? 'Save changes' : 'Register business'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title="Delete business record?"
        message="This will permanently remove this business registration."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <Toast toast={toast} />
    </div>
  )
}
