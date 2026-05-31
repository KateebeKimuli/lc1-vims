/**
 * ============================================================
 * RESIDENTPROFILE — src/pages/ResidentProfile.jsx
 * ============================================================
 * Full profile view for one resident. Shows all biodata, biometric status, and record metadata. Allows PDF export of the resident record.
 * ============================================================
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth }           from '../hooks/useAuth'
import { useVillageDB }      from '../db/villageDB'
import { getVillageDB }      from '../db/multiTenantDB'
import { format, differenceInYears } from 'date-fns'
import IdentityCard              from '../components/shared/IdentityCard'
import { generateResidentProfile } from '../services/documentService'

export default function ResidentProfile() {
  const { id }           = useParams()
  const [searchParams]   = useSearchParams()
  const navigate         = useNavigate()
  const { user }         = useAuth()
  const db               = useVillageDB()
  const [resident,  setResident]  = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [printing,  setPrinting]  = useState(false)
  const [printError,setPrintError]= useState('')
  const [showCard,  setShowCard]  = useState(false)

  useEffect(() => {
    async function loadResident() {
      setLoading(true)
      try {
        let record = null

        // Primary: try the current village DB (works for normal users)
        record = await db.get('residents', id).catch(() => null)

        // Fallback for System Admin: try the villageId from the URL query param
        // e.g. /residents/abc123?vid=V024
        if (!record) {
          const queryVid = searchParams.get('vid')
          if (queryVid && queryVid !== 'MASTER') {
            const vdb = await getVillageDB(queryVid)
            record = await vdb.get('residents', id).catch(() => null)
          }
        }

        // Second fallback: search all known village DBs on device (sysadmin)
        if (!record && user?.isMasterAdmin) {
          const { getRegisteredVillages } = await import('../db/multiTenantDB')
          const villages = await getRegisteredVillages()
          for (const v of villages) {
            try {
              const vdb = await getVillageDB(v.villageId)
              const r   = await vdb.get('residents', id)
              if (r) { record = r; break }
            } catch {}
          }
        }

        setResident(record || null)
      } catch (err) {
        console.error('Failed to load resident:', err)
        setResident(null)
      } finally {
        setLoading(false)
      }
    }
    loadResident()
  }, [id, db.villageId])

  async function printProfile() {
    setPrinting(true)
    setPrintError('')
    try {
      await generateResidentProfile(resident, user)
    } catch (err) {
      console.error('PDF error:', err)
      setPrintError('PDF failed: ' + err.message)
    } finally {
      setPrinting(false)
    }
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--c-text3)' }}>Loading…</div>
  if (!resident) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--c-text3)' }}>Resident not found</div>

  const r = resident
  const age = r.dateOfBirth ? differenceInYears(new Date(), new Date(r.dateOfBirth)) : null

  const INFO = [
    { label: 'National ID (NIN)', value: r.nin, mono: true },
    { label: 'Date of birth', value: r.dateOfBirth ? format(new Date(r.dateOfBirth), 'dd MMMM yyyy') : '—' },
    { label: 'Age', value: age != null ? `${age} years` : '—' },
    { label: 'Sex', value: r.sex || '—' },
    { label: 'Marital status', value: r.maritalStatus || '—' },
    { label: 'Tribe', value: r.tribe || '—' },
    { label: 'Religion', value: r.religion || '—' },
    { label: 'Nationality', value: r.nationality || '—' },
    { label: 'Occupation', value: r.occupation || '—' },
  ]

  const CONTACT = [
    { label: 'Zone / Cell', value: r.zone || r.physicalAddress || '—' },
    { label: 'Phone', value: r.phone || '—' },
    { label: 'Alt. phone', value: r.phone2 || '—' },
    { label: 'Email', value: r.email || '—' },
    { label: 'Village', value: r.village || '—' },
    { label: 'Parish', value: r.parish || '—' },
    { label: 'Sub-county', value: r.subCounty || '—' },
    { label: 'District', value: r.district || '—' },
    { label: 'Physical address', value: r.physicalAddress || '—' },
  ]

  return (
    <div className="page">
      {/* Affiliated banner */}
      {r.residentType === 'affiliated' && (
        <div style={{
          background:'rgba(200,151,43,0.12)', border:'2px solid var(--c-gold)',
          borderRadius:12, padding:'14px 20px', marginBottom:20,
          display:'flex', gap:14, alignItems:'flex-start',
        }}>
          <span style={{ fontSize:28 }}>🔗</span>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:'var(--c-gold-l)', marginBottom:4 }}>
              Affiliated Resident
            </div>
            <div style={{ fontSize:13, color:'var(--c-text2)', lineHeight:1.7 }}>
              This person's <strong>primary residence and official population count</strong> are
              in <strong>{r.formerVillage || 'another village'}</strong>.
              They are affiliated with this village due to:
              <strong> {r.registrationReasonNote || r.registrationReason?.replace(/_/g,' ')?.replace('aff ','') || '—'}</strong>.
              <br/>Their original village record has not been changed.
              This record is <strong>not counted</strong> in this village's population statistics.
            </div>
          </div>
        </div>
      )}

    <div className="page-header">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/residents')}>← Residents</button>
          <div>
            <h1 className="page-title">{r.surname} {r.firstName} {r.otherNames}</h1>
            <div className="page-sub">Resident profile</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-gold" onClick={() => setShowCard(true)}>
            🪪 Generate ID card
          </button>
          <button className="btn btn-secondary" onClick={printProfile} disabled={printing}>
            {printing ? '⏳ Generating…' : '🖨️ Print / PDF'}
          </button>
          <button className="btn btn-primary" onClick={() => navigate(`/residents/${r.id}/edit`)}>✏️ Edit</button>
        </div>
      </div>

      {/* Print error banner */}
      {printError && (
        <div style={{
          background:'rgba(192,57,43,0.12)', border:'1px solid var(--c-red)',
          borderRadius:8, padding:'10px 16px', marginBottom:16,
          fontSize:13, color:'var(--c-red-l)',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <span>✕ {printError}</span>
          <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--c-red-l)', fontSize:16 }}
            onClick={() => setPrintError('')}>✕</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left: photo + status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            {r.photo
              ? <img src={r.photo} alt={r.surname} style={{ width: 180, height: 210, objectFit: 'cover', borderRadius: 12, border: '3px solid var(--c-border2)', marginBottom: 16 }} />
              : <div style={{ width: 180, height: 210, borderRadius: 12, background: 'var(--c-surface2)', border: '2px dashed var(--c-border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 60 }}>👤</div>}
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 18 }}>{r.surname}</div>
            <div style={{ color: 'var(--c-text2)', marginBottom: 12 }}>{r.firstName} {r.otherNames}</div>
            <span className={`badge badge-${r.status === 'active' ? 'green' : r.status === 'deceased' ? 'gray' : r.status === 'migrated' ? 'blue' : 'gold'}`} style={{ fontSize: 13, padding: '5px 16px' }}>{r.status}</span>
          </div>

          {/* Biometrics */}
          <div className="card">
            <div className="section-title">Biometrics</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--c-text3)' }}>Photo</span>
                <span className={`badge badge-${r.photo ? 'green' : 'gray'}`}>{r.photo ? '✓ Yes' : '✗ No'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--c-text3)' }}>Fingerprint</span>
                <span className={`badge badge-${r.fingerprint ? 'green' : 'gray'}`}>{r.fingerprint ? '✓ On file' : '✗ None'}</span>
              </div>
              {r.fingerprint && <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--c-text3)', wordBreak: 'break-all' }}>{r.fingerprint}</div>}
            </div>
          </div>

          {/* Record meta */}
          <div className="card">
            <div className="section-title">Record info</div>
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['ID', r.id?.slice(0, 8) + '…'],
                ['Registered', r.createdAt ? format(new Date(r.createdAt), 'dd/MM/yyyy') : '—'],
                ['Last updated', r.updatedAt ? format(new Date(r.updatedAt), 'dd/MM/yyyy HH:mm') : '—'],
                ['Sync', r.syncStatus === 'synced' ? '✓ Synced' : '⏳ Pending'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--c-text3)' }}>{k}</span>
                  <span style={{ fontFamily: k === 'ID' ? 'monospace' : undefined, fontSize: k === 'ID' ? 11 : undefined }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="section-title">Personal information</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              {INFO.map(({ label, value, mono }) => (
                <div key={label}>
                  <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontWeight: 500, fontFamily: mono ? 'monospace' : undefined, letterSpacing: mono ? '0.06em' : undefined }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-title">Contact &amp; current address</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              {CONTACT.map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Affiliated / former address card */}
          {(r.formerVillage || r.formerDistrict || r.residentType === 'affiliated') && (
            <div className="card" style={{
              borderColor: r.residentType === 'affiliated' ? 'var(--c-gold)' : 'var(--c-border)',
              background:  r.residentType === 'affiliated' ? 'rgba(200,151,43,0.04)' : undefined,
            }}>
              <div className="section-title">
                {r.residentType === 'affiliated' ? '🔗 Affiliation details' : 'Former / previous address'}
              </div>

              {/* Affiliated notice — prominent, explains what this means */}
              {r.residentType === 'affiliated' && (
                <div style={{ background:'rgba(200,151,43,0.12)', border:'1px solid var(--c-gold)',
                  borderRadius:8, padding:'12px 16px', marginBottom:14, fontSize:13, lineHeight:1.7 }}>
                  <div style={{ fontWeight:700, color:'var(--c-gold-l)', marginBottom:4 }}>
                    🔗 Affiliated resident — home village record unchanged
                  </div>
                  <div style={{ color:'var(--c-text2)' }}>
                    This person's <strong>primary residence and population count</strong> remain in
                    their home village. They are recorded here as affiliated because of their connection
                    to this village. This LC1 can issue them letters and they appear in all local
                    records, but they are <strong>not counted in this village's population total</strong>.
                  </div>
                  <div style={{ marginTop:8, padding:'6px 10px', background:'rgba(200,151,43,0.15)',
                    borderRadius:6, fontSize:12, color:'var(--c-gold-l)' }}>
                    <strong>Affiliation reason:</strong>{' '}
                    {r.registrationReasonNote || r.registrationReason?.replace(/aff_/,'').replace(/_/g,' ')}
                  </div>
                </div>
              )}

              {/* Migration notice for moved residents */}
              {r.residentType !== 'affiliated' && r.registrationReason && r.registrationReason !== 'born_here' && (
                <div style={{ background:'rgba(93,173,226,0.1)', border:'1px solid rgba(93,173,226,0.3)',
                  borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color:'var(--c-text2)' }}>
                  ⬇ Moved from former village
                  {r.movedFrom && ` · Former village record updated`}
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 24px' }}>
                {[
                  ['Former village',    r.formerVillage   || '—'],
                  ['Former parish',     r.formerParish    || '—'],
                  ['Former sub-county', r.formerSubcounty || '—'],
                  ['Former district',   r.formerDistrict  || '—'],
                  ['Date arrived here', r.dateArrived ? new Date(r.dateArrived).toLocaleDateString('en-UG') : '—'],
                  ['Reason',            r.registrationReasonNote || r.registrationReason?.replace(/_/g,' ') || '—'],
                ].map(([k,v]) => (
                  <div key={k}>
                    <div style={{ fontSize:12, color:'var(--c-text3)', marginBottom:2 }}>{k}</div>
                    <div style={{ fontWeight:500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next of kin */}
          <div className="card">
            <div className="section-title">Next of kin</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 24px' }}>
              {[['Name', r.nextOfKinName || '—'], ['Relationship', r.nextOfKinRelation || '—'], ['Phone', r.nextOfKinPhone || '—']].map(([k, v]) => (
                <div key={k}><div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 2 }}>{k}</div><div style={{ fontWeight: 500 }}>{v}</div></div>
              ))}
            </div>
          </div>

          {r.notes && (
            <div className="card">
              <div className="section-title">Notes</div>
              <div className="rich-content"
                dangerouslySetInnerHTML={{ __html: r.notes }}
                style={{ color:'var(--c-text2)', fontSize:14 }}
              />
            </div>
          )}
        </div>
      </div>
      {/* Identity card modal */}
      {showCard && resident && (
        <IdentityCard resident={resident} user={user} onClose={() => setShowCard(false)} />
      )}
    </div>
  )
}
