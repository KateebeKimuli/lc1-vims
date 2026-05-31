/**
 * ============================================================
 * MEETINGSPAGE — src/pages/MeetingsPage.jsx
 * ============================================================
 * LC1 council meeting records. Stores agenda, minutes, attendance, and resolutions for every meeting.
 * ============================================================
 */

// ── MEETINGS PAGE ─────────────────────────────────────────────────────────────
import { useToast, Toast }    from '../components/shared/Toast'
import { useVillageDB }           from '../db/villageDB'
import ConfirmModal              from '../components/shared/ConfirmModal'
import PageHeader                from '../components/shared/PageHeader'
import { useState, useEffect } from 'react'
import RichTextEditor from '../components/shared/RichTextEditor'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'

const EMPTY_MTG = { type: 'general', date: '', time: '', venue: '', agenda: '', minutes: '', attendance: '', chairperson: '', status: 'scheduled' }

export default function MeetingsPage() {
  const db = useVillageDB()
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_MTG)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    const data = await db.getAll('meetings')
    setRecords(data.sort((a, b) => new Date(b.date) - new Date(a.date)))
  }

  function showToast(msg, type='success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  async function save() {
if (!form.date) { showToast('Meeting date is required', 'error'); return }
    if (!form.type) { showToast('Meeting type is required', 'error'); return }
        try {
    const now = new Date().toISOString()
    const record = { ...form, id: editing || uuidv4(), createdAt: editing ? form.createdAt : now, updatedAt: now }
    if (editing) await db.put('meetings', record); else await db.add('meetings', record)
    showToast(editing ? 'Meeting updated' : 'Meeting added'); setModal(false); setEditing(null); setForm(EMPTY_MTG); load()
    } catch (err) {
      showToast('Error saving: ' + err.message, 'error')
    }
  }

  async function del(id) { await db.delete('meetings', id); showToast('Deleted'); load() }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Meetings</h1><div className="page-sub">{records.length} meetings recorded</div></div>
        <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY_MTG, date: new Date().toISOString().slice(0,10) }); setEditing(null); setModal(true) }}>+ New meeting</button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {records.length === 0 ? <div style={{ padding:48, textAlign:'center', color:'var(--c-text3)' }}>No meetings recorded.</div> :
          records.map(r => (
            <div key={r.id} className="card" style={{ cursor:'pointer', transition:'border-color 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--c-border2)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='var(--c-border)'}
              onClick={() => setViewing(r)}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontFamily:'var(--font-head)', fontWeight:700, fontSize:16, marginBottom:4 }}>{r.type?.toUpperCase()} MEETING</div>
                  <div style={{ color:'var(--c-text2)', fontSize:14 }}>{r.date ? format(new Date(r.date),'dd MMMM yyyy') : '—'} {r.time && `at ${r.time}`} · {r.venue || 'Venue TBD'}</div>
                  {r.agenda && <div style={{ color:'var(--c-text3)', fontSize:13, marginTop:6 }}>Agenda: {r.agenda.slice(0,100)}{r.agenda.length>100?'…':''}</div>}
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <span className={`badge badge-${r.status==='completed'?'green':r.status==='cancelled'?'red':'blue'}`}>{r.status}</span>
                  <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();setForm({...EMPTY_MTG,...r});setEditing(r.id);setModal(true)}}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={e=>{e.stopPropagation();del(r.id)}}>Del</button>
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {viewing && <div className="modal-overlay" onClick={() => setViewing(null)}>
        <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
          <h2 style={{ marginBottom:4 }}>{viewing.type?.toUpperCase()} MEETING</h2>
          <div style={{ color:'var(--c-text2)', marginBottom:20 }}>{viewing.date?format(new Date(viewing.date),'dd MMMM yyyy'):''}</div>
          {[['Venue',viewing.venue],['Time',viewing.time],['Chairperson',viewing.chairperson],['Attendance',viewing.attendance]].map(([k,v])=>v&&(
            <div key={k} style={{ marginBottom:10 }}><span style={{ color:'var(--c-text3)', fontSize:12 }}>{k}: </span><span>{v}</span></div>
          ))}
          {viewing.agenda && <div style={{ marginBottom:16 }}><div style={{ color:'var(--c-text3)', fontSize:12, marginBottom:4 }}>AGENDA</div><div className="rich-content" dangerouslySetInnerHTML={{ __html: viewing.agenda }} /></div>}
          {viewing.minutes && <div><div style={{ color:'var(--c-text3)', fontSize:12, marginBottom:4 }}>MINUTES / RESOLUTIONS</div><div className="rich-content" dangerouslySetInnerHTML={{ __html: viewing.minutes }} /></div>}
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:20 }}>
            <button className="btn btn-secondary" onClick={() => setViewing(null)}>Close</button>
          </div>
        </div>
      </div>}

      {modal && <div className="modal-overlay" onClick={() => setModal(false)}>
        <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
          <h2 style={{ marginBottom:20 }}>{editing?'Edit meeting':'New meeting'}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="form-row-3">
              <div className="form-group"><label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                  {['general','emergency','special','budget','land','security','health'].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Venue</label><input className="form-input" value={form.venue} onChange={e=>setForm({...form,venue:e.target.value})} placeholder="Meeting venue" /></div>
              <div className="form-group"><label className="form-label">Chairperson</label><input className="form-input" value={form.chairperson} onChange={e=>setForm({...form,chairperson:e.target.value})} /></div>
            </div>
            <div className="form-group"><label className="form-label">Attendance (names or count)</label><input className="form-input" value={form.attendance} onChange={e=>setForm({...form,attendance:e.target.value})} placeholder="e.g. 24 residents, list names…" /></div>
            <RichTextEditor label="Agenda" value={form.agenda} onChange={html => setForm(prev => ({...prev, agenda: html}))} placeholder="List agenda items…" minHeight={100} />
            <RichTextEditor label="Minutes / Resolutions" value={form.minutes} onChange={html => setForm(prev => ({...prev, minutes: html}))} placeholder="Record what was discussed and decided…" minHeight={160} />
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                {['scheduled','completed','postponed','cancelled'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>}
      {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </div>
  )
}
