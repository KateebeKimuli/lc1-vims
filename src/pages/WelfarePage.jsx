/**
 * ============================================================
 * WELFARE & PDM PAGE — src/pages/WelfarePage.jsx
 * ============================================================
 * Manages village-level welfare and social protection records.
 * Covers the Parish Development Model (PDM) — Uganda's flagship
 * programme that channels UGX 100M per parish for enterprise
 * development — as well as other programmes:
 *
 *   PDM        — Parish Development Model beneficiaries
 *   OVC        — Orphans and Vulnerable Children
 *   Elderly    — Senior citizen support programmes
 *   Disability — People with disabilities support
 *   SAGE       — Social Assistance Grants for Empowerment
 *   YLP        — Youth Livelihood Programme
 *   UWEP       — Uganda Women Empowerment Project
 *
 * This module helps LC1 officials track who receives support,
 * prevent duplicate beneficiaries, and report to higher levels.
 * ============================================================
 */

import { useState, useEffect }    from 'react'
import { useVillageDB }           from '../db/villageDB'
import RichTextEditor from '../components/shared/RichTextEditor'
import { v4 as uuidv4 }           from 'uuid'
import { format }                 from 'date-fns'
import { useToast, Toast }        from '../components/shared/Toast'
import ConfirmModal               from '../components/shared/ConfirmModal'
import PageHeader                 from '../components/shared/PageHeader'

// ── Programme type options ─────────────────────────────────────────────────
const PROGRAMME_TYPES = [
  'PDM - Parish Development Model',
  'OVC - Orphans & Vulnerable Children',
  'Elderly support',
  'Disability support',
  'SAGE - Social Assistance Grant',
  'YLP - Youth Livelihood Programme',
  'UWEP - Women Empowerment',
  'School bursary',
  'Other'
]

// ── Status options ─────────────────────────────────────────────────────────
const STATUSES = ['active', 'completed', 'suspended', 'pending verification']

// ── Blank form template ────────────────────────────────────────────────────
const EMPTY = {
  residentId:    '',
  residentName:  '',
  programType:   '',
  groupName:     '',        // PDM group/SACCO name if applicable
  amountUGX:     '',        // Amount allocated in UGX (for PDM)
  startDate:     '',
  endDate:       '',
  status:        'active',
  verifiedBy:    '',        // Name of verifying official
  notes:         '',
}

export default function WelfarePage() {
  const db = useVillageDB()
  // ── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [records,   setRecords]   = useState([])   // all welfare records
  const [residents, setResidents] = useState([])   // for the resident dropdown
  const [modal,     setModal]     = useState(false) // add/edit modal open?
  const [form,      setForm]      = useState(EMPTY)
  const [editing,   setEditing]   = useState(null)  // id of record being edited, or null
  const [deleteId,  setDeleteId]  = useState(null)  // id pending deletion confirmation
  const [search,    setSearch]    = useState('')
  const [typeFilter,setTypeFilter]= useState('all')

  const { toast, showToast } = useToast()

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    const [welfare, res] = await Promise.all([
      db.getAll('welfare'),
      db.getAll('residents')
    ])
    // Sort by most recently added
    setRecords(welfare.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
    setResidents(res)
  }

  // ── Open the form for a new record ────────────────────────────────────────
  function openNew() {
    setForm({ ...EMPTY, startDate: new Date().toISOString().slice(0, 10) })
    setEditing(null)
    setModal(true)
  }

  // ── Open the form to edit an existing record ───────────────────────────────
  function openEdit(record) {
    setForm({...EMPTY, ...record})
    setEditing(record.id)
    setModal(true)
  }

  // ── Save (create or update) ────────────────────────────────────────────────
  async function save() {
    // Basic validation
    if (!form.residentId) { showToast('Please select a resident', 'error'); return }
    if (!form.programType) { showToast('Please select a programme type', 'error'); return }

    const now    = new Date().toISOString()
    const record = {
      ...form,
      id:        editing || uuidv4(),
      createdAt: editing ? form.createdAt : now,
      updatedAt: now,
    }

    try {
      if (editing) {
        await db.put('welfare', record)
        showToast('Welfare record updated')
      } else {
        await db.add('welfare', record)
        showToast('Beneficiary registered')
      }
      setModal(false)
      setEditing(null)
      setForm(EMPTY)
      load()
    } catch (err) {
      showToast('Error saving: ' + err.message, 'error')
    }
  }

  // ── Delete a record ────────────────────────────────────────────────────────
  async function confirmDelete() {
    await db.delete('welfare', deleteId)
    showToast('Record deleted')
    setDeleteId(null)
    load()
  }

  // ── When a resident is selected from the dropdown, auto-fill their name ───
  function handleResidentSelect(e) {
    const id = e.target.value
    const r  = residents.find(x => x.id === id)
    setForm({
      ...form,
      residentId:   id,
      residentName: r ? `${r.surname} ${r.firstName}` : ''
    })
  }

  // ── Filter records based on search text and programme type ────────────────
  const filtered = records
    .filter(r => typeFilter === 'all' || r.programType?.startsWith(typeFilter.split(' ')[0]))
    .filter(r => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (r.residentName || '').toLowerCase().includes(q) ||
        (r.programType  || '').toLowerCase().includes(q) ||
        (r.groupName    || '').toLowerCase().includes(q)
      )
    })

  // ── Count active PDM beneficiaries for the summary bar ────────────────────
  const pdmCount    = records.filter(r => r.programType?.startsWith('PDM') && r.status === 'active').length
  const activeCount = records.filter(r => r.status === 'active').length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">

      {/* ── Page header ── */}
      <PageHeader
        title="Welfare & PDM"
        sub={`${activeCount} active beneficiaries · ${pdmCount} PDM`}
        actions={
          <button className="btn btn-primary" onClick={openNew}>
            + Add beneficiary
          </button>
        }
      />

      {/* ── Summary stat cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { label: 'Total beneficiaries', value: records.length,  color: 'var(--c-green-xl)' },
          { label: 'Active',              value: activeCount,      color: '#fdcb6e' },
          { label: 'PDM beneficiaries',   value: pdmCount,         color: '#a29bfe' },
          { label: 'Programmes running',  value: new Set(records.map(r => r.programType)).size, color: '#5dade2' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-num" style={{ color: s.color, fontSize: 28 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <input
          className="form-input"
          style={{ maxWidth: 280 }}
          placeholder="Search by name, programme…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-select"
          style={{ width: 220 }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="all">All programmes</option>
          {PROGRAMME_TYPES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* ── Records table ── */}
            <div className="table-wrap">
        {filtered.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--c-text3)' }}>
            {records.length === 0
              ? 'No welfare records yet. Add the first beneficiary.'
              : 'No records match your search.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Beneficiary</th>
                <th>Programme</th>
                <th>Group / SACCO</th>
                <th>Amount (UGX)</th>
                <th>Start date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.residentName || '—'}</td>
                  <td style={{ fontSize: 13 }}>{r.programType || '—'}</td>
                  <td>{r.groupName || '—'}</td>
                  {/* Format amount with comma separator if present */}
                  <td>
                    {r.amountUGX
                      ? Number(r.amountUGX).toLocaleString()
                      : '—'}
                  </td>
                  <td style={{ fontSize:12, color:'var(--c-text3)' }}>
                    {r.startDate ? format(new Date(r.startDate), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td>
                    <span className={`badge badge-${
                      r.status === 'active'    ? 'green' :
                      r.status === 'completed' ? 'blue'  :
                      r.status === 'suspended' ? 'red'   : 'gold'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(r.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add / Edit modal ── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 20 }}>
              {editing ? 'Edit welfare record' : 'Register beneficiary'}
            </h2>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Resident selection */}
              <div className="form-group">
                <label className="form-label">Resident / Beneficiary *</label>
                <select className="form-select" value={form.residentId} onChange={handleResidentSelect}>
                  <option value="">Select registered resident…</option>
                  {residents.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.surname} {r.firstName} {r.nin ? `(${r.nin})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Programme type and status */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Programme type *</label>
                  <select className="form-select" value={form.programType} onChange={e => setForm({ ...form, programType: e.target.value })}>
                    <option value="">Select programme…</option>
                    {PROGRAMME_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Group name and amount */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Group / SACCO name</label>
                  <input
                    className="form-input"
                    value={form.groupName}
                    onChange={e => setForm({ ...form, groupName: e.target.value })}
                    placeholder="e.g. Kyanja Farmers SACCO"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount allocated (UGX)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={form.amountUGX}
                    onChange={e => setForm({ ...form, amountUGX: e.target.value })}
                    inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 1000000"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start date</label>
                  <input className="form-input" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">End date (if applicable)</label>
                  <input className="form-input" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>

              {/* Verified by */}
              <div className="form-group">
                <label className="form-label">Verified / approved by</label>
                <input
                  className="form-input"
                  value={form.verifiedBy}
                  onChange={e => setForm({ ...form, verifiedBy: e.target.value })}
                  placeholder="Name of approving official"
                />
              </div>

              {/* Notes */}
              <RichTextEditor label="Notes" value={form.notes} onChange={html => setForm(prev => ({...prev, notes: html}))} placeholder="Any additional context…" minHeight={80} />

            </div>

            {/* Modal action buttons */}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>
                {editing ? 'Save changes' : 'Register beneficiary'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      <ConfirmModal
        open={!!deleteId}
        title="Delete welfare record?"
        message="This will permanently remove this beneficiary record."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* ── Toast notifications ── */}
      <Toast toast={toast} />
    </div>
  )
}
