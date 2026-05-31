/**
 * ============================================================
 * LETTERSPAGE — src/pages/LettersPage.jsx
 * ============================================================
 * Official LC1 letters and certificates with PDF generation. Types include introduction letters, residence confirmations, character references, and more.
 * ============================================================
 */

import { useToast, Toast }    from '../components/shared/Toast'
import { useVillageDB }           from '../db/villageDB'
import ConfirmModal              from '../components/shared/ConfirmModal'
import PageHeader                from '../components/shared/PageHeader'
import { useState, useEffect } from 'react'
import RichTextEditor, { stripHtml } from '../components/shared/RichTextEditor'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'
import { generateOfficialLetter } from '../services/documentService'
import { useAuth } from '../hooks/useAuth'

const TYPES = ['Introduction letter','Recommendation letter','Residence confirmation','Character certificate','Land ownership confirmation','Birth confirmation','Death confirmation','Poverty / indigence','Business permit support','Travel support letter','Good conduct','Marriage confirmation','Other']

const EMPTY = { type: '', residentId: '', residentName: '', purpose: '', recipient: '', content: '', referenceNumber: '', status: 'issued' }

export default function LettersPage() {
  const db = useVillageDB()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState([])
  const [residents, setResidents] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState(null)
  const [settings, setSettings] = useState({})
  let letterSeq = 1

  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    const [letters, res, allSettings] = await Promise.all([db.getAll('letters'), db.getAll('residents'), db.getAll('settings')])
    setRecords(letters.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)))
    setResidents(res)
    const s = {}; allSettings.forEach(x => s[x.key] = x.value); setSettings(s)
    letterSeq = letters.length + 1
  }

  function showToast(msg, type='success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  async function save() {
    try {
    const now = new Date().toISOString()
    const refNum = form.referenceNumber || `LC1/${new Date().getFullYear()}/${String(letterSeq).padStart(4,'0')}`
    const record = { ...form, referenceNumber: refNum, issuedAt: now, id: editing || uuidv4(), createdAt: editing ? form.createdAt : now, updatedAt: now }
    if (editing) await db.put('letters', record); else await db.add('letters', record)
    showToast(editing ? 'Updated' : 'Letter issued'); setModal(false); setEditing(null); setForm(EMPTY); load()
    } catch (err) {
      showToast('Error saving: ' + err.message, 'error')
    }
  }

  async function del(id) { await db.delete('letters', id); showToast('Deleted'); load() }

  /**
   * generatePDF — calls the professional document service
   * which renders the full letterhead + body + signature block.
   */
  async function generatePDF(letter) {
    try {
      await generateOfficialLetter(letter, user)
    } catch (err) {
      showToast('PDF generation failed: ' + err.message, 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Letters & Certificates</h1><div className="page-sub">{records.length} letters issued</div></div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setEditing(null); setModal(true) }}>+ Issue letter</button>
      </div>
            <div className="table-wrap">
        {records.length === 0 ? <div style={{ padding:48, textAlign:'center', color:'var(--c-text3)' }}>No letters issued yet.</div> : (
          <table><thead><tr><th>Ref No.</th><th>Type</th><th>Resident</th><th>Recipient</th><th>Date issued</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{records.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily:'monospace', fontSize:12 }}>{r.referenceNumber||'—'}</td>
                <td>{r.type||'—'}</td>
                <td>{r.residentName||'—'}</td>
                <td>{r.recipient||'—'}</td>
                <td style={{ fontSize:12, color:'var(--c-text3)' }}>{r.issuedAt?format(new Date(r.issuedAt),'dd/MM/yyyy'):'—'}</td>
                <td><span className={`badge badge-${r.status==='issued'?'green':r.status==='revoked'?'red':'gold'}`}>{r.status}</span></td>
                <td><div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-gold btn-sm" onClick={() => generatePDF(r)}>🖨️ PDF</button>
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
          <h2 style={{ marginBottom:20 }}>{editing?'Edit letter':'Issue letter'}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Letter type *</label>
                <select className="form-select" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                  <option value="">Select type…</option>{TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Resident *</label>
                <select className="form-select" value={form.residentId} onChange={e=>{const r=residents.find(x=>x.id===e.target.value);setForm({...form,residentId:e.target.value,residentName:r?`${r.surname} ${r.firstName}`:''})}}>
                  <option value="">Select resident…</option>{residents.map(r=><option key={r.id} value={r.id}>{r.surname} {r.firstName}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Addressed to (recipient)</label><input className="form-input" value={form.recipient} onChange={e=>setForm({...form,recipient:e.target.value})} placeholder="e.g. The Manager, Bank of Uganda…" /></div>
            <div className="form-group"><label className="form-label">Purpose</label><input className="form-input" value={form.purpose} onChange={e=>setForm({...form,purpose:e.target.value})} placeholder="What is the letter for?" /></div>
            <RichTextEditor
              label="Letter body"
              value={form.content}
              onChange={html => setForm(prev => ({...prev, content: html}))}
              placeholder={`This is to certify that ${form.residentName || '[RESIDENT NAME]'} is a known and registered resident of this village…`}
              minHeight={200}
            />
            <div className="form-row">
              <div className="form-group"><label className="form-label">Reference number (auto if blank)</label><input className="form-input" value={form.referenceNumber} onChange={e=>setForm({...form,referenceNumber:e.target.value})} placeholder="LC1/2024/0001" /></div>
              <div className="form-group"><label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                  <option value="issued">Issued</option><option value="draft">Draft</option><option value="revoked">Revoked</option>
                </select>
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Issue letter</button>
          </div>
        </div>
      </div>}
      {toast && <div className="toast-container"><div className={`toast toast-${toast.type}`}>{toast.msg}</div></div>}
    </div>
  )
}
