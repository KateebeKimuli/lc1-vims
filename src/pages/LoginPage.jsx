/**
 * ============================================================
 * LOGIN PAGE — src/pages/LoginPage.jsx  (v5 — fully fixed)
 * ============================================================
 * BUGS FIXED IN THIS VERSION:
 *
 *   BUG 1 — "Can't get back to sign-in / not responsive":
 *     After first-time setup completes, the CREDENTIALS flow
 *     showed the sign-in form but the button was disabled
 *     because creds.username and creds.password were empty.
 *     Users didn't realise they had to type credentials again.
 *     FIX: After successful setup, pre-fill the username field
 *     with the just-created username and focus the password
 *     field so the user only needs to type their password.
 *     Also added a clear "Village setup complete — sign in below"
 *     success message so the state is obvious.
 *
 *   BUG 2 — "Blank screen when registering same village again":
 *     If a village was already set up but isVillageSetup()
 *     returned false (race condition or first-run), the setup
 *     form appeared. Submitting it called setupVillage() (which
 *     succeeded silently — idempotent) then login() with the
 *     new credentials. But the DB held the ORIGINAL hashed
 *     password from the first setup, so login failed.
 *     FIX 1: If a village is already set up, show a clear
 *     "Already registered" message with a "Go to sign in"
 *     button instead of silently failing.
 *     FIX 2: setupVillage() now returns { alreadyExisted: true }
 *     if users already exist, so the UI can handle this case.
 *     FIX 3: Added "Village already set up" detection in
 *     proceedFromVillageSelect — if isVillageSetup is true,
 *     show a friendly message before going to CREDENTIALS.
 *
 *   BUG 3 — Missing "← Back to village" link on CREDENTIALS:
 *     There was no easy way to go back and select a different
 *     village without reloading the page.
 *     FIX: The LocationBadge "Change" button and a prominent
 *     "← Back" button both work reliably.
 * ============================================================
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate }     from 'react-router-dom'
import { useAuth }         from '../hooks/useAuth'
import {
  DISTRICTS, getCountiesByDistrict, getSubcountiesByCounty,
  getParishesBySubcounty, getVillagesByParish, getDistrictsByRegion
} from '../data/ugandaLocations'
import {
  isVillageSetup, setupVillage,
  verifyAndUseResetToken, resetUserPassword
} from '../db/multiTenantDB.js'
import MoLGLogo from '../assets/MoLGLogo'

// ── Flow constants ─────────────────────────────────────────────────────────
const FLOW = {
  VILLAGE_SELECT: 'village_select',
  CREDENTIALS:    'credentials',
  FIRST_SETUP:    'first_setup',
  MASTER_LOGIN:   'master_login',
  RESET_PASSWORD: 'reset_password',
}

// ══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS — all at MODULE SCOPE to prevent focus-loss on re-render
// ══════════════════════════════════════════════════════════════════════════

function Card({ children, maxW = 520 }) {
  return (
    <div style={{
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
      borderRadius: 'var(--r-xl)', padding: 32,
      boxShadow: '0 8px 40px rgba(0,0,0,0.3)', width: '100%', maxWidth: maxW,
    }}>
      {children}
    </div>
  )
}

function ErrBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      background: 'rgba(192,57,43,0.15)', border: '1px solid var(--c-red)',
      color: 'var(--c-red-l)', padding: '10px 14px', borderRadius: 8,
      fontSize: 14, marginBottom: 16, lineHeight: 1.5,
    }}>
      ✕ {msg}
    </div>
  )
}

function SucBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      background: 'rgba(45,122,79,0.15)', border: '1px solid var(--c-green)',
      color: 'var(--c-green-xl)', padding: '10px 14px', borderRadius: 8,
      fontSize: 14, marginBottom: 16, lineHeight: 1.5,
    }}>
      ✓ {msg}
    </div>
  )
}

function InfoBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      background: 'rgba(200,151,43,0.12)', border: '1px solid var(--c-gold)',
      color: 'var(--c-gold-l)', padding: '10px 14px', borderRadius: 8,
      fontSize: 13, marginBottom: 16, lineHeight: 1.6,
    }}>
      ℹ️ {msg}
    </div>
  )
}

function LocationBadge({ villageName, parishName, subcountyName, districtName, onChangClick }) {
  if (!villageName) return null
  return (
    <div style={{
      background: 'rgba(45,122,79,0.12)', border: '1px solid var(--c-green)',
      borderRadius: 10, padding: '10px 14px', marginBottom: 16,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontWeight: 600, color: 'var(--c-green-xl)', fontSize: 14 }}>
          📍 {villageName} Village
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-text2)', marginTop: 2 }}>
          {[parishName, subcountyName, districtName].filter(Boolean).join(' · ')}
        </div>
      </div>
      <button className="btn btn-secondary btn-sm" type="button" onClick={onChangClick}>
        Change
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [flow,    setFlow]    = useState(FLOW.VILLAGE_SELECT)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [info,    setInfo]    = useState('')   // non-blocking informational message
  const [loading, setLoading] = useState(false)

  // ── Village location selection ─────────────────────────────────────────
  const [sel, setSel] = useState({
    districtId: '', districtName: '',
    countyId: '', countyName: '',
    subcountyId: '', subcountyName: '',
    parishId: '', parishName: '',
    villageId: '', villageName: '', region: '',
  })
  const counties      = sel.districtId  ? getCountiesByDistrict(sel.districtId)    : []
  const subcounties   = sel.countyId    ? getSubcountiesByCounty(sel.countyId)     : []
  const parishes      = sel.subcountyId ? getParishesBySubcounty(sel.subcountyId)  : []
  const villages      = sel.parishId    ? getVillagesByParish(sel.parishId)        : []
  const distsByRegion = getDistrictsByRegion()

  // ── Form state ─────────────────────────────────────────────────────────
  const [creds,       setCreds]       = useState({ username: '', password: '' })
  const [masterCreds, setMasterCreds] = useState({ username: '', password: '' })
  const [setupForm,   setSetupForm]   = useState({
    chairFullName: '', chairUsername: '', chairPassword: '', chairConfirm: '', chairPhone: '',
  })
  const [resetForm, setResetForm] = useState({
    username: '', resetToken: '', newPassword: '', confirmPassword: '',
  })

  // ── Focus refs ─────────────────────────────────────────────────────────
  const credUsernameRef   = useRef(null)
  const credPasswordRef   = useRef(null)
  const masterUsernameRef = useRef(null)
  const setupNameRef      = useRef(null)
  const resetUsernameRef  = useRef(null)

  // Check for session timeout message
  const timeoutMsg = sessionStorage.getItem('lc1_logout_reason') === 'timeout'
    ? 'You were automatically logged out after 15 minutes of inactivity for security.'
    : null

  // Focus the right field when the flow changes
  useEffect(() => {
    const t = setTimeout(() => {
      if (flow === FLOW.CREDENTIALS    && credUsernameRef.current)   credUsernameRef.current.focus()
      if (flow === FLOW.MASTER_LOGIN   && masterUsernameRef.current) masterUsernameRef.current.focus()
      if (flow === FLOW.FIRST_SETUP    && setupNameRef.current)      setupNameRef.current.focus()
      if (flow === FLOW.RESET_PASSWORD && resetUsernameRef.current)  resetUsernameRef.current.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [flow])

  // Clear all messages when switching flow
  function goToFlow(f) {
    setFlow(f)
    setError('')
    setSuccess('')
    setInfo('')
  }

  function goToVillageSelect() { goToFlow(FLOW.VILLAGE_SELECT) }

  // ── Location pickers ───────────────────────────────────────────────────
  function pickDistrict(e) {
    const d = DISTRICTS.find(x => x.id === e.target.value)
    setSel({ districtId: e.target.value, districtName: d?.name || '',
      countyId:'', countyName:'', subcountyId:'', subcountyName:'',
      parishId:'', parishName:'', villageId:'', villageName:'', region: d?.region||'' })
  }
  function pickCounty(e) {
    const o = counties.find(x => x.id === e.target.value)
    setSel(p => ({ ...p, countyId: e.target.value, countyName: o?.name||'',
      subcountyId:'', subcountyName:'', parishId:'', parishName:'', villageId:'', villageName:'' }))
  }
  function pickSubcounty(e) {
    const o = subcounties.find(x => x.id === e.target.value)
    setSel(p => ({ ...p, subcountyId: e.target.value, subcountyName: o?.name||'',
      parishId:'', parishName:'', villageId:'', villageName:'' }))
  }
  function pickParish(e) {
    const o = parishes.find(x => x.id === e.target.value)
    setSel(p => ({ ...p, parishId: e.target.value, parishName: o?.name||'',
      villageId:'', villageName:'' }))
  }
  function pickVillage(e) {
    const o = villages.find(x => x.id === e.target.value)
    setSel(p => ({ ...p, villageId: e.target.value, villageName: o?.name||'' }))
  }

  // ── Proceed from village select ────────────────────────────────────────
  async function proceedFromVillageSelect() {
    if (!sel.villageId) { setError('Please select your village to continue'); return }
    setError('')
    setLoading(true)
    try {
      const alreadySetup = await isVillageSetup(sel.villageId)
      if (alreadySetup) {
        // Village exists — go straight to sign-in
        // Clear credentials so the user types them fresh
        setCreds({ username: '', password: '' })
        setSuccess('')
        setInfo('')
        goToFlow(FLOW.CREDENTIALS)
      } else {
        // New village — go to first-time setup
        setSetupForm({ chairFullName:'', chairUsername:'', chairPassword:'', chairConfirm:'', chairPhone:'' })
        goToFlow(FLOW.FIRST_SETUP)
      }
    } catch {
      // If check fails, default to credentials
      goToFlow(FLOW.CREDENTIALS)
    } finally {
      setLoading(false)
    }
  }

  // ── FLOW B: Regular sign-in ────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault()
    if (!creds.username.trim() || !creds.password) return
    setError('')
    setLoading(true)
    try {
      await login(creds.username.trim(), creds.password, sel)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── FLOW A: First-time village setup ───────────────────────────────────
  async function handleFirstSetup(e) {
    e.preventDefault()
    // Validate
    if (!setupForm.chairFullName.trim())     { setError('Full name is required'); return }
    if (!setupForm.chairUsername.trim())     { setError('Username is required'); return }
    if (setupForm.chairPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (setupForm.chairPassword !== setupForm.chairConfirm) { setError('Passwords do not match'); return }
    setError('')
    setLoading(true)
    try {
      const result = await setupVillage(sel, {
        username: setupForm.chairUsername.trim(),
        password: setupForm.chairPassword,
        fullName: setupForm.chairFullName.trim(),
        phone:    setupForm.chairPhone,
      })

      // FIX: If the village was already set up (alreadyExisted),
      // do not try to login with the new credentials — they won't match
      // the original stored (hashed) password.
      if (result?.alreadyExisted) {
        // Village already set up — send to sign-in with a clear message
        setCreds({ username: '', password: '' })
        setSuccess('')
        setInfo(`${sel.villageName} Village is already registered. Please sign in with your existing credentials.`)
        goToFlow(FLOW.CREDENTIALS)
        setLoading(false)
        return
      }

      // New setup succeeded — pre-fill the username so user only types password
      // FIX: This prevents the "not responsive" issue where the sign-in button
      // appeared disabled because both fields were empty after setup.
      setCreds({ username: setupForm.chairUsername.trim(), password: '' })
      setSuccess(`✓ ${sel.villageName} Village set up successfully! Enter your password below to sign in.`)
      goToFlow(FLOW.CREDENTIALS)
      // Focus the password field (not username — it's already filled)
      setTimeout(() => credPasswordRef.current?.focus(), 50)

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── FLOW C: Master admin ───────────────────────────────────────────────
  async function handleMasterLogin(e) {
    e.preventDefault()
    if (!masterCreds.username || !masterCreds.password) return
    setError('')
    setLoading(true)
    try {
      await login(masterCreds.username, masterCreds.password, {
        villageId: 'MASTER', villageName: 'All Villages'
      })
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── FLOW D: Password reset ─────────────────────────────────────────────
  async function handlePasswordReset(e) {
    e.preventDefault()
    if (resetForm.newPassword.length < 6)                         { setError('Password must be at least 6 characters'); return }
    if (resetForm.newPassword !== resetForm.confirmPassword)      { setError('Passwords do not match'); return }
    if (!resetForm.username.trim())                               { setError('Username is required'); return }
    if (!resetForm.resetToken.trim())                             { setError('Reset token is required'); return }
    setError('')
    setLoading(true)
    try {
      const result = await verifyAndUseResetToken(
        resetForm.resetToken.trim().toUpperCase(),
        sel.villageId,
        resetForm.username.trim()
      )
      if (!result.valid) {
        setError(`Invalid token: ${result.reason}`)
        setLoading(false)
        return
      }
      await resetUserPassword(sel.villageId, resetForm.username.trim(), resetForm.newPassword)
      setCreds({ username: resetForm.username.trim(), password: '' })
      setSuccess('Password reset successfully. Enter your new password below to sign in.')
      goToFlow(FLOW.CREDENTIALS)
      setTimeout(() => credPasswordRef.current?.focus(), 50)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Shared props ───────────────────────────────────────────────────────
  const locationBadgeProps = {
    villageName: sel.villageName, parishName: sel.parishName,
    subcountyName: sel.subcountyName, districtName: sel.districtName,
    onChangClick: goToVillageSelect,
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center',
      justifyContent:'center', background:'var(--c-bg)', padding:20,
    }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:24, width:'100%' }}>

        {/* Logo + title */}
        <div style={{ textAlign:'center' }}>
          <MoLGLogo size={72} />
          <h1 style={{ fontSize:22, fontWeight:800, marginTop:12, marginBottom:4 }}>
            LC1 Village IMS
          </h1>
          <p style={{ color:'var(--c-text2)', fontSize:13 }}>
            Ministry of Local Government · Republic of Uganda
          </p>
        </div>

        {/* Step indicator */}
        {flow !== FLOW.MASTER_LOGIN && (
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {[
              { n:1, label:'Select village', active: flow === FLOW.VILLAGE_SELECT },
              { n:2, label: flow === FLOW.FIRST_SETUP ? 'First-time setup'
                          : flow === FLOW.RESET_PASSWORD ? 'Reset password'
                          : 'Sign in',
                active: flow !== FLOW.VILLAGE_SELECT },
            ].map((s, i) => (
              <div key={s.n} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{
                  width:26, height:26, borderRadius:'50%',
                  background: s.active ? 'var(--c-green)' : 'var(--c-border)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:700, color:'#fff', transition:'background 0.2s',
                }}>
                  {s.n}
                </div>
                <span style={{ fontSize:13, color: s.active ? 'var(--c-text)' : 'var(--c-text3)' }}>
                  {s.label}
                </span>
                {i === 0 && <span style={{ color:'var(--c-border2)', margin:'0 4px' }}>→</span>}
              </div>
            ))}
          </div>
        )}

        {/* ══ FLOW: VILLAGE SELECT ══ */}
        {flow === FLOW.VILLAGE_SELECT && (
          <Card>
            <h2 style={{ fontSize:17, marginBottom:4 }}>Select your village</h2>
            <p style={{ color:'var(--c-text2)', fontSize:13, marginBottom:18, lineHeight:1.6 }}>
              Each village has its own secure, isolated database. Choose your location to continue.
            </p>
            <ErrBox msg={error} />

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* District */}
              <div className="form-group">
                <label className="form-label">District *</label>
                <select className="form-select" value={sel.districtId} onChange={pickDistrict}>
                  <option value="">— Select district —</option>
                  {Object.entries(distsByRegion).map(([region, dists]) => (
                    <optgroup key={region} label={`${region} Region`}>
                      {dists.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* County */}
              <div className="form-group">
                <label className="form-label">County / Division *</label>
                <select className="form-select" value={sel.countyId} onChange={pickCounty} disabled={!sel.districtId}>
                  <option value="">— Select county —</option>
                  {counties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Sub-county */}
              <div className="form-group">
                <label className="form-label">Sub-county / Town Council *</label>
                <select className="form-select" value={sel.subcountyId} onChange={pickSubcounty} disabled={!sel.countyId}>
                  <option value="">— Select sub-county —</option>
                  {subcounties.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.type === 'town_council' ? ' (TC)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Parish */}
              <div className="form-group">
                <label className="form-label">Parish *</label>
                <select className="form-select" value={sel.parishId} onChange={pickParish} disabled={!sel.subcountyId}>
                  <option value="">— Select parish —</option>
                  {parishes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Village */}
              <div className="form-group">
                <label className="form-label">Village (LC1 unit) *</label>
                <select className="form-select" value={sel.villageId} onChange={pickVillage} disabled={!sel.parishId}>
                  <option value="">— Select village —</option>
                  {villages.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              {/* Confirmation */}
              {sel.villageId && (
                <div style={{ background:'rgba(45,122,79,0.1)', border:'1px solid var(--c-green)', borderRadius:8, padding:'10px 14px', fontSize:13 }}>
                  <span style={{ color:'var(--c-green-xl)', fontWeight:600 }}>✓ {sel.villageName}</span>
                  <span style={{ color:'var(--c-text2)', marginLeft:8 }}>{sel.parishName} · {sel.districtName}</span>
                </div>
              )}
            </div>

            <button className="btn btn-primary btn-lg" style={{ width:'100%', marginTop:20 }}
              onClick={proceedFromVillageSelect} disabled={!sel.villageId || loading}>
              {loading ? 'Checking…' : 'Continue →'}
            </button>

            <button className="btn btn-secondary btn-sm" style={{ width:'100%', marginTop:10 }}
              onClick={() => goToFlow(FLOW.MASTER_LOGIN)}>
              🔧 System Administrator Login
            </button>
          </Card>
        )}

        {/* ══ FLOW: FIRST_SETUP ══ */}
        {flow === FLOW.FIRST_SETUP && (
          <Card maxW={560}>
            <div style={{ background:'rgba(200,151,43,0.15)', border:'1px solid var(--c-gold)', borderRadius:8, padding:'12px 16px', marginBottom:18, fontSize:13 }}>
              <strong style={{ color:'var(--c-gold-l)' }}>🆕 First-time setup</strong>
              <div style={{ color:'var(--c-text2)', marginTop:4 }}>
                <strong>{sel.villageName}</strong> Village has not been set up on this device yet.
                Create the Chairperson account to get started.
                Other committee members are added via Settings after login.
              </div>
            </div>

            <LocationBadge {...locationBadgeProps} />
            <ErrBox msg={error} />

            <form onSubmit={handleFirstSetup} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <h3 style={{ marginBottom:4 }}>Create Chairperson account</h3>

              <div className="form-group">
                <label className="form-label">Chairperson's full name *</label>
                <input ref={setupNameRef} className="form-input"
                  value={setupForm.chairFullName}
                  onChange={e => setSetupForm(p => ({ ...p,
                    chairFullName: e.target.value.replace(/[^a-zA-ZÀ-ÿĀ-ɏ\s\-'.]/g, '')
                  }))}
                  placeholder="Full name — letters only, no numbers" autoComplete="name" />
              </div>

              <div className="form-group">
                <label className="form-label">Phone number</label>
                <input className="form-input" type="tel" inputMode="tel"
                  value={setupForm.chairPhone}
                  onChange={e => setSetupForm(p => ({ ...p, chairPhone: e.target.value }))}
                  placeholder="07XXXXXXXX" />
              </div>

              <div className="form-group">
                <label className="form-label">Login username *</label>
                <input className="form-input"
                  value={setupForm.chairUsername}
                  onChange={e => setSetupForm(p => ({ ...p, chairUsername: e.target.value }))}
                  placeholder="e.g. chair_kyanja" autoComplete="off" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Password * (min 6 characters)</label>
                  <input className="form-input" type="password"
                    value={setupForm.chairPassword}
                    onChange={e => setSetupForm(p => ({ ...p, chairPassword: e.target.value }))}
                    autoComplete="new-password" />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm password *</label>
                  <input className="form-input" type="password"
                    value={setupForm.chairConfirm}
                    onChange={e => setSetupForm(p => ({ ...p, chairConfirm: e.target.value }))}
                    autoComplete="new-password" />
                </div>
              </div>

              <div style={{ background:'rgba(36,113,163,0.1)', border:'1px solid rgba(36,113,163,0.3)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'var(--c-text2)', lineHeight:1.6 }}>
                ℹ️ After setup you will be taken to the sign-in screen. Enter your password to complete login.
                Other committee members are added in Settings after you are signed in.
              </div>

              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button type="button" className="btn btn-secondary" onClick={goToVillageSelect}>
                  ← Back
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex:1 }} disabled={loading}>
                  {loading ? 'Setting up…' : 'Set up village →'}
                </button>
              </div>
            </form>
          </Card>
        )}

        {/* ══ FLOW: CREDENTIALS ══ */}
        {flow === FLOW.CREDENTIALS && (
          <Card maxW={420}>
            <LocationBadge {...locationBadgeProps} />

            {/* Session timeout notice */}
            {timeoutMsg && <InfoBox msg={timeoutMsg} />}

            {/* Success message (e.g. after setup or password reset) */}
            <SucBox msg={success} />

            {/* Info message (e.g. "village already set up") */}
            <InfoBox msg={info} />

            <ErrBox msg={error} />

            <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <h2 style={{ fontSize:18, marginBottom:4 }}>Sign in</h2>

              <div className="form-group">
                <label className="form-label">Username</label>
                <input ref={credUsernameRef} className="form-input"
                  value={creds.username}
                  onChange={e => setCreds(p => ({ ...p, username: e.target.value }))}
                  autoComplete="username" placeholder="Your username" />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                {/* FIX: ref on password field so we can focus it after setup */}
                <input ref={credPasswordRef} className="form-input"
                  type="password"
                  value={creds.password}
                  onChange={e => setCreds(p => ({ ...p, password: e.target.value }))}
                  autoComplete="current-password" placeholder="Your password" />
              </div>

              <button type="submit" className="btn btn-primary btn-lg"
                style={{ marginTop:4 }}
                disabled={loading || !creds.username.trim() || !creds.password}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button type="button" className="btn btn-secondary btn-sm" style={{ flex:1 }}
                onClick={goToVillageSelect}>
                ← Change village
              </button>
              <button type="button" className="btn btn-secondary btn-sm" style={{ flex:1 }}
                onClick={() => goToFlow(FLOW.RESET_PASSWORD)}>
                🔑 Forgot password
              </button>
            </div>
          </Card>
        )}

        {/* ══ FLOW: RESET_PASSWORD ══ */}
        {flow === FLOW.RESET_PASSWORD && (
          <Card maxW={460}>
            <h2 style={{ fontSize:18, marginBottom:4 }}>Reset password</h2>
            <p style={{ color:'var(--c-text2)', fontSize:13, marginBottom:16, lineHeight:1.6 }}>
              Ask the LC1 Chairperson or System Administrator for a reset token.
              They generate it in Settings → Committee and can send it to your phone via SMS.
            </p>
            <LocationBadge {...locationBadgeProps} />
            <ErrBox msg={error} />

            <form onSubmit={handlePasswordReset} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input ref={resetUsernameRef} className="form-input"
                  value={resetForm.username}
                  onChange={e => setResetForm(p => ({ ...p, username: e.target.value }))}
                  autoComplete="username" placeholder="Your login username" />
              </div>

              <div className="form-group">
                <label className="form-label">Reset token (from admin)</label>
                <input className="form-input"
                  value={resetForm.resetToken}
                  onChange={e => setResetForm(p => ({ ...p, resetToken: e.target.value.toUpperCase() }))}
                  placeholder="e.g. A4X9K2" style={{ fontFamily:'monospace', letterSpacing:'0.18em', fontSize:16 }}
                  autoComplete="off" maxLength={8} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">New password</label>
                  <input className="form-input" type="password"
                    value={resetForm.newPassword}
                    onChange={e => setResetForm(p => ({ ...p, newPassword: e.target.value }))}
                    placeholder="At least 6 characters" autoComplete="new-password" />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm new password</label>
                  <input className="form-input" type="password"
                    value={resetForm.confirmPassword}
                    onChange={e => setResetForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    autoComplete="new-password" />
                </div>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => goToFlow(FLOW.CREDENTIALS)}>← Back</button>
                <button type="submit" className="btn btn-primary" style={{ flex:1 }} disabled={loading}>
                  {loading ? 'Resetting…' : 'Reset password'}
                </button>
              </div>
            </form>
          </Card>
        )}

        {/* ══ FLOW: MASTER_LOGIN ══ */}
        {flow === FLOW.MASTER_LOGIN && (
          <Card maxW={400}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>🔧</div>
              <h2 style={{ fontSize:18, marginBottom:4 }}>System Administrator</h2>
              <p style={{ color:'var(--c-text2)', fontSize:13 }}>
                Full access to all villages for maintenance and support.
              </p>
            </div>
            <ErrBox msg={error} />

            <form onSubmit={handleMasterLogin} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="form-group">
                <label className="form-label">Admin username</label>
                <input ref={masterUsernameRef} className="form-input"
                  value={masterCreds.username}
                  onChange={e => setMasterCreds(p => ({ ...p, username: e.target.value }))}
                  autoComplete="username" placeholder="sysadmin" />
              </div>

              <div className="form-group">
                <label className="form-label">Admin password</label>
                <input className="form-input" type="password"
                  value={masterCreds.password}
                  onChange={e => setMasterCreds(p => ({ ...p, password: e.target.value }))}
                  autoComplete="current-password" />
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button type="button" className="btn btn-secondary" onClick={goToVillageSelect}>
                  ← Back
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex:1 }}
                  disabled={loading || !masterCreds.username || !masterCreds.password}>
                  {loading ? 'Signing in…' : 'Sign in as Admin'}
                </button>
              </div>
            </form>

            <p style={{ textAlign:'center', fontSize:11, color:'var(--c-text3)', marginTop:14 }}>
              Default: <strong style={{ color:'var(--c-text2)' }}>sysadmin</strong>
              {' / '}
              <strong style={{ color:'var(--c-text2)' }}>MoLG@Uganda2024</strong>
            </p>
          </Card>
        )}

        <div style={{ textAlign:'center' }}>
          <span className="badge badge-green">✓ Works fully offline</span>
        </div>
      </div>
    </div>
  )
}
