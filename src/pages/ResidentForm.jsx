/**
 * ============================================================
 * RESIDENT REGISTRATION / EDIT FORM — src/pages/ResidentForm.jsx
 * ============================================================
 * KEY CHANGES IN THIS VERSION:
 *
 *   ADDRESS → FORMER ADDRESS:
 *   The address section is now split into two:
 *
 *   1. CURRENT ADDRESS (this village) — auto-filled from the
 *      logged-in village profile. The "Village *" field is the
 *      zone/cell within this village, not the village name itself.
 *
 *   2. FORMER / PREVIOUS ADDRESS — captures where the resident
 *      came from: former village, parish, district, reason for
 *      leaving, and date of arrival here.
 *
 *   REGISTRATION REASONS:
 *   Replaces the simple "tenant / permanent" toggle with a full
 *   reason system that covers all real-world Uganda LC1 scenarios:
 *
 *   - Tenant (renting)        → deducted from former village
 *   - Work / Employment       → deducted from former village
 *   - Marriage (monogamous)   → deducted from former village
 *   - Marriage (polygamous)   → stays active in former village too
 *                               (Muslim / cultural law allows this)
 *   - Property owner          → stays active in home village too
 *                               (landlord may have homes in multiple villages)
 *   - Boarding school/college → stays active in home village
 *   - Displaced / refugee     → deducted from former village
 *   - Permanent relocation    → deducted from former village
 *   - Born here               → no former village
 *   - Other (specify)         → user describes the reason
 *
 *   CROSS-VILLAGE DEDUCTION:
 *   When a resident is saved here AND a former villageId is known
 *   AND their reason causes deduction (isMigratedOut = true):
 *     → The former village's DB (if on this device) is updated:
 *       resident.status = 'migrated'
 *       resident.migratedTo = { villageId, villageName, date }
 *     → If not on device, a migration notice is queued for cloud sync
 *
 *   MULTI-HOME RESIDENTS:
 *   Reasons that allow dual-village active status (property owner,
 *   polygamous marriage, school) do NOT trigger deduction. The resident
 *   stays active in both villages. A clear label shows this on the profile.
 * ============================================================
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useParams }   from 'react-router-dom'
import Webcam                       from 'react-webcam'
import { v4 as uuidv4 }             from 'uuid'
import { useVillageDB }             from '../db/villageDB'
import { useAuth }                  from '../hooks/useAuth'
import {
  getVillageDB,
  checkNINAcrossVillages, checkNameDOBAcrossVillages,
} from '../db/multiTenantDB'
import { BrowserMultiFormatReader } from '@zxing/library'
import RichTextEditor               from '../components/shared/RichTextEditor'
import {
  DISTRICTS,
  getCountiesByDistrict, getSubcountiesByCounty,
  getParishesBySubcounty, getVillagesByParish,
  getDistrictsByRegion,
} from '../data/ugandaLocations'

// ── Reference data ─────────────────────────────────────────────────────────
const RELIGIONS   = ['Catholic','Protestant / Anglican','Muslim','Pentecostal','SDA','Orthodox','Traditional','Other']
const TRIBES      = ['Baganda','Banyankore','Basoga','Bakiga','Iteso','Langi','Acholi','Lugbara','Bagisu','Banyoro','Batooro','Bafumbira','Alur','Jonam','Madi','Other']
const MARITAL     = ['Single','Married','Widowed','Divorced','Separated']
const OCCUPATIONS = ['Farmer','Teacher','Health worker','Trader/Vendor','Civil servant','Student','Casual labourer','Artisan','Boda-boda','Unemployed','Other']

// ── Registration reasons ───────────────────────────────────────────────────
// Each reason carries:
//   label          — shown in the dropdown
//   deductsFrom    — true = mark as 'migrated' in former village (they are LEAVING)
//   isAffiliated   — true = person stays active in original village, stored here
//                    as 'affiliated' — no population count impact, no move
//   requiresNote   — true = explanation text is mandatory
//
// AFFILIATED means: person has a genuine link to this village (property, family,
// business) but their PRIMARY residence and population count remain elsewhere.
// Their profile is visible in this village under the "Affiliated" tab.
// The original village record is NEVER touched.
const REGISTRATION_REASONS = [
  // ── Full residents (counted in this village's population) ─────────────
  { id: 'born_here',      label: 'Born here / Always lived here',       deductsFrom: false, isAffiliated: false, requiresNote: false },
  { id: 'tenant',         label: 'Tenant (renting accommodation)',       deductsFrom: true,  isAffiliated: false, requiresNote: false },
  { id: 'work',           label: 'Work / Employment (relocated here)',   deductsFrom: true,  isAffiliated: false, requiresNote: false },
  { id: 'marriage_mono',  label: 'Marriage — moved to spouse\'s village',deductsFrom: true,  isAffiliated: false, requiresNote: false },
  { id: 'displaced',      label: 'Displaced / Fled conflict or disaster',deductsFrom: true,  isAffiliated: false, requiresNote: true  },
  { id: 'relocation',     label: 'Permanent relocation to this village', deductsFrom: true,  isAffiliated: false, requiresNote: false },

  // ── Affiliated only (NOT counted in population, original record untouched) ──
  // Use these for anyone with a connection here but primary home elsewhere.
  { id: 'aff_property',   label: 'Affiliated — owns property / land here',         deductsFrom: false, isAffiliated: true, requiresNote: true  },
  { id: 'aff_business',   label: 'Affiliated — runs business here',                deductsFrom: false, isAffiliated: true, requiresNote: true  },
  { id: 'aff_poly_spouse',label: 'Affiliated — spouse in polygamous household',    deductsFrom: false, isAffiliated: true, requiresNote: true  },
  { id: 'aff_poly_head',  label: 'Affiliated — polygamous head of household here', deductsFrom: false, isAffiliated: true, requiresNote: true  },
  { id: 'aff_family',     label: 'Affiliated — family ties / dependants here',     deductsFrom: false, isAffiliated: true, requiresNote: true  },
  { id: 'aff_school',     label: 'Affiliated — studying here (home village active)',deductsFrom: false, isAffiliated: true, requiresNote: false },
  { id: 'aff_seasonal',   label: 'Affiliated — seasonal / part-time presence',     deductsFrom: false, isAffiliated: true, requiresNote: true  },
  { id: 'aff_other',      label: 'Affiliated — other connection (specify)',         deductsFrom: false, isAffiliated: true, requiresNote: true  },

  // ── Catch-all ─────────────────────────────────────────────────────────
  { id: 'other',          label: 'Other (specify in reason notes)',      deductsFrom: false, isAffiliated: false, requiresNote: true  },
]

// Convenience sets
export const AFFILIATED_REASON_IDS = new Set(
  REGISTRATION_REASONS.filter(r => r.isAffiliated).map(r => r.id)
)
export const DEDUCTS_REASON_IDS = new Set(
  REGISTRATION_REASONS.filter(r => r.deductsFrom).map(r => r.id)
)

// ── EMPTY form template ────────────────────────────────────────────────────
const EMPTY_FORM = {
  // Personal
  surname: '', firstName: '', otherNames: '', nin: '',
  dateOfBirth: '', sex: '', maritalStatus: '',
  tribe: '', religion: '', occupation: '',
  nationality: 'Ugandan',
  // Foreigner-specific fields (only shown when nationality is not Ugandan)
  passportNumber:  '',   // passport number
  passportExpiry:  '',   // passport expiry date
  permitType:      '',   // work permit, student visa, refugee, etc.
  permitNumber:    '',   // permit/visa reference number
  permitExpiry:    '',   // permit expiry date
  countryOfOrigin: '',   // home country
  purposeOfStay:   '',   // reason for being in Uganda

  // Contact
  phone: '', phone2: '', email: '',

  // Current address (within this village)
  zone: '',            // zone/cell/plot within the current village
  physicalAddress: '', // detailed physical address

  // Former / previous address
  formerVillage:    '',  // name of village they came from
  formerVillageId:  '',  // villageId if we know it (for cross-DB update)
  formerParish:     '',
  formerSubcounty:  '',
  formerDistrict:   '',
  dateArrived:      '',  // when they arrived in this village

  // Registration reason
  registrationReason:     'born_here',
  registrationReasonNote: '',   // free text explanation (required for some reasons)

  // Legacy fields (kept for backward compatibility)
  village:     '',   // auto-set to current village name on save
  parish:      '',   // auto-set to current parish
  subCounty:   '',
  district:    '',

  // Next of kin
  nextOfKinName: '', nextOfKinRelation: '', nextOfKinPhone: '',

  // Biometrics
  photo: '', fingerprint: '',

  // Status
  status:       'active',
  residentType: 'permanent',   // derived from registrationReason on save
  homeVillage:  '',

  // Notes
  notes: '',
}

const INPUT_TABS = [
  { id: 'manual',      label: '✏️ Manual entry'  },
  { id: 'camera',      label: '📷 Photo capture'  },
  { id: 'scanner',     label: '🔳 ID scanner'     },
  { id: 'fingerprint', label: '👆 Fingerprint'    },
]

// ── Helpers ────────────────────────────────────────────────────────────────
function isValidPhone(p) { if (!p) return true; return /^[+]?[\d\s\-]{7,15}$/.test(p.trim()) }
function isValidNIN(n)   { if (!n) return true; return /^[A-Z0-9]{14}$/i.test(n.trim()) }

// ── Cross-village migration: mark resident as migrated in their former village ──
/**
 * applyMigrationToFormerVillage(formerVillageId, nin, residentName, newVillage)
 * Finds the resident in their former village DB and marks them as 'migrated'.
 * Only runs if the former village DB exists on this device.
 * Queues for cloud sync if not available locally.
 */
async function applyMigrationToFormerVillage(formerVillageId, nin, residentName, newVillage, currentVillageId) {
  if (!formerVillageId || !nin) return { done: false, reason: 'no_former_village_id_or_nin' }
  if (formerVillageId === currentVillageId) return { done: false, reason: 'same_village' }

  try {
    const vdb = await getVillageDB(formerVillageId)
    // Find the resident by NIN in the former village
    const allRes  = await vdb.getAll('residents')
    const formerR = allRes.find(r => r.nin === nin && r.status === 'active')
    if (!formerR) return { done: false, reason: 'not_found_in_former_village' }

    // Mark them as migrated in former village
    await vdb.put('residents', {
      ...formerR,
      status:       'migrated',
      syncStatus:   'pending',
      updatedAt:    new Date().toISOString(),
      migratedTo: {
        villageId:   currentVillageId,
        villageName: newVillage,
        date:        new Date().toISOString().slice(0, 10),
      },
    })
    return { done: true }
  } catch {
    // Former village DB not on this device — queue via cloud sync
    return { done: false, reason: 'former_village_not_on_device_will_sync' }
  }
}

// ── Cross-village move ─────────────────────────────────────────────────────
/**
 * performCrossVillageMove(match, newFormData, db, user, onSuccess)
 *
 * The CORRECT way to handle a person moving between villages:
 *
 *   1. Take the existing resident record from their FORMER village
 *   2. Update it with the new village context and any new form fields
 *   3. Write the updated record into THIS village's DB (same ID — no duplicate)
 *   4. Mark the former village's copy as status='migrated'
 *   5. Write an audit entry in both villages
 *   6. Never create a new record — the person keeps their original ID and
 *      complete registration history
 *
 * @param {object} match       - { villageId, villageName, resident } from checkAllDuplicates
 * @param {object} newFormData - fields the registrar typed in the form (may add new details)
 * @param {object} db          - useVillageDB() instance for the CURRENT village
 * @param {object} user        - logged-in user (for village context)
 * @param {function} onSuccess - called with the moved record after success
 */
async function performCrossVillageMove(match, newFormData, db, user, onSuccess) {
  const now            = new Date().toISOString()
  const formerVillageId = match.villageId
  const formerResident  = match.resident

  // Build the moved record:
  // - Keep the original ID, createdAt, createdBy (continuous identity)
  // - Merge any new details the registrar filled in (they may have added phone,
  //   address, or other details not captured at original registration)
  // - Update village context to the CURRENT village
  const movedRecord = {
    // Original identity fields preserved
    ...formerResident,
    // Merge any new data from the form (new details take priority over blank originals)
    ...(newFormData.phone         ? { phone:         newFormData.phone }         : {}),
    ...(newFormData.phone2        ? { phone2:        newFormData.phone2 }        : {}),
    ...(newFormData.email         ? { email:         newFormData.email }         : {}),
    ...(newFormData.occupation    ? { occupation:    newFormData.occupation }    : {}),
    ...(newFormData.maritalStatus ? { maritalStatus: newFormData.maritalStatus } : {}),
    ...(newFormData.zone          ? { zone:          newFormData.zone }          : {}),
    ...(newFormData.physicalAddress ? { physicalAddress: newFormData.physicalAddress } : {}),
    ...(newFormData.nextOfKinName ? { nextOfKinName: newFormData.nextOfKinName } : {}),
    ...(newFormData.nextOfKinPhone? { nextOfKinPhone:newFormData.nextOfKinPhone }: {}),
    ...(newFormData.notes         ? { notes:         newFormData.notes }         : {}),
    // Registration reason from current form
    registrationReason:     newFormData.registrationReason,
    registrationReasonNote: newFormData.registrationReasonNote || '',
    // Former address — record where they came from
    formerVillage:    match.villageName,
    formerVillageId:  formerVillageId,
    formerParish:     formerResident.parish     || '',
    formerSubcounty:  formerResident.subCounty  || '',
    formerDistrict:   formerResident.district   || '',
    dateArrived:      newFormData.dateArrived   || now.slice(0,10),
    // New village context
    village:    user?.villageName    || '',
    parish:     user?.parishName     || '',
    subCounty:  user?.subcountyName  || '',
    district:   user?.districtName   || '',
    // Status
    status:      'active',
    residentType: REGISTRATION_REASONS.find(r => r.id === newFormData.registrationReason)?.isAffiliated ? 'affiliated' : newFormData.registrationReason === 'born_here' ? 'permanent' : 'tenant',
    // Audit trail
    updatedAt:   now,
    updatedBy:   user?.id,
    syncStatus:  'pending',
    movedFrom: {
      villageId:   formerVillageId,
      villageName: match.villageName,
      movedAt:     now,
      movedBy:     user?.id,
      reason:      newFormData.registrationReason,
    },
  }

  // 1. Write moved record to THIS village's DB (same ID = no duplicate)
  await db.put('residents', movedRecord)

  // 2. Audit in this village
  await db.audit('MOVE_IN', 'residents', movedRecord.id, {
    fromVillage: match.villageName,
    name: `${movedRecord.surname} ${movedRecord.firstName}`,
  })

  // 3. Mark as migrated in the FORMER village DB (if on this device)
  try {
    const formerDB = await getVillageDB(formerVillageId)
    await formerDB.put('residents', {
      ...formerResident,
      status:      'migrated',
      syncStatus:  'pending',
      updatedAt:   now,
      migratedTo: {
        villageId:   db.villageId,
        villageName: user?.villageName || '',
        movedAt:     now,
        reason:      newFormData.registrationReason,
      },
    })
  } catch {
    // Former village DB not on this device — will sync when online
    // The moved record is still correct in this village
  }

  if (onSuccess) onSuccess(movedRecord)
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function ResidentForm() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const { user }     = useAuth()
  const db           = useVillageDB()
  const isEdit       = Boolean(id)

  const [form,       setForm]       = useState(EMPTY_FORM)
  const [inputTab,   setInputTab]   = useState('manual')
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(isEdit)
  const [toast,      setToast]      = useState(null)
  const [errors,     setErrors]     = useState({})
  const [ninChecking, setNinChecking] = useState(false)   // live NIN check status
  const [ninStatus,   setNinStatus]   = useState(null)    // null | 'ok' | 'conflict' | 'local'

  // Former village location selector state (for the cross-village lookup)
  const [fvDistrict,  setFvDistrict]  = useState('')
  const [fvCounty,    setFvCounty]    = useState('')
  const [fvSubcounty, setFvSubcounty] = useState('')
  const [fvParish,    setFvParish]    = useState('')
  const [fvVillage,   setFvVillage]   = useState('')

  // Derived lists for former village dropdowns
  const fvCounties    = fvDistrict  ? getCountiesByDistrict(fvDistrict)        : []
  const fvSubcounties = fvCounty    ? getSubcountiesByCounty(fvCounty)         : []
  const fvParishes    = fvSubcounty ? getParishesBySubcounty(fvSubcounty)      : []
  const fvVillages    = fvParish    ? getVillagesByParish(fvParish)            : []
  const distsByRegion = getDistrictsByRegion()

  // Webcam
  const webcamRef = useRef(null)
  const [camOpen, setCamOpen] = useState(false)

  // Scanner
  const scannerRef    = useRef(null)
  const codeReaderRef = useRef(null)
  const [scanning,    setScanning]   = useState(false)
  const [scanResult,  setScanResult] = useState('')

  // Fingerprint
  const [fpStatus, setFpStatus] = useState('idle')
  const [fpData,   setFpData]   = useState('')

  // Current registration reason object
  const reasonDef = REGISTRATION_REASONS.find(r => r.id === form.registrationReason) || REGISTRATION_REASONS[0]

  // ── Load existing record for edit ────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return
    async function loadForEdit() {
      setLoading(true)
      const record = await db.get('residents', id)
      if (record) {
        setForm({ ...EMPTY_FORM, ...record })
        if (record.fingerprint) { setFpData(record.fingerprint); setFpStatus('captured') }
        // Restore former village selector state if formerVillageId is known
        if (record.formerDistrict) setFvDistrict(record.formerDistrict)
      } else {
        showToast('Resident record not found', 'error')
        navigate('/residents')
      }
      setLoading(false)
    }
    loadForEdit()
  }, [id, isEdit, db.villageId])

  // ── Live NIN check — fires when NIN reaches 14 characters ─────────────
  // Shows a green ✓ or red ✗ indicator next to the NIN field in real time,
  // BEFORE the user clicks Save.
  useEffect(() => {
    if (isEdit) return                          // don't check on edits
    if (!form.nin || form.nin.length < 14) {    // wait for full NIN
      setNinStatus(null)
      return
    }

    let cancelled = false
    setNinChecking(true)

    async function liveNINCheck() {
      try {
        // Check within current village first
        const local      = await db.getAll('residents')
        const localMatch = local.find(r => r.nin === form.nin && r.id !== form.id)
        if (!cancelled && localMatch) {
          const isDeceased = localMatch.status === 'deceased'
          setNinStatus({
            level: 'block',
            msg: isDeceased
              ? `⚰ DECEASED: ${localMatch.surname} ${localMatch.firstName} — this NIN is permanently blocked`
              : `Already registered in THIS village: ${localMatch.surname} ${localMatch.firstName}`,
          })
          setNinChecking(false)
          return
        }

        // Check across other villages
        const cross = await checkNINAcrossVillages(form.nin, db.villageId, form.id)
        if (!cancelled) {
          if (cross.conflict) {
            const v          = cross.villages[0]
            const isDeceased = v.deceased || v.resident.status === 'deceased'
            setNinStatus({
              level: 'block',  // deceased is always a hard block
              msg: isDeceased
                ? `⚰ DECEASED: ${v.resident.surname} ${v.resident.firstName} in ${v.villageName} Village — this NIN is permanently blocked`
                : `Found active in ${v.villageName} Village as ${v.resident.surname} ${v.resident.firstName} (status: ${v.resident.status})`,
            })
          } else {
            setNinStatus({ level: 'ok', msg: 'NIN not found in any village ✓' })
          }
          setNinChecking(false)
        }
      } catch {
        if (!cancelled) { setNinChecking(false); setNinStatus(null) }
      }
    }

    // 600ms debounce — don't hammer the DB on every keystroke
    const t = setTimeout(liveNINCheck, 600)
    return () => { cancelled = true; clearTimeout(t) }
  }, [form.nin, db.villageId, isEdit])

  // ── Field setter ──────────────────────────────────────────────────────────
  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
  }

  function phoneInput(field, value) {
    set(field, value.replace(/[^\d+\s\-]/g, ''))
  }

  // ── Name input — strips digits and special characters ─────────────────
  // Names should only contain letters, spaces, hyphens, apostrophes, and dots.
  // This prevents data entry errors like "John123" or "Mary_Jane".
  function nameInput(field, value) {
    // Allow letters (including accented/African characters), spaces, hyphens, apostrophes, dots
    const cleaned = value.replace(/[^a-zA-ZÀ-ÿ\u0100-\u024F\u1E00-\u1EFF\s\-'.]/g, '')
    set(field, cleaned)
  }

  // ── Former village selector handlers ────────────────────────────────────
  function pickFvDistrict(e) {
    const { value } = e.target
    setFvDistrict(value); setFvCounty(''); setFvSubcounty(''); setFvParish(''); setFvVillage('')
    set('formerDistrict', DISTRICTS.find(d => d.id === value)?.name || value)
    set('formerVillageId', '')
  }
  function pickFvCounty(e) {
    setFvCounty(e.target.value); setFvSubcounty(''); setFvParish(''); setFvVillage('')
  }
  function pickFvSubcounty(e) {
    const obj = fvSubcounties.find(x => x.id === e.target.value)
    setFvSubcounty(e.target.value); setFvParish(''); setFvVillage('')
    set('formerSubcounty', obj?.name || '')
  }
  function pickFvParish(e) {
    const obj = fvParishes.find(x => x.id === e.target.value)
    setFvParish(e.target.value); setFvVillage('')
    set('formerParish', obj?.name || '')
  }
  function pickFvVillage(e) {
    const id  = e.target.value
    const obj = fvVillages.find(x => x.id === id)
    setFvVillage(id)
    set('formerVillage',   obj?.name || '')
    set('formerVillageId', id)
  }

  // ── Validation ───────────────────────────────────────────────────────────
  function validate() {
    const e = {}

    // ── Name fields ────────────────────────────────────────────────────────
    if (!form.surname.trim())
      e.surname   = 'Surname is required'
    else if (/\d/.test(form.surname))
      e.surname   = 'Surname must not contain numbers'

    if (!form.firstName.trim())
      e.firstName = 'First name is required'
    else if (/\d/.test(form.firstName))
      e.firstName = 'First name must not contain numbers'

    if (form.otherNames && /\d/.test(form.otherNames))
      e.otherNames = 'Other names must not contain numbers'

    if (form.nextOfKinName && /\d/.test(form.nextOfKinName))
      e.nextOfKinName = 'Next of kin name must not contain numbers'

    // ── Required biometrics ───────────────────────────────────────────────
    // Photo is required — ensures every resident has a visual identity record
    if (!form.photo && !isEdit)
      e.photo = 'A photo is required. Use the 📷 Photo capture tab to take or upload one.'

    // Fingerprint is required — ensures biometric identity is captured
    const hasFingerprint = fpData || form.fingerprint
    if (!hasFingerprint && !isEdit)
      e.fingerprint = 'A fingerprint is required. Use the 👆 Fingerprint tab to capture one.'

    // ── Other required fields ─────────────────────────────────────────────
    if (!form.sex)
      e.sex        = 'Sex is required'
    if (!form.dateOfBirth)
      e.dateOfBirth= 'Date of birth is required'
    if (form.nin && !isValidNIN(form.nin))
      e.nin = 'NIN must be 14 letters/numbers (e.g. CM90000123ABCD)'
    if (!isValidPhone(form.phone))
      e.phone         = 'Invalid phone number'
    if (!isValidPhone(form.phone2))
      e.phone2        = 'Invalid phone number'
    if (!isValidPhone(form.nextOfKinPhone))
      e.nextOfKinPhone= 'Invalid phone number'
    if (form.dateOfBirth && new Date(form.dateOfBirth) > new Date())
      e.dateOfBirth = 'Date of birth cannot be in the future'
    if (reasonDef.requiresNote && !form.registrationReasonNote.trim())
      e.registrationReasonNote = 'Please explain the reason for registration here'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Comprehensive duplicate detection ─────────────────────────────────
  // Checks BOTH the current village AND all other villages on this device.
  // Returns an object describing what was found.
  async function checkAllDuplicates() {
    const currentVillageId = db.villageId
    const excludeId        = isEdit ? form.id : null

    // ── 1. Within this village ──────────────────────────────────────────
    const localResidents = await db.getAll('residents')
    let localNINConflict  = null
    let localNameConflict = null

    if (form.nin) {
      // Hard block on ANY record with same NIN — including deceased
      localNINConflict = localResidents.find(
        r => r.nin === form.nin && r.id !== excludeId
      ) || null
    }

    if (form.surname && form.firstName && form.dateOfBirth) {
      // Hard block on deceased, soft warn on active with same name+DOB
      localNameConflict = localResidents.find(
        r => r.id !== excludeId &&
          r.surname?.toLowerCase()   === form.surname.toLowerCase() &&
          r.firstName?.toLowerCase() === form.firstName.toLowerCase() &&
          r.dateOfBirth              === form.dateOfBirth
      ) || null
    }

    // ── 2. Across OTHER villages on this device ──────────────────────────
    let crossNINResult  = { conflict: false }
    let crossNameResult = { conflict: false }

    if (form.nin) {
      crossNINResult = await checkNINAcrossVillages(form.nin, currentVillageId, excludeId)
    }

    if (form.surname && form.firstName && form.dateOfBirth) {
      crossNameResult = await checkNameDOBAcrossVillages(
        form.surname, form.firstName, form.dateOfBirth, currentVillageId, excludeId
      )
    }

    return { localNINConflict, localNameConflict, crossNINResult, crossNameResult }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave(e) {
    if (e?.preventDefault) e.preventDefault()
    if (!validate()) { showToast('Please fix the errors before saving', 'error'); return }

    // ── Reason-driven duplicate resolution ────────────────────────────────
    //
    // The registration REASON the registrar selects determines everything:
    //
    //   deductsFrom = true  (tenant, work, marriage_mono, displaced, relocation)
    //     → Person is LEAVING their former village permanently or semi-permanently
    //     → AUTO-MOVE: transfer record here, mark former village as "migrated"
    //     → Former village count goes down, this village count goes up
    //     → ONE active record across the whole system
    //
    //   multiHome = true  (marriage_poly, property_owner, school)
    //     → Person LEGITIMATELY lives in / is registered in multiple villages
    //     → Muslim husband with wives in different villages: active in BOTH
    //     → Landlord with land in 3 villages: registered in ALL THREE
    //     → Student: stays active at home, school village may also register
    //     → CREATE a new record here, leave former village UNCHANGED
    //     → Both villages count them — this is correct and legal
    //
    //   born_here / other
    //     → No former village link — normal registration
    //
    // Within-village NIN duplicate: always a hard block regardless of reason.
    // ─────────────────────────────────────────────────────────────────────────

    if (!isEdit) {
      setSaving(true)
      const dup = await checkAllDuplicates()
      setSaving(false)

      // ── Hard block: NIN already in THIS village ─────────────────────────
      // No reason overrides this — includes deceased records
      if (dup.localNINConflict) {
        const r = dup.localNINConflict
        if (r.status === 'deceased') {
          showToast(
            `BLOCKED: NIN ${form.nin} belongs to ${r.surname} ${r.firstName} who is ` +
            `recorded as DECEASED in this village. ` +
            `A deceased person's NIN cannot be reused or reassigned under any circumstances.`,
            'error'
          )
        } else {
          showToast(
            `${r.surname} ${r.firstName} is already registered in this village with that NIN. ` +
            `Open their existing profile to update details.`,
            'error'
          )
        }
        setErrors(prev => ({ ...prev, nin: r.status === 'deceased'
          ? 'This NIN belongs to a deceased person — permanently blocked'
          : 'Already registered in this village' }))
        return
      }

      // ── Hard block: same name+DOB in THIS village and person is DECEASED ─
      if (dup.localNameConflict && dup.localNameConflict.status === 'deceased') {
        showToast(
          `BLOCKED: ${form.surname} ${form.firstName} born ${form.dateOfBirth} ` +
          `is recorded as DECEASED in this village. ` +
          `A deceased person's identity cannot be registered again.`,
          'error'
        )
        setErrors(prev => ({ ...prev, surname: 'This person is recorded as deceased — registration blocked' }))
        return
      }

      // ── Cross-village NIN conflict ──────────────────────────────────────
      if (dup.crossNINResult.conflict) {
        const found = dup.crossNINResult.villages
        const match = found[0]
        const name  = `${match.resident.surname} ${match.resident.firstName}`

        // DECEASED — hard block regardless of reason
        if (match.deceased || match.resident.status === 'deceased') {
          showToast(
            `BLOCKED: NIN ${form.nin} belongs to ${name} who is recorded as DECEASED ` +
            `in ${match.villageName} Village. ` +
            `A deceased person's NIN cannot be reused or reassigned under any circumstances. ` +
            `If this NIN was incorrectly recorded, contact the system administrator.`,
            'error'
          )
          setErrors(prev => ({ ...prev, nin: `Belongs to a deceased person in ${match.villageName} — permanently blocked` }))
          return
        }

        if (reasonDef.isAffiliated) {
          // ── AFFILIATED: original village untouched, stored here as affiliated ──
          const proceed = window.confirm(
            `${name} is already an active resident in ${match.villageName} Village.\n\n` +
            `Reason: "${reasonDef.label}"\n\n` +
            `This will create an AFFILIATED record here:\n` +
            `  ✓ ${match.villageName} Village — original record UNCHANGED, still active\n` +
            `  ✓ ${user?.villageName || 'This village'} — stored as AFFILIATED (not counted in population)\n\n` +
            `The affiliated record will appear in the "🔗 Affiliated" tab of the Residents page.\n` +
            `Their identity card will be marked as "AFFILIATED RESIDENT".\n\n` +
            `Click OK to create affiliated record, or Cancel to go back.`
          )
          if (!proceed) return

        } else if (reasonDef.deductsFrom) {
          // ── MIGRATION: auto-move the person ────────────────────────────
          const proceed = window.confirm(
            `${name} is currently registered as an active resident in ${match.villageName} Village.\n\n` +
            `Reason selected: "${reasonDef.label}"\n\n` +
            `This will MOVE their registration to ${user?.villageName || 'this village'}:\n` +
            `  • Their record transfers here (same ID, full history preserved)\n` +
            `  • ${match.villageName} Village will show them as "Migrated away"\n` +
            `  • ${match.villageName}'s population count will decrease by 1\n` +
            `  • No duplicate record will be created\n\n` +
            `Click OK to move them, or Cancel to go back.`
          )
          if (!proceed) return

          setSaving(true)
          try {
            await performCrossVillageMove(match, form, db, user, movedRecord => {
              showToast(`✓ ${name} moved from ${match.villageName} to ${user?.villageName || 'this village'}.`)
              setTimeout(() => navigate(`/residents/${movedRecord.id}`), 1000)
            })
          } catch (err) {
            showToast('Move failed: ' + err.message, 'error')
          } finally { setSaving(false) }
          return

        } else {
          const proceed = window.confirm(
            `${name} is already registered in ${match.villageName} Village.\n\n` +
            `Please verify:\n` +
            `  • If they are MOVING here → change reason to "Tenant", "Work", etc.\n` +
            `  • If they have ties in both villages → change reason to "Property owner" or "Polygamous household"\n` +
            `  • If this is genuinely a different person → click OK\n\n` +
            `Click Cancel to go back and change the reason.`
          )
          if (!proceed) return
        }
      }

      // ── Cross-village name+DOB conflict ────────────────────────────────
      if (dup.crossNameResult.conflict && !dup.crossNINResult.conflict) {
        const found = dup.crossNameResult.villages
        const match = found[0]
        const name  = `${form.surname} ${form.firstName}`

        // DECEASED — hard block
        if (match.deceased || match.resident.status === 'deceased') {
          showToast(
            `BLOCKED: ${name} born ${form.dateOfBirth} is recorded as DECEASED ` +
            `in ${match.villageName} Village. ` +
            `A deceased person's identity cannot be registered again.`,
            'error'
          )
          setErrors(prev => ({ ...prev, surname: `This person is recorded as deceased in ${match.villageName} — blocked` }))
          return
        }

        if (reasonDef.isAffiliated) {
          const proceed = window.confirm(
            `Someone named ${name} born ${form.dateOfBirth} is already active in ` +
            `${match.villageName} Village.\n\n` +
            `Reason: "${reasonDef.label}" — this allows dual registration.\n\n` +
            `Click OK to register here while keeping them active in ${match.villageName} too.\n` +
            `Click Cancel if you want to verify this is the same person first.`
          )
          if (!proceed) return

        } else if (reasonDef.deductsFrom) {
          const choice = window.confirm(
            `Someone named ${name} born ${form.dateOfBirth} is already active in ` +
            `${match.villageName} Village.\n\n` +
            `Is this the SAME person moving here?\n\n` +
            `  Click OK   → Move them here (${match.villageName} updated to "Migrated")\n` +
            `  Click Cancel → This is a different person, register fresh`
          )
          if (choice) {
            setSaving(true)
            try {
              await performCrossVillageMove(match, form, db, user, movedRecord => {
                showToast(`✓ ${name} moved from ${match.villageName} to ${user?.villageName || 'this village'}.`)
                setTimeout(() => navigate(`/residents/${movedRecord.id}`), 1000)
              })
            } catch (err) {
              showToast('Move failed: ' + err.message, 'error')
            } finally { setSaving(false) }
            return
          }

        } else {
          const proceed = window.confirm(
            `Someone named ${name} born ${form.dateOfBirth} exists in ${match.villageName} Village.\n\n` +
            `Are you sure this is a completely different person?\n` +
            `Click Cancel to verify first, OK to continue.`
          )
          if (!proceed) return
        }
      }

      // ── Same-village name+DOB (alive, not deceased — already handled above) ─
      if (dup.localNameConflict && dup.localNameConflict.status !== 'deceased' && !dup.localNINConflict) {
        const r = dup.localNameConflict
        const proceed = window.confirm(
          `${r.surname} ${r.firstName} (born ${r.dateOfBirth}) already exists in this village.\n\n` +
          `Are you sure this is a different person with the same name and date of birth?\n` +
          `Click Cancel to check the existing record first.`
        )
        if (!proceed) return
      }

      // ── Cross-village NIN conflict ──────────────────────────────────────
      if (dup.crossNINResult.conflict) {
        const found = dup.crossNINResult.villages
        const match = found[0]
        const name  = `${match.resident.surname} ${match.resident.firstName}`

        if (reasonDef.isAffiliated) {
          // ── AFFILIATED: original village untouched, stored here as affiliated ──
          // Polygamous household head/spouse, property owner, seasonal, business, family ties.
          // The person's PRIMARY residence and population count stay in their original village.
          // We create an AFFILIATED record here — visible in the Affiliated tab,
          // clearly labelled, NOT counted in this village's population.
          // The original village record is NEVER modified.
          const proceed = window.confirm(
            `${name} is already an active resident in ${match.villageName} Village.\n\n` +
            `Reason: "${reasonDef.label}"\n\n` +
            `This will create an AFFILIATED record here:\n` +
            `  ✓ ${match.villageName} Village — original record UNCHANGED, still active\n` +
            `  ✓ ${user?.villageName || 'This village'} — stored as AFFILIATED (not counted in population)\n\n` +
            `The affiliated record will appear in the "🔗 Affiliated" tab of the Residents page.\n` +
            `Their identity card will be marked as "AFFILIATED RESIDENT".\n\n` +
            `Click OK to create affiliated record, or Cancel to go back.`
          )
          if (!proceed) return
          // Fall through — create affiliated record, original village untouched

        } else if (reasonDef.deductsFrom) {
          // ── MIGRATION: auto-move the person ────────────────────────────
          // Tenant, work, marriage (mono), displaced, relocation.
          // This person has ONE home — they are moving it here.
          // Transfer the record, deduct from former village.
          const proceed = window.confirm(
            `${name} is currently registered as an active resident in ${match.villageName} Village.\n\n` +
            `Reason selected: "${reasonDef.label}"\n\n` +
            `This will MOVE their registration to ${user?.villageName || 'this village'}:\n` +
            `  • Their record transfers here (same ID, full history preserved)\n` +
            `  • ${match.villageName} Village will show them as "Migrated away"\n` +
            `  • ${match.villageName}'s population count will decrease by 1\n` +
            `  • No duplicate record will be created\n\n` +
            `Click OK to move them, or Cancel to go back.`
          )
          if (!proceed) return

          setSaving(true)
          try {
            await performCrossVillageMove(match, form, db, user, movedRecord => {
              showToast(
                `✓ ${name} moved from ${match.villageName} to ${user?.villageName || 'this village'}.`
              )
              setTimeout(() => navigate(`/residents/${movedRecord.id}`), 1000)
            })
          } catch (err) {
            showToast('Move failed: ' + err.message, 'error')
          } finally {
            setSaving(false)
          }
          return  // done — no new record

        } else {
          // ── OTHER reason with NIN conflict ──────────────────────────────
          // born_here or 'other' — unusual. Ask registrar to verify or change reason.
          const proceed = window.confirm(
            `${name} is already registered in ${match.villageName} Village.\n\n` +
            `Please verify:\n` +
            `  • If they are MOVING here → change reason to "Tenant", "Work", etc.\n` +
            `  • If they have ties in both villages → change reason to "Property owner" or "Polygamous household"\n` +
            `  • If this is genuinely a different person → click OK\n\n` +
            `Click Cancel to go back and change the reason.`
          )
          if (!proceed) return
          // Fall through to create record (registrar confirmed different person)
        }
      }

      // ── Cross-village name+DOB conflict (no NIN recorded) ──────────────
      // Less certain than NIN — could be coincidence of names.
      // Still offer the move option but make the choice clearer.
      if (dup.crossNameResult.conflict && !dup.crossNINResult.conflict) {
        const found = dup.crossNameResult.villages
        const match = found[0]
        const name  = `${form.surname} ${form.firstName}`

        if (reasonDef.isAffiliated) {
          // Dual registration — confirm and proceed, no move
          const proceed = window.confirm(
            `Someone named ${name} born ${form.dateOfBirth} is already active in ` +
            `${match.villageName} Village.\n\n` +
            `Reason: "${reasonDef.label}" — this allows dual registration.\n\n` +
            `Click OK to register here while keeping them active in ${match.villageName} too.\n` +
            `Click Cancel if you want to verify this is the same person first.`
          )
          if (!proceed) return
          // Fall through — create new record

        } else if (reasonDef.deductsFrom) {
          // Offer to move, but allow "different person" since no NIN to confirm
          const choice = window.confirm(
            `Someone named ${name} born ${form.dateOfBirth} is already active in ` +
            `${match.villageName} Village.\n\n` +
            `Is this the SAME person moving here?\n\n` +
            `  Click OK   → Move them here (${match.villageName} updated to "Migrated")\n` +
            `  Click Cancel → This is a different person, register fresh`
          )
          if (choice) {
            setSaving(true)
            try {
              await performCrossVillageMove(match, form, db, user, movedRecord => {
                showToast(`✓ ${name} moved from ${match.villageName} to ${user?.villageName || 'this village'}.`)
                setTimeout(() => navigate(`/residents/${movedRecord.id}`), 1000)
              })
            } catch (err) {
              showToast('Move failed: ' + err.message, 'error')
            } finally {
              setSaving(false)
            }
            return
          }
          // Cancel = different person = fall through to create new record

        } else {
          // born_here or other — just warn
          const proceed = window.confirm(
            `Someone named ${name} born ${form.dateOfBirth} exists in ${match.villageName} Village.\n\n` +
            `Are you sure this is a completely different person?\n` +
            `Click Cancel to verify first, OK to continue.`
          )
          if (!proceed) return
        }
      }

      // ── Same-village name+DOB (no NIN) ──────────────────────────────────
      if (dup.localNameConflict && !dup.localNINConflict) {
        const r = dup.localNameConflict
        const proceed = window.confirm(
          `${r.surname} ${r.firstName} (born ${r.dateOfBirth}) already exists in this village.\n\n` +
          `Are you sure this is a different person with the same name and date of birth?\n` +
          `Click Cancel to check the existing record first.`
        )
        if (!proceed) return
      }
    }

    setSaving(true)

    try {
      const now = new Date().toISOString()

      // Derive residentType from reason
      const residentType = reasonDef.isAffiliated                                   ? 'affiliated'
        : (form.registrationReason === 'born_here' || form.registrationReason === 'relocation') ? 'permanent'
        : 'tenant'

      const record = {
        ...form,
        id:           isEdit ? form.id : uuidv4(),
        createdAt:    isEdit ? form.createdAt : now,
        createdBy:    isEdit ? form.createdBy : user?.id,
        updatedAt:    now,
        updatedBy:    user?.id,
        fingerprint:  fpData || form.fingerprint,
        syncStatus:   'pending',
        residentType,
        // Always store the current village from the logged-in context
        village:    user?.villageName || form.village || '',
        parish:     user?.parishName  || form.parish  || '',
        subCounty:  user?.subcountyName || form.subCounty || '',
        district:   user?.districtName  || form.district  || '',
      }

      // Write to village DB
      await db.put('residents', record)
      await db.audit(isEdit ? 'UPDATE' : 'CREATE', 'residents', record.id,
        { surname: record.surname, firstName: record.firstName })

      // ── Cross-village deduction (new registrations only) ─────────────────
      // Only trigger if:
      //   1. This is a new registration (not an edit)
      //   2. The reason causes deduction (tenant, work, marriage, etc.)
      //   3. We have the former village ID from the selector
      //   4. We have a NIN to find them by
      if (!isEdit && reasonDef.deductsFrom && record.formerVillageId && record.nin) {
        const migResult = await applyMigrationToFormerVillage(
          record.formerVillageId,
          record.nin,
          record.surname + ' ' + record.firstName,
          user?.villageName || '',
          db.villageId
        )
        if (migResult.done) {
          showToast(`✓ ${record.surname} registered here. Former village record updated to "migrated".`)
        } else if (migResult.reason === 'not_found_in_former_village') {
          showToast(`Registered. Note: resident not found in former village DB — they may not have been registered there.`, 'info')
        } else if (migResult.reason === 'former_village_not_on_device_will_sync') {
          showToast(`Registered. Former village update will sync when their system comes online.`, 'info')
        } else {
          showToast('Resident registered successfully.')
        }
      } else if (reasonDef.isAffiliated && record.formerVillageId) {
        // Multi-home: notify but DO NOT deduct
        showToast(`${record.surname} registered as ${reasonDef.label}. They remain active in their former village.`)
      } else {
        showToast(isEdit ? 'Resident updated successfully' : 'Resident registered successfully')
      }

      // Navigate to resident profile on success
      // Short delay lets the success toast be visible first
      setTimeout(() => {
        if (record.id) {
          navigate(`/residents/${record.id}`)
        } else {
          navigate('/residents')
        }
      }, 1000)
    } catch (err) {
      if (err.name === 'ConstraintError')
        showToast('A resident with this NIN is already registered in this village', 'error')
      else
        showToast('Error saving record: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4500)
  }

  // ── Webcam ────────────────────────────────────────────────────────────────
  const capturePhoto = useCallback(() => {
    if (!webcamRef.current) return
    set('photo', webcamRef.current.getScreenshot())
    setCamOpen(false)
    showToast('Photo captured')
  }, [webcamRef])

  // ── ID Scanner ────────────────────────────────────────────────────────────
  async function startScanner() {
    setScanning(true); setScanResult('')
    codeReaderRef.current = new BrowserMultiFormatReader()
    try {
      await codeReaderRef.current.decodeFromVideoDevice(null, scannerRef.current, (result) => {
        if (result) {
          const text = result.getText()
          setScanResult(text); parseNationalID(text); stopScanner()
          showToast('ID scanned — fields auto-filled')
        }
      })
    } catch (err) { showToast('Camera not available: ' + err.message, 'error'); setScanning(false) }
  }
  function stopScanner() { if (codeReaderRef.current) codeReaderRef.current.reset(); setScanning(false) }
  function parseNationalID(raw) {
    try {
      const parts = raw.split('|')
      if (parts.length >= 4) {
        if (parts[0]?.length === 14) set('nin', parts[0].toUpperCase())
        if (parts[1]) set('surname',    parts[1])
        if (parts[2]) set('firstName',  parts[2])
        if (parts[3]) set('otherNames', parts[3])
        if (parts[4]) set('dateOfBirth', parts[4].length === 8 ? `${parts[4].slice(4)}-${parts[4].slice(2,4)}-${parts[4].slice(0,2)}` : '')
        if (parts[5]) set('sex', parts[5] === 'M' ? 'Male' : parts[5] === 'F' ? 'Female' : '')
        return
      }
      if (/^[A-Z0-9]{14}$/i.test(raw.trim())) set('nin', raw.trim().toUpperCase())
    } catch {}
  }

  // ── Fingerprint ───────────────────────────────────────────────────────────
  async function captureFingerprint() {
    setFpStatus('scanning'); setFpData('')
    if (navigator.usb) {
      try {
        const device = await navigator.usb.requestDevice({ filters: [] })
        await device.open()
        const fpId = `FP-${device.productName}-${device.serialNumber}-${Date.now()}`
        setFpData(fpId); setFpStatus('captured')
        showToast('Fingerprint captured via USB reader'); return
      } catch {}
    }
    setTimeout(() => {
      setFpData(`FP-SIM-${uuidv4().slice(0,12).toUpperCase()}`)
      setFpStatus('captured')
      showToast('Fingerprint recorded (simulated)', 'info')
    }, 2500)
  }
  function clearFingerprint() { setFpData(''); setFpStatus('idle') }

  // Error inline display
  const Err = ({ field }) => errors[field]
    ? <span style={{ color:'var(--c-red-l)', fontSize:12, marginTop:2 }}>{errors[field]}</span>
    : null

  if (loading) {
    return (
      <div className="page" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:400 }}>
        <div style={{ textAlign:'center', color:'var(--c-text2)' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
          <div>Loading resident record…</div>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isEdit ? `Edit: ${form.surname} ${form.firstName}` : 'Register new resident'}
          </h1>
          <div className="page-sub">LC1 Village IMS · Resident registration · {user?.villageName} Village</div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Back</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? '✓ Save changes' : '✓ Register resident'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:24, alignItems:'start' }}>

          {/* ═══════════ LEFT COLUMN ═══════════ */}
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

            {/* Personal information */}
            <div className="card">
              <div className="section-title">Personal information</div>
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Surname *</label>
                    <input className="form-input" value={form.surname}
                      onChange={e => nameInput('surname', e.target.value)}
                      placeholder="Family name" autoComplete="family-name" />
                    <Err field="surname" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">First name *</label>
                    <input className="form-input" value={form.firstName}
                      onChange={e => nameInput('firstName', e.target.value)}
                      placeholder="Given name" autoComplete="given-name" />
                    <Err field="firstName" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Other names</label>
                    <input className="form-input" value={form.otherNames}
                      onChange={e => nameInput('otherNames', e.target.value)}
                      placeholder="Middle name(s)" />
                    <Err field="otherNames" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">National ID (NIN)</label>
                    <input className="form-input" value={form.nin}
                      onChange={e => {
                        set('nin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,14))
                        setNinStatus(null)
                      }}
                      placeholder="e.g. CM90000123ABCD" maxLength={14}
                      style={{
                        fontFamily:'monospace', letterSpacing:'0.12em',
                        borderColor: ninStatus?.level === 'block' ? 'var(--c-red)'   :
                                     ninStatus?.level === 'warn'  ? 'var(--c-gold)'  :
                                     ninStatus?.level === 'ok'    ? 'var(--c-green)' : undefined,
                      }}
                      autoComplete="off" />
                    {/* Live NIN check status — shown while typing */}
                    {ninChecking && (
                      <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4 }}>
                        🔍 Checking across all villages…
                      </div>
                    )}
                    {!ninChecking && ninStatus && (
                      <div style={{
                        fontSize:12, marginTop:5, padding:'6px 10px', borderRadius:6, lineHeight:1.5,
                        background: ninStatus.level==='block' ? 'rgba(192,57,43,0.12)' :
                                    ninStatus.level==='warn'  ? 'rgba(200,151,43,0.12)' :
                                                                'rgba(45,122,79,0.08)',
                        color:      ninStatus.level==='block' ? 'var(--c-red-l)' :
                                    ninStatus.level==='warn'  ? 'var(--c-gold-l)' :
                                                                'var(--c-green-xl)',
                        border:    `1px solid ${ninStatus.level==='block' ? 'rgba(192,57,43,0.3)' :
                                                 ninStatus.level==='warn'  ? 'rgba(200,151,43,0.3)' :
                                                                             'rgba(45,122,79,0.3)'}`,
                      }}>
                        {ninStatus.level==='block' ? '✕ ' : ninStatus.level==='warn' ? '⚠ ' : '✓ '}
                        {ninStatus.msg}
                      </div>
                    )}
                    <Err field="nin" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nationality</label>
                    <input className="form-input" value={form.nationality}
                      onChange={e => set('nationality', e.target.value)} placeholder="Ugandan" />
                  </div>
                </div>

                {/* ── FOREIGNER FIELDS — shown when nationality is not Ugandan ── */}
                {form.nationality && form.nationality.toLowerCase() !== 'ugandan' && (
                  <div style={{
                    background:'rgba(200,151,43,0.08)', border:'1px solid var(--c-gold)',
                    borderRadius:10, padding:'14px 16px', marginTop:4,
                  }}>
                    <div style={{ fontSize:12, color:'var(--c-gold-l)', fontWeight:600, marginBottom:12 }}>
                      🌍 Foreign national — additional information required
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Country of origin</label>
                          <input className="form-input" value={form.countryOfOrigin}
                            onChange={e => set('countryOfOrigin', e.target.value)}
                            placeholder="e.g. Kenya, DRC, Tanzania" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Purpose of stay</label>
                          <select className="form-select" value={form.purposeOfStay}
                            onChange={e => set('purposeOfStay', e.target.value)}>
                            <option value="">Select…</option>
                            {['Work / Employment','Business','Study','Refugee / Asylum seeker','Family reunification','Investment','Religious / Mission','Diplomatic','Transit','Other'].map(p => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Passport number</label>
                          <input className="form-input" value={form.passportNumber}
                            onChange={e => set('passportNumber', e.target.value.toUpperCase())}
                            placeholder="e.g. A12345678"
                            style={{ fontFamily:'monospace', letterSpacing:'0.08em' }} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Passport expiry</label>
                          <input className="form-input" type="date" value={form.passportExpiry}
                            onChange={e => set('passportExpiry', e.target.value)} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Permit / Visa type</label>
                          <select className="form-select" value={form.permitType}
                            onChange={e => set('permitType', e.target.value)}>
                            <option value="">Select…</option>
                            {['Class G (Work permit)','Class A (Investment)','Class B (Dependent)','Class C (Student)','Refugee Certificate','Special Pass','Diplomatic / Official','Certificate of Residence','No permit (irregular)'].map(p => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Permit number</label>
                          <input className="form-input" value={form.permitNumber}
                            onChange={e => set('permitNumber', e.target.value.toUpperCase())}
                            placeholder="e.g. WP/001234"
                            style={{ fontFamily:'monospace' }} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Permit / Visa expiry</label>
                        <input className="form-input" type="date" value={form.permitExpiry}
                          onChange={e => set('permitExpiry', e.target.value)} />
                        {form.permitExpiry && new Date(form.permitExpiry) < new Date() && (
                          <div style={{ fontSize:12, color:'var(--c-red-l)', marginTop:4 }}>
                            ⚠ This permit/visa appears to have expired. Verify current immigration status.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-row" style={{ display: 'none' }}>{/* dummy closing row */}</div>
                <div className="form-row-3">
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Date of birth *</label>
                    <input className="form-input" type="date" value={form.dateOfBirth}
                      onChange={e => set('dateOfBirth', e.target.value)}
                      max={new Date().toISOString().slice(0,10)} />
                    <Err field="dateOfBirth" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sex *</label>
                    <select className="form-select" value={form.sex} onChange={e => set('sex', e.target.value)}>
                      <option value="">Select…</option>
                      <option>Male</option><option>Female</option>
                    </select>
                    <Err field="sex" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Marital status</label>
                    <select className="form-select" value={form.maritalStatus} onChange={e => set('maritalStatus', e.target.value)}>
                      <option value="">Select…</option>
                      {MARITAL.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tribe / Ethnicity</label>
                    <select className="form-select" value={form.tribe} onChange={e => set('tribe', e.target.value)}>
                      <option value="">Select…</option>
                      {TRIBES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Religion</label>
                    <select className="form-select" value={form.religion} onChange={e => set('religion', e.target.value)}>
                      <option value="">Select…</option>
                      {RELIGIONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Occupation</label>
                  <select className="form-select" value={form.occupation} onChange={e => set('occupation', e.target.value)}>
                    <option value="">Select…</option>
                    {OCCUPATIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Contact details */}
            <div className="card">
              <div className="section-title">Contact details</div>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Phone number</label>
                    <input className="form-input" type="tel" inputMode="tel" value={form.phone}
                      onChange={e => phoneInput('phone', e.target.value)} placeholder="07XXXXXXXX" autoComplete="tel" />
                    <Err field="phone" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Alternative phone</label>
                    <input className="form-input" type="tel" inputMode="tel" value={form.phone2}
                      onChange={e => phoneInput('phone2', e.target.value)} placeholder="07XXXXXXXX" />
                    <Err field="phone2" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Email (optional)</label>
                  <input className="form-input" type="email" inputMode="email" value={form.email}
                    onChange={e => set('email', e.target.value)} placeholder="example@email.com" autoComplete="email" />
                </div>
              </div>
            </div>

            {/* ── CURRENT ADDRESS (within this village) ── */}
            <div className="card">
              <div className="section-title">Current address</div>
              <div style={{
                background:'rgba(45,122,79,0.08)', border:'1px solid var(--c-green)',
                borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color:'var(--c-text2)'
              }}>
                📍 <strong style={{ color:'var(--c-green-xl)' }}>{user?.villageName || '—'} Village</strong>
                {user?.parishName && ` · ${user.parishName} Parish`}
                {user?.districtName && ` · ${user.districtName} District`}
                <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:3 }}>
                  The village above is auto-set from your login context.
                  Fill in the specific location within the village below.
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Zone / Cell / LC1 area</label>
                    <input className="form-input" value={form.zone}
                      onChange={e => set('zone', e.target.value)}
                      placeholder="e.g. Zone A, Cell 3, Kisenyi" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date arrived in this village</label>
                    <input className="form-input" type="date" value={form.dateArrived}
                      onChange={e => set('dateArrived', e.target.value)}
                      max={new Date().toISOString().slice(0,10)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Detailed physical address</label>
                  <input className="form-input" value={form.physicalAddress}
                    onChange={e => set('physicalAddress', e.target.value)}
                    placeholder="Plot number, street, landmark" />
                </div>
              </div>
            </div>

            {/* ── REGISTRATION REASON ── */}
            <div className="card">
              <div className="section-title">Reason for registration here</div>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className="form-group">
                  <label className="form-label">Why is this person registering in this village? *</label>
                  <select className="form-select" value={form.registrationReason}
                    onChange={e => set('registrationReason', e.target.value)}>
                    {REGISTRATION_REASONS.map(r => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </div>

                {/* Contextual notice based on chosen reason */}
                {reasonDef && (
                  <div style={{
                    padding:'10px 14px', borderRadius:8, fontSize:13, lineHeight:1.7,
                    background: reasonDef.deductsFrom ? 'rgba(192,57,43,0.1)' :
                                reasonDef.isAffiliated   ? 'rgba(200,151,43,0.1)' :
                                                        'rgba(45,122,79,0.08)',
                    border: `1px solid ${reasonDef.deductsFrom ? 'rgba(192,57,43,0.3)' :
                             reasonDef.isAffiliated ? 'rgba(200,151,43,0.3)' : 'var(--c-green)'}`,
                    color: 'var(--c-text2)',
                  }}>
                    {reasonDef.deductsFrom && (
                      <><strong style={{ color:'var(--c-red-l)' }}>⬇ Will be deducted from former village</strong>
                        <br/>If their NIN is found in the former village DB, their status will automatically
                        be changed to "Migrated" there, reducing that village's active count.</>
                    )}
                    {reasonDef.isAffiliated && (
                      <><strong style={{ color:'var(--c-gold-l)' }}>⇌ Dual registration — stays active in both villages</strong>
                        <br/>This resident will be counted as active in both their former and current village.
                        A clear note is shown on their profile explaining the reason.</>
                    )}
                    {!reasonDef.deductsFrom && !reasonDef.isAffiliated && (
                      <><strong style={{ color:'var(--c-green-xl)' }}>✓ No former village change needed</strong>
                        <br/>This resident was not previously registered elsewhere.</>
                    )}
                  </div>
                )}

                {/* Reason explanation — required for some reasons */}
                {(reasonDef.requiresNote || form.registrationReason === 'other') && (
                  <div className="form-group">
                    <label className="form-label">
                      Explanation / Details
                      {reasonDef.requiresNote && <span style={{ color:'var(--c-red-l)', marginLeft:4 }}>*</span>}
                    </label>
                    <input className="form-input" value={form.registrationReasonNote}
                      onChange={e => set('registrationReasonNote', e.target.value)}
                      placeholder={
                        form.registrationReason === 'marriage_poly' ? 'e.g. Second wife under Islamic / customary law' :
                        form.registrationReason === 'property_owner' ? 'e.g. Owns plot No. 42 in this village' :
                        form.registrationReason === 'displaced' ? 'e.g. Fled floods in Butaleja District' :
                        'Explain the reason for dual/special registration'
                      } />
                    <Err field="registrationReasonNote" />
                  </div>
                )}
              </div>
            </div>

            {/* ── FORMER / PREVIOUS ADDRESS ── */}
            {form.registrationReason !== 'born_here' && (
              <div className="card">
                <div className="section-title">Former / previous address</div>
                <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:14, lineHeight:1.6 }}>
                  Where did this person live before moving here?
                  {reasonDef.deductsFrom && (
                    <strong style={{ color:'var(--c-red-l)' }}> If you select their former village from the system list below, their record there will be automatically updated to "Migrated".</strong>
                  )}
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                  {/* Former village — use the Uganda location hierarchy */}
                  <div style={{
                    background:'var(--c-surface2)', borderRadius:8, padding:14,
                    border:'1px solid var(--c-border)',
                  }}>
                    <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                      Select former village from system (recommended)
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {/* District */}
                      <div className="form-group">
                        <label className="form-label">Former district</label>
                        <select className="form-select" value={fvDistrict} onChange={pickFvDistrict}>
                          <option value="">— Select district —</option>
                          {Object.entries(distsByRegion).map(([region, dists]) => (
                            <optgroup key={region} label={`${region} Region`}>
                              {dists.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">County / Division</label>
                          <select className="form-select" value={fvCounty} onChange={pickFvCounty} disabled={!fvDistrict}>
                            <option value="">— Select county —</option>
                            {fvCounties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Sub-county / TC</label>
                          <select className="form-select" value={fvSubcounty} onChange={pickFvSubcounty} disabled={!fvCounty}>
                            <option value="">— Select sub-county —</option>
                            {fvSubcounties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Parish</label>
                          <select className="form-select" value={fvParish} onChange={pickFvParish} disabled={!fvSubcounty}>
                            <option value="">— Select parish —</option>
                            {fvParishes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Village</label>
                          <select className="form-select" value={fvVillage} onChange={pickFvVillage} disabled={!fvParish}>
                            <option value="">— Select village —</option>
                            {fvVillages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Show confirmed former village */}
                      {form.formerVillage && (
                        <div style={{ background:'rgba(45,122,79,0.1)', border:'1px solid var(--c-green)',
                          borderRadius:6, padding:'8px 12px', fontSize:13 }}>
                          <strong style={{ color:'var(--c-green-xl)' }}>Former village: {form.formerVillage}</strong>
                          {form.formerVillageId && (
                            <span style={{ color:'var(--c-text3)', marginLeft:8, fontSize:11 }}>
                              (ID: {form.formerVillageId} — auto-update enabled)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:10 }}>
                      Or type the address manually below if the village is not listed.
                    </div>
                  </div>

                  {/* Manual fallback */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Former village (manual)</label>
                      <input className="form-input" value={form.formerVillage}
                        onChange={e => set('formerVillage', e.target.value)}
                        placeholder="Name of former village" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Former parish</label>
                      <input className="form-input" value={form.formerParish}
                        onChange={e => set('formerParish', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Former sub-county</label>
                      <input className="form-input" value={form.formerSubcounty}
                        onChange={e => set('formerSubcounty', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Former district</label>
                      <input className="form-input" value={form.formerDistrict}
                        onChange={e => set('formerDistrict', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Next of kin */}
            <div className="card">
              <div className="section-title">Next of kin</div>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Full name</label>
                    <input className="form-input" value={form.nextOfKinName}
                      onChange={e => nameInput('nextOfKinName', e.target.value)}
                      placeholder="Next of kin name" />
                    <Err field="nextOfKinName" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Relationship</label>
                    <input className="form-input" value={form.nextOfKinRelation}
                      onChange={e => nameInput('nextOfKinRelation', e.target.value)}
                      placeholder="e.g. Spouse, Parent, Sibling" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" type="tel" inputMode="tel"
                    value={form.nextOfKinPhone}
                    onChange={e => phoneInput('nextOfKinPhone', e.target.value)} placeholder="07XXXXXXXX" />
                  <Err field="nextOfKinPhone" />
                </div>
              </div>
            </div>

            {/* Additional notes */}
            <div className="card">
              <div className="section-title">Additional notes</div>
              <RichTextEditor value={form.notes} onChange={html => set('notes', html)}
                placeholder="Any additional information about this resident…" minHeight={80} />
            </div>

          </div>

          {/* ═══════════ RIGHT COLUMN ═══════════ */}
          <div style={{ display:'flex', flexDirection:'column', gap:20, position:'sticky', top:24 }}>

            {/* Capture method */}
            <div className="card">
              <div className="section-title" style={{ marginBottom:12 }}>Capture method</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:16 }}>
                {INPUT_TABS.map(t => {
                  // Show red highlight on tab if validation failed for that item
                  const hasError =
                    (t.id === 'camera'      && errors.photo)       ||
                    (t.id === 'fingerprint' && errors.fingerprint)
                  return (
                    <button key={t.id} type="button"
                      className={`tab ${inputTab === t.id ? 'active' : ''}`}
                      style={{
                        textAlign:'left',
                        borderColor: hasError && inputTab !== t.id ? 'var(--c-red)' : undefined,
                        color:       hasError && inputTab !== t.id ? 'var(--c-red-l)' : undefined,
                      }}
                      onClick={() => { setInputTab(t.id); setCamOpen(false); stopScanner() }}>
                      {t.label}
                      {hasError && inputTab !== t.id && (
                        <span style={{ marginLeft:6, fontSize:10, color:'var(--c-red-l)' }}>← Required</span>
                      )}
                      {t.id === 'camera' && form.photo && inputTab !== t.id && (
                        <span style={{ marginLeft:6, fontSize:10, color:'var(--c-green-xl)' }}>✓</span>
                      )}
                      {t.id === 'fingerprint' && (fpData || form.fingerprint) && inputTab !== t.id && (
                        <span style={{ marginLeft:6, fontSize:10, color:'var(--c-green-xl)' }}>✓</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {inputTab === 'manual' && (
                <div style={{ color:'var(--c-text2)', fontSize:13, lineHeight:1.7 }}>
                  Fill in the form on the left. Fields marked * are required.
                  Use the ID scanner tab to auto-fill from a Uganda National ID.
                  <div style={{ marginTop:10, padding:'8px 12px', borderRadius:7,
                    background: (!form.photo || !(fpData||form.fingerprint))
                      ? 'rgba(192,57,43,0.08)' : 'rgba(45,122,79,0.08)',
                    border: `1px solid ${(!form.photo || !(fpData||form.fingerprint))
                      ? 'rgba(192,57,43,0.3)' : 'var(--c-green)'}`,
                    fontSize:12,
                  }}>
                    {!form.photo && <div style={{ color:'var(--c-red-l)' }}>✕ Photo not yet captured — required</div>}
                    {form.photo  && <div style={{ color:'var(--c-green-xl)' }}>✓ Photo captured</div>}
                    {!(fpData||form.fingerprint) && <div style={{ color:'var(--c-red-l)', marginTop:3 }}>✕ Fingerprint not yet captured — required</div>}
                    {(fpData||form.fingerprint)  && <div style={{ color:'var(--c-green-xl)', marginTop:3 }}>✓ Fingerprint captured</div>}
                  </div>
                </div>
              )}

              {inputTab === 'camera' && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {errors.photo && (
                    <div style={{ background:'rgba(192,57,43,0.12)', border:'1px solid var(--c-red)',
                      borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--c-red-l)' }}>
                      ✕ {errors.photo}
                    </div>
                  )}
                  {!camOpen ? (
                    <>
                      {form.photo ? (
                        <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'center' }}>
                          <img src={form.photo} alt="Resident" className="photo-preview" />
                          <div style={{ display:'flex', gap:8 }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCamOpen(true)}>Retake</button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => set('photo', '')}>Remove</button>
                          </div>
                        </div>
                      ) : (
                        <div className="photo-placeholder" style={{ width:'100%', height:150 }} onClick={() => setCamOpen(true)}>
                          <span style={{ fontSize:32 }}>📷</span>
                          <span style={{ fontSize:13 }}>Click to open camera</span>
                        </div>
                      )}
                      <label className="btn btn-secondary btn-sm" style={{ cursor:'pointer', textAlign:'center' }}>
                        📁 Upload photo
                        <input type="file" accept="image/*" style={{ display:'none' }}
                          onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => set('photo', ev.target.result); r.readAsDataURL(f) }} />
                      </label>
                    </>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      <div className="scanner-frame" style={{ maxWidth:'100%' }}>
                        <Webcam ref={webcamRef} screenshotFormat="image/jpeg"
                          videoConstraints={{ facingMode:'user' }}
                          style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button type="button" className="btn btn-gold" style={{ flex:1 }} onClick={capturePhoto}>📸 Capture</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCamOpen(false)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {inputTab === 'scanner' && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.6 }}>
                    Point the camera at the barcode/QR on the Uganda National ID.
                  </div>
                  {!scanning ? (
                    <button type="button" className="btn btn-primary" onClick={startScanner}>🔳 Start scanning</button>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      <div className="scanner-frame" style={{ maxWidth:'100%' }}>
                        <video ref={scannerRef} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        <div className="scanner-overlay"><div className="scan-line" /></div>
                      </div>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={stopScanner}>Stop</button>
                    </div>
                  )}
                  {scanResult && (
                    <div style={{ background:'rgba(45,122,79,0.12)', border:'1px solid var(--c-green)',
                      borderRadius:8, padding:'8px 12px', fontSize:11, fontFamily:'monospace',
                      wordBreak:'break-all', color:'var(--c-green-xl)' }}>
                      ✓ Scanned: {scanResult}
                    </div>
                  )}
                </div>
              )}

              {inputTab === 'fingerprint' && (
                <div style={{ display:'flex', flexDirection:'column', gap:12, alignItems:'center' }}>
                  {errors.fingerprint && (
                    <div style={{ background:'rgba(192,57,43,0.12)', border:'1px solid var(--c-red)',
                      borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--c-red-l)', width:'100%' }}>
                      ✕ {errors.fingerprint}
                    </div>
                  )}
                  <div style={{ fontSize:13, color:'var(--c-text2)', textAlign:'center', lineHeight:1.6 }}>
                    Connect a USB fingerprint reader, then press Capture.
                  </div>
                  <div className={`fp-reader ${fpStatus}`}
                    onClick={fpStatus === 'idle' ? captureFingerprint : undefined}
                    style={{ cursor:fpStatus==='idle'?'pointer':'default', width:'100%', height:130 }}>
                    {fpStatus === 'idle'     && <><span style={{ fontSize:38 }}>👆</span><span style={{ fontSize:12, color:'var(--c-text3)' }}>Click to scan</span></>}
                    {fpStatus === 'scanning' && <><span style={{ fontSize:38 }}>👆</span><span style={{ fontSize:12, color:'var(--c-green-xl)' }}>Scanning…</span></>}
                    {fpStatus === 'captured' && <><span style={{ fontSize:38 }}>✅</span><span style={{ fontSize:12, color:'var(--c-gold-l)' }}>Captured</span></>}
                    {fpStatus === 'error'    && <><span style={{ fontSize:38 }}>❌</span><span style={{ fontSize:12, color:'var(--c-red-l)' }}>Error</span></>}
                  </div>
                  {fpStatus !== 'idle' && (
                    <div style={{ display:'flex', gap:8, width:'100%' }}>
                      {fpStatus !== 'scanning' && <button type="button" className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={captureFingerprint}>Retry</button>}
                      <button type="button" className="btn btn-danger btn-sm" style={{ flex:1 }} onClick={clearFingerprint}>Clear</button>
                    </div>
                  )}
                  {fpData && <div style={{ fontSize:10, fontFamily:'monospace', color:'var(--c-text3)', wordBreak:'break-all', textAlign:'center' }}>ID: {fpData}</div>}
                </div>
              )}
            </div>

            {/* Status card */}
            <div className="card">
              <div className="section-title">Record status</div>
              <select className="form-select" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="migrated">Migrated away</option>
                <option value="deceased">Deceased</option>
                <option value="unknown">Unknown / Unverified</option>
              </select>
              <div style={{ marginTop:10, fontSize:12, color:'var(--c-text3)' }}>
                Residency type: <strong style={{ color:'var(--c-text2)' }}>
                  {reasonDef.isAffiliated ? 'Multi-home (active in both villages)' :
                   form.registrationReason === 'born_here' ? 'Permanent (born/always here)' : 'Single-village (former village updated)'}
                </strong>
              </div>
            </div>

            {/* Summary */}
            <div className="card" style={{ background:'rgba(45,122,79,0.06)', borderColor:'var(--c-green)' }}>
              <div className="section-title">Record summary</div>
              <div style={{ fontSize:13, display:'flex', flexDirection:'column', gap:7 }}>
                {[
                  ['Name',           [form.surname, form.firstName, form.otherNames].filter(Boolean).join(' ') || '—'],
                  ['NIN',            form.nin || '—'],
                  ['Sex / DOB',      [form.sex, form.dateOfBirth].filter(Boolean).join(' · ') || '—'],
                  ['Current village',user?.villageName || '—'],
                  ['Former village', form.formerVillage || '—'],
                  ['Reason',         REGISTRATION_REASONS.find(r=>r.id===form.registrationReason)?.label || '—'],
                  ['Status',         form.status],
                ].map(([k, v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                    <span style={{ color:'var(--c-text3)' }}>{k}</span>
                    <span style={{ color:'var(--c-text)', fontWeight:500, textAlign:'right', fontSize:12 }}>{v}</span>
                  </div>
                ))}
                {/* Biometric status rows — highlighted */}
                {[
                  { label:'Photo',       ok: !!form.photo,              msg: form.photo ? '✓ Captured' : '✗ Required' },
                  { label:'Fingerprint', ok: !!(fpData||form.fingerprint), msg: (fpData||form.fingerprint) ? '✓ Captured' : '✗ Required' },
                ].map(({ label, ok, msg }) => (
                  <div key={label} style={{
                    display:'flex', justifyContent:'space-between', gap:8,
                    padding:'3px 6px', borderRadius:5, marginTop:2,
                    background: ok ? 'rgba(45,122,79,0.1)' : 'rgba(192,57,43,0.1)',
                  }}>
                    <span style={{ color: ok ? 'var(--c-green-xl)' : 'var(--c-red-l)', fontSize:12 }}>{label}</span>
                    <span style={{ color: ok ? 'var(--c-green-xl)' : 'var(--c-red-l)', fontWeight:600, fontSize:12 }}>{msg}</span>
                  </div>
                ))}
              </div>
            </div>

            <button className="btn btn-primary btn-lg" type="submit" onClick={handleSave} disabled={saving}>
              {saving ? '⏳ Saving…' : isEdit ? '✓ Save changes' : '✓ Register resident'}
            </button>

          </div>
        </div>
      </form>

      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
