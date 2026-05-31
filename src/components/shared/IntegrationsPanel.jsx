/**
 * ============================================================
 * INTEGRATIONS PANEL — src/components/shared/IntegrationsPanel.jsx
 * ============================================================
 * Manages SMS and government API configuration.
 * Rendered inside the Settings page full-width section.
 * ============================================================
 */

import { useState, useEffect, useRef } from 'react'
import { getDB }                        from '../../db'
import { GOV_INTEGRATION_LIST, testGovIntegration } from '../../services/govApiService'
import { generateResetToken }           from '../../db/multiTenantDB.js'
import { useAuth }                      from '../../hooks/useAuth'
import { useToast, Toast }              from './Toast'
import { formatUgandaPhone }            from '../../services/smsService.js'

// ── Inputs defined at module scope to prevent focus loss on re-render ─────
function LabelledInput({ label, value, onChange, placeholder, type = 'text', hint }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
      />
      {hint && <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4 }}>{hint}</div>}
    </div>
  )
}

// ── SMS proxy status badge ─────────────────────────────────────────────────
function ProxyStatusBadge({ status }) {
  if (status === 'checking') return <span className="badge badge-gold">Checking…</span>
  if (status === 'ok')       return <span className="badge badge-green">✓ Proxy online</span>
  if (status === 'error')    return <span className="badge badge-red">✗ Not reachable</span>
  return <span className="badge badge-gray">Not tested</span>
}

// ═══════════════════════════════════════════════════════════════════════════
export default function IntegrationsPanel() {
  const { user }             = useAuth()
  const { toast, showToast } = useToast()

  // ── SMS configuration state ───────────────────────────────────────────
  const [atUsername,   setAtUsername]   = useState('')
  const [atApiKey,     setAtApiKey]     = useState('')
  const [atSenderId,   setAtSenderId]   = useState('MOLG-LC1')
  const [atSandbox,    setAtSandbox]    = useState(false)
  const [smsProxyUrl,  setSmsProxyUrl]  = useState('')
  const [testPhone,    setTestPhone]    = useState('')
  const [proxyStatus,  setProxyStatus]  = useState('untested') // untested | checking | ok | error
  const [smsSending,   setSmsSending]   = useState(false)

  // ── Government API state ──────────────────────────────────────────────
  const [govSettings, setGovSettings] = useState({})
  const [govTesting,  setGovTesting]  = useState({})

  // ── Reset token state ─────────────────────────────────────────────────
  const [resetUsername,   setResetUsername]   = useState('')
  const [resetPhone,      setResetPhone]      = useState('')
  const [generatedToken,  setGeneratedToken]  = useState('')
  const [tokenLoading,    setTokenLoading]    = useState(false)

  // ── Load settings on mount ────────────────────────────────────────────
  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    try {
      const db  = await getDB()
      const all = await db.getAll('settings')
      const s   = {}
      all.forEach(x => { s[x.key] = x.value })

      setAtUsername(s.atUsername  || '')
      setAtApiKey(s.atApiKey      || '')
      setAtSenderId(s.atSenderId  || 'MOLG-LC1')
      setAtSandbox(s.atSandbox    === 'true')
      setSmsProxyUrl(s.smsProxyUrl|| '')
      setTestPhone(s.testPhone    || '')

      const gs = {}
      GOV_INTEGRATION_LIST.forEach(api => {
        gs[api.id] = {
          token:   s[api.tokenKey]   || '',
          enabled: s[api.enabledKey] === 'true',
        }
      })
      setGovSettings(gs)
    } catch (err) {
      showToast('Could not load integration settings', 'error')
    }
  }

  // ── Save all SMS settings ─────────────────────────────────────────────
  async function saveSMSSettings() {
    try {
      const db = await getDB()
      await db.put('settings', { key:'atUsername',  value: atUsername })
      await db.put('settings', { key:'atApiKey',    value: atApiKey })
      await db.put('settings', { key:'atSenderId',  value: atSenderId })
      await db.put('settings', { key:'atSandbox',   value: String(atSandbox) })
      await db.put('settings', { key:'smsProxyUrl', value: smsProxyUrl })
      showToast('SMS settings saved')
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error')
    }
  }

  // ── Test proxy connection (health check) ──────────────────────────────
  async function testProxyConnection() {
    if (!smsProxyUrl) {
      showToast('Enter the SMS Proxy URL first', 'error')
      return
    }
    setProxyStatus('checking')
    try {
      // Call /health on the proxy — strip /sms suffix if present
      const base    = smsProxyUrl.replace(/\/sms\s*$/, '')
      const response = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(8000)
      })
      const data = await response.json()
      if (data.ok) {
        setProxyStatus('ok')
        showToast(`✓ Proxy online — username: ${data.username}`)
      } else {
        setProxyStatus('error')
        showToast('Proxy responded but reported an error', 'error')
      }
    } catch (err) {
      setProxyStatus('error')
      showToast(
        `Cannot reach proxy at ${smsProxyUrl}. ` +
        'Make sure smsProxy.js is running. See README.md for setup.',
        'error'
      )
    }
  }

  // ── Send test SMS ─────────────────────────────────────────────────────
  async function sendTestSMS() {
    if (!testPhone)    { showToast('Enter a test phone number', 'error'); return }
    if (!smsProxyUrl)  { showToast('Set the SMS Proxy URL and save settings first', 'error'); return }
    if (!atUsername)   { showToast('Enter your Africa\'s Talking username', 'error'); return }
    if (!atApiKey)     { showToast('Enter your Africa\'s Talking API key', 'error'); return }

    const formatted = formatUgandaPhone(testPhone)
    if (!formatted) {
      showToast('Invalid phone number. Use format: 07XXXXXXXX or +256XXXXXXXXX', 'error')
      return
    }

    setSmsSending(true)
    try {
      // Save settings first so the proxy gets the latest credentials
      await saveSMSSettings()

      const response = await fetch(smsProxyUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:       [formatted],
          message:  `LC1 VIMS test SMS from ${user?.villageName || 'LC1 Office'}. Your SMS notifications are working correctly. - MoLG Uganda`,
          from:     atSenderId || 'MOLG-LC1',
          username: atUsername,
          apiKey:   atApiKey,
          sandbox:  atSandbox,
        }),
        signal: AbortSignal.timeout(20000),
      })

      const data = await response.json()

      if (data.success || data.sent) {
        showToast(`✓ Test SMS sent successfully to ${formatted}`)
        setProxyStatus('ok')
      } else {
        // ── Surface specific errors clearly ──────────────────────────
        const errMsg = data.error || ''

        if (response.status === 401 || errMsg.includes('401') || errMsg.toLowerCase().includes('unauthorized')) {
          showToast(
            `401 Unauthorized — your Africa's Talking API key is being rejected. ` +
            `Check: (1) correct API key copied from AT dashboard, ` +
            `(2) account is fully activated / not suspended, ` +
            `(3) you are using the LIVE key not the sandbox key.`,
            'error'
          )
        } else if (errMsg.includes('credentials missing')) {
          showToast('Username or API key is empty. Fill in both fields and click Save SMS settings first.', 'error')
        } else {
          showToast(`SMS failed: ${errMsg || JSON.stringify(data)}`, 'error')
        }
      }
    } catch (err) {
      if (err.name === 'TimeoutError' || err.message.includes('timeout')) {
        showToast('Request timed out — proxy took too long to respond.', 'error')
        setProxyStatus('error')
      } else if (err.message.includes('fetch') || err.message.includes('Failed') || err.message.includes('NetworkError')) {
        showToast(`Cannot reach proxy at ${smsProxyUrl}. Make sure smsProxy.js is still running.`, 'error')
        setProxyStatus('error')
      } else {
        showToast('Error: ' + err.message, 'error')
      }
    } finally {
      setSmsSending(false)
    }
  }

  // ── Save government API settings ──────────────────────────────────────
  async function saveGovSettings(apiId) {
    const db  = await getDB()
    const api = GOV_INTEGRATION_LIST.find(a => a.id === apiId)
    if (!api) return
    await db.put('settings', { key: api.tokenKey,   value: govSettings[apiId]?.token || '' })
    await db.put('settings', { key: api.enabledKey, value: String(govSettings[apiId]?.enabled || false) })
    showToast(`${apiId} settings saved`)
  }

  async function testGovAPI(apiId) {
    setGovTesting(t => ({ ...t, [apiId]: true }))
    const result = await testGovIntegration(apiId)
    showToast(
      result.ok ? `${apiId} connected (${result.latencyMs}ms)` : `${apiId} failed: ${result.error}`,
      result.ok ? 'success' : 'error'
    )
    setGovTesting(t => ({ ...t, [apiId]: false }))
  }

  // ── Generate password reset token ─────────────────────────────────────
  async function handleGenerateToken() {
    if (!resetUsername.trim()) { showToast('Enter the official\'s username', 'error'); return }
    if (!user?.villageId)      { showToast('No village context', 'error'); return }
    setTokenLoading(true)
    try {
      const token = await generateResetToken(user.villageId, resetUsername.trim())
      setGeneratedToken(token)
      if (resetPhone) {
        const { sendPasswordResetToken } = await import('../../services/smsService.js')
        const r = await sendPasswordResetToken(resetPhone, token, resetUsername.trim())
        if (r?.sent)   showToast(`Token generated and sent to ${resetPhone}`)
        else           showToast(`Token: ${token} (SMS not sent — check proxy)`, 'info')
      } else {
        showToast(`Token generated: ${token}`)
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error')
    } finally { setTokenLoading(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* ═══════════════════════════════════════════════════════════
          SMS SECTION
      ═══════════════════════════════════════════════════════════ */}
      <div className="card">
        <div className="section-title">SMS Notifications — Africa's Talking</div>

        {/* ── How-it-works explanation ── */}
        <div style={{
          background: 'rgba(36,113,163,0.12)', border:'1px solid rgba(36,113,163,0.3)',
          borderRadius:10, padding:'14px 16px', marginBottom:20, lineHeight:1.8, fontSize:13
        }}>
          <strong style={{ color:'var(--c-text)' }}>How SMS works in this system:</strong>
          <div style={{ color:'var(--c-text2)', marginTop:6 }}>
            <strong>1.</strong> This web app cannot call Africa's Talking directly
            (all web browsers block it for security — called CORS).<br/>
            <strong>2.</strong> You run a small helper program called <strong>smsProxy.js</strong>
            on your computer or server. It makes the call on behalf of the browser.<br/>
            <strong>3.</strong> You enter its address (proxy URL) below so the app knows where to send SMS requests.
          </div>
        </div>

        {/* ── Step-by-step setup guide ── */}
        <div style={{
          background:'var(--c-surface2)', borderRadius:10,
          padding:'16px 18px', marginBottom:20, fontSize:13, lineHeight:1.9
        }}>
          <div style={{ fontWeight:700, marginBottom:8, color:'var(--c-text)' }}>
            📋 Setup checklist (do these once):
          </div>
          {[
            ['1', 'Open the downloaded folder → go into the', <code key="c" style={{ background:'rgba(255,255,255,0.1)', padding:'1px 6px', borderRadius:4 }}>server/</code>, 'sub-folder'],
            ['2', 'Copy', <code key="c2" style={{ background:'rgba(255,255,255,0.1)', padding:'1px 6px', borderRadius:4 }}>.env.example</code>, 'and rename the copy to', <code key="c3" style={{ background:'rgba(255,255,255,0.1)', padding:'1px 6px', borderRadius:4 }}>.env</code>],
            ['3', 'Open', <code key="c4" style={{ background:'rgba(255,255,255,0.1)', padding:'1px 6px', borderRadius:4 }}>.env</code>, 'in Notepad and fill in your AT_USERNAME and AT_API_KEY'],
            ['4', 'Open a terminal/command prompt in the', <code key="c5" style={{ background:'rgba(255,255,255,0.1)', padding:'1px 6px', borderRadius:4 }}>server/</code>, 'folder'],
            ['5', 'Run:', <code key="c6" style={{ background:'rgba(255,255,255,0.1)', padding:'1px 6px', borderRadius:4 }}>npm install</code>, '(only first time)'],
            ['6', 'Run:', <code key="c7" style={{ background:'rgba(255,255,255,0.1)', padding:'1px 6px', borderRadius:4 }}>npm start</code>, '— you should see "✓ SMS Proxy running on port 3001"'],
            ['7', 'Fill in the form below and click Save, then Test'],
          ].map(([num, ...parts]) => (
            <div key={num} style={{ display:'flex', gap:8, alignItems:'baseline' }}>
              <span style={{
                background:'var(--c-green)', color:'#fff',
                width:22, height:22, borderRadius:'50%', flexShrink:0,
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                fontSize:11, fontWeight:700,
              }}>{num}</span>
              <span style={{ color:'var(--c-text2)' }}>{parts}</span>
            </div>
          ))}
        </div>

        {/* ── SMS form fields ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          <div className="form-row">
            <LabelledInput
              label="Africa's Talking username"
              value={atUsername}
              onChange={e => setAtUsername(e.target.value)}
              placeholder="Your AT account username"
              hint="Found on your AT dashboard at account.africastalking.com"
            />
            <LabelledInput
              label="Sender ID"
              value={atSenderId}
              onChange={e => setAtSenderId(e.target.value)}
              placeholder="MOLG-LC1"
              hint="Must be approved by Africa's Talking. Leave as MOLG-LC1 if unsure."
            />
          </div>

          <LabelledInput
            label="API Key"
            type="password"
            value={atApiKey}
            onChange={e => setAtApiKey(e.target.value)}
            placeholder="Your Africa's Talking API key (from Settings → API Key)"
            hint="Keep this secret. It is stored in your browser's local database only."
          />

          {/* Proxy URL with inline test button */}
          <div className="form-group">
            <label className="form-label">
              SMS Proxy URL
              <span style={{ marginLeft:8 }}>
                <ProxyStatusBadge status={proxyStatus} />
              </span>
            </label>
            <div style={{ display:'flex', gap:8 }}>
              <input
                className="form-input"
                value={smsProxyUrl}
                onChange={e => setSmsProxyUrl(e.target.value)}
                placeholder="http://localhost:3001/sms"
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ whiteSpace:'nowrap', flexShrink:0 }}
                onClick={testProxyConnection}
                disabled={proxyStatus === 'checking'}
              >
                {proxyStatus === 'checking' ? 'Checking…' : 'Test proxy'}
              </button>
            </div>
            <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4 }}>
              Address of your running smsProxy.js. If running on this computer: http://localhost:3001/sms
            </div>
          </div>

          {/* Sandbox mode */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <input
              type="checkbox"
              id="atSandbox"
              checked={atSandbox}
              onChange={e => setAtSandbox(e.target.checked)}
              style={{ width:16, height:16, cursor:'pointer' }}
            />
            <label htmlFor="atSandbox" style={{ fontSize:13, cursor:'pointer', color:'var(--c-text2)' }}>
              Sandbox mode — simulates sending without using real SMS credits (good for testing)
            </label>
          </div>

          {/* ── 401 troubleshooting guide (always visible) ── */}
          <div style={{
            background: 'rgba(192,57,43,0.08)', border:'1px solid rgba(192,57,43,0.25)',
            borderRadius:8, padding:'12px 14px', fontSize:12, lineHeight:1.8, color:'var(--c-text2)'
          }}>
            <strong style={{ color:'var(--c-red-l)' }}>Getting a 401 error?</strong> Check these:
            <ol style={{ margin:'6px 0 0 16px', padding:0 }}>
              <li>Log in to <strong>account.africastalking.com</strong> and go to <strong>Settings → API Key</strong></li>
              <li>Copy the key shown there <em>exactly</em> — no extra spaces</li>
              <li>Make sure your AT account status is <strong>Active</strong> (not pending/suspended)</li>
              <li>Your AT username is the name shown in the top-left of the dashboard — <em>not</em> your email</li>
              <li>If using a new account, you may need to add airtime/credit before live sending works</li>
              <li>Tick <strong>Sandbox mode</strong> above to test without real credentials</li>
            </ol>
          </div>

          {/* Save button */}
          <button type="button" className="btn btn-primary" onClick={saveSMSSettings}>
            💾 Save SMS settings
          </button>

          {/* Test SMS row */}
          <div style={{
            borderTop: '1px solid var(--c-border)',
            paddingTop: 14,
            display:'flex', gap:8, alignItems:'flex-end'
          }}>
            <LabelledInput
              label="Send test SMS to this number"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              placeholder="07XXXXXXXX"
              type="tel"
            />
            <button
              type="button"
              className="btn btn-gold"
              style={{ marginBottom:0, flexShrink:0 }}
              onClick={sendTestSMS}
              disabled={smsSending}
            >
              {smsSending ? 'Sending…' : '📱 Send test SMS'}
            </button>
          </div>

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          GOVERNMENT APIS
      ═══════════════════════════════════════════════════════════ */}
      <div className="card">
        <div className="section-title">Government API Integrations</div>
        <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:14, lineHeight:1.6 }}>
          Optional connections to Uganda's national systems (NIRA, UBOS, MoH, MoLG).
          Contact each ministry's IT department for API access credentials.
          The system works fully without these — they add automatic data sharing.
        </p>

        {GOV_INTEGRATION_LIST.map(api => (
          <div key={api.id} style={{
            border:'1px solid var(--c-border)', borderRadius:10,
            padding:16, marginBottom:12
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:14 }}>{api.name}</div>
                <div style={{ fontSize:12, color:'var(--c-text3)', marginTop:2 }}>{api.description}</div>
                <a href={api.website} target="_blank" rel="noreferrer"
                  style={{ fontSize:11, color:'var(--c-green-xl)' }}>
                  {api.website}
                </a>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <input
                  type="checkbox"
                  checked={govSettings[api.id]?.enabled || false}
                  onChange={e => setGovSettings(g => ({
                    ...g, [api.id]: { ...g[api.id], enabled: e.target.checked }
                  }))}
                  style={{ width:16, height:16, cursor:'pointer' }}
                />
                <label style={{ fontSize:12, cursor:'pointer' }}>Enabled</label>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input
                className="form-input"
                type="password"
                style={{ flex:1 }}
                value={govSettings[api.id]?.token || ''}
                onChange={e => setGovSettings(g => ({
                  ...g, [api.id]: { ...g[api.id], token: e.target.value }
                }))}
                placeholder={`${api.id} Bearer token / API key`}
              />
              <button className="btn btn-secondary btn-sm"
                onClick={() => testGovAPI(api.id)}
                disabled={govTesting[api.id]}>
                {govTesting[api.id] ? '…' : 'Test'}
              </button>
              <button className="btn btn-primary btn-sm"
                onClick={() => saveGovSettings(api.id)}>
                Save
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          PASSWORD RESET TOKEN
      ═══════════════════════════════════════════════════════════ */}
      <div className="card">
        <div className="section-title">Generate password reset token</div>
        <p style={{ fontSize:13, color:'var(--c-text2)', marginBottom:14, lineHeight:1.6 }}>
          When a committee member forgets their password, generate a one-time token here.
          Give the code to the member verbally or send it to their phone via SMS.
          They enter it on the login screen under "Forgot / Reset password".
          Tokens expire after 24 hours.
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-row">
            <LabelledInput
              label="Member's username"
              value={resetUsername}
              onChange={e => setResetUsername(e.target.value)}
              placeholder="Their login username"
            />
            <LabelledInput
              label="Their phone (optional — to SMS the token)"
              value={resetPhone}
              onChange={e => setResetPhone(e.target.value)}
              placeholder="07XXXXXXXX"
              type="tel"
            />
          </div>

          <button
            type="button"
            className="btn btn-gold"
            onClick={handleGenerateToken}
            disabled={tokenLoading}
          >
            {tokenLoading ? 'Generating…' : '🔑 Generate reset token'}
          </button>

          {/* Display the generated token prominently */}
          {generatedToken && (
            <div style={{
              background: 'rgba(200,151,43,0.15)',
              border: '2px solid var(--c-gold)',
              borderRadius:12, padding:'18px 24px', textAlign:'center',
            }}>
              <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:8 }}>
                One-time reset token for <strong>{resetUsername}</strong> — valid for 24 hours
              </div>
              <div style={{
                fontFamily:'monospace', fontSize:36, fontWeight:900,
                color:'var(--c-gold-l)', letterSpacing:'0.3em',
              }}>
                {generatedToken}
              </div>
              <div style={{ fontSize:12, color:'var(--c-text3)', marginTop:10, lineHeight:1.6 }}>
                Tell the member to go to the login screen and click<br/>
                <strong style={{ color:'var(--c-text2)' }}>"Forgot / Reset password"</strong> and enter this code.
              </div>
            </div>
          )}
        </div>
      </div>

      <Toast toast={toast} />
    </div>
  )
}
