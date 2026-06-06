/**
 * ============================================================
 * LAND TITLE GENERATOR — src/services/landTitleService.js
 * ============================================================
 * Generates two official land documents:
 *
 *   1. VILLAGE LAND TITLE (LC1 CERTIFICATE OF CUSTOMARY OWNERSHIP)
 *      - A4 portrait, official letterhead
 *      - Plot details, owner biodata, boundaries
 *      - Sketch map image embedded
 *      - Witness signatures, LC1 Chairperson signature
 *      - Official stamp box
 *      - Unique reference number
 *      - Date of issue
 *
 *   2. BOUNDARY INSPECTION REPORT
 *      - Records the boundary inspection process
 *      - Lists all neighbouring landowners present
 *      - Declarations and signatures
 *
 * LEGAL STATUS IN UGANDA:
 *   At LC1 level, a village land title/certificate is the
 *   foundational document for customary land rights.
 *   It is signed by the LC1 Chairperson, witnessed by
 *   committee members, and is recognised by higher authorities
 *   as proof of occupancy and customary ownership.
 * ============================================================
 */

import { jsPDF }     from 'jspdf'
import { savePDFDoc, FOLDERS } from './documentStorage.js'
import autoTable     from 'jspdf-autotable'
import { format }    from 'date-fns'

// ── Helpers ────────────────────────────────────────────────────────────────
function getDB() { return import('../db/index.js').then(m => m.getDB()) }

async function loadSettings(user = null) {
  const s = {}

  // Village-specific DB (primary)
  if (user?.villageId && user.villageId !== 'MASTER') {
    try {
      const { getVillageDB } = await import('../db/multiTenantDB.js')
      const vdb = await getVillageDB(user.villageId)
      const all = await vdb.getAll('settings')
      all.forEach(x => { s[x.key] = x.value })
    } catch {}
  }
  // Legacy DB fallback
  if (Object.keys(s).filter(k => k !== 'villageName').length === 0) {
    try {
      const db  = await getDB()
      const all = await db.getAll('settings')
      all.forEach(x => { s[x.key] = x.value })
    } catch {}
  }

  // User session (highest priority — always accurate from login)
  if (user) {
    if (user.villageName)   s.villageName   = user.villageName
    if (user.parishName)    s.parishName    = user.parishName
    if (user.subcountyName) s.subCountyName = user.subcountyName
    if (user.countyName)    s.countyName    = user.countyName
    if (user.districtName)  s.districtName  = user.districtName
    if (user.fullName && !s.chairName) s.chairName = user.fullName
  }

  return s
}

async function loadLogo() {
  try {
    // Logo is stored centrally in master DB
    const { getMasterDB } = await import('../db/multiTenantDB.js')
    const masterDB = await getMasterDB()
    const entry    = await masterDB.get('settings', 'officialLogo')
    if (entry?.value) return entry.value
    const { OFFICIAL_LOGO_BASE64 } = await import('../assets/officialLogo.js')
    return OFFICIAL_LOGO_BASE64
  } catch { return null }
}

// ── Reference number generator ─────────────────────────────────────────────
function makeLandRef(settings, plotNumber) {
  const dist  = (settings.districtName || 'UGA').slice(0,3).toUpperCase()
  const vill  = (settings.villageName  || 'VIL').slice(0,3).toUpperCase()
  const year  = new Date().getFullYear()
  const plot  = (plotNumber || '000').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,6)
  return `LC1/${dist}/${vill}/${year}/${plot}`
}

// ── Draw the sketch map SVG into the PDF canvas ────────────────────────────
async function embedSketchMap(doc, svgString, x, y, w, h) {
  if (!svgString) return

  // Convert SVG to image via canvas
  return new Promise((resolve) => {
    const blob  = new Blob([svgString], { type:'image/svg+xml' })
    const url   = URL.createObjectURL(blob)
    const img   = new Image()
    img.onload  = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = w * 4   // high-res
      canvas.height = h * 4
      const ctx = canvas.getContext('2d')
      ctx.scale(4, 4)
      ctx.fillStyle = '#FFFEF7'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      const png = canvas.toDataURL('image/png')
      doc.addImage(png, 'PNG', x, y, w, h)
      URL.revokeObjectURL(url)
      resolve()
    }
    img.onerror = () => resolve()
    img.src = url
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE VILLAGE LAND TITLE
// ═══════════════════════════════════════════════════════════════════════════
export async function generateLandTitle(landRecord, ownerResident, user) {
  const settings = await loadSettings(user)
  const logo     = await loadLogo()
  const doc      = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' })
  const W        = 210
  const MARGIN   = 18
  const TEXT_W   = W - MARGIN * 2
  const refNum   = makeLandRef(settings, landRecord.plotNumber)
  const issueDate= format(new Date(), 'dd MMMM yyyy')

  // ── DECORATIVE BORDER ────────────────────────────────────────────────────
  doc.setDrawColor(0, 77, 0)
  doc.setLineWidth(2)
  doc.rect(8, 8, W-16, 282)
  doc.setLineWidth(0.5)
  doc.rect(10, 10, W-20, 278)

  // ── HEADER ───────────────────────────────────────────────────────────────
  let y = 18

  // Logo
  if (logo) {
    try { doc.addImage(logo, 'JPEG', MARGIN, y, 22, 22) } catch {}
  }

  // Title text
  doc.setFont('helvetica','bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 77, 0)
  doc.text('REPUBLIC OF UGANDA', W/2, y+5, { align:'center' })
  doc.setFontSize(9)
  doc.text('MINISTRY OF LOCAL GOVERNMENT', W/2, y+10, { align:'center' })
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.text([
    settings.districtName ? `${settings.districtName} District` : '',
    settings.subcountyName ? `${settings.subcountyName} Sub-county` : '',
    settings.parishName ? `${settings.parishName} Parish` : '',
  ].filter(Boolean).join(' · '), W/2, y+16, { align:'center' })

  // MR Uganda coat-of-arms text placeholder (right side)
  doc.setFontSize(7)
  doc.setTextColor(100)
  doc.text(`Ref: ${refNum}`, W - MARGIN, y+4, { align:'right' })
  doc.text(`Issued: ${issueDate}`, W - MARGIN, y+9, { align:'right' })

  y += 26

  // Double rule
  doc.setDrawColor(0, 77, 0); doc.setLineWidth(1.2)
  doc.line(MARGIN, y, W-MARGIN, y)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, y+2, W-MARGIN, y+2)
  y += 8

  // Document title
  doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(0, 77, 0)
  doc.text('CERTIFICATE OF CUSTOMARY LAND OWNERSHIP', W/2, y, { align:'center' })
  y += 5
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(80)
  doc.text('(Village Level Land Title — Issued under the Land Act, Cap. 227)', W/2, y, { align:'center' })
  y += 7

  doc.setDrawColor(0,77,0); doc.setLineWidth(0.4)
  doc.line(MARGIN, y, W-MARGIN, y)
  y += 6

  // ── OWNER DETAILS ────────────────────────────────────────────────────────
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,77,0)
  doc.text('PART A — CERTIFICATE HOLDER', MARGIN, y)
  y += 6

  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(0)

  const ownerName = ownerResident
    ? `${ownerResident.surname || ''} ${ownerResident.firstName || ''} ${ownerResident.otherNames || ''}`.trim()
    : landRecord.ownerName || '—'

  const ownerFields = [
    ['Full name',      ownerName],
    ['National ID',    ownerResident?.nin || '—'],
    ['Date of birth',  ownerResident?.dateOfBirth ? format(new Date(ownerResident.dateOfBirth), 'dd MMMM yyyy') : '—'],
    ['Sex',            ownerResident?.sex || '—'],
    ['Phone',          ownerResident?.phone || '—'],
    ['Village',        ownerResident?.village || settings.villageName || '—'],
    ['Nationality',    ownerResident?.nationality || 'Ugandan'],
  ]

  // Two-column layout for owner details
  ownerFields.forEach(([k, v], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const fx  = MARGIN + col * (TEXT_W / 2)
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(80)
    doc.text(`${k}:`, fx, y + row * 7)
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(0)
    doc.text(String(v), fx + 26, y + row * 7)
  })
  y += Math.ceil(ownerFields.length / 2) * 7 + 4

  // Foreigner note
  if (ownerResident?.nationality && ownerResident.nationality.toLowerCase() !== 'ugandan') {
    doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(150, 80, 0)
    doc.text(`Note: Holder is a foreign national (${ownerResident.nationality}). Passport: ${ownerResident.passportNumber || '—'}. Permit: ${ownerResident.permitNumber || '—'}`, MARGIN, y)
    y += 6
  }

  doc.setDrawColor(180); doc.setLineWidth(0.3)
  doc.line(MARGIN, y, W-MARGIN, y); y += 5

  // ── LAND DETAILS ─────────────────────────────────────────────────────────
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,77,0)
  doc.text('PART B — LAND PARTICULARS', MARGIN, y); y += 6

  const landFields = [
    ['Plot number',    landRecord.plotNumber     || '—'],
    ['Land use',       landRecord.use            || '—'],
    ['Size',           landRecord.size ? `${landRecord.size} ${landRecord.unit}` : '—'],
    ['Title type',     landRecord.titleType      || 'Customary'],
    ['Location',       landRecord.location       || '—'],
    ['Village',        landRecord.village || settings.villageName || '—'],
    ['Parish',         settings.parishName       || '—'],
    ['Sub-county',     settings.subcountyName    || '—'],
    ['District',       settings.districtName     || '—'],
    ['Status',         landRecord.status         || 'Registered'],
  ]

  landFields.forEach(([k, v], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const fx  = MARGIN + col * (TEXT_W / 2)
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(80)
    doc.text(`${k}:`, fx, y + row * 7)
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(0)
    doc.text(String(v), fx + 28, y + row * 7)
  })
  y += Math.ceil(landFields.length / 2) * 7 + 3

  doc.setDrawColor(180); doc.setLineWidth(0.3)
  doc.line(MARGIN, y, W-MARGIN, y); y += 5

  // ── SKETCH MAP ───────────────────────────────────────────────────────────
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,77,0)
  doc.text('PART C — SKETCH MAP OF THE PLOT', MARGIN, y); y += 4

  const mapH = 72
  const mapW = TEXT_W

  if (landRecord.sketchMap) {
    try {
      await embedSketchMap(doc, landRecord.sketchMap, MARGIN, y, mapW, mapH)
    } catch {
      doc.setDrawColor(180); doc.setLineWidth(0.5)
      doc.rect(MARGIN, y, mapW, mapH)
      doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(150)
      doc.text('Sketch map not available', W/2, y + mapH/2, { align:'center' })
    }
  } else {
    doc.setDrawColor(180); doc.setLineWidth(0.5)
    doc.rect(MARGIN, y, mapW, mapH)
    doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(150)
    doc.text('No sketch map drawn — draw in the Land module', W/2, y + mapH/2, { align:'center' })
  }

  doc.setDrawColor(0,77,0); doc.setLineWidth(0.5)
  doc.rect(MARGIN, y, mapW, mapH)
  y += mapH + 4

  doc.setDrawColor(180); doc.setLineWidth(0.3)
  doc.line(MARGIN, y, W-MARGIN, y); y += 5

  // ── DECLARATION ──────────────────────────────────────────────────────────
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0,77,0)
  doc.text('PART D — DECLARATION AND CERTIFICATION', MARGIN, y); y += 5

  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(0)
  const declaration = `This is to certify that ${ownerName} is the lawful occupant and customary owner of the land described above, situated in ${settings.villageName || '[Village]'} Village, ${settings.parishName || '[Parish]'} Parish, ${settings.subcountyName || '[Sub-county]'} Sub-county, ${settings.districtName || '[District]'} District. The boundaries have been inspected and are not in dispute. This certificate is issued in accordance with the Land Act, Cap. 227 and the Local Governments Act, Cap. 243 of the Republic of Uganda.`

  const declLines = doc.splitTextToSize(declaration, TEXT_W)
  doc.text(declLines, MARGIN, y)
  y += declLines.length * 4.5 + 5

  // ── SIGNATURES ───────────────────────────────────────────────────────────
  const sigY = y

  // Three signature blocks
  const sigBlocks = [
    { label:'LC1 Chairperson',       name: settings.chairName || user?.fullName || '—' },
    { label:'LC1 General Secretary', name: settings.secretaryName || '—'               },
    { label:'LC1 Treasurer',         name: settings.treasurerName || '—'               },
  ]

  sigBlocks.forEach((s, i) => {
    const sx = MARGIN + i * (TEXT_W / 3)
    const sw = TEXT_W / 3 - 6

    doc.setDrawColor(0); doc.setLineWidth(0.4)
    doc.line(sx, sigY + 14, sx + sw, sigY + 14)
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(0)
    doc.text(s.label, sx + sw/2, sigY + 19, { align:'center' })
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(80)
    doc.text(s.name, sx + sw/2, sigY + 23, { align:'center' })
    doc.text(`Date: ____________________`, sx + sw/2, sigY + 28, { align:'center' })
  })

  // Official stamp box
  const stampX = W - MARGIN - 36
  doc.setDrawColor(0,77,0); doc.setLineWidth(1)
  doc.rect(stampX, sigY, 32, 32)
  doc.setFont('helvetica','bold'); doc.setFontSize(6); doc.setTextColor(0,77,0)
  doc.text('OFFICIAL', stampX+16, sigY+13, { align:'center' })
  doc.text('STAMP', stampX+16, sigY+19, { align:'center' })

  y = sigY + 34

  // ── FOOTER ───────────────────────────────────────────────────────────────
  doc.setDrawColor(0,77,0); doc.setLineWidth(0.8)
  doc.line(MARGIN, y+2, W-MARGIN, y+2)
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(80)
  doc.text(
    `${settings.villageName || 'Village'} LC1 · ${settings.parishName || 'Parish'} · ${settings.districtName || 'District'} · Ref: ${refNum} · Issued: ${issueDate}`,
    W/2, y+6, { align:'center' }
  )
  doc.text('This document is an official LC1 Village Land Certificate — Republic of Uganda', W/2, y+10, { align:'center' })

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const filename = `LandTitle-${(landRecord.plotNumber||'PLOT').replace(/\s+/g,'-')}-${ownerName.replace(/\s+/g,'-')}-${format(new Date(),'yyyyMMdd')}.pdf`
  await savePDFDoc(doc, filename, FOLDERS.LAND_TITLES, settings.villageName || user?.villageName)
  return filename
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE BOUNDARY INSPECTION REPORT
// ═══════════════════════════════════════════════════════════════════════════
export async function generateBoundaryReport(landRecord, ownerResident, user) {
  const settings = await loadSettings(user)
  const doc      = new jsPDF({ unit:'mm', format:'a4' })
  const W        = 210
  const MARGIN   = 18
  const refNum   = makeLandRef(settings, landRecord.plotNumber)

  let y = 20

  doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(0,77,0)
  doc.text('BOUNDARY INSPECTION REPORT', W/2, y, { align:'center' }); y += 6
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(0)
  doc.text(`${settings.villageName || ''} Village · Ref: ${refNum} · Date: ${format(new Date(),'dd MMMM yyyy')}`, W/2, y, { align:'center' })
  y += 8

  doc.setDrawColor(0,77,0); doc.setLineWidth(0.8)
  doc.line(MARGIN, y, W-MARGIN, y); y += 6

  doc.setFont('helvetica','bold'); doc.setFontSize(9)
  doc.text('PLOT SUMMARY', MARGIN, y); y += 5
  doc.setFont('helvetica','normal'); doc.setFontSize(9)
  doc.text(`Plot No: ${landRecord.plotNumber || '—'}   Owner: ${landRecord.ownerName || '—'}   Size: ${landRecord.size || '—'} ${landRecord.unit || ''}   Use: ${landRecord.use || '—'}`, MARGIN, y)
  y += 8

  // Boundary sides table
  doc.setFont('helvetica','bold'); doc.setFontSize(9)
  doc.text('BOUNDARY SIDES AND NEIGHBOURS', MARGIN, y); y += 3

  // Parse boundary data from sketch map SVG
  let sideData = []
  if (landRecord.sketchMap) {
    try {
      const parser  = new DOMParser()
      const svgDoc  = parser.parseFromString(landRecord.sketchMap, 'image/svg+xml')
      const root    = svgDoc.querySelector('svg')
      const pts     = JSON.parse(root?.getAttribute('data-points') || '[]')
      const neigh   = JSON.parse(root?.getAttribute('data-neighbours') || '{}')
      for (let i = 0; i < pts.length; i++) {
        const p1  = pts[i]
        const p2  = pts[(i+1) % pts.length]
        const d   = Math.sqrt((p2.x-p1.x)**2+(p2.y-p1.y)**2)
        const dirs= ['N','NE','E','SE','S','SW','W','NW']
        const ang = Math.atan2(p2.x-p1.x, -(p2.y-p1.y)) * 180/Math.PI
        const brg = dirs[Math.round(((ang+360)%360)/45)%8]
        sideData.push([
          `Side ${i+1}`, `${(d/50*10).toFixed(1)}m`, brg,
          neigh[i] || '(not recorded)', '________________'
        ])
      }
    } catch {}
  }

  if (sideData.length === 0) {
    sideData = [['—','—','—','No sketch map drawn — draw in Land module','—']]
  }

  autoTable(doc, {
    startY: y,
    head: [['Side','Length','Direction','Neighbouring owner / feature','Neighbour signature']],
    body: sideData,
    styles: { fontSize:8, cellPadding:3 },
    headStyles: { fillColor:[0,77,0], textColor:255 },
  })

  y = doc.lastAutoTable.finalY + 8

  // Declaration
  doc.setFont('helvetica','bold'); doc.setFontSize(9)
  doc.text('DECLARATION', MARGIN, y); y += 4
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5)
  const decl = `We, the undersigned, confirm that the above boundary inspection was conducted on ${format(new Date(),'dd MMMM yyyy')} in the presence of all parties. The boundaries described are agreed upon and are not in dispute.`
  doc.text(doc.splitTextToSize(decl, W-MARGIN*2), MARGIN, y)
  y += 16

  // Signature blocks
  ;[
    ['Applicant/Owner',   landRecord.ownerName || '—'],
    ['LC1 Chairperson',   settings.chairName   || user?.fullName || '—'],
    ['Witness 1',         ''],
    ['Witness 2',         ''],
  ].forEach((s, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const sx  = MARGIN + col * (W/2 - MARGIN)
    const sy  = y + row * 22
    doc.setDrawColor(0); doc.setLineWidth(0.4)
    doc.line(sx, sy+12, sx+60, sy+12)
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5)
    doc.text(s[0], sx, sy+17)
    if (s[1]) { doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.text(s[1], sx, sy+21) }
  })

  await savePDFDoc(doc, `BoundaryReport-${landRecord.plotNumber||'PLOT'}-${format(new Date(),'yyyyMMdd')}.pdf`, FOLDERS.BOUNDARY, settings.villageName || user?.villageName)
}
