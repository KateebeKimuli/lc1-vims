/**
 * ============================================================
 * BIRTHS PAGE — src/pages/BirthsPage.jsx
 * ============================================================
 * BUGS FIXED:
 *
 *   BUG — Birth-created residents had blank surname:
 *     createResidentFromBirth used birth.surname which didn't
 *     exist in the births form. All auto-created residents had
 *     surname='' and sorted to the top of the residents list.
 *     FIX: Added "Child's surname" field to birth form.
 *     The surname is required for auto-resident creation.
 *
 *   BUG — Births read/write from wrong DB:
 *     dbGetAll/dbAdd/dbPut used the legacy single DB while
 *     ResidentsPage reads from the village-specific DB.
 *     FIX: All DB ops now use getVillageDB(user.villageId).
 *
 *   BUG — Weight field accepted letters:
 *     type="number" was set but no inputMode or min/max.
 *     FIX: inputMode="decimal", min="0", max="10" (reasonable
 *     birth weight range), step="0.01".
 *
 *   BUG — motherPhone referenced but not in form:
 *     The SMS notification tried record.motherPhone but the
 *     form had no motherPhone field. SMS was never sent.
 *     FIX: Added motherPhone field; auto-filled when mother
 *     is selected from the residents dropdown.
 * ============================================================
 */

import { useState, useEffect }           from 'react'
import { useAuth }                        from '../hooks/useAuth'
import { useToast, Toast }               from '../components/shared/Toast'
import ConfirmModal                      from '../components/shared/ConfirmModal'
import PageHeader                        from '../components/shared/PageHeader'
import { getVillageDB }                  from '../db/multiTenantDB.js'
import { useVillageDB }           from '../db/villageDB'
import { createResidentFromBirth }       from '../db/multiTenantDB.js'
import { generateBirthCertificate }      from '../services/documentService'
import { notifyBirthRegistered }         from '../services/smsService.js'
import RichTextEditor from '../components/shared/RichTextEditor'
import { v4 as uuidv4 }                  from 'uuid'
import { format }                        from 'date-fns'

// ── FIX: Added childSurname and motherPhone to EMPTY_BIRTH ────────────────
const EMPTY_BIRTH = {
  childName:      '',   // child's first name(s)
  childSurname:   '',   // child's family name (father's or mother's surname)
  dateOfBirth:    '',
  sex:            '',
  placeOfBirth:   '',
  weight:         '',   // in kg
  motherId:       '',
  motherName:     '',
  motherPhone:    '',   // auto-filled from mother resident record
  fatherId:       '',
  fatherName:     '',
  village:        '',
  parish:         '',
  healthFacility: '',
  attendant:      '',
  notes:          '',
}

export default function BirthsPage() {
  const { user }             = useAuth()
  const db                   = useVillageDB()
  const { toast, showToast } = useToast()

  const [loading, setLoading] = useState(false)
  const [records,   setRecords]   = useState([])
  const [residents, setResidents] = useState([])
  const [modal,     setModal]     = useState(false)
  const [form,      setForm]      = useState(EMPTY_BIRTH)
  const [editing,   setEditing]   = useState(null)
  const [deleteId,  setDeleteId]  = useState(null)
  const [saving,    setSaving]    = useState(false)

  // ── Load from village-specific DB ─────────────────────────────────────
  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    try {
      const [births, res] = await Promise.all([
        db.getAll('births'),
        db.getAll('residents'),
      ])
      setRecords(births.sort((a,b) => new Date(b.dateOfBirth||b.createdAt) - new Date(a.dateOfBirth||a.createdAt)))
      setResidents(res)
    } catch (err) {
      showToast('Error loading births: ' + err.message, 'error')
    }
  }

  // ── Open new birth form ───────────────────────────────────────────────
  function openNew() {
    setForm({
      ...EMPTY_BIRTH,
      dateOfBirth: new Date().toISOString().slice(0,10),
      village:     user?.villageName || '',
    })
    setEditing(null)
    setModal(true)
  }

  // ── Open edit form with existing data pre-populated ───────────────────
  function openEdit(r) {
    setForm({ ...EMPTY_BIRTH, ...r })  // merge so new fields get defaults
    setEditing(r.id)
    setModal(true)
  }

  // ── Save ──────────────────────────────────────────────────────────────
  async function save() {
    if (!form.childName.trim())    { showToast('Child\'s first name is required', 'error'); return }
    if (!form.childSurname.trim()) { showToast('Child\'s surname is required for resident registration', 'error'); return }
    if (!form.dateOfBirth)         { showToast('Date of birth is required', 'error'); return }

    // Weight validation: must be a number if entered, sensible range
    if (form.weight && (isNaN(Number(form.weight)) || Number(form.weight) < 0.3 || Number(form.weight) > 10)) {
      showToast('Birth weight must be between 0.3 kg and 10 kg', 'error'); return
    }

    setSaving(true)
    try {
      const now    = new Date().toISOString()
      const record = {
        ...form,
        id:        editing || uuidv4(),
        createdAt: editing ? form.createdAt : now,
        updatedAt: now,
        syncStatus:'pending',
      }

      // Write to village-specific DB
      if (editing) await db.put('births', record)
      else         await db.add('births', record)

      await db.audit(editing ? 'UPDATE' : 'CREATE', 'births', record.id, user?.id,
        { childName: record.childName, childSurname: record.childSurname })

      // ── Auto-create resident from birth (new births only) ─────────────
      if (!editing && record.childName && user?.villageId) {
        try {
          await createResidentFromBirth(user.villageId, record, user?.id)
          showToast(`Birth registered — ${record.childSurname} ${record.childName} added as resident`)
        } catch (err) {
          showToast('Birth registered (auto-resident creation failed: ' + err.message + ')', 'info')
        }
      } else {
        showToast(editing ? 'Birth record updated' : 'Birth registered')
      }

      // ── SMS to mother ──────────────────────────────────────────────────
      if (!editing && record.motherPhone) {
        notifyBirthRegistered(record, record.motherPhone, user?.villageName || '').catch(() => {})
      }

      setModal(false); setEditing(null); setForm(EMPTY_BIRTH); load()
    } catch (err) {
      showToast('Error saving: ' + err.message, 'error')
    } finally {
      setSaving(false) }
  }

  // ── Delete ────────────────────────────────────────────────────────────
  async function confirmDelete() {
    try {
      await db.delete('births', deleteId)
      showToast('Birth record deleted')
      setDeleteId(null); load()
    } catch (err) { showToast('Delete failed: ' + err.message, 'error') }
  }

  // ── When mother is selected, auto-fill her phone ──────────────────────
  function selectMother(e) {
    const id  = e.target.value
    const res = residents.find(x => x.id === id)
    setForm(prev => ({
      ...prev,
      motherId:    id,
      motherName:  res ? `${res.surname} ${res.firstName}` : '',
      motherPhone: res?.phone || '',  // auto-fill for SMS notification
    }))
  }

  function selectFather(e) {
    const id  = e.target.value
    const res = residents.find(x => x.id === id)
    setForm(prev => ({
      ...prev,
      fatherId:    id,
      fatherName:  res ? `${res.surname} ${res.firstName}` : '',
    }))
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <PageHeader
        title="Birth Registrations"
        sub={`${records.length} births recorded`}
        actions={
          <button className="btn btn-primary" onClick={openNew}>+ Register birth</button>
        }
      />

      {/* Table */}
            <div className="table-wrap">
        {records.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--c-text3)' }}>
            No births registered yet.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Child name</th><th>Surname</th><th>DOB</th><th>Sex</th>
                <th>Mother</th><th>Father</th><th>Facility</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight:600 }}>{r.childName||'—'}</td>
                  <td>{r.childSurname||'—'}</td>
                  <td>{r.dateOfBirth ? format(new Date(r.dateOfBirth),'dd/MM/yyyy') : '—'}</td>
                  <td>{r.sex||'—'}</td>
                  <td>{r.motherName||'—'}</td>
                  <td>{r.fatherName||'—'}</td>
                  <td>{r.healthFacility||'—'}</td>
                  <td>
                    <div style={{ display:'flex', gap:5 }}>
                      <button className="btn btn-gold btn-sm"
                        onClick={async () => {
                          try {
                            await generateBirthCertificate(r, user)
                          } catch(err) {
                            alert('Certificate error: ' + err.message)
                          }
                        }}>
                        🖨️
                      </button>
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

      {/* Birth registration modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom:20 }}>{editing ? 'Edit birth record' : 'Register birth'}</h2>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Child name row — now includes surname */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Child's first name(s) *</label>
                  <input className="form-input" value={form.childName}
                    onChange={e => setForm(prev => ({ ...prev,
                      childName: e.target.value.replace(/[^a-zA-ZÀ-ÿĀ-ɏ\s\-'.]/g, '')
                    }))}
                    placeholder="e.g. Aisha, John Paul (letters only)" />
                </div>
                <div className="form-group">
                  <label className="form-label">Child's surname *</label>
                  <input className="form-input" value={form.childSurname}
                    onChange={e => setForm(prev => ({ ...prev,
                      childSurname: e.target.value.replace(/[^a-zA-ZÀ-ÿĀ-ɏ\s\-'.]/g, '')
                    }))}
                    placeholder="Family name (letters only)" />
                </div>
              </div>

              {/* Date of birth and sex */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date of birth *</label>
                  <input className="form-input" type="date"
                    value={form.dateOfBirth}
                    onChange={e => setForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                    max={new Date().toISOString().slice(0,10)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sex</label>
                  <select className="form-select" value={form.sex}
                    onChange={e => setForm(prev => ({ ...prev, sex: e.target.value }))}>
                    <option value="">Select…</option>
                    <option>Male</option><option>Female</option>
                  </select>
                </div>
              </div>

              {/* Weight — number only, sensible range */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Birth weight (kg)</label>
                  <input className="form-input"
                    type="number" inputMode="decimal"
                    min="0.3" max="10" step="0.01"
                    value={form.weight}
                    onChange={e => setForm(prev => ({ ...prev, weight: e.target.value }))}
                    placeholder="e.g. 3.2" />
                </div>
                <div className="form-group">
                  <label className="form-label">Health facility</label>
                  <input className="form-input" value={form.healthFacility}
                    onChange={e => setForm(prev => ({ ...prev, healthFacility: e.target.value }))}
                    placeholder="e.g. Mulago, home, health centre" />
                </div>
              </div>

              {/* Parents — dropdowns from residents list */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Mother (select registered resident)</label>
                  <select className="form-select" value={form.motherId} onChange={selectMother}>
                    <option value="">Select mother…</option>
                    {residents
                      .filter(r => r.sex === 'Female' || !r.sex)
                      .map(r => (
                        <option key={r.id} value={r.id}>
                          {r.surname} {r.firstName}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Father (select registered resident)</label>
                  <select className="form-select" value={form.fatherId} onChange={selectFather}>
                    <option value="">Select father…</option>
                    {residents
                      .filter(r => r.sex === 'Male' || !r.sex)
                      .map(r => (
                        <option key={r.id} value={r.id}>
                          {r.surname} {r.firstName}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Mother's phone — auto-filled, editable for SMS */}
              {form.motherId && (
                <div className="form-group">
                  <label className="form-label">Mother's phone (for SMS birth notification)</label>
                  <input className="form-input"
                    type="tel" inputMode="tel"
                    value={form.motherPhone}
                    onChange={e => setForm(prev => ({ ...prev, motherPhone: e.target.value.replace(/[^\d+\s\-]/g, '') }))}
                    placeholder="07XXXXXXXX" />
                </div>
              )}

              {/* Village and parish */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Village</label>
                  <input className="form-input" value={form.village}
                    onChange={e => setForm(prev => ({ ...prev, village: e.target.value }))}
                    placeholder="Village of birth" />
                </div>
                <div className="form-group">
                  <label className="form-label">Parish</label>
                  <input className="form-input" value={form.parish}
                    onChange={e => setForm(prev => ({ ...prev, parish: e.target.value }))} />
                </div>
              </div>

              {/* Notes */}
              <RichTextEditor label="Notes" value={form.notes} onChange={html => setForm(prev => ({...prev, notes: html}))} placeholder="Any additional information…" minHeight={80} />

            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Register birth'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title="Delete birth record?"
        message="This permanently removes the birth registration. The associated resident record will not be deleted automatically."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      <Toast toast={toast} />
    </div>
  )
}
