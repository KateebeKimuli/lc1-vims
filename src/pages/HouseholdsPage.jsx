/**
 * ============================================================
 * HOUSEHOLDSPAGE — src/pages/HouseholdsPage.jsx
 * ============================================================
 * Groups residents into family/household units. Links to residents table via headId.
 * ============================================================
 */

// ── HOUSEHOLDS PAGE ──────────────────────────────────────────────────────────
import { useToast, Toast }    from '../components/shared/Toast'
import { useVillageDB }           from '../db/villageDB'
import ConfirmModal              from '../components/shared/ConfirmModal'
import PageHeader                from '../components/shared/PageHeader'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import RichTextEditor from '../components/shared/RichTextEditor'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'
import { useAuth } from '../hooks/useAuth'

const EMPTY_HH = { householdNumber: '', headId: '', headName: '', village: '', zone: '', members: 0, type: 'nuclear', notes: '' }

export default function HouseholdsPage() {
  const db = useVillageDB()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState([])
  const [residents, setResidents] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_HH)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    const [hh, res] = await Promise.all([db.getAll('households'), db.getAll('residents')])
    setRecords(hh.sort((a, b) => (a.householdNumber || '').localeCompare(b.householdNumber || '')))
    setResidents(res)
  }

  function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  async function save() {
if (!form.headName.trim()) { showToast('Household head name is required', 'error'); return }
        try {
    const now = new Date().toISOString()
    const record = { ...form, id: editing || uuidv4(), createdAt: editing ? form.createdAt : now, updatedAt: now }
    if (editing) await db.put('households', record); else await db.add('households', record)
    showToast(editing ? 'Household updated' : 'Household added')
    setModal(false); setEditing(null); setForm(EMPTY_HH); load()
    } catch (err) {
      showToast('Error saving: ' + err.message, 'error')
    }
  }

  async function del(id) {
    await db.delete('households', id); showToast('Deleted'); load()
  }

  const filtered = records.filter(r => !search || `${r.householdNumber} ${r.headName} ${r.village}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Households</h1><div className="page-sub">{records.length} households</div></div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY_HH); setEditing(null); setModal(true) }}>+ Add household</button>
      </div>
      <input className="form-input" style={{ maxWidth: 320, marginBottom: 20 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="table-wrap">
        {filtered.length === 0 ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text3)' }}>No households yet.</div> : (
          <table><thead><tr><th>HH No.</th><th>Head of household</th><th>Village</th><th>Zone</th><th>Type</th><th>Members</th><th>Actions</th></tr></thead>
            <tbody>{filtered.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.householdNumber || '—'}</td>
                <td>{r.headName || '—'}</td><td>{r.village || '—'}</td><td>{r.zone || '—'}</td>
                <td>{r.type || '—'}</td><td>{r.members || 0}</td>
                <td><div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setForm({...EMPTY_HH, ...r}); setEditing(r.id); setModal(true) }}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>Del</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {modal && <div className="modal-overlay" onClick={() => setModal(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h2 style={{ marginBottom: 20 }}>{editing ? 'Edit household' : 'Add household'}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Household number</label><input className="form-input" value={form.householdNumber} onChange={e => setForm({ ...form, householdNumber: e.target.value })} placeholder="e.g. HH-001" /></div>
              <div className="form-group"><label className="form-label">Head of household</label>
                <select className="form-select" value={form.headId} onChange={e => { const r = residents.find(x => x.id === e.target.value); setForm({ ...form, headId: e.target.value, headName: r ? `${r.surname} ${r.firstName}` : '' }) }}>
                  <option value="">Select resident…</option>
                  {residents.map(r => <option key={r.id} value={r.id}>{r.surname} {r.firstName}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Village</label><input className="form-input" value={form.village} onChange={e => setForm({ ...form, village: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Zone / Cell</label><input className="form-input" value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {['nuclear','extended','single-parent','other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">No. of members</label><input className="form-input" type="number" inputMode="numeric" min="1" max="99" value={form.members} onChange={e => setForm({ ...form, members: +e.target.value })} /></div>
            </div>
            <RichTextEditor label="Notes" value={form.notes} onChange={html => setForm(prev => ({...prev, notes: html}))} minHeight={80} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>}
      {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </div>
  )
}
