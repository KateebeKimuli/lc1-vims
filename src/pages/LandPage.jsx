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
  // ── Ownership history ──
  // Array of { ownerName, ownerId, from, to, method, note }
  // 'to' is null/'' for the current owner. Each transfer pushes the previous
  // owner here with a 'to' date, and a fresh open-ended entry for the new owner.
  ownershipHistory: [],
  // Partition lineage — if this plot was split from a parent plot
  parentPlot: '',          // plotNumber of the plot this was carved from
  partitionedFrom: '',     // land record id of the parent
}

const TRANSFER_METHODS = ['Sale','Gift','Inheritance','Court order','Exchange','Surrender','Other']

const USES    = ['Residential','Agricultural','Commercial','Industrial','Institutional','Mixed use','Forest/Wetland']
const TITLES  = ['Freehold','Leasehold','Customary','Mailo','Kibanja','None / Untitled']
const METHODS = ['Purchase','Inheritance','Gift','Customary allocation','Court order','Government allocation','Other']
const UNITS   = ['acres','hectares','sq metres','perches','sq feet']

// ── Tab definitions ─────────────────────────────────────────────────────────
const MODAL_TABS = [
  { id:'details',   label:'📋 Details'     },
  { id:'ownership', label:'👥 Ownership'   },
  { id:'sketch',    label:'🗺️ Sketch map'  },
  { id:'notes',     label:'📝 Notes'       },
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

  // ── Transfer / inheritance / partition state ──────────────────────────────
  const [transferPlot, setTransferPlot] = useState(null)   // land record being transferred
  const [transfer, setTransfer] = useState({
    newOwnerId: '', newOwnerName: '', method: 'Sale', date: '', note: '',
  })
  const [partitionPlot, setPartitionPlot] = useState(null) // land record being partitioned
  const [partitions, setPartitions] = useState([])         // [{ heirId, heirName, size, note }]

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

  // ── Open transfer modal ────────────────────────────────────────────────────
  function openTransfer(plot) {
    setTransferPlot(plot)
    setTransfer({
      newOwnerId: '', newOwnerName: '', method: 'Sale',
      date: new Date().toISOString().slice(0,10), note: '',
    })
  }

  // ── Execute a transfer / sale / gift / inheritance of the whole plot ──────
  async function confirmTransfer() {
    const plot = transferPlot
    if (!plot) return
    if (!transfer.newOwnerName.trim()) { showToast('Enter the new owner', 'error'); return }

    const now = new Date().toISOString()
    const transferDate = transfer.date || now.slice(0,10)

    // Build the history: close the current owner's entry, open the new owner's
    const history = Array.isArray(plot.ownershipHistory) ? [...plot.ownershipHistory] : []
    // If no history yet, seed it with the original owner as an open entry
    if (history.length === 0 && plot.ownerName) {
      history.push({
        ownerName: plot.ownerName, ownerId: plot.ownerId || '',
        from: plot.acquisitionDate || plot.createdAt?.slice(0,10) || '', to: '',
        method: plot.acquisitionMethod || 'Original registration', note: '',
      })
    }
    // Close the currently-open entry (the seller / deceased)
    const openIdx = history.findIndex(h => !h.to)
    if (openIdx >= 0) history[openIdx] = { ...history[openIdx], to: transferDate }
    // Add the new owner as the open entry
    history.push({
      ownerName: transfer.newOwnerName, ownerId: transfer.newOwnerId || '',
      from: transferDate, to: '',
      method: transfer.method,
      note: transfer.note || '',
    })

    const updated = {
      ...plot,
      ownerId:   transfer.newOwnerId || '',
      ownerName: transfer.newOwnerName,
      acquisitionMethod: transfer.method,
      acquisitionDate:   transferDate,
      ownershipHistory:  history,
      status: 'registered',
      updatedAt: now,
    }
    try {
      await db.put('land', updated)
      await db.audit('TRANSFER','land',plot.id, {
        plot: plot.plotNumber, from: plot.ownerName,
        to: transfer.newOwnerName, method: transfer.method,
      })
      showToast(`Plot ${plot.plotNumber} transferred to ${transfer.newOwnerName} (${transfer.method})`)
      setTransferPlot(null); load()
    } catch (err) { showToast('Transfer failed: ' + err.message, 'error') }
  }

  // ── Open partition modal (split one plot among heirs) ──────────────────────
  function openPartition(plot) {
    setPartitionPlot(plot)
    setPartitions([
      { heirId:'', heirName:'', size:'', note:'' },
      { heirId:'', heirName:'', size:'', note:'' },
    ])
  }
  function addPartitionRow() {
    setPartitions(p => [...p, { heirId:'', heirName:'', size:'', note:'' }])
  }
  function removePartitionRow(i) {
    setPartitions(p => p.filter((_, idx) => idx !== i))
  }
  function setPartitionField(i, field, value) {
    setPartitions(p => p.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  // ── Execute partition: create a child plot per heir, retire the parent ─────
  async function confirmPartition() {
    const parent = partitionPlot
    if (!parent) return
    const valid = partitions.filter(p => p.heirName.trim())
    if (valid.length < 2) { showToast('Add at least two heirs to partition', 'error'); return }

    const now = new Date().toISOString()
    const today = now.slice(0,10)
    try {
      // Create a new child plot for each heir
      let seq = records.length
      for (let i = 0; i < valid.length; i++) {
        const heir = valid[i]
        seq += 1
        const childPlotNumber = `${parent.plotNumber}-${String.fromCharCode(65 + i)}` // e.g. .../0001-A
        const childTitleRef   = generateTitleRef(childPlotNumber)
        const childHistory = [{
          ownerName: heir.heirName, ownerId: heir.heirId || '',
          from: today, to: '',
          method: 'Inheritance (partition)',
          note: `Partitioned from plot ${parent.plotNumber} (estate of ${parent.ownerName})`,
        }]
        const child = {
          ...EMPTY,
          id: uuidv4(),
          plotNumber: childPlotNumber,
          titleRef:   childTitleRef,
          ownerId:    heir.heirId || '',
          ownerName:  heir.heirName,
          size:       heir.size || '',
          unit:       parent.unit || 'acres',
          use:        parent.use || 'Residential',
          location:   parent.location || '',
          village:    parent.village  || user?.villageName  || '',
          parish:     parent.parish   || user?.parishName   || '',
          district:   parent.district || user?.districtName || '',
          titleType:  parent.titleType || '',
          status:     'registered',
          acquisitionDate:   today,
          acquisitionMethod: 'Inheritance',
          boundaries: heir.note || '',
          ownershipHistory: childHistory,
          parentPlot:       parent.plotNumber,
          partitionedFrom:  parent.id,
          notes: `Created by partition of ${parent.plotNumber} on ${today}.`,
          createdAt: now, updatedAt: now,
        }
        await db.add('land', child)
        await db.audit('CREATE','land',child.id, { plot: child.plotNumber, owner: child.ownerName, via:'partition' })
      }

      // Retire the parent plot — mark as partitioned, no longer an active holding
      const parentHistory = Array.isArray(parent.ownershipHistory) ? [...parent.ownershipHistory] : []
      const openIdx = parentHistory.findIndex(h => !h.to)
      if (openIdx >= 0) parentHistory[openIdx] = { ...parentHistory[openIdx], to: today }
      else if (parent.ownerName) parentHistory.push({
        ownerName: parent.ownerName, ownerId: parent.ownerId || '',
        from: parent.acquisitionDate || '', to: today,
        method: parent.acquisitionMethod || 'Original registration', note: '',
      })
      await db.put('land', {
        ...parent,
        status: 'partitioned',
        ownershipHistory: parentHistory,
        notes: `${parent.notes ? parent.notes + ' · ' : ''}Partitioned into ${valid.length} plots on ${today} among heirs of ${parent.ownerName}.`,
        updatedAt: now,
      })
      await db.audit('PARTITION','land',parent.id, { plot: parent.plotNumber, into: valid.length })

      showToast(`Plot ${parent.plotNumber} partitioned into ${valid.length} plots for the heirs`)
      setPartitionPlot(null); setPartitions([]); load()
    } catch (err) { showToast('Partition failed: ' + err.message, 'error') }
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
                      {r.status !== 'partitioned' && (
                        <>
                          <button className="btn btn-primary btn-sm"
                            onClick={() => openTransfer(r)}
                            title="Record a sale, gift or inheritance of this whole plot">
                            🔁 Transfer
                          </button>
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => openPartition(r)}
                            title="Split this plot among heirs (e.g. on the owner's death)">
                            ✂️ Partition
                          </button>
                        </>
                      )}
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

            {/* ── TAB: OWNERSHIP HISTORY ── */}
            {modalTab === 'ownership' && (
              <div>
                <div style={{
                  background:'rgba(45,122,79,0.08)', border:'1px solid var(--c-green)',
                  borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, color:'var(--c-text2)', lineHeight:1.6,
                }}>
                  👥 The chain of ownership for this plot. Use <strong>Transfer / Sell</strong> on the
                  records list to record a sale, gift, or inheritance, or <strong>Partition</strong> to
                  split the plot among heirs.
                </div>

                {/* Current owner */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:4 }}>CURRENT OWNER</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'var(--c-green-xl)' }}>
                    {form.ownerName || '—'}
                  </div>
                  {form.acquisitionDate && (
                    <div style={{ fontSize:12, color:'var(--c-text3)' }}>
                      Since {form.acquisitionDate} · via {form.acquisitionMethod || '—'}
                    </div>
                  )}
                  {form.parentPlot && (
                    <div style={{ fontSize:11, color:'var(--c-gold-l)', marginTop:3 }}>
                      ⬇ Partitioned from plot {form.parentPlot}
                    </div>
                  )}
                </div>

                {/* History timeline */}
                <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:8 }}>OWNERSHIP TIMELINE</div>
                {(!form.ownershipHistory || form.ownershipHistory.length === 0) ? (
                  <div style={{ fontSize:13, color:'var(--c-text3)', fontStyle:'italic', padding:'8px 0' }}>
                    No prior owners recorded. The first transfer will start the history.
                  </div>
                ) : (
                  <div style={{ position:'relative', paddingLeft:18 }}>
                    {/* vertical line */}
                    <div style={{ position:'absolute', left:5, top:6, bottom:6, width:2, background:'var(--c-border2)' }} />
                    {[...form.ownershipHistory].reverse().map((h, i) => (
                      <div key={i} style={{ position:'relative', marginBottom:14 }}>
                        <div style={{
                          position:'absolute', left:-16, top:3, width:10, height:10, borderRadius:'50%',
                          background: h.to ? 'var(--c-text3)' : 'var(--c-green)',
                          border:'2px solid var(--c-surface)',
                        }} />
                        <div style={{ fontSize:14, fontWeight:600 }}>
                          {h.ownerName}
                          {!h.to && <span style={{ fontSize:11, color:'var(--c-green-xl)', marginLeft:6 }}>● current</span>}
                        </div>
                        <div style={{ fontSize:12, color:'var(--c-text3)' }}>
                          {h.from || '?'} → {h.to || 'present'} · {h.method || '—'}
                        </div>
                        {h.note && <div style={{ fontSize:12, color:'var(--c-text2)', marginTop:2 }}>{h.note}</div>}
                      </div>
                    ))}
                  </div>
                )}
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

      {/* ── TRANSFER / SELL / INHERIT MODAL ── */}
      {transferPlot && (
        <div className="modal-overlay" onClick={() => setTransferPlot(null)}>
          <div className="modal" style={{ maxWidth:480 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom:4 }}>🔁 Transfer plot {transferPlot.plotNumber}</h2>
            <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:16, lineHeight:1.6 }}>
              Current owner: <strong>{transferPlot.ownerName || '—'}</strong>.
              Record who it is passing to and how. The previous owner is kept in the plot's history.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="form-group">
                <label className="form-label">New owner (registered resident)</label>
                <select className="form-select" value={transfer.newOwnerId}
                  onChange={e => {
                    const r = residents.find(x => x.id === e.target.value)
                    setTransfer(t => ({ ...t, newOwnerId: e.target.value, newOwnerName: r ? `${r.surname} ${r.firstName}` : t.newOwnerName }))
                  }}>
                  <option value="">— Select or type below —</option>
                  {residents.map(r => <option key={r.id} value={r.id}>{r.surname} {r.firstName}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">New owner name *</label>
                <input className="form-input" value={transfer.newOwnerName}
                  onChange={e => setTransfer(t => ({ ...t, newOwnerName: e.target.value }))}
                  placeholder="Full name of new owner" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Method</label>
                  <select className="form-select" value={transfer.method}
                    onChange={e => setTransfer(t => ({ ...t, method: e.target.value }))}>
                    {TRANSFER_METHODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input className="form-input" type="date" value={transfer.date}
                    onChange={e => setTransfer(t => ({ ...t, date: e.target.value }))}
                    max={new Date().toISOString().slice(0,10)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Note (optional)</label>
                <input className="form-input" value={transfer.note}
                  onChange={e => setTransfer(t => ({ ...t, note: e.target.value }))}
                  placeholder="e.g. sale price, agreement ref, witness" />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn btn-secondary" onClick={() => setTransferPlot(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmTransfer}>Record transfer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PARTITION MODAL ── */}
      {partitionPlot && (
        <div className="modal-overlay" onClick={() => setPartitionPlot(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom:4 }}>✂️ Partition plot {partitionPlot.plotNumber}</h2>
            <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:16, lineHeight:1.6 }}>
              Split this plot (owner: <strong>{partitionPlot.ownerName || '—'}</strong>) into separate
              plots for the heirs. Each heir gets a new plot numbered{' '}
              <span style={{ fontFamily:'monospace' }}>{partitionPlot.plotNumber}-A</span>,{' '}
              <span style={{ fontFamily:'monospace' }}>-B</span>, etc. The original plot is retired
              and marked as <em>partitioned</em>, with its history preserved.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {partitions.map((p, i) => (
                <div key={i} style={{
                  display:'flex', gap:8, alignItems:'flex-end',
                  padding:'10px', borderRadius:8, background:'var(--c-surface2)',
                }}>
                  <div style={{ fontFamily:'monospace', fontWeight:700, color:'var(--c-gold-l)', paddingBottom:8 }}>
                    {partitionPlot.plotNumber}-{String.fromCharCode(65 + i)}
                  </div>
                  <div className="form-group" style={{ flex:2, marginBottom:0 }}>
                    <label className="form-label" style={{ fontSize:11 }}>Heir</label>
                    <select className="form-select" value={p.heirId}
                      onChange={e => {
                        const r = residents.find(x => x.id === e.target.value)
                        setPartitionField(i, 'heirId', e.target.value)
                        if (r) setPartitionField(i, 'heirName', `${r.surname} ${r.firstName}`)
                      }}>
                      <option value="">— Select heir —</option>
                      {residents.map(r => <option key={r.id} value={r.id}>{r.surname} {r.firstName}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex:2, marginBottom:0 }}>
                    <label className="form-label" style={{ fontSize:11 }}>Name</label>
                    <input className="form-input" value={p.heirName}
                      onChange={e => setPartitionField(i, 'heirName', e.target.value)}
                      placeholder="Heir name" />
                  </div>
                  <div className="form-group" style={{ flex:1, marginBottom:0 }}>
                    <label className="form-label" style={{ fontSize:11 }}>Size ({partitionPlot.unit||'acres'})</label>
                    <input className="form-input" value={p.size}
                      onChange={e => setPartitionField(i, 'size', e.target.value)}
                      placeholder="e.g. 0.5" inputMode="decimal" />
                  </div>
                  {partitions.length > 2 && (
                    <button className="btn btn-danger btn-sm" style={{ marginBottom:2 }}
                      onClick={() => removePartitionRow(i)}>✕</button>
                  )}
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" style={{ alignSelf:'flex-start' }}
                onClick={addPartitionRow}>+ Add another heir</button>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn btn-secondary" onClick={() => setPartitionPlot(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmPartition}>
                ✂️ Partition into {partitions.filter(p => p.heirName.trim()).length} plots
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}
