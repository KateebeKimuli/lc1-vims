/**
 * ============================================================
 * LAYOUT — src/components/layout/Layout.jsx  (v3 — secured)
 * ============================================================
 * Added:
 *   - Session timeout warning modal (60-second countdown)
 *   - "Stay logged in" / "Log out now" actions
 *   - Security status indicators in sidebar
 * ============================================================
 */

import { useState, useEffect }            from 'react'
import { NavLink, Outlet, useNavigate }   from 'react-router-dom'
import { useAuth }                        from '../../hooks/useAuth'
import { useSyncStatus }                  from '../../hooks/useSyncStatus'
import { getRoleById }                    from '../../data/roles'
import MoLGLogo                           from '../../assets/MoLGLogo'
import GlobalSearch                        from '../shared/GlobalSearch'

const ALL_NAV = [
  { to:'/',           icon:'⊞',  label:'Dashboard',   end:true },
  { to:'/residents',  icon:'👤', label:'Residents'              },
  { to:'/households', icon:'🏠', label:'Households'             },
  { to:'/land',       icon:'📐', label:'Land Records'           },
  { to:'/cases',      icon:'⚖️', label:'Cases'                  },
  { to:'/births',     icon:'👶', label:'Births'                 },
  { to:'/deaths',     icon:'📋', label:'Deaths'                 },
  { to:'/meetings',   icon:'🗣️', label:'Meetings'               },
  { to:'/letters',    icon:'📄', label:'Letters'                },
  { to:'/welfare',    icon:'🤝', label:'Welfare / PDM'          },
  { to:'/businesses', icon:'🏪', label:'Businesses'             },
  { to:'/security',   icon:'🛡️', label:'Security'               },
  { to:'/reports',    icon:'📊', label:'Reports'                },
  { to:'/audit',      icon:'🔍', label:'Audit Log'              },
  { to:'/settings',   icon:'⚙️', label:'Settings'               },
]

// ── Session timeout warning modal — module scope ───────────────────────────
function TimeoutWarningModal({ secondsLeft, onStay, onLogout }) {
  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60

  return (
    <div style={{
      position:       'fixed', inset:0, zIndex:9999,
      background:     'rgba(0,0,0,0.7)',
      display:        'flex', alignItems:'center', justifyContent:'center',
    }}>
      <div style={{
        background:   'var(--c-surface)',
        border:       '2px solid var(--c-gold)',
        borderRadius: 'var(--r-xl)',
        padding:      '32px 36px',
        maxWidth:     420, width:'90%',
        textAlign:    'center',
        boxShadow:    '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Warning icon */}
        <div style={{ fontSize:48, marginBottom:12 }}>⏳</div>

        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>
          Session expiring soon
        </h2>
        <p style={{ color:'var(--c-text2)', fontSize:14, marginBottom:20, lineHeight:1.6 }}>
          You have been inactive for a while. For security, you will be
          automatically logged out in:
        </p>

        {/* Countdown */}
        <div style={{
          fontSize:       48,
          fontWeight:     800,
          fontFamily:     'monospace',
          color:          secondsLeft <= 10 ? 'var(--c-red-l)' : 'var(--c-gold-l)',
          marginBottom:   24,
          transition:     'color 0.3s',
        }}>
          {mins > 0 ? `${mins}:${String(secs).padStart(2,'0')}` : String(secs)}
        </div>

        <div style={{ display:'flex', gap:12 }}>
          <button
            className="btn btn-danger"
            style={{ flex:1 }}
            onClick={onLogout}
          >
            Log out now
          </button>
          <button
            className="btn btn-primary"
            style={{ flex:1 }}
            onClick={onStay}
          >
            Stay logged in
          </button>
        </div>

        <p style={{ fontSize:11, color:'var(--c-text3)', marginTop:14 }}>
          This protects village data on shared computers.
        </p>
      </div>
    </div>
  )
}

// ── Main layout ────────────────────────────────────────────────────────────
export default function Layout() {
  const { user, logout, canAccessRoute, warningSeconds, extendSession } = useAuth()
  const navigate   = useNavigate()
  const sync       = useSyncStatus()
  const [collapsed,      setCollapsed]      = useState(false)
  const [searching,      setSearching]      = useState(false)
  const [confirmingLogout, setConfirmingLogout] = useState(false)

  const roleDef   = getRoleById(user?.role)
  const roleTitle = roleDef?.shortTitle || user?.role || ''
  const visibleNav = ALL_NAV.filter(item => {
    if (item.to === '/audit') return user?.isMasterAdmin
    return canAccessRoute(item.to)
  })

  // Show confirmation modal first — only actually logout on confirm
  function handleLogout()        { setConfirmingLogout(true) }
  function handleLogoutConfirm() { setConfirmingLogout(false); logout(); navigate('/login') }
  function handleLogoutCancel()  { setConfirmingLogout(false) }

  // Ctrl+K opens global search
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearching(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  function handleStayLoggedIn() { extendSession() }

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>

      {/* ── GLOBAL SEARCH ── */}
      {searching && <GlobalSearch onClose={() => setSearching(false)} />}

      {/* ── LOGOUT CONFIRMATION ── */}
      {confirmingLogout && (
        <div style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(0,0,0,0.65)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <div style={{
            background:   'var(--c-surface)',
            border:       '1px solid var(--c-border)',
            borderRadius: 'var(--r-xl)',
            padding:      '32px 36px',
            maxWidth:     380, width:'90%',
            textAlign:    'center',
            boxShadow:    '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize:44, marginBottom:12 }}>👋</div>
            <h2 style={{ fontSize:19, fontWeight:700, marginBottom:8 }}>
              Sign out?
            </h2>
            <p style={{ color:'var(--c-text2)', fontSize:13, lineHeight:1.7, marginBottom:8 }}>
              You are signed in as <strong>{user?.fullName}</strong>
              {user?.villageName && (
                <> — <strong>{user.villageName} Village</strong></>
              )}.
            </p>
            <p style={{ color:'var(--c-text3)', fontSize:12, lineHeight:1.6, marginBottom:24 }}>
              Any unsaved changes will be lost. All registered data is safely stored.
            </p>
            <div style={{ display:'flex', gap:12 }}>
              <button
                className="btn btn-secondary"
                style={{ flex:1 }}
                onClick={handleLogoutCancel}
                autoFocus
              >
                Cancel — stay logged in
              </button>
              <button
                className="btn btn-danger"
                style={{ flex:1 }}
                onClick={handleLogoutConfirm}
              >
                Yes, sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SESSION TIMEOUT WARNING ── */}
      {warningSeconds !== null && warningSeconds > 0 && (
        <TimeoutWarningModal
          secondsLeft={warningSeconds}
          onStay={handleStayLoggedIn}
          onLogout={handleLogoutConfirm}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside style={{
        width:       collapsed ? 64 : 248,
        background:  'var(--c-surface)',
        borderRight: '1px solid var(--c-border)',
        display:     'flex', flexDirection:'column',
        transition:  'width 0.2s ease',
        flexShrink:  0, overflow:'hidden',
      }}>

        {/* Brand */}
        <div style={{
          padding:      '14px 12px',
          borderBottom: '1px solid var(--c-border)',
          display:      'flex', alignItems:'center', gap:10,
          background:   'var(--c-surface)',
        }}>
          <div style={{ flexShrink:0, width:collapsed?36:40, height:collapsed?36:40 }}>
            <MoLGLogo size={collapsed?36:40} />
          </div>
          {!collapsed && (
            <div style={{ minWidth:0 }}>
              <div style={{ fontFamily:'var(--font-head)', fontWeight:800, fontSize:12, lineHeight:1.2, color:'var(--c-text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                LC1 Village IMS
              </div>
              <div style={{ fontSize:10, color:'var(--c-green-xl)', marginTop:1 }}>
                {user?.villageName ? `${user.villageName} Village` : 'MoLG Uganda'}
              </div>
            </div>
          )}
        </div>

        {/* Search button */}
        <button
          onClick={() => setSearching(true)}
          style={{
            margin: '8px 7px 0', padding:'8px 10px', border:'1px solid var(--c-border)',
            borderRadius:8, background:'var(--c-surface2)', cursor:'pointer', width:'calc(100% - 14px)',
            display:'flex', alignItems:'center', gap:8, color:'var(--c-text3)', fontSize:12,
          }}
        >
          <span style={{ fontSize:16 }}>🔍</span>
          {!collapsed && (
            <>
              <span style={{ flex:1, textAlign:'left' }}>Search…</span>
              <kbd style={{ fontSize:10, background:'var(--c-border)', padding:'1px 5px', borderRadius:3 }}>⌘K</kbd>
            </>
          )}
        </button>

        {/* Navigation */}
        <nav style={{ flex:1, padding:'10px 7px', overflowY:'auto', overflowX:'hidden' }}>
          {visibleNav.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:11,
                padding:'8px 10px', borderRadius:8, marginBottom:2,
                textDecoration:'none', fontSize:13.5, fontWeight:500,
                transition:'all 0.15s', whiteSpace:'nowrap', overflow:'hidden',
                background: isActive ? 'var(--c-green)' : 'transparent',
                color:      isActive ? '#fff' : 'var(--c-text2)',
              })}>
              <span style={{ fontSize:17, flexShrink:0, lineHeight:1 }}>{icon}</span>
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User info + status + actions */}
        <div style={{ padding:'10px 7px', borderTop:'1px solid var(--c-border)' }}>

          {/* Sync badge */}
          {!collapsed && (
            <div style={{
              padding:'8px 10px', marginBottom:6,
              background:'var(--c-surface2)', borderRadius:8,
              fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center',
            }}>
              <span style={{ color: sync.online ? 'var(--c-green)' : 'var(--c-text3)' }}>
                {sync.online ? '● Online' : '○ Offline'}
              </span>
              {sync.pendingCount > 0 && (
                <span style={{ background:'var(--c-gold)', color:'#0d1b14', fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:99 }}>
                  {sync.pendingCount} pending
                </span>
              )}
              {sync.pendingCount === 0 && sync.online && (
                <span style={{ color:'var(--c-green-xl)', fontSize:11 }}>✓ Synced</span>
              )}
            </div>
          )}

          {/* Security indicator — lock icon shows session is protected */}
          {!collapsed && (
            <div style={{
              padding:'6px 10px', marginBottom:4,
              background:'rgba(45,122,79,0.06)', borderRadius:8,
              fontSize:11, color:'var(--c-text3)',
              display:'flex', gap:6, alignItems:'center',
            }}>
              <span>🔒</span>
              <span>Secured session</span>
              {user?.sessionStart && (
                <span style={{ marginLeft:'auto' }}>
                  {Math.floor((Date.now() - new Date(user.sessionStart)) / 60000)}m
                </span>
              )}
            </div>
          )}

          {/* User name + role */}
          {!collapsed && (
            <div style={{ padding:'6px 10px', marginBottom:4 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--c-text)' }}>
                {user?.fullName}
              </div>
              <div style={{ fontSize:11, color:'var(--c-green-xl)', marginTop:1 }}>
                {roleTitle}
              </div>
              <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:1 }}>
                {user?.villageName} Village
              </div>
            </div>
          )}

          {/* Sign out */}
          <button onClick={handleLogout} style={{
            width:'100%', padding:'7px 10px', border:'none',
            background:'transparent', cursor:'pointer', borderRadius:8,
            display:'flex', alignItems:'center', gap:11,
            color:'var(--c-text3)', fontSize:13, transition:'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(192,57,43,0.15)'; e.currentTarget.style.color='var(--c-red-l)' }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--c-text3)' }}>
            <span style={{ fontSize:17 }}>⎋</span>
            {!collapsed && 'Sign out'}
          </button>

          {/* Collapse toggle */}
          <button onClick={() => setCollapsed(!collapsed)} style={{
            width:'100%', padding:'7px 10px', border:'none',
            background:'transparent', cursor:'pointer', borderRadius:8,
            display:'flex', alignItems:'center', gap:11,
            color:'var(--c-text3)', fontSize:13, marginTop:3,
          }}>
            <span style={{ fontSize:17 }}>{collapsed ? '→' : '←'}</span>
            {!collapsed && 'Collapse sidebar'}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex:1, overflowY:'auto', background:'var(--c-bg)' }}>
        <Outlet />
      </main>
    </div>
  )
}
