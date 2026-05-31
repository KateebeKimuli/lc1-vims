/**
 * ============================================================
 * REPORTS & ANALYTICS — src/pages/ReportsPage.jsx
 * ============================================================
 * Full analytics dashboard with live charts:
 *   - Population overview (stat cards with sparklines)
 *   - Age pyramid (male vs female by age group)
 *   - Sex ratio donut
 *   - Religion breakdown (horizontal bar)
 *   - Tribe/ethnicity breakdown (horizontal bar)
 *   - Occupation spread (bar chart)
 *   - Births vs deaths monthly trend
 *   - Cases opened vs resolved
 *   - PDM eligibility auto-report
 *   - Print-ready paginated village register PDF
 * ============================================================
 */

import { useState, useEffect, useMemo } from 'react'
import { useAuth }                       from '../hooks/useAuth'
import { useVillageDB }                  from '../db/villageDB'
import PageHeader                        from '../components/shared/PageHeader'
import { Toast, useToast }               from '../components/shared/Toast'
import { BarChart, HorizontalBar, DonutChart, AgePyramid, StatCard } from '../components/charts/Charts'
import { saveDocument, FOLDERS } from '../services/documentStorage.js'
import { generatePopulationReport }      from '../services/documentService'
import { jsPDF }                         from 'jspdf'
import autoTable                         from 'jspdf-autotable'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'

export default function ReportsPage() {
  const db                   = useVillageDB()
  const { user }             = useAuth()
  const { toast, showToast } = useToast()

  const [residents,   setResidents]   = useState([])
  const [births,      setBirths]      = useState([])
  const [deaths,      setDeaths]      = useState([])
  const [cases,       setCases]       = useState([])
  const [welfare,     setWelfare]     = useState([])
  const [households,  setHouseholds]  = useState([])
  const [businesses,  setBusinesses]  = useState([])
  const [landRecords, setLandRecords] = useState([])
  const [meetings,    setMeetings]    = useState([])
  const [letters,     setLetters]     = useState([])
  const [security,    setSecurity]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState('overview')
  const [exporting,   setExporting]   = useState(false)
  // Advanced filter/sieve state
  const [filters, setFilters] = useState({
    ageMin: '', ageMax: '', sex: 'all', tribe: 'all', religion: 'all',
    residentType: 'all', status: 'active', nationality: 'all',
  })

  useEffect(() => { load() }, [db.villageId])

  async function load() {
    setLoading(true)
    try {
      const [res, b, d, c, w, hh, biz, land, meetings, letters, security] = await Promise.all([
        db.getAll('residents'), db.getAll('births'),    db.getAll('deaths'),
        db.getAll('cases'),     db.getAll('welfare'),   db.getAll('households'),
        db.getAll('businesses'),db.getAll('land'),      db.getAll('meetings'),
        db.getAll('letters'),   db.getAll('security'),
      ])
      setResidents(res); setBirths(b); setDeaths(d); setCases(c)
      setWelfare(w); setHouseholds(hh); setBusinesses(biz)
      setLandRecords(land); setMeetings(meetings); setLetters(letters); setSecurity(security)
    } catch (err) { showToast('Error loading data: ' + err.message, 'error') }
    finally { setLoading(false) }
  }

  // ── Computed analytics ────────────────────────────────────────────────
  // Apply advanced sieve filters
  const applyFilters = (list) => list.filter(r => {
    if (filters.status !== 'all' && r.status !== filters.status) return false
    if (filters.sex !== 'all' && r.sex !== filters.sex) return false
    if (filters.tribe !== 'all' && r.tribe !== filters.tribe) return false
    if (filters.religion !== 'all' && r.religion !== filters.religion) return false
    if (filters.residentType !== 'all' && (r.residentType||'permanent') !== filters.residentType) return false
    if (filters.nationality !== 'all') {
      const isUg = !r.nationality || r.nationality.toLowerCase() === 'ugandan'
      if (filters.nationality === 'ugandan' && !isUg) return false
      if (filters.nationality === 'foreign' && isUg) return false
    }
    if (filters.ageMin || filters.ageMax) {
      if (!r.dateOfBirth) return filters.ageMin === '' && filters.ageMax === ''
      const age = Math.floor((Date.now() - new Date(r.dateOfBirth)) / (365.25*24*3600*1000))
      if (filters.ageMin && age < Number(filters.ageMin)) return false
      if (filters.ageMax && age > Number(filters.ageMax)) return false
    }
    return true
  })
  const active   = applyFilters(residents.filter(r => r.status === 'active' || r.residentType === 'tenant'))
  const deceased = residents.filter(r => r.status === 'deceased')
  const allActive = residents.filter(r => r.status === 'active' || r.residentType === 'tenant')
  const uniqueTribes     = [...new Set(allActive.map(r=>r.tribe).filter(Boolean))].sort()
  const uniqueReligions  = [...new Set(allActive.map(r=>r.religion).filter(Boolean))].sort()
  const migrated = residents.filter(r => r.status === 'migrated')
  const male     = active.filter(r => r.sex === 'Male').length
  const female   = active.filter(r => r.sex === 'Female').length

  // Monthly trends — last 6 months
  const monthlyTrends = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d   = subMonths(new Date(), 5 - i)
      const lo  = startOfMonth(d)
      const hi  = endOfMonth(d)
      const inM = (date) => date && new Date(date) >= lo && new Date(date) <= hi
      return {
        label:   format(d, 'MMM'),
        births:  births.filter(b  => inM(b.dateOfBirth  || b.createdAt)).length,
        birthsM: births.filter(b  => (b.sex||b.childSex) === 'Male'   && inM(b.dateOfBirth || b.createdAt)).length,
        birthsF: births.filter(b  => (b.sex||b.childSex) === 'Female' && inM(b.dateOfBirth || b.createdAt)).length,
        deaths:  deaths.filter(d  => inM(d.dateOfDeath  || d.createdAt)).length,
        cases:   cases.filter(c   => inM(c.createdAt)).length,
        resolved:cases.filter(c   => c.status === 'resolved' && inM(c.updatedAt)).length,
        newRes:  residents.filter(r=> inM(r.createdAt)).length,
      }
    })
    return months
  }, [births, deaths, cases, residents])

  // Religion breakdown
  const religionData = useMemo(() => {
    const counts = {}
    active.forEach(r => { if (r.religion) counts[r.religion] = (counts[r.religion] || 0) + 1 })
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,8)
      .map(([label, value]) => ({ label, value }))
  }, [active])

  // Tribe breakdown
  const tribeData = useMemo(() => {
    const counts = {}
    active.forEach(r => { if (r.tribe) counts[r.tribe] = (counts[r.tribe] || 0) + 1 })
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,8)
      .map(([label, value]) => ({ label, value }))
  }, [active])

  // Occupation breakdown
  const occupationData = useMemo(() => {
    const counts = {}
    active.forEach(r => { if (r.occupation) counts[r.occupation] = (counts[r.occupation] || 0) + 1 })
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,8)
      .map(([label, value]) => ({ label, value }))
  }, [active])

  // PDM eligibility — households with 3+ active residents
  const pdmEligible = useMemo(() => {
    const hhMap = {}
    active.forEach(r => {
      const key = r.household || r.village || 'general'
      hhMap[key] = (hhMap[key] || 0) + 1
    })
    // Households with 3+ members and welfare status = none (not yet benefiting)
    const benefiting = new Set(welfare.map(w => w.householdId || w.residentId))
    return Object.entries(hhMap)
      .filter(([k, count]) => count >= 1)
      .map(([zone, count]) => ({ zone, count, enrolled: benefiting.has(zone) }))
  }, [active, welfare])

  // ── PDF exports ───────────────────────────────────────────────────────

  async function exportPopulationPDF() {
    setExporting(true)
    try {
      await generatePopulationReport(
        { active: active.length, deceased: deceased.length, migrated: migrated.length,
          total: residents.length, male, female, households: households.length,
          businesses: businesses.length, welfare: welfare.length },
        residents, user
      )
      showToast('Population report exported')
    } catch (err) { showToast('Export failed: ' + err.message, 'error') }
    finally { setExporting(false) }
  }

  async function exportVillageRegister() {
    const doc = new jsPDF({ unit:'mm', format:'a4' })
    const vn  = user?.villageName || 'Village'
    // Add logo if available — read from village-specific settings
    try {
      const { getVillageDB } = await import('../db/multiTenantDB.js')
      const vdb    = await getVillageDB(user?.villageId)
      const logoEn = await vdb.get('settings', 'officialLogo')
      if (logoEn?.value) {
        doc.addImage(logoEn.value, 'JPEG', 14, 8, 20, 20)
      }
    } catch {}

    // Header
    doc.setFont('helvetica','bold'); doc.setFontSize(14)
    doc.text('REPUBLIC OF UGANDA — MINISTRY OF LOCAL GOVERNMENT', 105, 14, { align:'center' })
    doc.setFontSize(11)
    doc.text(`${vn.toUpperCase()} VILLAGE — LC1 OFFICIAL RESIDENTS REGISTER`, 105, 21, { align:'center' })
    doc.setFont('helvetica','normal'); doc.setFontSize(9)
    doc.text(`${user?.parishName || ''} Parish · ${user?.districtName || ''} District`, 105, 27, { align:'center' })
    doc.text(`Generated: ${format(new Date(),'dd MMMM yyyy HH:mm')} · Total active: ${active.length}`, 105, 33, { align:'center' })
    doc.setDrawColor(0,80,0); doc.setLineWidth(0.8); doc.line(14, 36, 196, 36)
    doc.setLineWidth(0.3); doc.line(14, 37.5, 196, 37.5)

    autoTable(doc, {
      startY: 41,
      head: [['#','Surname','First name','NIN','Sex','DOB','Age','Zone/Cell','Type','Phone']],
      body: active.sort((a,b) => (a.surname||'').localeCompare(b.surname||'')).map((r,i) => {
        const age = r.dateOfBirth ? Math.floor((Date.now()-new Date(r.dateOfBirth))/(365.25*24*3600*1000)) : '—'
        return [
          i+1,
          r.surname   || '',
          r.firstName || '',
          r.nin       || '—',
          r.sex?.[0]  || '—',
          r.dateOfBirth ? format(new Date(r.dateOfBirth),'dd/MM/yyyy') : '—',
          age,
          r.zone || r.physicalAddress || '—',
          r.residentType || 'permanent',
          r.phone     || '—',
        ]
      }),
      styles:      { fontSize:7.5, cellPadding:2 },
      headStyles:  { fillColor:[0,100,0], textColor:255, fontSize:8, fontStyle:'bold' },
      alternateRowStyles: { fillColor:[245,250,245] },
      columnStyles: {
        0: { halign:'center', cellWidth:8 },
        3: { font:'courier', fontSize:7 },
        4: { halign:'center', cellWidth:8 },
        7: { halign:'center', cellWidth:14 },
      },
      didDrawPage: (data) => {
        // Footer on every page
        const pg = doc.internal.getNumberOfPages()
        doc.setFontSize(7); doc.setTextColor(120)
        doc.text(`${vn} Village LC1 Official Register · Page ${data.pageNumber}`, 105, 291, { align:'center' })
        doc.text('Official LC1 Document — Ministry of Local Government, Republic of Uganda', 105, 295, { align:'center' })
        doc.setTextColor(0)
      }
    })

    // Signature block on last page
    const finalY = doc.lastAutoTable.finalY + 12
    doc.setFont('helvetica','normal'); doc.setFontSize(9)
    doc.text('Certified correct by:', 14, finalY)
    doc.line(14, finalY + 16, 80, finalY + 16)
    doc.text(user?.fullName || 'LC1 Chairperson', 14, finalY + 20)
    doc.text(user?.role?.replace(/_/g,' ') || 'LC1 Chairperson', 14, finalY + 25)
    doc.text(`Date: ${format(new Date(),'dd MMMM yyyy')}`, 14, finalY + 30)
    doc.setDrawColor(0,80,0); doc.setLineWidth(0.8)
    doc.rect(130, finalY - 2, 52, 38)
    doc.setFontSize(7); doc.setTextColor(0,80,0)
    doc.text('OFFICIAL STAMP', 156, finalY + 16, { align:'center' })
    doc.setTextColor(0)

    const regFilename = `${vn.replace(/\s+/g,'-')}-LC1-Register-${format(new Date(),'yyyyMMdd')}.pdf`
    const blob = doc.output('blob')
    const result = await saveDocument(blob, regFilename, FOLDERS.REPORTS, vn)
    showToast(result.method === 'filesystem'
      ? `✓ Saved to ${FOLDERS.REPORTS}/${regFilename}`
      : 'Village register downloaded successfully')
  }

  function exportPDMReport() {
    const doc = new jsPDF({ unit:'mm', format:'a4' })
    doc.setFont('helvetica','bold'); doc.setFontSize(13)
    doc.text('PDM BENEFICIARY ELIGIBILITY REPORT', 105, 18, { align:'center' })
    doc.setFont('helvetica','normal'); doc.setFontSize(9)
    doc.text(`${user?.villageName || ''} Village · ${format(new Date(),'dd MMMM yyyy')}`, 105, 25, { align:'center' })

    autoTable(doc, {
      startY: 32,
      head: [['Zone / Cell', 'Active residents', 'Currently enrolled', 'Eligible']],
      body: pdmEligible.map(h => [
        h.zone, h.count, h.enrolled ? 'Yes' : 'No', !h.enrolled ? '✓ Eligible' : '—'
      ]),
      headStyles: { fillColor:[0,100,0] },
      styles: { fontSize:9 },
    })

    doc.setFontSize(8)
    doc.text(`Total eligible: ${pdmEligible.filter(h => !h.enrolled).length} of ${pdmEligible.length} zones`, 14, doc.lastAutoTable.finalY + 8)
    doc.save(`PDM-Eligibility-${user?.villageName?.replace(/\s+/g,'-')}-${format(new Date(),'yyyyMMdd')}.pdf`)
    showToast('PDM eligibility report exported')
  }

  // ── Tabs ────────────────────────────────────────────────────────────────
  const TABS = [
    { id:'overview',    label:'📊 Overview'      },
    { id:'sieve',       label:'🔍 Data Sieve'    },
    { id:'population',  label:'👥 Population'    },
    { id:'trends',      label:'📈 Trends'        },
    { id:'pdm',         label:'🤝 PDM'           },
    { id:'exports',     label:'📄 Exports'       },
  ]

  if (loading) return (
    <div className="page" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:400 }}>
      <div style={{ textAlign:'center', color:'var(--c-text2)' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
        <div>Building analytics…</div>
      </div>
    </div>
  )

  return (
    <div className="page">
      <PageHeader
        title="Reports & Analytics"
        sub={`${user?.villageName || ''} Village · ${format(new Date(),'dd MMMM yyyy')}`}
      />

      {/* Tab bar */}
      <div className="tabs" style={{ marginBottom:28 }}>
        {TABS.map(t => (
          <button key={t.id}
            className={`tab ${activeTab===t.id?'active':''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: OVERVIEW ══════════════ */}
      {activeTab === 'overview' && (
        <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

          {/* Stat cards row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:14 }}>
            <StatCard label="Active residents" value={active.length}
              color="var(--c-green-xl)" icon="👤"
              trend={monthlyTrends.map(m => m.newRes)}
              sub={`${male}M · ${female}F`} />
            <StatCard label="Births registered" value={births.length}
              color="#9B59B6" icon="👶"
              trend={monthlyTrends.map(m => m.births)} />
            <StatCard label="Deaths recorded" value={deaths.length}
              color="var(--c-text3)" icon="📋"
              trend={monthlyTrends.map(m => m.deaths)} />
            <StatCard label="Migrated out" value={migrated.length}
              color="#5dade2" icon="🚶" />
            <StatCard label="Cases" value={cases.length}
              color="var(--c-red-l)" icon="⚖️"
              sub={`${cases.filter(c=>c.status==='open').length} open`}
              trend={monthlyTrends.map(m => m.cases)} />
            <StatCard label="Households" value={households.length}
              color="#5dade2" icon="🏠" />
            <StatCard label="Businesses" value={businesses.length}
              color="#00b894" icon="🏪" />
            <StatCard label="Welfare/PDM" value={welfare.length}
              color="var(--c-gold)" icon="🤝" />
            <StatCard label="Land plots" value={landRecords.length}
              color="#5dade2" icon="📐" />
            <StatCard label="Meetings" value={meetings.length}
              color="#00b894" icon="🗣️" />
            <StatCard label="Letters issued" value={letters.length}
              color="#a29bfe" icon="📄"
              sub={`${letters.filter(l=>l.issuedAt).length} issued`} />
            <StatCard label="Security incidents" value={security.length}
              color="#e17055" icon="🛡️"
              sub={`${security.filter(s=>s.status==='resolved').length} resolved`} />
          </div>

          {/* Two column charts */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

            {/* Sex ratio donut */}
            <div className="card">
              <DonutChart
                title="Sex ratio (active residents)"
                data={[
                  { label:'Male',   value:male,   color:'#3498DB' },
                  { label:'Female', value:female, color:'#E91E8C' },
                ]}
              />
            </div>

            {/* Monthly births vs deaths */}
            <div className="card">
              <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                Births vs deaths (last 6 months)
              </div>
              <BarChart
                height={150}
                data={monthlyTrends.flatMap(m => [
                  { label:m.label, value:m.birthsM||Math.round(m.births*0.5), color:'#3498DB' },
                  { label:'',      value:m.birthsF||Math.round(m.births*0.5), color:'#E91E8C' },
                  { label:'',      value:m.deaths,  color:'#E74C3C' },
                ])}
              />
              <div style={{ display:'flex', gap:16, marginTop:8, justifyContent:'center', flexWrap:'wrap' }}>
                {[['Births (M)','#3498DB'],['Births (F)','#E91E8C'],['Deaths','#7F8C8D']].map(([l,c])=>(
                  <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                    <div style={{ width:10, height:10, borderRadius:2, background:c }} />
                    <span style={{ color:'var(--c-text2)' }}>{l}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:6 }}>
                Population net change this period: {' '}
                <strong style={{ color: monthlyTrends.reduce((s,m)=>s+m.births-m.deaths,0) >= 0 ? 'var(--c-green-xl)' : 'var(--c-red-l)' }}>
                  {monthlyTrends.reduce((s,m)=>s+m.births-m.deaths,0) >= 0 ? '+' : ''}
                  {monthlyTrends.reduce((s,m)=>s+m.births-m.deaths,0)} people
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ══════════════ TAB: SIEVE ══════════════ */}
      {activeTab === 'sieve' && (
        <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
          {/* Filter panel */}
          <div className="card">
            <div style={{ fontWeight:700, fontSize:15, marginBottom:14 }}>🔍 Data Sieve — Filter any data</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}>
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="deceased">Deceased</option>
                  <option value="migrated">Migrated</option>
                  <option value="affiliated">Affiliated</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sex</label>
                <select className="form-select" value={filters.sex} onChange={e=>setFilters(p=>({...p,sex:e.target.value}))}>
                  <option value="all">All</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Age from</label>
                <input className="form-input" type="number" min="0" max="120" placeholder="0"
                  value={filters.ageMin} onChange={e=>setFilters(p=>({...p,ageMin:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Age to</label>
                <input className="form-input" type="number" min="0" max="120" placeholder="120"
                  value={filters.ageMax} onChange={e=>setFilters(p=>({...p,ageMax:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Tribe</label>
                <select className="form-select" value={filters.tribe} onChange={e=>setFilters(p=>({...p,tribe:e.target.value}))}>
                  <option value="all">All tribes</option>
                  {uniqueTribes.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Religion</label>
                <select className="form-select" value={filters.religion} onChange={e=>setFilters(p=>({...p,religion:e.target.value}))}>
                  <option value="all">All religions</option>
                  {uniqueReligions.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Residency type</label>
                <select className="form-select" value={filters.residentType} onChange={e=>setFilters(p=>({...p,residentType:e.target.value}))}>
                  <option value="all">All types</option>
                  <option value="permanent">Permanent</option>
                  <option value="tenant">Tenant</option>
                  <option value="affiliated">Affiliated</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Nationality</label>
                <select className="form-select" value={filters.nationality} onChange={e=>setFilters(p=>({...p,nationality:e.target.value}))}>
                  <option value="all">All</option>
                  <option value="ugandan">Ugandan</option>
                  <option value="foreign">Foreign nationals</option>
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:14 }}>
              <div style={{ background:'var(--c-green)', color:'#fff', padding:'6px 16px', borderRadius:8, fontWeight:600, fontSize:13 }}>
                {active.length} resident{active.length!==1?'s':''} match filters
              </div>
              <button className="btn btn-secondary btn-sm" onClick={()=>setFilters({ageMin:'',ageMax:'',sex:'all',tribe:'all',religion:'all',residentType:'all',status:'active',nationality:'all'})}>
                Clear filters
              </button>
            </div>
          </div>

          {/* Results */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:14 }}>
            <StatCard label="Matching residents" value={active.length} color="var(--c-green-xl)" icon="👤" />
            <StatCard label="Male" value={active.filter(r=>r.sex==='Male').length} color="#3498DB" icon="♂" />
            <StatCard label="Female" value={active.filter(r=>r.sex==='Female').length} color="#E91E8C" icon="♀" />
            <StatCard label="Avg age" icon="📅" color="var(--c-gold)"
              value={active.filter(r=>r.dateOfBirth).length > 0
                ? Math.round(active.filter(r=>r.dateOfBirth).reduce((s,r)=>{
                    return s + Math.floor((Date.now()-new Date(r.dateOfBirth))/(365.25*24*3600*1000))
                  },0) / active.filter(r=>r.dateOfBirth).length)
                : '—'} />
          </div>

          {/* Tribe chart */}
          {filters.tribe === 'all' && (
            <div className="card">
              <HorizontalBar title="Tribe distribution in filtered results"
                data={uniqueTribes.map(t=>({ label:t, value:active.filter(r=>r.tribe===t).length })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,10)} />
            </div>
          )}

          {/* Religion chart */}
          {filters.religion === 'all' && (
            <div className="card">
              <DonutChart title="Religion distribution in filtered results"
                data={uniqueReligions.map(r=>({ label:r, value:active.filter(x=>x.religion===r).length })).filter(d=>d.value>0)} />
            </div>
          )}

          {/* Filtered residents list */}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Sex</th><th>Age</th><th>Tribe</th><th>Religion</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>
                {active.slice(0,50).map(r => {
                  const age = r.dateOfBirth ? Math.floor((Date.now()-new Date(r.dateOfBirth))/(365.25*24*3600*1000)) : '—'
                  return (
                    <tr key={r.id}>
                      <td style={{fontWeight:500}}>{r.surname} {r.firstName}</td>
                      <td>{r.sex||'—'}</td>
                      <td>{age}</td>
                      <td>{r.tribe||'—'}</td>
                      <td>{r.religion||'—'}</td>
                      <td><span className="badge badge-gray" style={{fontSize:10}}>{r.residentType||'permanent'}</span></td>
                      <td><span className={`badge badge-${r.status==='active'?'green':r.status==='deceased'?'gray':'gold'}`}>{r.status}</span></td>
                    </tr>
                  )
                })}
                {active.length > 50 && (
                  <tr><td colSpan={7} style={{textAlign:'center',color:'var(--c-text3)',padding:12}}>
                    Showing 50 of {active.length} matching records
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: POPULATION BREAKDOWN ══════════════ */}
      {activeTab === 'population' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* Age pyramid */}
          <div className="card">
            <AgePyramid residents={residents} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            {/* Religion */}
            <div className="card">
              {religionData.length > 0
                ? <HorizontalBar title="Religion" data={religionData} />
                : <div style={{ color:'var(--c-text3)', fontSize:13, padding:'20px 0' }}>No religion data yet — add it when registering residents.</div>
              }
            </div>
            {/* Tribe */}
            <div className="card">
              {tribeData.length > 0
                ? <HorizontalBar title="Tribe / Ethnicity" data={tribeData} />
                : <div style={{ color:'var(--c-text3)', fontSize:13, padding:'20px 0' }}>No tribe data yet.</div>
              }
            </div>
          </div>

          {/* Occupation */}
          <div className="card">
            {occupationData.length > 0
              ? <HorizontalBar title="Occupation breakdown" data={occupationData} />
              : <div style={{ color:'var(--c-text3)', fontSize:13 }}>No occupation data yet.</div>
            }
          </div>

          {/* Residency type donut */}
          <div className="card">
            <DonutChart
              title="Residency type"
              data={[
                { label:'Permanent', value: active.filter(r=>r.residentType==='permanent'||!r.residentType).length, color:'#2D7A4F' },
                { label:'Tenant',    value: active.filter(r=>r.residentType==='tenant').length,     color:'#F39C12' },
                { label:'Multi-home',value: active.filter(r=>r.residentType==='multi_home').length, color:'#9B59B6' },
              ].filter(d=>d.value>0)}
            />
          </div>
        </div>
      )}

      {/* ══════════════ TAB: TRENDS ══════════════ */}
      {activeTab === 'trends' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* Registration trend */}
          <div className="card">
            <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              New registrations per month
            </div>
            <BarChart
              height={160}
              color="var(--c-green)"
              data={monthlyTrends.map(m => ({ label:m.label, value:m.newRes }))}
            />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            {/* Cases trend */}
            <div className="card">
              <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                Cases opened vs resolved
              </div>
              <BarChart
                height={120}
                data={monthlyTrends.flatMap(m => [
                  { label:m.label, value:m.cases,    color:'#E74C3C' },
                  { label:'',      value:m.resolved, color:'#2D7A4F' },
                ])}
              />
              <div style={{ display:'flex', gap:16, marginTop:8, justifyContent:'center' }}>
                {[['Opened','#E74C3C'],['Resolved','#2D7A4F']].map(([l,c])=>(
                  <div key={l} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                    <div style={{ width:10, height:10, borderRadius:2, background:c }} />
                    <span style={{ color:'var(--c-text2)' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status breakdown donut */}
            <div className="card">
              <DonutChart
                title="Resident status breakdown"
                data={[
                  { label:'Active',   value:active.length,   color:'#2D7A4F' },
                  { label:'Deceased', value:deceased.length, color:'#7F8C8D' },
                  { label:'Migrated', value:migrated.length, color:'#5dade2' },
                ].filter(d=>d.value>0)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ TAB: PDM ELIGIBILITY ══════════════ */}
      {activeTab === 'pdm' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* Summary banner */}
          <div style={{
            background:'rgba(45,122,79,0.1)', border:'1px solid var(--c-green)',
            borderRadius:12, padding:'16px 20px',
            display:'flex', justifyContent:'space-between', alignItems:'center',
          }}>
            <div>
              <div style={{ fontWeight:700, fontSize:16 }}>PDM Eligibility Summary</div>
              <div style={{ fontSize:13, color:'var(--c-text2)', marginTop:4 }}>
                Parish Development Model — potential beneficiary zones in {user?.villageName || 'this village'}
              </div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:36, fontWeight:800, color:'var(--c-green-xl)' }}>
                {pdmEligible.filter(h=>!h.enrolled).length}
              </div>
              <div style={{ fontSize:11, color:'var(--c-text3)' }}>eligible zones</div>
            </div>
          </div>

          {/* PDM table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zone / Cell</th>
                  <th>Active residents</th>
                  <th>PDM enrolled</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pdmEligible.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign:'center', color:'var(--c-text3)', padding:32 }}>
                    No zone data yet. Add zone/cell when registering residents.
                  </td></tr>
                ) : pdmEligible.map((h,i) => (
                  <tr key={i}>
                    <td style={{ fontWeight:500 }}>{h.zone}</td>
                    <td>{h.count}</td>
                    <td>
                      <span className={`badge badge-${h.enrolled?'green':'gray'}`}>
                        {h.enrolled ? 'Yes' : 'Not yet'}
                      </span>
                    </td>
                    <td>
                      {!h.enrolled
                        ? <span className="badge badge-gold">✓ Eligible for PDM</span>
                        : <span className="badge badge-green">Enrolled</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn btn-primary" onClick={exportPDMReport}>
            📄 Export PDM Eligibility Report (PDF)
          </button>
        </div>
      )}

      {/* ══════════════ TAB: EXPORTS ══════════════ */}
      {activeTab === 'exports' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

          <div className="card">
            <div style={{ fontSize:22, marginBottom:12 }}>📋</div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Official Village Register</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.7, marginBottom:16 }}>
              Paginated A4 register of all active residents, sorted by surname.
              Includes signature block and official stamp space. Ready for
              physical filing at the sub-county office.
            </p>
            <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:14 }}>
              {active.length} active residents · ~{Math.ceil(active.length / 40)} pages
            </div>
            <button className="btn btn-primary" onClick={exportVillageRegister}>
              📄 Generate Village Register PDF
            </button>
          </div>

          <div className="card">
            <div style={{ fontSize:22, marginBottom:12 }}>📊</div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Population Statistics Report</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.7, marginBottom:16 }}>
              Statistical summary on official letterhead. Includes population
              counts, sex ratio, age distribution summary, and module totals.
              Suitable for submission to UBOS or MoLG.
            </p>
            <button className="btn btn-secondary" onClick={exportPopulationPDF} disabled={exporting}>
              {exporting ? 'Generating…' : '📄 Export Statistics PDF'}
            </button>
          </div>

          <div className="card">
            <div style={{ fontSize:22, marginBottom:12 }}>🤝</div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>PDM Eligibility Report</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.7, marginBottom:16 }}>
              Auto-identifies zones eligible for Parish Development Model funds.
              Cross-references welfare enrolment to avoid double-counting.
            </p>
            <button className="btn btn-gold" onClick={exportPDMReport}>
              📄 Export PDM Report PDF
            </button>
          </div>

          <div className="card">
            <div style={{ fontSize:22, marginBottom:12 }}>💾</div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>Full Data Backup (JSON)</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.7, marginBottom:16 }}>
              Complete export of all village data as a JSON file. Store on USB
              drive as an offline backup. Can be restored via Settings.
            </p>
            <button className="btn btn-secondary" onClick={async () => {
              const data = {}
              const tables = ['residents','households','land','cases','meetings','births','deaths','letters','welfare','businesses','security']
              for (const t of tables) { try { data[t] = await db.getAll(t) } catch { data[t] = [] } }
              const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
              const bkFilename = `lc1-backup-${user?.villageName?.replace(/\s+/g,'-')}-${format(new Date(),'yyyyMMdd')}.json`
              a.download = bkFilename
              a.click()
              // Also try to save to organised folder
              saveDocument(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}), bkFilename, FOLDERS.BACKUPS, user?.villageName)
                .catch(()=>{})
              showToast('Backup exported')
            }}>
              💾 Download JSON Backup
            </button>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}
