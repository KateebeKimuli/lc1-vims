/**
 * ============================================================
 * DOCUMENT GENERATOR — src/services/documentService.js
 * ============================================================
 * Produces professional PDF documents with:
 *
 *   - Official letterhead (logo + ministry name + village address)
 *   - Document body with proper typography
 *   - Signature block with name, designation, date, and stamp box
 *   - Footer with reference number and page number
 *
 * LOGO HANDLING:
 *   The logo is stored in IndexedDB settings under the key
 *   'officialLogo'. It is saved as a base64 data URL (PNG/JPG).
 *   If no logo is uploaded, the letterhead falls back to a
 *   text-only header with "MINISTRY OF LOCAL GOVERNMENT" in bold.
 *
 * DOCUMENT TYPES SUPPORTED:
 *   - Introduction letter
 *   - Residence confirmation
 *   - Character certificate
 *   - Birth confirmation
 *   - Death confirmation
 *   - Land ownership confirmation
 *   - Good conduct letter
 *   - Poverty / indigence certificate
 *   - Travel support letter
 *   - Recommendation letter
 *   - Resident profile print
 *   - Any custom letter type
 *
 * LAYOUT (top to bottom, all measurements in mm):
 *   0–55   Letterhead (logo left, text right OR centred)
 *   55–60  Thick rule line
 *   60–68  Reference number (left) + Date (right)
 *   68–80  Document title (centred, bold, underlined)
 *   80–82  "To:" addressee line (if present)
 *   82–??  Body text (auto-wrapped at 170mm)
 *   ??     Signature block
 *   last   Footer rule + reference + page number
 * ============================================================
 */

import { jsPDF } from 'jspdf'
import { savePDFDoc, FOLDERS } from './documentStorage.js'
import { stripHtml } from '../components/shared/RichTextEditor'
import { format } from 'date-fns'

// ── PDF page constants ─────────────────────────────────────────────────────
const PAGE_W     = 210          // A4 width in mm
const PAGE_H     = 297          // A4 height in mm
const MARGIN_L   = 20           // left margin
const MARGIN_R   = 190          // right edge
const TEXT_W     = 170          // usable text width
const CENTER     = PAGE_W / 2   // horizontal centre

// ── Typography helpers ─────────────────────────────────────────────────────
// jsPDF font families: 'helvetica' | 'courier' | 'times'
// We use 'times' for body (traditional government document feel)
// and 'helvetica' for header elements (modern, readable)

/**
 * loadLogoFromSettings()
 * Retrieves the stored logo base64 string from IndexedDB.
 * Returns null if no logo has been uploaded.
 */
async function loadLogoFromSettings() {
  try {
    const { getDB } = await import('../db/index.js')
    const db        = await getDB()
    const entry     = await db.get('settings', 'officialLogo')
    if (entry?.value) return entry.value

    // Fall back to the embedded default logo (works fully offline)
    const { OFFICIAL_LOGO_BASE64 } = await import('../assets/officialLogo.js')
    return OFFICIAL_LOGO_BASE64
  } catch {
    // If all else fails return null — document will render without logo
    return null
  }
}

/**
 * loadSettingsMap(user)
 * Returns all settings as a key→value plain object.
 *
 * Priority order:
 *   1. user session object (from login — always has village/parish/district)
 *   2. Village-specific DB settings (saved via Setup flow)
 *   3. Legacy shared DB settings (fallback)
 *
 * This ensures village name, parish, district, sub-county are ALWAYS
 * present on documents regardless of which DB was used during setup.
 */
async function loadSettingsMap(user = null) {
  const s = {}

  // Village-specific DB (primary — always use this first)
  if (user?.villageId && user.villageId !== 'MASTER') {
    try {
      const { getVillageDB } = await import('../db/multiTenantDB.js')
      const vdb = await getVillageDB(user.villageId)
      const all = await vdb.getAll('settings')
      all.forEach(x => { s[x.key] = x.value })
    } catch {}
  }
  // Legacy DB fallback (only if no village DB settings found)
  if (Object.keys(s).filter(k => k !== 'villageName').length === 0) {
    try {
      const { getDB } = await import('../db/index.js')
      const db  = await getDB()
      const all = await db.getAll('settings')
      all.forEach(x => { s[x.key] = x.value })
    } catch {}
  }

  // 1. User session (highest priority — always accurate from login)
  // These come directly from the Uganda locations database selected at login
  if (user) {
    if (user.villageName)   s.villageName   = user.villageName
    if (user.parishName)    s.parishName    = user.parishName
    if (user.subcountyName) s.subCountyName = user.subcountyName
    if (user.countyName)    s.countyName    = user.countyName
    if (user.districtName)  s.districtName  = user.districtName
    // Chairperson name from user record
    if (user.fullName && !s.chairName) s.chairName = user.fullName
  }

  return s
}

// ─────────────────────────────────────────────────────────────────────────
// CORE LETTERHEAD RENDERER
// Draws the letterhead on the current page. Called once per page.
// Returns the Y position immediately below the letterhead (where body starts).
// ─────────────────────────────────────────────────────────────────────────

/**
 * drawLetterhead(doc, settings, logoBase64)
 * Renders the official letterhead:
 *   - Logo (left side, 35×35mm) if available, else MoLG text crest
 *   - "REPUBLIC OF UGANDA" (small caps, centred)
 *   - "MINISTRY OF LOCAL GOVERNMENT" (large bold, centred)
 *   - Village name, parish, sub-county, district (centred, smaller)
 *   - Thick rule line beneath
 *
 * @param {jsPDF} doc           - the jsPDF instance
 * @param {object} settings     - settings map from IndexedDB
 * @param {string|null} logo    - base64 logo data URL or null
 * @returns {number}            - Y position after the letterhead
 */
function drawLetterhead(doc, settings, logo) {
  const village    = settings.villageName    || 'Village'
  const parish     = settings.parishName     || 'Parish'
  const subcounty  = settings.subCountyName  || settings.subcountyName || 'Sub-county'
  const county     = settings.countyName     || 'County'
  const district   = settings.districtName   || 'District'

  // ── Logo or fallback crest ─────────────────────────────────────────────
  if (logo) {
    // Detect format from data URL prefix
    const fmt = logo.startsWith('data:image/png') ? 'PNG' : 'JPEG'
    // Place logo in top-left, 32mm wide × 32mm tall
    try {
      doc.addImage(logo, fmt, MARGIN_L, 8, 32, 32)
    } catch {
      // If image fails to render, draw placeholder box
      doc.setDrawColor(150)
      doc.rect(MARGIN_L, 8, 32, 32)
      doc.setFontSize(7)
      doc.setTextColor(150)
      doc.text('LOGO', MARGIN_L + 16, 26, { align: 'center' })
      doc.setTextColor(0)
    }
  } else {
    // Text-based placeholder when no logo uploaded
    doc.setFillColor(230, 240, 230)
    doc.roundedRect(MARGIN_L, 8, 32, 32, 3, 3, 'F')
    doc.setFontSize(6)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(60, 100, 60)
    doc.text('MINISTRY OF', MARGIN_L + 16, 18, { align: 'center' })
    doc.text('LOCAL GOVT', MARGIN_L + 16, 24, { align: 'center' })
    doc.text('UGANDA', MARGIN_L + 16, 30, { align: 'center' })
    doc.setTextColor(0)
  }

  // ── Ministry name block (centred, right of logo) ───────────────────────
  // "REPUBLIC OF UGANDA" — small, spaced caps
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  doc.text('REPUBLIC OF UGANDA', CENTER + 10, 14, { align: 'center' })

  // "MINISTRY OF LOCAL GOVERNMENT" — large bold
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(0, 60, 0)   // dark green — government colour
  doc.text('MINISTRY OF LOCAL GOVERNMENT', CENTER + 10, 22, { align: 'center' })

  // Thin rule under ministry name
  doc.setDrawColor(0, 100, 0)
  doc.setLineWidth(0.3)
  doc.line(58, 25, MARGIN_R, 25)

  // Village + location hierarchy
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text(`${village.toUpperCase()} VILLAGE — LOCAL COUNCIL 1`, CENTER + 10, 32, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  doc.text(
    `${parish} Parish · ${subcounty} Sub-county · ${county} County · ${district} District`,
    CENTER + 10, 38, { align: 'center' }
  )

  // Contact line if phone/email set
  const phone = settings.officePhone || settings.phone || ''
  const email = settings.officeEmail || settings.email || ''
  if (phone || email) {
    const contact = [phone && `Tel: ${phone}`, email && `Email: ${email}`].filter(Boolean).join('  |  ')
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    doc.text(contact, CENTER + 10, 43, { align: 'center' })
  }

  // ── Thick rule line beneath letterhead ────────────────────────────────
  // Double line (thick + thin) for a professional look
  doc.setDrawColor(0, 80, 0)
  doc.setLineWidth(1.5)
  doc.line(MARGIN_L, 48, MARGIN_R, 48)
  doc.setLineWidth(0.4)
  doc.line(MARGIN_L, 50, MARGIN_R, 50)

  // Reset drawing state
  doc.setTextColor(0)
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)

  return 56  // Y position where the document body starts
}

// ─────────────────────────────────────────────────────────────────────────
// FOOTER RENDERER
// ─────────────────────────────────────────────────────────────────────────

/**
 * drawFooter(doc, refNumber, pageNum)
 * Draws a footer at the bottom of the page with:
 *   - Thin rule
 *   - Reference number (left)
 *   - "Page X" (right)
 *   - Confidentiality notice (centre)
 */
function drawFooter(doc, refNumber, pageNum = 1) {
  const footerY = PAGE_H - 14
  doc.setDrawColor(180)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_L, footerY, MARGIN_R, footerY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(120)

  if (refNumber) {
    doc.text(`Ref: ${refNumber}`, MARGIN_L, footerY + 5)
  }
  doc.text('Official LC1 Document — Ministry of Local Government, Republic of Uganda', CENTER, footerY + 5, { align: 'center' })
  doc.text(`Page ${pageNum}`, MARGIN_R, footerY + 5, { align: 'right' })

  doc.setTextColor(0)
}

// ─────────────────────────────────────────────────────────────────────────
// SIGNATURE BLOCK
// ─────────────────────────────────────────────────────────────────────────

/**
 * drawSignatureBlock(doc, signerName, designation, date, startY)
 * Draws a professional signature block with:
 *   - "Signed:" label + signature line
 *   - Signer's full name
 *   - Designation (e.g. "LC1 Chairperson")
 *   - Date
 *   - Official stamp box (right side)
 *
 * @returns {number} Y position after the signature block
 */
function drawSignatureBlock(doc, signerName, designation, date, startY) {
  let y = startY + 8

  // ── Left side: signature ──────────────────────────────────────────────
  doc.setFont('times', 'normal')
  doc.setFontSize(10)
  doc.text('Signed:', MARGIN_L, y)

  // Signature line
  doc.setDrawColor(0)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_L, y + 14, MARGIN_L + 70, y + 14)

  // Name beneath line
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(signerName || 'LC1 Chairperson', MARGIN_L, y + 20)

  // Designation
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  doc.text(designation || 'LC1 Chairperson', MARGIN_L, y + 26)

  // Date
  doc.setFontSize(9)
  doc.text(`Date: ${date}`, MARGIN_L, y + 32)

  // ── Right side: official stamp box ────────────────────────────────────
  const stampX = MARGIN_R - 50
  const stampY = y - 2
  const stampW = 50
  const stampH = 38

  doc.setDrawColor(0, 80, 0)
  doc.setLineWidth(1)
  doc.roundedRect(stampX, stampY, stampW, stampH, 2, 2)

  // Dotted inner border
  doc.setLineWidth(0.3)
  doc.setDrawColor(0, 120, 0)
  doc.roundedRect(stampX + 2, stampY + 2, stampW - 4, stampH - 4, 1, 1)

  // "OFFICIAL STAMP" text inside box
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(0, 80, 0)
  doc.text('OFFICIAL STAMP', stampX + stampW / 2, stampY + stampH / 2 - 3, { align: 'center' })
  doc.setFontSize(6)
  doc.setFont('helvetica', 'normal')
  doc.text('LC1 Office', stampX + stampW / 2, stampY + stampH / 2 + 3, { align: 'center' })

  doc.setTextColor(0)
  doc.setDrawColor(0)

  return y + 40  // return Y after signature block
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — GENERATE SPECIFIC DOCUMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * generateOfficialLetter(letter, user)
 * Produces a fully formatted PDF for any LC1 official letter.
 *
 * @param {object} letter - the letter record from IndexedDB
 * @param {object} user   - the logged-in user (for signature block)
 */
export async function generateOfficialLetter(letter, user) {
  const [settings, logo] = await Promise.all([loadSettingsMap(user), loadLogoFromSettings()])
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const today  = format(new Date(letter.issuedAt || letter.createdAt || Date.now()), 'dd MMMM yyyy')

  // ── Letterhead ─────────────────────────────────────────────────────────
  let y = drawLetterhead(doc, settings, logo)

  // ── Reference + Date line ──────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Ref: ${letter.referenceNumber || '—'}`, MARGIN_L, y)
  doc.text(`Date: ${today}`, MARGIN_R, y, { align: 'right' })
  y += 10

  // ── Document title ─────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  const title = (letter.type || 'OFFICIAL LETTER').toUpperCase()
  doc.text(title, CENTER, y, { align: 'center' })
  // Underline the title
  const titleW = doc.getTextWidth(title)
  doc.setLineWidth(0.5)
  doc.line(CENTER - titleW / 2, y + 1, CENTER + titleW / 2, y + 1)
  y += 10

  // ── Addressee ──────────────────────────────────────────────────────────
  if (letter.recipient) {
    doc.setFont('times', 'normal')
    doc.setFontSize(10)
    doc.text('To:', MARGIN_L, y)
    doc.setFont('times', 'bold')
    doc.text(letter.recipient, MARGIN_L + 10, y)
    y += 8
  }

  // ── Salutation ─────────────────────────────────────────────────────────
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.text('Dear Sir/Madam,', MARGIN_L, y)
  y += 8

  // ── Title line ─────────────────────────────────────────────────────────
  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.text(`RE: ${title}`, MARGIN_L, y)
  doc.setFont('times', 'normal')
  y += 8

  // ── Body text (auto word-wrap) ──────────────────────────────────────────
  // content may be HTML from the RichTextEditor — strip tags for clean PDF output
  const rawContent = letter.content ||
    `This is to certify that ${letter.residentName || '[NAME]'} is a known and registered ` +
    `resident of ${settings.villageName || 'this'} village under ${settings.parishName || ''} Parish, ` +
    `${settings.subCountyName || ''} Sub-county, ${settings.districtName || ''} District.`
  const body = stripHtml(rawContent) || rawContent

  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.setLineHeightFactor(1.5)

  const lines = doc.splitTextToSize(body, TEXT_W)
  // Check if body overflows to next page
  if (y + lines.length * 6 > PAGE_H - 70) {
    // Draw on current page what fits, add new page for rest
    const fitsCount = Math.floor((PAGE_H - 70 - y) / 6)
    doc.text(lines.slice(0, fitsCount), MARGIN_L, y)
    doc.addPage()
    drawLetterhead(doc, settings, logo)
    drawFooter(doc, letter.referenceNumber, 2)
    y = 60
    doc.text(lines.slice(fitsCount), MARGIN_L, y)
    y += (lines.length - fitsCount) * 6
  } else {
    doc.text(lines, MARGIN_L, y)
    y += lines.length * 6
  }

  y += 6  // extra breathing room after body

  // ── Closing ────────────────────────────────────────────────────────────
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.text('Yours faithfully,', MARGIN_L, y)
  y += 6

  // ── Signature block ────────────────────────────────────────────────────
  const signerName   = settings.chairName || user?.fullName || 'LC1 Chairperson'
  const designation  = `LC1 Chairperson — ${settings.villageName || ''} Village`
  y = drawSignatureBlock(doc, signerName, designation, today, y)

  // ── Footer ────────────────────────────────────────────────────────────
  drawFooter(doc, letter.referenceNumber, 1)

  // ── Save ──────────────────────────────────────────────────────────────
  const filename = [
    'LC1',
    letter.type?.replace(/[\s/]/g, '-'),
    letter.residentName?.split(' ')[0],
    letter.referenceNumber?.replace(/\//g, '-'),
    format(new Date(), 'yyyyMMdd'),
  ].filter(Boolean).join('_') + '.pdf'

  await savePDFDoc(doc, filename, FOLDERS.LETTERS, settings.villageName)
}

/**
 * generateResidentProfile(resident, user)
 * Prints a full resident biodata sheet on official letterhead.
 *
 * @param {object} resident - full resident record
 * @param {object} user     - logged-in user for signature
 */
export async function generateResidentProfile(resident, user) {
  // For sysadmin: use the resident's own stored village data as fallback
  const effectiveUser = user?.isMasterAdmin && resident?.village ? {
    ...user,
    villageName:   resident.village    || user.villageName    || '',
    parishName:    resident.parish     || user.parishName     || '',
    districtName:  resident.district   || user.districtName   || '',
    subcountyName: resident.subCounty  || user.subcountyName  || '',
  } : user
  const [settings, logo] = await Promise.all([loadSettingsMap(effectiveUser), loadLogoFromSettings()])
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' })
  const today = format(new Date(), 'dd MMMM yyyy')

  let y = drawLetterhead(doc, settings, logo)

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('RESIDENT BIODATA RECORD', CENTER, y, { align: 'center' })
  y += 10

  // Photo (if available) — top right
  if (resident.photo) {
    try {
      const fmt = resident.photo.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(resident.photo, fmt, MARGIN_R - 35, y - 8, 30, 36)
    } catch { /* photo failed */ }
  }

  // ── Biodata fields in two-column layout ────────────────────────────────
  doc.setFont('times', 'normal')
  doc.setFontSize(10)

  const age = resident.dateOfBirth
    ? Math.floor((Date.now() - new Date(resident.dateOfBirth)) / (365.25*24*3600*1000)) + ' years'
    : '—'

  const FIELDS = [
    // [left label, left value, right label, right value]
    ['Surname',        resident.surname          || '—', 'First name',   resident.firstName      || '—'],
    ['Other names',    resident.otherNames        || '—', 'NIN',          resident.nin            || '—'],
    ['Date of birth',  resident.dateOfBirth
      ? format(new Date(resident.dateOfBirth), 'dd MMMM yyyy') : '—',
                                                          'Age',          age],
    ['Sex',            resident.sex              || '—', 'Marital status',resident.maritalStatus || '—'],
    ['Nationality',    resident.nationality       || '—', 'Religion',     resident.religion       || '—'],
    ['Tribe',          resident.tribe             || '—', 'Occupation',   resident.occupation     || '—'],
    ['Village',        resident.village           || '—', 'Parish',       resident.parish         || '—'],
    ['Sub-county',     resident.subCounty         || '—', 'District',     resident.district       || '—'],
    ['Phone',          resident.phone             || '—', 'Alt. phone',   resident.phone2         || '—'],
    ['Status',         resident.status?.toUpperCase() || '—',
                                                          'Resident type', resident.residentType  || '—'],
    ['Next of kin',    resident.nextOfKinName     || '—', 'NOK phone',    resident.nextOfKinPhone || '—'],
  ]

  FIELDS.forEach(([kL, vL, kR, vR]) => {
    // Left column label (bold) + value
    doc.setFont('helvetica', 'bold')
    doc.text(kL + ':', MARGIN_L, y)
    doc.setFont('times', 'normal')
    doc.text(String(vL), MARGIN_L + 32, y)

    // Right column
    doc.setFont('helvetica', 'bold')
    doc.text(kR + ':', 110, y)
    doc.setFont('times', 'normal')
    doc.text(String(vR), 142, y)

    y += 7
    // Light row divider
    doc.setDrawColor(220)
    doc.setLineWidth(0.2)
    doc.line(MARGIN_L, y - 1, MARGIN_R, y - 1)
    doc.setDrawColor(0)
  })

  y += 4

  // Biometrics status row
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(60)
  doc.text(
    `Photo: ${resident.photo ? '✓ On file' : '✗ None'}   |   Fingerprint: ${resident.fingerprint ? '✓ On file' : '✗ None'}   |   Registered: ${resident.createdAt ? format(new Date(resident.createdAt), 'dd/MM/yyyy') : '—'}`,
    CENTER, y, { align: 'center' }
  )
  doc.setTextColor(0)
  y += 10

  // Notes if present
  if (resident.notes) {
    doc.setFont('times', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(80)
    const noteLines = doc.splitTextToSize(`Notes: ${resident.notes}`, TEXT_W)
    doc.text(noteLines, MARGIN_L, y)
    doc.setTextColor(0)
    y += noteLines.length * 5 + 4
  }

  // Signature block
  const signerName  = settings.chairName || user?.fullName || 'LC1 Chairperson'
  const designation = `LC1 Chairperson — ${settings.villageName || ''} Village`
  drawSignatureBlock(doc, signerName, designation, today, y)

  drawFooter(doc, `RESIDENT/${resident.id?.slice(0,8).toUpperCase()}`)

  const filename = `LC1_Resident_${resident.surname}_${resident.nin || resident.id?.slice(0,8)}_${format(new Date(),'yyyyMMdd')}.pdf`
  await savePDFDoc(doc, filename, FOLDERS.PROFILES, settings.villageName)
}

/**
 * generateBirthCertificate(birth, user)
 * Official birth confirmation document on letterhead.
 */
export async function generateBirthCertificate(birth, user) {
  const [settings, logo] = await Promise.all([loadSettingsMap(user), loadLogoFromSettings()])
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' })
  const today = format(new Date(), 'dd MMMM yyyy')

  let y = drawLetterhead(doc, settings, logo)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('BIRTH REGISTRATION CERTIFICATE', CENTER, y, { align: 'center' })
  y += 10

  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  const intro = `This is to certify that the birth of the following child has been duly registered at ${settings.villageName || 'this'} Village LC1 Office as per the records of this council.`
  const introLines = doc.splitTextToSize(intro, TEXT_W)
  doc.text(introLines, MARGIN_L, y)
  y += introLines.length * 6 + 6

  const BFIELDS = [
    ['Child\'s full name', birth.childName  || '—'],
    ['Date of birth',     birth.dateOfBirth  ? format(new Date(birth.dateOfBirth), 'dd MMMM yyyy') : '—'],
    ['Sex',               birth.sex          || '—'],
    ['Weight at birth',   birth.weight       ? `${birth.weight} kg` : '—'],
    ['Place of birth',    birth.healthFacility || birth.placeOfBirth || '—'],
    ['Mother\'s name',    birth.motherName   || '—'],
    ['Father\'s name',    birth.fatherName   || '—'],
    ['Village',           birth.village      || settings.villageName || '—'],
    ['Parish',            birth.parish       || settings.parishName  || '—'],
    ['District',          settings.districtName || '—'],
  ]

  BFIELDS.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(k + ':', MARGIN_L, y)
    doc.setFont('times', 'normal')
    doc.text(String(v), MARGIN_L + 50, y)
    doc.setDrawColor(220); doc.setLineWidth(0.2)
    doc.line(MARGIN_L, y + 2, MARGIN_R, y + 2)
    doc.setDrawColor(0)
    y += 8
  })

  y += 6
  const signerName  = settings.chairName || user?.fullName || 'LC1 Chairperson'
  const designation = `LC1 Chairperson — ${settings.villageName || ''} Village`
  drawSignatureBlock(doc, signerName, designation, today, y)
  drawFooter(doc, `BIRTH/${birth.id?.slice(0,8).toUpperCase()}`)

  await savePDFDoc(doc, `LC1_Birth_Certificate_${birth.childName?.replace(/\s+/g,'_')}_${format(new Date(),'yyyyMMdd')}.pdf`, FOLDERS.BIRTH_CERTS, settings.villageName)
}

/**
 * generateDeathCertificate(death, deceased, user)
 * Official death registration document on letterhead.
 */
export async function generateDeathCertificate(death, deceased, user) {
  const [settings, logo] = await Promise.all([loadSettingsMap(user), loadLogoFromSettings()])
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' })
  const today = format(new Date(), 'dd MMMM yyyy')

  let y = drawLetterhead(doc, settings, logo)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('DEATH REGISTRATION CERTIFICATE', CENTER, y, { align: 'center' })
  y += 12

  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  const intro = `This is to certify that the death of the person named below has been duly recorded at ${settings.villageName || 'this'} Village LC1 Office.`
  const introLines = doc.splitTextToSize(intro, TEXT_W)
  doc.text(introLines, MARGIN_L, y)
  y += introLines.length * 6 + 6

  const DFIELDS = [
    ['Full name of deceased', (deceased?.surname ? `${deceased.surname} ${deceased.firstName} ${deceased.otherNames||''}`.trim() : death.deceasedName) || '—'],
    ['National ID (NIN)',     deceased?.nin   || '—'],
    ['Date of death',         death.dateOfDeath  ? format(new Date(death.dateOfDeath), 'dd MMMM yyyy') : '—'],
    ['Place of death',        death.placeOfDeath || '—'],
    ['Cause of death',        death.cause        || '—'],
    ['Burial location',       death.burialLocation|| '—'],
    ['Burial date',           death.burialDate    ? format(new Date(death.burialDate), 'dd MMMM yyyy') : '—'],
    ['Reported by',           death.reportedBy   || '—'],
    ['Next of kin notified',  death.nextOfKin    || '—'],
    ['Village',               settings.villageName || '—'],
    ['District',              settings.districtName|| '—'],
  ]

  DFIELDS.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(k + ':', MARGIN_L, y)
    doc.setFont('times', 'normal')
    doc.text(String(v), MARGIN_L + 55, y)
    doc.setDrawColor(220); doc.setLineWidth(0.2)
    doc.line(MARGIN_L, y + 2, MARGIN_R, y + 2)
    doc.setDrawColor(0)
    y += 8
  })

  y += 6
  const signerName  = settings.chairName || user?.fullName || 'LC1 Chairperson'
  const designation = `LC1 Chairperson — ${settings.villageName || ''} Village`
  drawSignatureBlock(doc, signerName, designation, today, y)
  drawFooter(doc, `DEATH/${death.id?.slice(0,8).toUpperCase()}`)

  await savePDFDoc(doc, `LC1_Death_Certificate_${death.deceasedName?.replace(/\s+/g,'_')}_${format(new Date(),'yyyyMMdd')}.pdf`, FOLDERS.DEATH_CERTS, settings.villageName)
}

/**
 * generatePopulationReport(stats, residents, user)
 * Statistical population report for submission to UBOS / MoLG.
 */
export async function generatePopulationReport(stats, residents, user) {
  const [settings, logo] = await Promise.all([loadSettingsMap(user), loadLogoFromSettings()])
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' })
  const today = format(new Date(), 'dd MMMM yyyy')

  let y = drawLetterhead(doc, settings, logo)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('VILLAGE POPULATION REPORT', CENTER, y, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text(`Report generated: ${today}`, CENTER, y + 6, { align: 'center' })
  doc.setTextColor(0)
  y += 14

  // Summary stats table
  const STATS = [
    ['Active residents (permanent + tenants)',  String(stats.active   || 0)],
    ['Deceased (on record)',                    String(stats.deceased  || 0)],
    ['Migrated away',                           String(stats.migrated  || 0)],
    ['Total records',                           String(stats.total     || 0)],
    ['Male (active)',                           String(stats.male      || 0)],
    ['Female (active)',                         String(stats.female    || 0)],
    ['Households',                              String(stats.households|| 0)],
    ['Businesses',                              String(stats.businesses|| 0)],
  ]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('POPULATION SUMMARY', MARGIN_L, y)
  y += 6

  STATS.forEach(([k, v], i) => {
    const bgColor = i % 2 === 0 ? [245, 250, 245] : [255, 255, 255]
    doc.setFillColor(...bgColor)
    doc.rect(MARGIN_L, y - 4, TEXT_W, 7, 'F')
    doc.setFont('times', 'normal')
    doc.setFontSize(10)
    doc.text(k, MARGIN_L + 2, y)
    doc.setFont('times', 'bold')
    doc.text(v, MARGIN_R - 2, y, { align: 'right' })
    y += 7
  })

  y += 6
  const signerName  = settings.chairName || user?.fullName || 'LC1 Chairperson'
  const designation = `LC1 Chairperson — ${settings.villageName || ''} Village`
  drawSignatureBlock(doc, signerName, designation, today, y)
  drawFooter(doc, `POP-REPORT-${format(new Date(), 'yyyyMMdd')}`)

  await savePDFDoc(doc, `LC1_Population_Report_${settings.villageName?.replace(/\s+/g,'_')}_${format(new Date(),'yyyyMMdd')}.pdf`, FOLDERS.REPORTS, settings.villageName)
}
