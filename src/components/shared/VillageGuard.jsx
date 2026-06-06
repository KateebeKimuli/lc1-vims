/**
 * VillageGuard — src/components/shared/VillageGuard.jsx
 * Shows a "select a village first" prompt when sysadmin is in MASTER mode.
 * Wraps every page so nothing is accidentally empty.
 */
import { useState, useEffect } from 'react'
import { useAuth }             from '../../hooks/useAuth'
import { getRegisteredVillages } from '../../db/multiTenantDB'

export default function VillageGuard({ children }) {
  const { user, switchVillage } = useAuth()
  const [villages, setVillages] = useState([])
  const [search,   setSearch]   = useState('')

  const needsVillage = user?.isMasterAdmin && (!user.villageId || user.villageId === 'MASTER')

  useEffect(() => {
    if (needsVillage) {
      getRegisteredVillages().then(setVillages).catch(() => {})
    }
  }, [needsVillage])

  if (!needsVillage) return children

  const filtered = villages.filter(v =>
    !search ||
    v.villageName?.toLowerCase().includes(search.toLowerCase()) ||
    v.districtName?.toLowerCase().includes(search.toLowerCase()) ||
    v.parishName?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page" style={{
      display:'flex', alignItems:'center', justifyContent:'center', minHeight:400,
    }}>
      <div style={{
        background:'var(--c-surface)', border:'2px solid var(--c-gold)',
        borderRadius:16, padding:32, maxWidth:480, width:'90%',
        boxShadow:'0 8px 40px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize:40, textAlign:'center', marginBottom:12 }}>🏘</div>
        <h2 style={{ textAlign:'center', marginBottom:8, fontSize:18 }}>
          Select a village to manage
        </h2>
        <p style={{ textAlign:'center', fontSize:13, color:'var(--c-text2)', marginBottom:20, lineHeight:1.6 }}>
          You are logged in as <strong>System Administrator</strong>.
          Choose a village below to view and manage its data.
        </p>

        {villages.length === 0 ? (
          <div style={{
            padding:'14px 16px', borderRadius:8, background:'rgba(200,151,43,0.1)',
            border:'1px solid var(--c-gold)', fontSize:13, color:'var(--c-text2)', lineHeight:1.6,
          }}>
            ⚠ No villages have been registered on this device yet.
            Ask a village chairperson to log in first and complete their village setup,
            then you can manage it from here.
          </div>
        ) : (
          <>
            <input
              autoFocus
              className="form-input"
              placeholder="Search village, parish, or district…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom:12 }}
            />
            <div style={{
              maxHeight:240, overflowY:'auto',
              border:'1px solid var(--c-border)', borderRadius:8,
            }}>
              {filtered.length === 0 && (
                <div style={{ padding:'12px 16px', fontSize:12, color:'var(--c-text3)', fontStyle:'italic' }}>
                  No villages matching "{search}"
                </div>
              )}
              {filtered.map(v => (
                <button key={v.villageId}
                  onClick={() => {
                    switchVillage(v.villageId, v.villageName, {
                      parishName:    v.parishName    || '',
                      districtName:  v.districtName  || '',
                      subcountyName: v.subcountyName || '',
                      countyName:    v.countyName    || '',
                    })
                    setSearch('')
                  }}
                  style={{
                    width:'100%', padding:'12px 16px',
                    background:'none', border:'none',
                    borderBottom:'1px solid var(--c-border)',
                    cursor:'pointer', textAlign:'left',
                    display:'flex', flexDirection:'column', gap:2,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(45,122,79,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background='none'}
                >
                  <span style={{ fontWeight:600, fontSize:14, color:'var(--c-text)' }}>
                    📍 {v.villageName}
                  </span>
                  <span style={{ fontSize:11, color:'var(--c-text3)' }}>
                    {[v.parishName, v.subcountyName, v.districtName].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
