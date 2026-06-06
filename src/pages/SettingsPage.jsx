/**
 * ============================================================
 * SETTINGS PAGE — src/pages/SettingsPage.jsx
 * ============================================================
 * Tabbed layout so every section is immediately reachable
 * without scrolling. Tabs:
 *
 *   📍 Village         — village name, parish, district, etc.
 *   🖼️ Logo            — upload official MoLG logo
 *   👥 Committee        — add / edit / retire LC1 members
 *   📱 SMS & APIs      — Africa's Talking proxy URL ← HERE
 *   ☁️ Sync & Backup   — cloud sync + JSON export/import
 *   ℹ️ About
 * ============================================================
 */

import { useState, useEffect, useRef }  from 'react'
import { useVillageDB }                              from '../db/villageDB'
import { getVillageDB }                              from '../db/multiTenantDB'
import { v4 as uuidv4 }                 from 'uuid'
import { LC1_ROLES }                    from '../data/roles'
import { checkServerStatus, syncPendingRecords } from '../sync/syncEngine'
import { useToast, Toast }              from '../components/shared/Toast'
import ConfirmModal                     from '../components/shared/ConfirmModal'
import PageHeader                       from '../components/shared/PageHeader'
import LogoUpload                       from '../components/shared/LogoUpload'
import IntegrationsPanel                from '../components/shared/IntegrationsPanel'
import { useAuth }                      from '../hooks/useAuth'
import { generateResetToken, generateResetTokenByEmail } from '../db/multiTenantDB.js'
import { hashPassword }                 from '../security/crypto.js'
import { getAllowedSettingsTabs }        from '../data/roles'
import { getSupabaseConfig, setSupabaseConfig, testSupabaseConnection, startAutoSync, syncVillage } from '../services/cloudSync'
import { pushAllDataToSupabase } from '../services/dataMigration'
import { promptSetupFolder, getSetupStatus, clearSetupFolder, isFSApiSupported, FOLDERS } from '../services/documentStorage.js'

// ── Village info fields ────────────────────────────────────────────────────
// Location fields — auto-filled from login session, read-only display
const LOCATION_KEYS = [
  { key: 'villageName',   label: 'Village name',  sessionKey: 'villageName'   },
  { key: 'parishName',    label: 'Parish',         sessionKey: 'parishName'    },
  { key: 'subCountyName', label: 'Sub-county',     sessionKey: 'subcountyName' },
  { key: 'countyName',    label: 'County',         sessionKey: 'countyName'    },
  { key: 'districtName',  label: 'District',       sessionKey: 'districtName'  },
]
// Name/contact fields — editable by the chairperson
const NAME_KEYS = [
  { key: 'chairName',       label: 'LC1 Chairperson full name'   },
  { key: 'secretaryName',   label: 'General Secretary full name' },
  { key: 'treasurerName',   label: 'Sec. Finance full name'      },
  { key: 'officePhone',     label: 'Office phone number'         },
  { key: 'officeEmail',     label: 'Office email address'        },
  { key: 'physicalAddress', label: 'Physical office address'     },
]

const EMPTY_USER = {
  fullName: '', username: '', password: '',
  role: '', userStatus: 'active', phone: '', email: '', notes: ''
}

// ── RoleOption at module scope — prevents focus loss on re-render ──────────
function RoleOption({ role, users, editingUser }) {
  const holder = users.find(u => u.role === role.id && u.userStatus === 'active')
  const taken  = holder && holder.id !== editingUser
  return (
    <option value={role.id} disabled={taken}>
      {role.title}{taken ? ` — held by ${holder.fullName}` : ''}
    </option>
  )
}

// ── Tab definitions ────────────────────────────────────────────────────────
const ALL_TABS = [
  { id: 'village',   label: '📍 Village info'    },
  { id: 'logo',      label: '🖼️ Logo'            },
  { id: 'committee', label: '👥 Committee'        },
  { id: 'sms',       label: '📱 SMS & APIs'       },
  { id: 'sync',      label: '☁️ Sync & Backup'   },
  { id: 'about',     label: 'ℹ️ About'            },
]

// ═══════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const { user: currentUser } = useAuth()
  const { toast, showToast }  = useToast()
  const db = useVillageDB()   // village-scoped DB — MUST be here

  // Active tab — default to 'village', but can be set externally via URL hash
  const [activeTab, setActiveTab] = useState('village')

  // ── State ──────────────────────────────────────────────────────────────
  const [settings,      setSettings]      = useState({})
  const [users,         setUsers]         = useState([])
  const [logoData,      setLogoData]      = useState(null)
  const [syncUrl,       setSyncUrl]       = useState('')
  const [syncToken,     setSyncToken]     = useState('')
  const [syncTesting,   setSyncTesting]   = useState(false)
  const [syncTestResult,setSyncTestResult]= useState(null)
  const [folderStatus,  setFolderStatus]  = useState(null)
  const [supabaseUrl,   setSupabaseUrl]   = useState('')
  const [supabaseKey,   setSupabaseKey]   = useState('')
  const [syncEnabled,   setSyncEnabled]   = useState(false)
  const [syncTesting2,  setSyncTesting2]  = useState(false)
  const [syncTestResult2,setSyncTestResult2] = useState(null)
  const [syncingNow,    setSyncingNow]    = useState(false)
  const [migrating,     setMigrating]     = useState(false)
  const [migrateLog,    setMigrateLog]    = useState([])
  const [migrateResult, setMigrateResult] = useState(null)
  const [wiping,        setWiping]        = useState(false)
  const [wipeConfirm,   setWipeConfirm]   = useState(false)

  // User management modal
  const [userModal,    setUserModal]    = useState(false)
  const [userForm,     setUserForm]     = useState(EMPTY_USER)
  const [editingUser,  setEditingUser]  = useState(null)
  const [retireId,     setRetireId]     = useState(null)
  const [retireReason, setRetireReason] = useState('resigned')

  // Password reset modal
  const [resetUser,    setResetUser]    = useState(null)   // the member being reset
  const [resetPw,      setResetPw]      = useState('')
  const [resetPw2,     setResetPw2]     = useState('')
  const [resetShow,    setResetShow]    = useState(false)
  const [issuedToken,  setIssuedToken]  = useState(null)   // token generated by admin

  // Focus ref for user modal
  const userNameRef = useRef(null)
  useEffect(() => {
    if (userModal) setTimeout(() => userNameRef.current?.focus(), 0)
  }, [userModal])

  // ── Load on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    load()
    getSetupStatus().then(setFolderStatus)
    const sc = getSupabaseConfig()
    setSupabaseUrl(sc.url || '')
    setSupabaseKey(sc.anonKey || '')
    setSyncEnabled(sc.enabled || false)
  }, [db.villageId])  // ← re-runs when village changes

  async function load() {
    try {
      const [allSettings, allUsers] = await Promise.all([
        db.getAll('settings'),
        db.getAll('users'),
      ])
      const s = {}
      allSettings.forEach(x => { s[x.key] = x.value })

      // Auto-fill location from login session — these come from
      // the Uganda locations database selected at login, always accurate
      if (currentUser?.villageName)   s.villageName   = currentUser.villageName
      if (currentUser?.parishName)    s.parishName    = currentUser.parishName
      if (currentUser?.subcountyName) s.subCountyName = currentUser.subcountyName
      if (currentUser?.countyName)    s.countyName    = currentUser.countyName
      if (currentUser?.districtName)  s.districtName  = currentUser.districtName

      setSettings(s)
      setUsers(allUsers.sort((a, b) => (a.role || '').localeCompare(b.role || '')))
      setSyncUrl(s.syncServerUrl || '')
      setSyncToken(s.syncApiToken || '')
      // Logo is stored centrally — read from master DB
      try {
        const { getMasterDB } = await import('../db/multiTenantDB')
        const masterDB = await getMasterDB()
        const logoEntry = await masterDB.get('settings', 'officialLogo')
        setLogoData(logoEntry?.value || null)
      } catch {
        setLogoData(s.officialLogo || null)
      }
    } catch (err) {
      showToast('Error loading settings: ' + err.message, 'error')
    }
  }

  // ── Village info save ──────────────────────────────────────────────────
  async function saveVillageSettings() {
    try {
      for (const [key, value] of Object.entries(settings)) {
        await db.put('settings', { key, value })
      }
      showToast('Village settings saved')
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error')
    }
  }

  // ── Logo save ──────────────────────────────────────────────────────────
  async function saveLogo(dataUrl) {
    try {
      // Logo is stored centrally in the MASTER DB so it's identical across all villages
      const { getMasterDB } = await import('../db/multiTenantDB')
      const masterDB = await getMasterDB()
      if (dataUrl) {
        await masterDB.put('settings', { key: 'officialLogo', value: dataUrl })
      } else {
        try { await masterDB.delete('settings', 'officialLogo') } catch {}
      }
      setLogoData(dataUrl)
      showToast(dataUrl ? '✓ Logo saved centrally — appears on all village documents' : 'Logo removed')
    } catch (err) {
      showToast('Logo save failed: ' + err.message, 'error')
    }
  }

  // ── Sync config ────────────────────────────────────────────────────────
  async function saveSyncConfig() {
    await db.put('settings', { key: 'syncServerUrl', value: syncUrl })
    await db.put('settings', { key: 'syncApiToken',  value: syncToken })
    showToast('Sync configuration saved')
  }

  async function testServer() {
    if (!syncUrl || !syncToken) { showToast('Enter server URL and token first', 'error'); return }
    setSyncTesting(true); setSyncTestResult(null)
    const result = await checkServerStatus(syncUrl, syncToken)
    setSyncTestResult(result)
    setSyncTesting(false)
    showToast(result.ok ? 'Server connected' : 'Connection failed: ' + result.error,
      result.ok ? 'success' : 'error')
  }

  // ── User management ────────────────────────────────────────────────────
  function openNewUser()  { setUserForm(EMPTY_USER); setEditingUser(null); setUserModal(true) }
  function openEditUser(u){ setUserForm({ ...u, password: '' }); setEditingUser(u.id); setUserModal(true) }

  // ── Password reset (admin sets a new password for a member) ──────────────
  function openResetPassword(u) {
    setResetUser(u)
    setResetPw('')
    setResetPw2('')
    setResetShow(false)
  }

  async function confirmResetPassword() {
    if (!resetUser) return
    const pw = resetPw.trim()
    if (pw.length < 4) { showToast('Password must be at least 4 characters', 'error'); return }
    if (pw !== resetPw2.trim()) { showToast('Passwords do not match', 'error'); return }
    try {
      const existing = await db.get('users', resetUser.id)
      if (!existing) { showToast('Member not found', 'error'); return }
      const hashed = await hashPassword(pw)
      await db.put('users', {
        ...existing,
        password: hashed,
        updatedAt: new Date().toISOString(),
        // Clear any lockout so they can log in immediately
        failedAttempts: 0,
        lockedUntil: null,
      })
      // Also clear any failed-attempt lock stored separately
      try {
        const lockKey = `lc1_lockout_${currentUser?.villageId || ''}_${resetUser.username}`
        localStorage.removeItem(lockKey)
      } catch {}
      showToast(`✓ Password reset for ${resetUser.fullName}. Give them the new password.`, 'success')
      setResetUser(null)
      setResetPw(''); setResetPw2('')
      load()
    } catch (err) {
      showToast('Reset failed: ' + err.message, 'error')
    }
  }

  async function saveUser() {
    if (!userForm.fullName.trim()) { showToast('Full name is required', 'error'); return }
    if (!userForm.username.trim()) { showToast('Username is required', 'error'); return }
    if (!editingUser && !userForm.password.trim()) { showToast('Password required', 'error'); return }
    if (!userForm.role)            { showToast('Select a council role', 'error'); return }

    // Check if role is available within this village's users
    const villageUsers = await db.getAll('users')
    const existingHolder = villageUsers.find(u =>
      u.role === userForm.role &&
      u.userStatus === 'active' &&
      u.id !== editingUser
    )
    if (existingHolder) {
      showToast(`"${userForm.role.replace(/_/g,' ')}" is held by ${existingHolder.fullName}. Retire them first.`, 'error')
      return
    }
    const now = new Date().toISOString()
    try {
      if (editingUser) {
        const existing = await db.get('users', editingUser)
        const finalPw = userForm.password.trim()
          ? await hashPassword(userForm.password.trim())
          : existing.password
        await db.put('users', { ...existing, ...userForm,
          password: finalPw, updatedAt: now })
        showToast('Committee member updated')
      } else {
        const hashedPw = await hashPassword(userForm.password.trim())
        await db.add('users', { ...userForm, password: hashedPw, id: uuidv4(),
          userStatus: 'active', createdAt: now, updatedAt: now })
        showToast('Committee member added')
      }
      setUserModal(false); setEditingUser(null); setUserForm(EMPTY_USER); load()
    } catch (err) {
      if (err.name === 'ConstraintError') showToast('Username already taken', 'error')
      else showToast('Error: ' + err.message, 'error')
    }
  }

  async function confirmRetire() {
    const u  = await db.get('users', retireId)
    await db.put('users', { ...u, userStatus: retireReason, retiredAt: new Date().toISOString() })
    showToast(`${u.fullName} marked as "${retireReason}"`)
    setRetireId(null); load()
  }

  // ── Data export / import ───────────────────────────────────────────────
  async function exportData() {
    const tables = ['residents','households','land','cases','meetings',
                    'births','deaths','letters','welfare','businesses','security']
    const data   = {}
    for (const t of tables) {
      try { data[t] = await db.getAll(t) } catch { data[t] = [] }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `lc1-backup-${settings.villageName?.replace(/\s+/g,'-') || 'village'}-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Backup exported')
  }

  async function importData(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      let count  = 0
      for (const [store, records] of Object.entries(data)) {
        for (const record of records) {
          try { await db.put(store, record); count++ } catch {}
        }
      }
      showToast(`Restored ${count} records from backup`)
      load()
    } catch (err) { showToast('Import failed: ' + err.message, 'error') }
    e.target.value = ''
  }

  // ── Wipe entire village database ──────────────────────────────────────────
  async function wipeDatabase() {
    setWiping(true)
    try {
      const stores = ['residents','households','land','cases','births','deaths',
                      'meetings','letters','welfare','businesses','security',
                      'audit','settings']
      for (const store of stores) {
        try {
          const all = await db.getAll(store)
          for (const rec of all) {
            const key = rec.id || rec.key
            if (key) await db.delete(store, key)
          }
        } catch {}
      }
      // Reset last pull timestamps
      Object.keys(localStorage)
        .filter(k => k.startsWith('lc1_last_pull_'))
        .forEach(k => localStorage.removeItem(k))
      showToast('✓ Database wiped — all records cleared', 'success')
      setWipeConfirm(false)
      load()
    } catch (err) {
      showToast('Wipe failed: ' + err.message, 'error')
    }
    setWiping(false)
  }

  const statusColor = { active:'green', resigned:'gold', deceased:'gray', removed:'red', term_ended:'blue' }

  // ── Filter settings tabs based on role ────────────────────────────────────
  // System admin (isMasterAdmin) sees ALL tabs
  // Chair/GenSec see only village + committee
  // While user loads, show all tabs temporarily to avoid blank screen
  const allowedTabIds = getAllowedSettingsTabs(currentUser)
  const TABS = ALL_TABS.filter(t => allowedTabIds.includes(t.id))

  // If no tabs resolved yet (currentUser still loading), fall back to all
  const visibleTabs = TABS.length > 0 ? TABS : ALL_TABS

  // If current activeTab is not in visible tabs, snap to first available
  const safeActiveTab = visibleTabs.find(t => t.id === activeTab)?.id || visibleTabs[0]?.id || 'village'

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <PageHeader title="Settings" sub="Village configuration and system management" />

      {/* ── TAB BAR ── */}
      <div className="tabs" style={{ marginBottom: 28 }}>
        {visibleTabs.map(t => (
          <button
            key={t.id}
            className={`tab ${safeActiveTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB: VILLAGE INFO
      ══════════════════════════════════════════════════════ */}
      {safeActiveTab === 'village' && (
        <div style={{ maxWidth:640, display:'flex', flexDirection:'column', gap:20 }}>

          {/* Location — auto-filled from login, read-only */}
          <div className="card">
            <div className="section-title">📍 Village location</div>
            <div style={{ fontSize:12, color:'var(--c-text2)', marginBottom:14, lineHeight:1.6,
              background:'rgba(45,122,79,0.08)', padding:'8px 12px', borderRadius:7,
              border:'1px solid var(--c-green)' }}>
              ✓ Location fields are automatically filled from your login session.
              They update when you log in to a different village.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {LOCATION_KEYS.map(({ key, label }) => (
                <div key={key} style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <label style={{ fontSize:12, color:'var(--c-text3)', width:110, flexShrink:0 }}>{label}</label>
                  <div style={{
                    flex:1, padding:'8px 12px', borderRadius:7,
                    background:'var(--c-surface2)', border:'1px solid var(--c-border)',
                    fontSize:13, fontWeight:600, color:'var(--c-text)',
                  }}>
                    {settings[key] || <span style={{ color:'var(--c-text3)', fontStyle:'italic' }}>Not set</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Names & contact — editable */}
          <div className="card">
            <div className="section-title">👥 Committee names &amp; contact</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {NAME_KEYS.map(({ key, label }) => (
                <div key={key} className="form-group">
                  <label className="form-label">{label}</label>
                  <input className="form-input"
                    value={settings[key] || ''}
                    onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={label} />
                </div>
              ))}
              <button className="btn btn-primary" style={{ marginTop:8 }} onClick={saveVillageSettings}>
                💾 Save names &amp; contact details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: LOGO
      ══════════════════════════════════════════════════════ */}
      {safeActiveTab === 'logo' && (
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="section-title">Official logo</div>
          <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:16, lineHeight:1.6 }}>
            Upload the official Ministry of Local Government logo. It appears on all
            printed documents, letters, and certificates.
          </p>
          <LogoUpload
            currentLogo={logoData}
            onLogoChange={saveLogo}
            settings={settings}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: COMMITTEE
      ══════════════════════════════════════════════════════ */}
      {safeActiveTab === 'committee' && (
        <div style={{ maxWidth: 700 }}>

          {/* Password reset token generator — by email or username */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Generate password reset token</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:14, lineHeight:1.6 }}>
              When a member forgets their password, look them up by their{' '}
              <strong>registered email</strong> (or username) and generate a one-time token.
              Give it to them — they enter it on the login screen with a new password.
            </p>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
              <div className="form-group" style={{ flex:1, minWidth:220 }}>
                <label className="form-label">Member's email or username</label>
                <input className="form-input" id="resetLookup" placeholder="member@example.com or username" />
              </div>
              <button className="btn btn-gold" onClick={async () => {
                const val = document.getElementById('resetLookup')?.value?.trim()
                if (!val) { showToast('Enter an email or username first', 'error'); return }
                if (!currentUser?.villageId || currentUser.villageId === 'MASTER') {
                  showToast('Select a village first', 'error'); return
                }
                try {
                  let result
                  if (val.includes('@')) {
                    result = await generateResetTokenByEmail(currentUser.villageId, val)
                    if (!result.found) { showToast('No active member found with that email', 'error'); return }
                  } else {
                    const token = await generateResetToken(currentUser.villageId, val)
                    result = { found: true, token, username: val }
                  }
                  setIssuedToken(result)
                } catch (err) { showToast(err.message, 'error') }
              }}>
                🔑 Generate token
              </button>
            </div>

            {/* Issued token display */}
            {issuedToken?.found && (
              <div style={{
                marginTop:16, padding:'14px 18px', borderRadius:10,
                background:'rgba(45,122,79,0.1)', border:'1px solid var(--c-green)',
              }}>
                <div style={{ fontSize:12, color:'var(--c-text2)', marginBottom:6 }}>
                  Reset token for <strong>{issuedToken.fullName || issuedToken.username}</strong>
                  {' '}(<span style={{ fontFamily:'monospace' }}>@{issuedToken.username}</span>):
                </div>
                <div style={{
                  fontSize:26, fontWeight:800, letterSpacing:'0.15em',
                  fontFamily:'monospace', color:'var(--c-green-xl)', textAlign:'center',
                  padding:'8px 0', userSelect:'all',
                }}>
                  {issuedToken.token}
                </div>
                <div style={{ fontSize:11, color:'var(--c-text3)', textAlign:'center' }}>
                  Valid for 24 hours · the member enters this on the login screen under "Forgot password"
                </div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop:10, width:'100%' }}
                  onClick={() => { navigator.clipboard?.writeText(issuedToken.token); showToast('Token copied') }}>
                  📋 Copy token
                </button>
              </div>
            )}
          </div>

          {/* Committee member list */}
          <div className="card">
            <div className="section-title">LC1 Committee members</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:14, lineHeight:1.6 }}>
              Only one active person per role. Retire the current holder before
              assigning the same role to someone new.
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
              {users.length === 0 ? (
                <div style={{ color:'var(--c-text3)', fontSize:13, padding:'12px 0' }}>
                  No committee members yet.
                </div>
              ) : users.map(u => (
                <div key={u.id} style={{
                  padding:'10px 14px', borderRadius:8, background:'var(--c-surface2)',
                  border:`1px solid ${u.userStatus==='active' ? 'var(--c-border)' : 'rgba(192,57,43,0.2)'}`,
                  display:'flex', justifyContent:'space-between', alignItems:'center', gap:12,
                }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14 }}>{u.fullName}</div>
                    <div style={{ fontSize:12, color:'var(--c-text3)', marginTop:2 }}>
                      @{u.username} · {u.role?.replace(/_/g,' ')}
                    </div>
                    {u.phone && <div style={{ fontSize:11, color:'var(--c-text3)' }}>{u.phone}</div>}
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                    <span className={`badge badge-${statusColor[u.userStatus]||'gray'}`}>
                      {u.userStatus}
                    </span>
                    {u.userStatus === 'active' && (
                      <>
                        <button className="btn btn-gold btn-sm"
                          onClick={() => openResetPassword(u)}
                          title="Set a new password for this member">🔑 Reset password</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditUser(u)}>Edit</button>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => { setRetireId(u.id); setRetireReason('resigned') }}>
                          Retire
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={openNewUser}>+ Add committee member</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: SMS & APIS  ← THE ONE THAT WAS HIDDEN
      ══════════════════════════════════════════════════════ */}
      {safeActiveTab === 'sms' && (
        <IntegrationsPanel />
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: SYNC & BACKUP
      ══════════════════════════════════════════════════════ */}
      {safeActiveTab === 'sync' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:640 }}>

          {/* Cloud sync */}
          <div className="card">
            <div className="section-title">Cloud sync</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:14, lineHeight:1.6 }}>
              Connect to a server to sync data across multiple devices.
              The system works fully offline without this.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-group">
                <label className="form-label">Sync server URL</label>
                <input className="form-input" value={syncUrl}
                  onChange={e => setSyncUrl(e.target.value)}
                  placeholder="https://your-server.com" />
              </div>
              <div className="form-group">
                <label className="form-label">API token</label>
                <input className="form-input" type="password" value={syncToken}
                  onChange={e => setSyncToken(e.target.value)}
                  placeholder="Your village sync token" />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-secondary" onClick={testServer} disabled={syncTesting}>
                  {syncTesting ? 'Testing…' : 'Test connection'}
                </button>
                <button className="btn btn-primary" onClick={saveSyncConfig}>Save</button>
                <button className="btn btn-gold btn-sm" onClick={syncPendingRecords}>↑ Sync now</button>
              </div>
              {syncTestResult && (
                <div style={{
                  padding:'8px 12px', borderRadius:8, fontSize:13,
                  background: syncTestResult.ok ? 'rgba(45,122,79,0.15)' : 'rgba(192,57,43,0.15)',
                  color:      syncTestResult.ok ? 'var(--c-green-xl)' : 'var(--c-red-l)',
                  border:    `1px solid ${syncTestResult.ok ? 'var(--c-green)' : 'var(--c-red)'}`,
                }}>
                  {syncTestResult.ok ? '✓ Connected' : '✕ ' + syncTestResult.error}
                </div>
              )}
            </div>
          </div>

          {/* Supabase cloud sync */}
          <div className="card">
            <div className="section-title">☁️ Supabase Cloud Database</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:12, lineHeight:1.6 }}>
              Connect to <strong>Supabase</strong> (free tier: 500MB, unlimited API calls) for automatic
              cloud backup and cross-device sync. All data stays in Uganda if you select the
              Africa region when creating your project.
            </p>

            {/* Setup steps */}
            <div style={{ background:'rgba(36,113,163,0.08)', border:'1px solid rgba(36,113,163,0.3)',
              borderRadius:8, padding:'12px 14px', marginBottom:14, fontSize:12, lineHeight:1.8 }}>
              <strong style={{ fontSize:13 }}>How to set up (free, 5 minutes):</strong><br/>
              1. Go to <strong>supabase.com</strong> → Create account → New project<br/>
              2. Settings → API → copy <strong>Project URL</strong> and <strong>anon/public key</strong><br/>
              3. SQL Editor → paste and run this setup script:<br/>
              <pre style={{ background:'#1a1a2e', color:'#a8d8a8', padding:'8px 10px', borderRadius:6,
                fontSize:10, overflow:'auto', marginTop:6, lineHeight:1.6 }}>{`CREATE TABLE IF NOT EXISTS lc1_sync_data (
  id          TEXT PRIMARY KEY,
  village_id  TEXT NOT NULL,
  store_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted     BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_vill ON lc1_sync_data(village_id,store_name);
CREATE INDEX IF NOT EXISTS idx_upd  ON lc1_sync_data(updated_at);
ALTER TABLE lc1_sync_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON lc1_sync_data FOR ALL USING (true);`}</pre>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-group">
                <label className="form-label">Supabase Project URL</label>
                <input className="form-input" value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxxxxxxxxxx.supabase.co"
                  style={{ fontFamily:'monospace', fontSize:12 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Supabase anon/public key</label>
                <input className="form-input" type="password" value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  style={{ fontFamily:'monospace', fontSize:11 }} />
              </div>
            </div>

            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginTop:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                <input type="checkbox" checked={syncEnabled}
                  onChange={e => setSyncEnabled(e.target.checked)} />
                Enable automatic sync every 30 seconds
              </label>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
              <button className="btn btn-primary" onClick={() => {
                setSupabaseConfig(supabaseUrl, supabaseKey, syncEnabled)
                if (syncEnabled && supabaseUrl && supabaseKey) {
                  startAutoSync(currentUser?.villageId, () => {})
                }
                showToast('Supabase sync settings saved')
              }}>
                💾 Save settings
              </button>
              <button className="btn btn-secondary" disabled={!supabaseUrl || !supabaseKey || syncTesting2}
                onClick={async () => {
                  setSyncTesting2(true); setSyncTestResult2(null)
                  const r = await testSupabaseConnection(supabaseUrl, supabaseKey)
                  setSyncTestResult2(r); setSyncTesting2(false)
                }}>
                {syncTesting2 ? '⏳ Testing…' : '🔌 Test connection'}
              </button>
              <button className="btn btn-gold" disabled={!supabaseUrl || !supabaseKey || syncingNow}
                onClick={async () => {
                  setSyncingNow(true)
                  try {
                    const result = await syncVillage(currentUser?.villageId, () => {})
                    if (result?.skipped) {
                      showToast('Save your Supabase URL and key first, then try again.', 'error')
                    } else {
                      showToast(`✓ Synced — pushed ${result?.pushed ?? 0}, pulled ${result?.pulled ?? 0} records`)
                    }
                  } catch(err) {
                    showToast('Sync failed: ' + err.message, 'error')
                  }
                  setSyncingNow(false)
                }}>
                {syncingNow ? '⏳ Syncing…' : '↺ Sync now'}
              </button>
            </div>

            {/* Push ALL local data to Supabase — one-time migration */}
            <div style={{
              marginTop:16, padding:'12px 14px',
              background:'rgba(13,71,161,0.06)', border:'1px solid rgba(13,71,161,0.25)',
              borderRadius:8
            }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:6 }}>
                📤 Push ALL local data to Supabase
              </div>
              <div style={{ fontSize:12, color:'var(--c-text2)', marginBottom:10, lineHeight:1.6 }}>
                Reads every record from every village on this device and upserts it to Supabase.
                Safe to run multiple times — existing records are updated, not duplicated.
              </div>
              <button className="btn btn-primary"
                disabled={!supabaseUrl || !supabaseKey || migrating}
                onClick={async () => {
                  setMigrating(true); setMigrateLog([]); setMigrateResult(null)
                  try {
                    const result = await pushAllDataToSupabase((msg, count) => {
                      setMigrateLog(prev => [...prev.slice(-8), `${msg} — ${count} pushed so far`])
                    })
                    setMigrateResult({ success: true, ...result })
                    showToast(`✓ Pushed ${result.total} records to Supabase`)
                  } catch (err) {
                    setMigrateResult({ success: false, error: err.message })
                    showToast('Push failed: ' + err.message, 'error')
                  }
                  setMigrating(false)
                }}>
                {migrating ? '⏳ Pushing…' : '📤 Push all data to Supabase now'}
              </button>

              {/* Live log */}
              {migrateLog.length > 0 && (
                <div style={{ marginTop:10, background:'#1a1a2e', borderRadius:6,
                  padding:'8px 10px', fontSize:10, fontFamily:'monospace',
                  color:'#a8d8a8', maxHeight:140, overflowY:'auto' }}>
                  {migrateLog.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              )}

              {/* Result */}
              {migrateResult && (
                <div style={{
                  marginTop:8, padding:'8px 12px', borderRadius:6, fontSize:12,
                  background: migrateResult.success ? 'rgba(45,122,79,0.1)' : 'rgba(192,57,43,0.1)',
                  border: `1px solid ${migrateResult.success ? 'var(--c-green)' : 'var(--c-red)'}`,
                  color: migrateResult.success ? 'var(--c-green-xl)' : 'var(--c-red-l)',
                }}>
                  {migrateResult.success ? (
                    <>
                      ✓ Pushed {migrateResult.total} records total
                      {Object.entries(migrateResult.byVillage).map(([v,n]) => (
                        <div key={v} style={{ fontSize:11, marginTop:2 }}>
                          📍 {v}: {n} records
                        </div>
                      ))}
                    </>
                  ) : `✕ ${migrateResult.error}`}
                </div>
              )}
            </div>

            {syncTestResult2 && (
              <div style={{
                marginTop:12, padding:'10px 14px', borderRadius:8, fontSize:12, lineHeight:1.6,
                background: syncTestResult2.success ? 'rgba(45,122,79,0.1)' : 'rgba(192,57,43,0.1)',
                border:`1px solid ${syncTestResult2.success ? 'var(--c-green)' : 'var(--c-red)'}`,
                color: syncTestResult2.success ? 'var(--c-green-xl)' : 'var(--c-red-l)',
              }}>
                {syncTestResult2.success
                  ? `✓ ${syncTestResult2.message}`
                  : `✕ ${syncTestResult2.error}`}
                {syncTestResult2.needsSetup && (
                  <div style={{ marginTop:6, color:'var(--c-gold-l)' }}>
                    ⚠ Run the SQL setup script above in Supabase → SQL Editor, then test again.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Document folder setup */}
          <div className="card">
            <div className="section-title">Document save folder</div>
            <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:14, lineHeight:1.6 }}>
              Choose a folder on your computer where all generated PDFs will be automatically
              saved into organised subfolders: <em>Birth Certificates</em>, <em>Land Titles</em>,
              <em>Official Letters</em>, <em>Resident Profiles</em>, etc.
            </p>

            {!isFSApiSupported() ? (
              <div style={{ background:'rgba(200,151,43,0.1)', border:'1px solid var(--c-gold)',
                borderRadius:8, padding:'10px 14px', fontSize:13, color:'var(--c-text2)', marginBottom:10 }}>
                ⚠ Your browser does not support folder selection.
                Use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> to enable this feature.
                Documents will still download to your Downloads folder.
              </div>
            ) : folderStatus?.configured ? (
              <div>
                <div style={{ background:'rgba(45,122,79,0.1)', border:'1px solid var(--c-green)',
                  borderRadius:8, padding:'10px 14px', marginBottom:12,
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:600, color:'var(--c-green-xl)', fontSize:13 }}>
                      ✓ Folder configured: <strong>{folderStatus.folderName}</strong>
                    </div>
                    <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:3 }}>
                      Documents save to: {folderStatus.folderName}/LC1-VIMS-{currentUser?.villageName}/[type]/filename.pdf
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={async () => {
                    await clearSetupFolder()
                    setFolderStatus({ supported: true, configured: false })
                    showToast('Folder cleared — documents will download normally')
                  }}>Change folder</button>
                </div>
                <div style={{ fontSize:12, color:'var(--c-text3)', lineHeight:1.8 }}>
                  <strong>Subfolders created automatically:</strong><br/>
                  {Object.values(FOLDERS).map(f => `📁 ${f}`).join('  ·  ')}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ background:'var(--c-surface2)', border:'1px solid var(--c-border)',
                  borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, color:'var(--c-text2)', lineHeight:1.7 }}>
                  No folder selected yet. Click below to choose where documents should be saved.
                  The system will create subfolders automatically.
                </div>
                <button className="btn btn-primary" onClick={async () => {
                  const result = await promptSetupFolder()
                  if (result.success) {
                    const status = await getSetupStatus()
                    setFolderStatus(status)
                    showToast(`✓ Documents will save to: ${result.path}/LC1-VIMS-${currentUser?.villageName}/`)
                  } else if (result.error !== 'Cancelled') {
                    showToast('Folder setup failed: ' + result.error, 'error')
                  }
                }}>
                  📁 Choose document save folder
                </button>
              </div>
            )}
          </div>

          {/* Data backup */}
          <div className="card">
            <div className="section-title">Data backup &amp; restore</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button className="btn btn-secondary" onClick={exportData}>
                📤 Export all data (JSON backup)
              </button>
              <label className="btn btn-secondary" style={{ cursor:'pointer', textAlign:'center' }}>
                📥 Restore from backup
                <input type="file" accept=".json" style={{ display:'none' }} onChange={importData} />
              </label>
              <p style={{ fontSize:12, color:'var(--c-text3)', lineHeight:1.6, marginTop:4 }}>
                Export saves all records as a JSON file — keep on a USB drive as an offline backup.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: ABOUT
      ══════════════════════════════════════════════════════ */}
      {safeActiveTab === 'about' && (
        <div className="card" style={{ maxWidth:500 }}>
          <div className="section-title">About this system</div>
          <div style={{ fontSize:13, color:'var(--c-text2)', lineHeight:2.2 }}>
            <div><strong>LC1 Village IMS</strong> — Version 2.0.0</div>
            <div>Uganda Local Council 1 Information Management System</div>
            <div>Ministry of Local Government · Republic of Uganda</div>
            <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
              <span className="badge badge-green">✓ Works fully offline</span>
              <span className="badge badge-blue">✓ Multi-village</span>
              <span className="badge badge-gold">✓ Cloud sync ready</span>
              <span className="badge badge-green">✓ SMS notifications</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Add / Edit committee member */}
      {userModal && (
        <div className="modal-overlay" onClick={() => setUserModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom:20 }}>
              {editingUser ? 'Edit committee member' : 'Add committee member'}
            </h2>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Full name *</label>
                  <input ref={userNameRef} className="form-input"
                    value={userForm.fullName}
                    onChange={e => setUserForm(prev => ({ ...prev,
                      fullName: e.target.value.replace(/[^a-zA-ZÀ-ÿĀ-ɏ\s\-'.]/g, '')
                    }))}
                    placeholder="Full legal name (letters only)" />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={userForm.phone || ''}
                    onChange={e => setUserForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="07XXXXXXXX" type="tel" inputMode="tel" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email (for password recovery)</label>
                <input className="form-input" value={userForm.email || ''}
                  onChange={e => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="member@example.com" type="email" inputMode="email" autoComplete="off" />
                <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4 }}>
                  Used by the admin to issue a reset token if this member forgets their password.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Council role *</label>
                <select className="form-select" value={userForm.role}
                  onChange={e => setUserForm(prev => ({ ...prev, role: e.target.value }))}>
                  <option value="">— Select role —</option>
                  {LC1_ROLES.map(r => (
                    <RoleOption key={r.id} role={r} users={users} editingUser={editingUser} />
                  ))}
                </select>
                {userForm.role && (
                  <div style={{ fontSize:12, color:'var(--c-text3)', marginTop:6, lineHeight:1.5 }}>
                    {LC1_ROLES.find(r => r.id === userForm.role)?.description}
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input className="form-input" value={userForm.username}
                    onChange={e => setUserForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="Login username" autoComplete="off" />
                </div>
                <div className="form-group">
                  <label className="form-label">Password{editingUser ? ' (blank = keep)' : ' *'}</label>
                  <input className="form-input" type="password" value={userForm.password}
                    onChange={e => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                    autoComplete="new-password" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={userForm.notes || ''}
                  onChange={e => setUserForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional notes" />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn btn-secondary" onClick={() => setUserModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveUser}>
                {editingUser ? 'Save changes' : 'Add member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetUser && (
        <div className="modal-overlay" onClick={() => setResetUser(null)}>
          <div className="modal" style={{ maxWidth:460 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom:6 }}>Reset password</h2>
            <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:18, lineHeight:1.6 }}>
              Set a new password for <strong>{resetUser.fullName}</strong>{' '}
              (<span style={{ fontFamily:'monospace' }}>@{resetUser.username}</span>).
              Tell them the new password directly — they can change it later.
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="form-group">
                <label className="form-label">New password</label>
                <div style={{ position:'relative' }}>
                  <input className="form-input"
                    type={resetShow ? 'text' : 'password'}
                    value={resetPw}
                    onChange={e => setResetPw(e.target.value)}
                    placeholder="At least 4 characters"
                    autoFocus />
                  <button type="button"
                    onClick={() => setResetShow(s => !s)}
                    style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                      background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--c-text3)' }}>
                    {resetShow ? '🙈 Hide' : '👁 Show'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Confirm new password</label>
                <input className="form-input"
                  type={resetShow ? 'text' : 'password'}
                  value={resetPw2}
                  onChange={e => setResetPw2(e.target.value)}
                  placeholder="Re-enter the password"
                  onKeyDown={e => { if (e.key === 'Enter') confirmResetPassword() }} />
              </div>
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
              <button className="btn btn-secondary" onClick={() => setResetUser(null)}>Cancel</button>
              <button className="btn btn-gold" onClick={confirmResetPassword}>🔑 Set new password</button>
            </div>
          </div>
        </div>
      )}

      {/* Retire confirmation */}
      {retireId && (
        <div className="modal-overlay" onClick={() => setRetireId(null)}>
          <div className="modal" style={{ maxWidth:440 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom:12 }}>Retire committee member</h2>
            <p style={{ color:'var(--c-text2)', marginBottom:20, lineHeight:1.6 }}>
              This frees the role for a new person. Records are preserved.
            </p>
            <div className="form-group" style={{ marginBottom:20 }}>
              <label className="form-label">Reason</label>
              <select className="form-select" value={retireReason}
                onChange={e => setRetireReason(e.target.value)}>
                <option value="resigned">Resigned from committee</option>
                <option value="deceased">Deceased</option>
                <option value="removed">Removed from office</option>
                <option value="term_ended">Term of office ended</option>
              </select>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setRetireId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmRetire}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}
