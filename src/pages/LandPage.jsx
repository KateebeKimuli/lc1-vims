/**
 * ============================================================
 * LAND PAGE — src/pages/LandPage.jsx  (v3 — full features)
 * ============================================================
 * Full land records management with:
 *   - Interactive sketch map boundary drawing
 *   - Village Land Title PDF generation
 *   - Boundary Inspection Report PDF
 *   - Foreign national land ownership support
 *   - All Uganda land title types
 * ============================================================
 */

import { useState, useEffect }            from 'react'
import { useToast, Toast }                from '../components/shared/Toast'
import { useVillageDB }                   from '../db/villageDB'
import { useAuth }                        from '../hooks/useAuth'
import ConfirmModal                       from '../components/shared/ConfirmModal'
import PageHeader                         from '../components/shared/PageHeader'
import RichTextEditor                     from '../components/shared/RichTextEditor'
import SketchMap                          from '../components/land/SketchMap'
import { generateLandTitle, generateBoundaryReport } from '../services/landTitleService'
import { v4 as uuidv4 }                   from 'uuid'
import { format }                         from 'date-fns'

const EMPTY = {
  plotNumber: '', titleRef: '', ownerId: '', ownerName: '',
  dimensions: '', size: '', unit: 'acres', use: 'Residential',
  location: '', village: '', parish: '', district: '',
  titleType: '', status: 'registered',
  acquisitionDate: '', acquisitionMethod: '',
  boundaries: '', sketchMap: '',
  notes: '',
}

const USES    = ['Residential','Agricultural','Commercial','Industrial','Institutional','Mixed use','Forest/Wetland']
const TITLES  = ['Freehold','Leasehold','Customary','Mailo','Kibanja','None / Untitled']
const METHODS = ['Purchase','Inheritance','Gift','Customary allocation','Court order','Government allocation','Other']
const UNITS   = ['acres','hectares','sq metres','perches','sq feet']

// ── Tab definitions ─────────────────────────────────────────────────────────
const MODAL_TABS = [
  { id:'details',  label:'📋 Details'     },
  { id:'sketch',   label:'🗺️ Sketch map'  },
  { id:'notes',    label:'📝 Notes'       },
]

export default function LandPage() {
  const db                   = useVillageDB()
  const { user }             = useAuth()
  const { toast, showToast } = useToast()

  const [loading, setLoading] = useState(false)
  const [records,   setRecords]   = useState([])
  const [residents, setResidents] = useState([])
  const [modal,     setModal]     = useState(false)
  const [form,      setForm]      = useState(EMPTY)
  const [editing,   setEditing]   = useState(null)
  const [deleteId,  setDeleteId]  = useState(null)
  const [search,    setSearch]    = useState('')
  const [modalTab,  setModalTab]  = useState('details')
  const [exporting, setExporting] = useState(null)

  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    try {
      const [land, res] = await Promise.all([db.getAll('land'), db.getAll('residents')])
      setRecords(land.sort((a,b) => (a.plotNumber||'').localeCompare(b.plotNumber||'')))
      setResidents(res)
    } catch (err) { showToast('Load error: ' + err.message, 'error') }
  }

  // ── Auto-generate plot number ─────────────────────────────────────────────
  // Format: VIL/DIST/YEAR/NNNN
  // e.g.    KYA/KAM/2026/0001
  // - VIL  = first 3 letters of village name (uppercase)
  // - DIST = first 3 letters of district name (uppercase)
  // - YEAR = current 4-digit year
  // - NNNN = sequential number padded to 4 digits
  //
  // The number is based on the total existing records + 1 so it is
  // always unique within this village. The field stays editable so
  // the registrar can override it if needed (e.g. to match a physical
  // plot number from an older paper register).
  function generatePlotNumber(existingCount) {
    const vill = (user?.villageName || 'VIL').slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
    const dist = (user?.districtName || 'DIS').slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
    const year = new Date().getFullYear()
    const seq  = String(existingCount + 1).padStart(4, '0')
    return `${vill}/${dist}/${year}/${seq}`
  }

  // ── Generate land title reference number ─────────────────────────────────
  // Format: LC1/VIL/DIST/YEAR/NNNN
  // e.g.    LC1/KYA/KAM/2026/0001
  // Stored with the record and printed on the title certificate.
  function generateTitleRef(plotNumber) {
    const vill = (user?.villageName || 'VIL').slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
    const dist = (user?.districtName || 'DIS').slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
    const year = new Date().getFullYear()
    // Extract the sequence number from the plot number if it has one
    const seq  = plotNumber?.split('/').pop() || String(records.length + 1).padStart(4, '0')
    return `LC1/${vill}/${dist}/${year}/${seq}`
  }

  function openNew() {
    const plotNumber = generatePlotNumber(records.length)
    const titleRef   = generateTitleRef(plotNumber)
    setForm({
      ...EMPTY,
      plotNumber,        // auto-generated, editable
      titleRef,          // auto-generated title reference
      village:    user?.villageName  || '',
      parish:     user?.parishName   || '',
      district:   user?.districtName || '',
    })
    setEditing(null); setModalTab('details'); setModal(true)
  }
  function openEdit(r) {
    setForm({ ...EMPTY, ...r }); setEditing(r.id); setModalTab('details'); setModal(true)
  }

  async function save() {
    if (!form.plotNumber.trim()) { showToast('Plot number is required', 'error'); return }
    const now    = new Date().toISOString()
    // Ensure titleRef is always set — derive from plotNumber if missing
    const titleRef = form.titleRef || generateTitleRef(form.plotNumber)
    const record = {
      ...form,
      titleRef,
      id:        editing || uuidv4(),
      createdAt: editing ? form.createdAt : now,
      updatedAt: now,
    }
    try {
      if (editing) await db.put('land', record)
      else         await db.add('land', record)
      await db.audit(editing?'UPDATE':'CREATE','land',record.id,{plotNumber:record.plotNumber,owner:record.ownerName})
      showToast(editing ? 'Land record updated' : 'Land record registered')
      setModal(false); setEditing(null); setForm(EMPTY); load()
    } catch(err) { showToast(err.message, 'error') }
  }

  async function del() {
    await db.delete('land', deleteId)
    await db.audit('DELETE','land',deleteId)
    showToast('Land record deleted')
    setDeleteId(null); load()
  }

  // ── Generate title PDF ──────────────────────────────────────────────────
  async function handleGenerateTitle(record) {
    setExporting('title')
    try {
      const owner = residents.find(r => r.id === record.ownerId) || null
      await generateLandTitle(record, owner, user)
      showToast('Village Land Title PDF generated')
    } catch(err) { showToast('Title generation failed: ' + err.message, 'error') }
    finally { setExporting(null) }
  }

  async function handleBoundaryReport(record) {
    setExporting('boundary')
    try {
      const owner = residents.find(r => r.id === record.ownerId) || null
      await generateBoundaryReport(record, owner, user)
      showToast('Boundary Inspection Report generated')
    } catch(err) { showToast('Report failed: ' + err.message, 'error') }
    finally { setExporting(null) }
  }

  // ── Owner select helper ──────────────────────────────────────────────────
  function selectOwner(e) {
    const r = residents.find(x => x.id === e.target.value)
    setForm(prev => ({ ...prev, ownerId: e.target.value, ownerName: r ? `${r.surname} ${r.firstName}` : '' }))
  }

  const filtered = records.filter(r =>
    !search ||
    `${r.plotNumber} ${r.ownerName} ${r.village} ${r.location} ${r.titleType}`.toLowerCase().includes(search.toLowerCase())
  )

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <PageHeader
        title="Land Records"
        sub={`${records.length} plots registered · ${records.filter(r=>r.sketchMap).length} with sketch maps`}
        actions={<button className="btn btn-primary" onClick={openNew}>+ Register land</button>}
      />

      {/* Search */}
      <input className="form-input" style={{ maxWidth:340, marginBottom:20 }}
        placeholder="Search by plot, owner, village, title type…"
        value={search} onChange={e => setSearch(e.target.value)} />

      {/* Records table */}
            <div className="table-wrap">
        {filtered.length === 0 ? (
          <div style={{ padding:60, textAlign:'center', color:'var(--c-text3)' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📐</div>
            No land records yet. Click <strong>+ Register land</strong> to begin.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Plot No.</th>
                <th>Title Ref</th>
                <th>Owner</th>
                <th>Size</th>
                <th>Use</th>
                <th>Title type</th>
                <th>Sketch</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily:'monospace', fontWeight:600 }}>{r.plotNumber||'—'}</td>
                  <td style={{ fontFamily:'monospace', fontSize:11, color:'var(--c-green-xl)' }}>
                    {r.titleRef || '—'}
                  </td>
                  <td>{r.ownerName||'—'}</td>
                  <td style={{ whiteSpace:'nowrap' }}>{r.size ? `${r.size} ${r.unit}` : '—'}</td>
                  <td>{r.use||'—'}</td>
                  <td>
                    <span className="badge badge-gray" style={{ fontSize:10 }}>{r.titleType||'—'}</span>
                  </td>
                  <td>{r.village||'—'}</td>
                  <td style={{ textAlign:'center' }}>
                    {r.sketchMap
                      ? <span title="Has sketch map" style={{ color:'var(--c-green-xl)', fontSize:16 }}>🗺️</span>
                      : <span title="No sketch map" style={{ color:'var(--c-text3)', fontSize:14 }}>—</span>
                    }
                  </td>
                  <td>
                    <span className={`badge badge-${r.status==='registered'?'green':r.status==='disputed'?'red':'gold'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                      <button className="btn btn-gold btn-sm"
                        onClick={() => handleGenerateTitle(r)}
                        disabled={!!exporting}
                        title="Generate Village Land Title PDF">
                        {exporting==='title' ? '…' : '📜 Title'}
                      </button>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => handleBoundaryReport(r)}
                        disabled={!!exporting}
                        title="Generate Boundary Inspection Report">
                        {exporting==='boundary' ? '…' : '📋 Boundary'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(r.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ══ ADD / EDIT MODAL ══ */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" style={{ maxWidth:680, width:'96%', maxHeight:'92vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>

            <h2 style={{ marginBottom:18 }}>
              {editing ? `Edit: ${form.plotNumber}` : 'Register land record'}
            </h2>

            {/* Modal tabs */}
            <div className="tabs" style={{ marginBottom:20 }}>
              {MODAL_TABS.map(t => (
                <button key={t.id}
                  className={`tab ${modalTab===t.id?'active':''}`}
                  onClick={() => setModalTab(t.id)}>
                  {t.label}
                  {t.id==='sketch' && form.sketchMap && ' ✓'}
                </button>
              ))}
            </div>

            {/* ── TAB: DETAILS ── */}
            {modalTab === 'details' && (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                {/* Plot identification */}
                <div className="form-row">
                {/* Plot number — auto-generated, editable */}
                <div className="form-group">
                  <label className="form-label">
                    Plot number
                    <span style={{ marginLeft:8, fontSize:10, color:'var(--c-green-xl)',
                      background:'rgba(45,122,79,0.1)', padding:'1px 7px', borderRadius:10 }}>
                      Auto-generated
                    </span>
                  </label>
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="form-input"
                      value={form.plotNumber}
                      onChange={e => setForm(p => ({
                        ...p,
                        plotNumber: e.target.value,
                        titleRef: generateTitleRef(e.target.value),
                      }))}
                      style={{ fontFamily:'monospace', letterSpacing:'0.08em', fontWeight:600 }}
                      placeholder="Auto-fills on open" />
                    {!editing && (
                      <button type="button" className="btn btn-secondary btn-sm"
                        style={{ flexShrink:0 }}
                        title="Regenerate plot number"
                        onClick={() => {
                          const pn = generatePlotNumber(records.length)
                          setForm(p => ({...p, plotNumber: pn, titleRef: generateTitleRef(pn)}))
                        }}>
                        ↺
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4 }}>
                    Format: VILLAGE/DISTRICT/YEAR/NUMBER (editable — change only if matching a paper register)
                  </div>
                </div>

                {/* Land title reference — auto-derived from plot number */}
                <div className="form-group">
                  <label className="form-label">
                    Land title reference
                    <span style={{ marginLeft:8, fontSize:10, color:'var(--c-text3)' }}>
                      (printed on the title certificate)
                    </span>
                  </label>
                  <input className="form-input"
                    value={form.titleRef || generateTitleRef(form.plotNumber)}
                    readOnly
                    style={{
                      fontFamily:'monospace', letterSpacing:'0.08em',
                      background:'var(--c-surface2)', color:'var(--c-green-xl)', fontWeight:600,
                    }} />
                </div>
                  <div className="form-group">
                    <label className="form-label">Date of acquisition</label>
                    <input className="form-input" type="date" value={form.acquisitionDate}
                      onChange={e => setForm(p=>({...p,acquisitionDate:e.target.value}))}
                      max={new Date().toISOString().slice(0,10)} />
                  </div>
                </div>

                {/* Owner */}
                <div className="form-group">
                  <label className="form-label">Owner (registered resident)</label>
                  <select className="form-select" value={form.ownerId} onChange={selectOwner}>
                    <option value="">— Select from registered residents —</option>
                    {residents.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.surname} {r.firstName}
                        {r.nationality && r.nationality.toLowerCase() !== 'ugandan' ? ` 🌍 ${r.nationality}` : ''}
                      </option>
                    ))}
                  </select>
                  {form.ownerId && (() => {
                    const owner = residents.find(r => r.id === form.ownerId)
                    return owner?.nationality && owner.nationality.toLowerCase() !== 'ugandan' ? (
                      <div style={{ fontSize:12, color:'#F0B429', marginTop:4,
                        background:'rgba(200,151,43,0.1)', padding:'5px 10px', borderRadius:5 }}>
                        ⚠ Foreign national — Passport: {owner.passportNumber||'not recorded'} · Permit: {owner.permitNumber||'not recorded'}
                      </div>
                    ) : null
                  })()}
                </div>

                {/* Dimensions and use */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">
                      Plot dimensions (feet)
                      <span style={{ marginLeft:8, fontSize:10, color:'var(--c-green-xl)',
                        background:'rgba(45,122,79,0.1)', padding:'1px 7px', borderRadius:10 }}>
                        Auto-draws sketch map
                      </span>
                    </label>
                    <input className="form-input"
                      value={form.dimensions || ''}
                      onChange={e => setForm(p=>({...p, dimensions: e.target.value}))}
                      placeholder="e.g. 100x200  or  100x200x150x80 (top×right×bottom×left)"
                      style={{ fontFamily:'monospace', letterSpacing:'0.05em' }} />
                    <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:3 }}>
                      Enter as feet: Width×Height for rectangle, or Top×East×Bottom×West for irregular plot
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Land use</label>
                    <select className="form-select" value={form.use}
                      onChange={e => setForm(p=>({...p,use:e.target.value}))}>
                      {USES.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Title type and acquisition */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Title type</label>
                    <select className="form-select" value={form.titleType}
                      onChange={e => setForm(p=>({...p,titleType:e.target.value}))}>
                      <option value="">Select…</option>
                      {TITLES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">How acquired</label>
                    <select className="form-select" value={form.acquisitionMethod}
                      onChange={e => setForm(p=>({...p,acquisitionMethod:e.target.value}))}>
                      <option value="">Select…</option>
                      {METHODS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* Status */}
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status}
                    onChange={e => setForm(p=>({...p,status:e.target.value}))}>
                    {['registered','disputed','unregistered','transferred'].map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Village</label>
                    <input className="form-input" value={form.village}
                      onChange={e => setForm(p=>({...p,village:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Parish</label>
                    <input className="form-input" value={form.parish}
                      onChange={e => setForm(p=>({...p,parish:e.target.value}))} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Physical location / description</label>
                  <input className="form-input" value={form.location}
                    onChange={e => setForm(p=>({...p,location:e.target.value}))}
                    placeholder="e.g. Along Kampala road, near the borehole, Zone B" />
                </div>

                {/* Boundary description (text) */}
                <div className="form-group">
                  <label className="form-label">Boundary description (text)</label>
                  <input className="form-input" value={form.boundaries}
                    onChange={e => setForm(p=>({...p,boundaries:e.target.value}))}
                    placeholder="e.g. N: Ssemakula John · S: Road · E: Nakato Mary · W: Swamp" />
                </div>
              </div>
            )}

            {/* ── TAB: SKETCH MAP ── */}
            {modalTab === 'sketch' && (
              <div>
                <div style={{
                  background:'rgba(45,122,79,0.08)', border:'1px solid var(--c-green)',
                  borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color:'var(--c-text2)',
                  lineHeight:1.7,
                }}>
                  🗺️ Draw the plot boundaries by clicking to place corner points.
                  Close the shape by clicking the first point (red●).
                  Click any boundary line label to enter the neighbour's name.
                  The sketch is saved with the record and printed on the land title.
                </div>
                <SketchMap
                  value={form.sketchMap}
                  onChange={svg => setForm(p => ({...p, sketchMap: svg}))}
                  plotNumber={form.plotNumber}
                  ownerName={form.ownerName}
                  village={form.village || user?.villageName || ''}
                />
              </div>
            )}

            {/* ── TAB: NOTES ── */}
            {modalTab === 'notes' && (
              <RichTextEditor
                label="Notes, history, and remarks"
                value={form.notes}
                onChange={html => setForm(p=>({...p, notes: html}))}
                placeholder="Land history, disputes, previous owners, agreements, etc."
                minHeight={180}
              />
            )}

            {/* Footer buttons */}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20,
              borderTop:'1px solid var(--c-border)', paddingTop:16 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>
                {editing ? '✓ Save changes' : '✓ Register land record'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title="Delete land record?"
        message="This permanently removes the land record and its sketch map. This action cannot be undone."
        onConfirm={del}
        onCancel={() => setDeleteId(null)}
      />

      <Toast toast={toast} />
    </div>
  )
}
