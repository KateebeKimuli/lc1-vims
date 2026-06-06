/**
 * ============================================================
 * MoLG LOGO COMPONENT — src/assets/MoLGLogo.jsx
 * ============================================================
 * Displays the official Uganda Ministry of Local Government
 * logo throughout the system.
 *
 * Priority order:
 *   1. Logo uploaded by user via Settings → Official logo
 *      (stored in IndexedDB, loaded dynamically)
 *   2. The embedded default logo (local-gov-logo.jpg converted
 *      to base64 in officialLogo.js — works fully offline)
 *
 * Usage:
 *   <MoLGLogo size={72} />          — login screen (large)
 *   <MoLGLogo size={36} />          — sidebar header (medium)
 *   <MoLGLogo size={24} />          — small contexts
 * ============================================================
 */

import { useState, useEffect } from 'react'
import { OFFICIAL_LOGO_BASE64, LOGO_ALT } from './officialLogo.js'

export default function MoLGLogo({ size = 48, className = '' }) {
  // Check if user has uploaded a custom logo (stored in IndexedDB settings)
  const [customLogo, setCustomLogo] = useState(null)
  const [loaded,     setLoaded]     = useState(false)

  useEffect(() => {
    // Load any user-uploaded logo from IndexedDB
    async function loadCustom() {
      try {
        // Prefer centrally stored master logo (sysadmin upload)
        try {
          const { getMasterDB } = await import('../db/multiTenantDB.js')
          const mdb = await getMasterDB()
          const mEntry = await mdb.get('settings', 'officialLogo')
          if (mEntry?.value) { setCustomLogo(mEntry.value); setLoaded(true); return }
        } catch {}

        // Fallback to local DB (village-specific uploaded logo)
        const { getDB } = await import('../db/index.js')
        const db    = await getDB()
        const entry = await db.get('settings', 'officialLogo')
        if (entry?.value) setCustomLogo(entry.value)
      } catch { /* use default */ }
      setLoaded(true)
    }
    loadCustom()
  }, [])

  // Use uploaded logo if available, otherwise use embedded default
  const logoSrc = customLogo || OFFICIAL_LOGO_BASE64

  return (
    <div
      className={className}
      style={{
        width:    size,
        height:   size,
        flexShrink: 0,
        display:  'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loaded && (
        <img
          src={logoSrc}
          alt={LOGO_ALT}
          style={{
            width:     '100%',
            height:    '100%',
            objectFit: 'contain',
            display:   'block',
          }}
        />
      )}
    </div>
  )
}
