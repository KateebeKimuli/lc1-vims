/**
 * ============================================================
 * CASESPAGE — src/pages/CasesPage.jsx
 * ============================================================
 * Community dispute and arbitration records. Tracks cases from filing through hearing to resolution. Auto-generates case numbers.
 * ============================================================
 */

import { useToast, Toast }    from '../components/shared/Toast'
import { useVillageDB }           from '../db/villageDB'
import ConfirmModal              from '../components/shared/ConfirmModal'
import PageHeader                from '../components/shared/PageHeader'
import { useState, useEffect } from 'react'
import RichTextEditor from '../components/shared/RichTextEditor'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'

const CATS = ['Land dispute','Domestic violence','Noise/Nuisance','Theft','Assault','Debt/Loan','Family dispute','Child neglect','Property damage','Business dispute','Other']
const EMPTY = { caseNumber: '', category: '', complainantId: '', complainantName: '', respondentName: '', description: '', status: 'open', priority: 'normal', dateReported: '', resolutionNotes: '', hearingDate: '' }

let caseSeq = 1

export default function CasesPage() {
  const db = useVillageDB()
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState([])
  const [residents, setResidents] = useState([])
  const [modal, setModal] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [toast, setToast] = useState(null)

  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    const [cases, res] = await Promise.all([db.getAll('cases'), db.getAll('residents')])
    setRecords(cases.sort((a, b) => new Date(b.dateReported || b.createdAt) - new Date(a.dateReported || a.createdAt)))
    setResidents(res)
    caseSeq = cases.length + 1
  }

  function showToast(msg, type='success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  async function save() {
    if (!form.category) { showToast('Category is required', 'error'); return }
    if (!form.complainantName.trim()) { showToast('Complainant name is required', 'error'); return }
    const now = new Date().toISOString()
    const caseNum = form.caseNumber || `CASE-${String(caseSeq).padStart(4,'0')}-${new Date().getFullYear()}`
    const record = { ...form, caseNumber: caseNum, id: editing || uuidv4(), createdAt: editing ? form.createdAt : now, updatedAt: now }
    try {
      if (editing) await db.put('cases', record); else await db.add('cases', record)
      showToast(editing ? 'Case updated' : 'Case registered'); setModal(false); setEditing(null); setForm(EMPTY); load()
    } catch(e) { showToast(e.message, 'error') }
  }

  async function del(id) { await db.delete('cases', id); showToast('Deleted'); load() }

  const filtered = records
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => !search || `${r.caseNumber} ${r.complainantName} ${r.respondentName} ${r.category}`.toLowerCase().includes(search.toLowerCase()))

  const statusColor = { open:'red', 'in-progress':'gold', resolved:'green', closed:'gray', withdrawn:'blue' }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Cases & Disputes</h1><div className="page-sub">{records.filter(r=>r.status==='open').length} open · {records.length} total</div></div>
        <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY, dateReported: new Date().toISOString().slice(0,10) }); setEditing(null); setModal(true) }}>+ New case</button>
      </div>
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <input className="form-input" style={{ maxWidth:280 }} placeholder="Search cases…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-select" style={{ width:160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All status</option>
          {['open','in-progress','resolved','closed','withdrawn'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
            <div className="table-wrap">
        {filtered.length === 0 ? <div style={{ padding:48, textAlign:'center', color:'var(--c-text3)' }}>No cases found.</div> : (
          <table><thead><tr><th>Case No.</th><th>Category</th><th>Complainant</th><th>Respondent</th><th>Date</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{filtered.map(r => (
              <tr key={r.id} style={{ cursor:'pointer' }} onClick={() => setViewing(r)}>
                <td style={{ fontFamily:'monospace', fontWeight:600 }}>{r.caseNumber}</td>
                <td>{r.category || '—'}</td>
                <td>{r.complainantName || '—'}</td>
                <td>{r.respondentName || '—'}</td>
                <td style={{ fontSize:12, color:'var(--c-text3)' }}>{r.dateReported ? format(new Date(r.dateReported),'dd/MM/yyyy') : '—'}</td>
                <td><span className={`badge badge-${r.priority==='urgent'?'red':r.priority==='high'?'gold':'gray'}`}>{r.priority||'normal'}</span></td>
                <td><span className={`badge badge-${statusColor[r.status]||'gray'}`}>{r.status}</span></td>
                <td onClick={e => e.stopPropagation()}><div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setForm({...EMPTY, ...r}); setEditing(r.id); setModal(true) }}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>Del</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {/* Case detail view */}
      {viewing && <div className="modal-overlay" onClick={() => setViewing(null)}>
        <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
            <div>
              <div style={{ fontFamily:'monospace', fontSize:13, color:'var(--c-text3)', marginBottom:4 }}>{viewing.caseNumber}</div>
              <h2>{viewing.category}</h2>
            </div>
            <span className={`badge badge-${statusColor[viewing.status]||'gray'}`} style={{ fontSize:14, padding:'6px 16px' }}>{viewing.status}</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 24px', marginBottom:20 }}>
            {[['Complainant',viewing.complainantName||'—'],['Respondent',viewing.respondentName||'—'],['Date reported',viewing.dateReported?format(new Date(viewing.dateReported),'dd MMMM yyyy'):'—'],['Hearing date',viewing.hearingDate?format(new Date(viewing.hearingDate),'dd MMMM yyyy'):'—'],['Priority',viewing.priority||'—']].map(([k,v])=>(
              <div key={k}><div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:2 }}>{k}</div><div style={{ fontWeight:500 }}>{v}</div></div>
            ))}
          </div>
          {viewing.description && <div style={{ marginBottom:16 }}><div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:4 }}>Description</div><div className="rich-content" dangerouslySetInnerHTML={{ __html: viewing.description }} /></div>}
          {viewing.resolutionNotes && <div><div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:4 }}>Resolution notes</div><div className="rich-content" dangerouslySetInnerHTML={{ __html: viewing.resolutionNotes }} /></div>}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:24 }}>
            <button className="btn btn-secondary" onClick={() => setViewing(null)}>Close</button>
            <button className="btn btn-primary" onClick={() => { setForm(viewing); setEditing(viewing.id); setViewing(null); setModal(true) }}>Edit case</button>
          </div>
        </div>
      </div>}

      {/* Form modal */}
      {modal && <div className="modal-overlay" onClick={() => setModal(false)}>
        <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
          <h2 style={{ marginBottom:20 }}>{editing ? 'Edit case' : 'Register new case'}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Category *</label>
                <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="">Select…</option>{CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Date reported</label><input className="form-input" type="date" value={form.dateReported} onChange={e => setForm({ ...form, dateReported: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Complainant</label>
                <select className="form-select" value={form.complainantId} onChange={e => { const r=residents.find(x=>x.id===e.target.value); setForm({ ...form, complainantId: e.target.value, complainantName: r?`${r.surname} ${r.firstName}`:'' }) }}>
                  <option value="">Select resident…</option>{residents.map(r=><option key={r.id} value={r.id}>{r.surname} {r.firstName}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Respondent name</label><input className="form-input" value={form.respondentName} onChange={e => setForm({ ...form, respondentName: e.target.value })} placeholder="Name or 'Unknown'" /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Priority</label>
                <select className="form-select" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  {['normal','high','urgent'].map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {['open','in-progress','resolved','closed','withdrawn'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Hearing date</label><input className="form-input" type="date" value={form.hearingDate} onChange={e => setForm({ ...form, hearingDate: e.target.value })} /></div>
            <RichTextEditor label="Description" value={form.description} onChange={html => setForm(prev => ({...prev, description: html}))} placeholder="Describe the case in full…" minHeight={100} />
            <RichTextEditor label="Resolution notes" value={form.resolutionNotes} onChange={html => setForm(prev => ({...prev, resolutionNotes: html}))} placeholder="How was this resolved? (fill when case is resolved)" minHeight={100} />
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save case</button>
          </div>
        </div>
      </div>}
      {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </div>
  )
}
