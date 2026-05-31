/**
 * ============================================================
 * DEATHSPAGE — src/pages/DeathsPage.jsx
 * ============================================================
 * Death registrations. When saved, automatically marks the linked resident record as 'deceased'. Feeds data to NIRA.
 * ============================================================
 */

import { useToast, Toast }    from '../components/shared/Toast'
import { useAuth }               from '../hooks/useAuth'
import { useVillageDB }           from '../db/villageDB'
import { generateDeathCertificate } from '../services/documentService'
import { notifyNextOfKinDeceased } from '../services/smsService.js'
import { reportDeathToNIRA }       from '../services/govApiService.js'
import ConfirmModal              from '../components/shared/ConfirmModal'
import PageHeader                from '../components/shared/PageHeader'
import { useState, useEffect } from 'react'
import RichTextEditor from '../components/shared/RichTextEditor'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'

const CAUSES = ['Natural causes','Illness','Accident','Maternal','Infant','Unknown','Other']
const EMPTY = { residentId: '', deceasedName: '', dateOfDeath: '', placeOfDeath: '', cause: '', reportedBy: '', burialLocation: '', burialDate: '', nextOfKin: '', notes: '' }

export default function DeathsPage() {
  const { user } = useAuth()
  const db = useVillageDB()
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState([])
  const [residents, setResidents] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    const [deaths, res] = await Promise.all([db.getAll('deaths'), db.getAll('residents')])
    setRecords(deaths.sort((a,b) => new Date(b.dateOfDeath||b.createdAt) - new Date(a.dateOfDeath||a.createdAt)))
    setResidents(res)
  }

  function showToast(msg, type='success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  async function save() {
    try {
    const now = new Date().toISOString()
    const record = { ...form, id: editing || uuidv4(), createdAt: editing ? form.createdAt : now, updatedAt: now }
    if (editing) await db.put('deaths', record); else await db.add('deaths', record)
    // Mark resident as deceased
    if (form.residentId) { const r = await db.get('residents', form.residentId); if (r) await db.put('residents', { ...r, status: 'deceased' }) }
    showToast(editing ? 'Death record updated' : 'Death recorded — resident marked as deceased')

    // ── SMS notification to next of kin ──────────────────────────────
    if (!editing && record.nextOfKin) {
      const nokPhone = residents.find(r => r.id === record.residentId)?.nextOfKinPhone
      if (nokPhone) {
        notifyNextOfKinDeceased(record, nokPhone, user?.villageName || '').catch(() => {})
      }
    }

    // ── Report death to NIRA (deactivates NIN nationally) ────────────
    if (!editing && record.residentId && navigator.onLine) {
      const deceasedRes = residents.find(r => r.id === record.residentId)
      if (deceasedRes) {
        reportDeathToNIRA(deceasedRes, record.dateOfDeath, user || {}).catch(() => {})
      }
    }

    setModal(false); setEditing(null); setForm(EMPTY); load()
    } catch (err) {
      showToast('Error saving: ' + err.message, 'error')
    }
  }

  async function del(id) { await db.delete('deaths', id); showToast('Deleted'); load() }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Death Registrations</h1><div className="page-sub">{records.length} deaths recorded</div></div>
        <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY, dateOfDeath: new Date().toISOString().slice(0,10) }); setEditing(null); setModal(true) }}>+ Record death</button>
      </div>
            <div className="table-wrap">
        {records.length === 0 ? <div style={{ padding:48, textAlign:'center', color:'var(--c-text3)' }}>No deaths recorded.</div> : (
          <table><thead><tr><th>Deceased</th><th>Date of death</th><th>Cause</th><th>Place</th><th>Burial</th><th>Reported by</th><th>Actions</th></tr></thead>
            <tbody>{records.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight:600 }}>{r.deceasedName||'—'}</td>
                <td>{r.dateOfDeath?format(new Date(r.dateOfDeath),'dd/MM/yyyy'):'—'}</td>
                <td>{r.cause||'—'}</td>
                <td>{r.placeOfDeath||'—'}</td>
                <td>{r.burialLocation||'—'}</td>
                <td>{r.reportedBy||'—'}</td>
                <td><div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-gold btn-sm" onClick={() => { const dec=residents.find(x=>x.id===r.residentId); generateDeathCertificate(r, dec, user).catch(()=>{}) }}>🖨️ Cert</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setForm({...EMPTY, ...r}); setEditing(r.id); setModal(true) }}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>Del</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {modal && <div className="modal-overlay" onClick={() => setModal(false)}>
        <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
          <h2 style={{ marginBottom:20 }}>{editing?'Edit record':'Record death'}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="form-group"><label className="form-label">Resident (if registered)</label>
              <select className="form-select" value={form.residentId} onChange={e=>{const r=residents.find(x=>x.id===e.target.value);setForm({...form,residentId:e.target.value,deceasedName:r?`${r.surname} ${r.firstName}`:''})}}>
                <option value="">Select resident or enter name below…</option>{residents.filter(r=>r.status!=='deceased').map(r=><option key={r.id} value={r.id}>{r.surname} {r.firstName}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Deceased name *</label><input className="form-input" value={form.deceasedName} onChange={e=>setForm({...form,deceasedName:e.target.value})} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Date of death *</label><input className="form-input" type="date" value={form.dateOfDeath} onChange={e=>setForm({...form,dateOfDeath:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Cause of death</label>
                <select className="form-select" value={form.cause} onChange={e=>setForm({...form,cause:e.target.value})}>
                  <option value="">Select…</option>{CAUSES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Place of death</label><input className="form-input" value={form.placeOfDeath} onChange={e=>setForm({...form,placeOfDeath:e.target.value})} placeholder="Home, hospital, etc." /></div>
              <div className="form-group"><label className="form-label">Reported by</label><input className="form-input" value={form.reportedBy} onChange={e=>setForm({...form,reportedBy:e.target.value})} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Burial location</label><input className="form-input" value={form.burialLocation} onChange={e=>setForm({...form,burialLocation:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Burial date</label><input className="form-input" type="date" value={form.burialDate} onChange={e=>setForm({...form,burialDate:e.target.value})} /></div>
            </div>
            <div className="form-group"><label className="form-label">Next of kin notified</label><input className="form-input" value={form.nextOfKin} onChange={e=>setForm({...form,nextOfKin:e.target.value})} /></div>
            <RichTextEditor label="Notes" value={form.notes} onChange={html => setForm(prev => ({...prev, notes: html}))} minHeight={80} />
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
