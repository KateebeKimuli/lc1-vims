/**
 * ============================================================
 * DASHBOARD — src/pages/Dashboard.jsx
 * ============================================================
 * Now uses useVillageDB() so ALL statistics are scoped to the
 * logged-in village only. No data from other villages appears.
 * ============================================================
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate }            from 'react-router-dom'
import { useAuth }                from '../hooks/useAuth'
import { useVillageDB }           from '../db/villageDB'
import { useSyncStatus }          from '../hooks/useSyncStatus'
import { getRoleById }            from '../data/roles'
import { format }                 from 'date-fns'
import MoLGLogo                   from '../assets/MoLGLogo'
import { getLoginHistory }         from '../security/sessionManager.js'

export default function Dashboard() {
  const { user, canWrite, canAccessRoute } = useAuth()
  const db       = useVillageDB()          // ← village-scoped DB
  const navigate = useNavigate()
  const sync     = useSyncStatus()
  const roleDef  = getRoleById(user?.role)

  const [stats,   setStats]   = useState({
    residents:0, households:0, land:0, cases:0, openCases:0,
    births:0, deaths:0, welfare:0, businesses:0, security:0,
    deceased:0, migrated:0,
  })
  const [recent,  setRecent]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [loginHistory,  setLoginHistory]  = useState([])
  const [backupWarning, setBackupWarning] = useState(false)

  // Load is scoped to this village via db.stats() and db.getAll()
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, residents] = await Promise.all([
        db.stats(),
        db.getAll('residents'),
      ])
      setStats(s)
      setRecent(
        residents
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 8)
      )
    } catch (err) {
      showToast && showToast('Error loading dashboard: ' + err.message, 'error')
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
    // Load login history (from localStorage — always available)
    setLoginHistory(getLoginHistory().slice(0, 5))

    // Check when last backup was done (stored in localStorage)
    const lastBackup = localStorage.getItem('lc1_last_backup')
    if (!lastBackup) {
      setBackupWarning(true)
    } else {
      const daysSince = (Date.now() - new Date(lastBackup)) / (1000 * 60 * 60 * 24)
      setBackupWarning(daysSince > 7)
    }
  }, [db.villageId])   // re-run if the village changes (e.g. master admin switches)

  useEffect(() => { load() }, [load])

  // Stat tiles filtered by RBAC
  const STAT_TILES = [
    { label:'Active residents', value:stats.residents,  icon:'👤', color:'var(--c-green-xl)', path:'/residents'  },
    { label:'Households',       value:stats.households, icon:'🏠', color:'#5dade2',           path:'/households' },
    { label:'Land Records',     value:stats.land,       icon:'📐', color:'var(--c-gold-l)',    path:'/land'       },
    { label:'Open Cases',       value:stats.openCases,  icon:'⚖️', color:'var(--c-red-l)',    path:'/cases'      },
    { label:'Birth Reg.',       value:stats.births,     icon:'👶', color:'#a29bfe',            path:'/births'     },
    { label:'Death Reg.',       value:stats.deaths,     icon:'📋', color:'var(--c-text2)',     path:'/deaths'     },
    { label:'Welfare/PDM',      value:stats.welfare,    icon:'🤝', color:'#fdcb6e',            path:'/welfare'    },
    { label:'Businesses',       value:stats.businesses, icon:'🏪', color:'#00b894',            path:'/businesses' },
    { label:'Security',         value:stats.security,   icon:'🛡️', color:'#e17055',            path:'/security'   },
    { label:'Meetings',         value:stats.meetings,   icon:'🗣️', color:'#74b9ff',            path:'/meetings'   },
    { label:'Letters issued',   value:stats.letters,    icon:'📄', color:'#a29bfe',            path:'/letters'    },
  ].filter(t => canAccessRoute(t.path))

  const ALL_ACTIONS = [
    { label:'Register resident', icon:'👤', to:'/residents/new', module:'residents'  },
    { label:'Register birth',    icon:'👶', to:'/births',        module:'births'     },
    { label:'New case',          icon:'⚖️', to:'/cases',         module:'cases'      },
    { label:'Issue letter',      icon:'📄', to:'/letters',       module:'letters'    },
    { label:'Record death',      icon:'📋', to:'/deaths',        module:'deaths'     },
    { label:'New meeting',       icon:'🗣️', to:'/meetings',      module:'meetings'   },
    { label:'Add business',      icon:'🏪', to:'/businesses',    module:'businesses' },
    { label:'Log incident',      icon:'🛡️', to:'/security',      module:'security'   },
  ].filter(a => canWrite(a.module))

  return (
    <div className="page">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">{format(new Date(), 'EEEE, d MMMM yyyy')}</div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          {/* Online/offline badge */}
          <span className={`badge badge-${sync.online ? 'green' : 'gray'}`}>
            {sync.online ? '● Online' : '○ Offline'}
          </span>

          {/* Sync button — always visible, shows state */}
          <button
            className={`btn btn-sm ${sync.isSyncing ? 'btn-gold' : sync.error ? 'btn-danger' : sync.isConfigured ? 'btn-primary' : 'btn-secondary'}`}
            onClick={sync.triggerSync}
            disabled={sync.isSyncing || !sync.online}
            title={
              !sync.isConfigured ? 'Configure Supabase in Settings → Sync & Backup' :
              sync.error ? sync.error :
              sync.lastSyncAt ? `Last synced: ${format(new Date(sync.lastSyncAt), 'dd/MM HH:mm')}` :
              'Sync to cloud'
            }
          >
            {sync.isSyncing
              ? '⏳ Syncing…'
              : !sync.isConfigured
                ? '☁ Not configured'
                : sync.error
                  ? '✕ Sync error'
                  : sync.lastSyncAt
                    ? `☁ Synced ${format(new Date(sync.lastSyncAt), 'HH:mm')}`
                    : '☁ Sync now'
            }
          </button>

          {/* Show last push/pull counts after sync */}
          {(sync.pushed > 0 || sync.pulled > 0) && !sync.isSyncing && (
            <span style={{ fontSize:11, color:'var(--c-text3)' }}>
              ↑{sync.pushed} ↓{sync.pulled}
            </span>
          )}
        </div>
      </div>

      {/* User + village identity card */}
      <div style={{
        background:'linear-gradient(135deg, var(--c-surface) 0%, rgba(45,122,79,0.2) 100%)',
        border:'1px solid var(--c-green)', borderRadius:'var(--r-lg)',
        padding:'20px 24px', marginBottom:28,
        display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'center',
      }}>
        <div>
          <div style={{ fontSize:12, color:'var(--c-text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>
            Logged in as
          </div>
          <div style={{ fontFamily:'var(--font-head)', fontSize:22, fontWeight:800, marginBottom:4 }}>
            {user?.fullName}
          </div>
          <div style={{ fontSize:14, color:'var(--c-green-xl)', fontWeight:600, marginBottom:8 }}>
            {roleDef?.title || user?.role}
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <span className="badge badge-green">📍 {user?.villageName || '—'} Village</span>
            {user?.parishName    && <span className="badge badge-gray">{user.parishName}</span>}
            {user?.subcountyName && <span className="badge badge-gray">{user.subcountyName}</span>}
            {user?.districtName  && <span className="badge badge-gray">{user.districtName} District</span>}
          </div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{
            width:60, height:60, borderRadius:'50%',
            background: roleDef?.accessLevel === 'full' ? 'rgba(45,122,79,0.25)' : 'rgba(200,151,43,0.2)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:28,
          }}>
            {roleDef?.accessLevel === 'full' ? '🔓' : '🔒'}
          </div>
          <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:4 }}>
            {roleDef?.accessLevel === 'full' ? 'Full access' : 'Restricted'}
          </div>
        </div>
      </div>

      {/* Backup reminder */}
      {backupWarning && (
        <div style={{
          background:'rgba(200,151,43,0.12)', border:'1px solid var(--c-gold)',
          borderRadius:10, padding:'10px 16px', marginBottom:16,
          display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13,
        }}>
          <div>
            <strong style={{ color:'var(--c-gold-l)' }}>💾 Backup reminder</strong>
            <span style={{ color:'var(--c-text2)', marginLeft:8 }}>
              It has been more than 7 days since your last data backup.
            </span>
          </div>
          <button className="btn btn-gold btn-sm" onClick={() => {
            localStorage.setItem('lc1_last_backup', new Date().toISOString())
            setBackupWarning(false)
          }}>Dismiss</button>
        </div>
      )}

      {/* Population summary sub-row */}
      {!loading && (
        <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap' }}>
          <span className="badge badge-green">👤 {stats.residents} active residents</span>
          {stats.deceased > 0 && <span className="badge badge-gray">💀 {stats.deceased} deceased</span>}
          {stats.migrated > 0 && <span className="badge badge-blue">🚶 {stats.migrated} migrated</span>}
          <span style={{ fontSize:12, color:'var(--c-text3)', alignSelf:'center' }}>
            All figures for {user?.villageName} Village only
          </span>
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14, marginBottom:32 }}>
        {STAT_TILES.map(t => (
          <div key={t.label} className="stat-card"
            style={{ cursor:'pointer', transition:'border-color 0.15s' }}
            onClick={() => navigate(t.path)}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--c-border2)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--c-border)'}>
            <div style={{ fontSize:26, marginBottom:6 }}>{t.icon}</div>
            <div className="stat-num" style={{ color:t.color }}>{loading ? '—' : t.value}</div>
            <div className="stat-label">{t.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:24 }}>

        {/* Recent residents */}
        <div>
          <div className="section-title">Recently registered residents</div>
          <div className="table-wrap">
            {recent.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--c-text3)' }}>
                No residents yet.{' '}
                {canWrite('residents') && (
                  <span style={{ color:'var(--c-green-xl)', cursor:'pointer' }}
                    onClick={() => navigate('/residents/new')}>
                    Register the first one →
                  </span>
                )}
              </div>
            ) : (
              <table>
                <thead><tr><th>Name</th><th>NIN</th><th>Village</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {recent.map(r => (
                    <tr key={r.id} style={{ cursor:'pointer' }}
                      onClick={() => navigate(`/residents/${r.id}`)}>
                      <td style={{ fontWeight:500 }}>
                        {r.photo && <img src={r.photo} alt="" style={{ width:26, height:26, borderRadius:'50%', objectFit:'cover', marginRight:8, verticalAlign:'middle' }} />}
                        {r.surname} {r.firstName}
                      </td>
                      <td style={{ fontFamily:'monospace', fontSize:12 }}>{r.nin||'—'}</td>
                      <td>{r.village||'—'}</td>
                      <td><span className={`badge badge-${r.status==='active'?'green':r.status==='deceased'?'gray':'gold'}`}>{r.status||'active'}</span></td>
                      <td style={{ fontSize:12, color:'var(--c-text3)' }}>
                        {r.createdAt ? format(new Date(r.createdAt),'dd/MM/yy') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <div className="section-title">Quick actions</div>
          {ALL_ACTIONS.length === 0 ? (
            <div style={{ color:'var(--c-text3)', fontSize:13, padding:'16px 0' }}>
              Your role has read-only access.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {ALL_ACTIONS.map(a => (
                <button key={a.label} className="btn btn-secondary"
                  onClick={() => navigate(a.to)}
                  style={{ justifyContent:'flex-start', gap:12, padding:'10px 14px' }}>
                  <span style={{ fontSize:20 }}>{a.icon}</span>
                  <span style={{ fontWeight:500 }}>{a.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Cloud sync status card */}
          <div className="card" style={{ marginTop:16 }}>
            <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.04em' }}>
              ☁ Cloud sync status
            </div>
            {!sync.isConfigured ? (
              <div style={{ fontSize:12, color:'var(--c-text3)', lineHeight:1.6 }}>
                Not configured.{' '}
                <span style={{ color:'var(--c-green-xl)', cursor:'pointer', textDecoration:'underline' }}
                  onClick={() => navigate('/settings')}>
                  Set up in Settings →
                </span>
              </div>
            ) : sync.isSyncing ? (
              <div style={{ fontSize:13, color:'var(--c-gold-l)', fontWeight:600 }}>⏳ Syncing…</div>
            ) : sync.error ? (
              <div style={{ fontSize:12, color:'var(--c-red-l)', lineHeight:1.5 }}>✕ {sync.error}</div>
            ) : sync.lastSyncAt ? (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--c-green-xl)' }}>
                  ✓ Synced {format(new Date(sync.lastSyncAt), 'dd/MM/yyyy HH:mm')}
                </div>
                {(sync.pushed > 0 || sync.pulled > 0) && (
                  <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:3 }}>
                    Last sync: ↑ {sync.pushed} pushed · ↓ {sync.pulled} pulled
                  </div>
                )}
                <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:2 }}>
                  Auto-syncs every 30 seconds
                </div>
              </div>
            ) : (
              <div style={{ fontSize:12, color:'var(--c-text3)' }}>
                Ready — click Sync now to push data
              </div>
            )}
            <button className="btn btn-primary btn-sm" style={{ marginTop:10, width:'100%' }}
              onClick={sync.triggerSync}
              disabled={sync.isSyncing || !sync.online || !sync.isConfigured}>
              {sync.isSyncing ? '⏳ Syncing…' : '↑ Sync now'}
            </button>
          </div>

          {/* Recent login history */}
          {loginHistory.length > 0 && (
            <div className="card" style={{ marginTop:16 }}>
              <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                🔐 Recent login activity
              </div>
              {loginHistory.map((l, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'6px 0', borderBottom: i < loginHistory.length-1 ? '1px solid var(--c-border)' : 'none',
                  fontSize:12 }}>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <span>{l.success ? '✓' : '✗'}</span>
                    <span style={{ color: l.success ? 'var(--c-text)' : 'var(--c-red-l)' }}>
                      {l.username}
                    </span>
                  </div>
                  <span style={{ color:'var(--c-text3)', fontSize:11 }}>
                    {format(new Date(l.timestamp), 'dd/MM HH:mm')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
