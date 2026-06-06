/**
 * ============================================================
 * SHARED PAGE HEADER — src/components/shared/PageHeader.jsx
 * ============================================================
 * Consistent top-of-page header used by every module page.
 * Renders the page title, subtitle, and an optional actions
 * slot (typically a "+ Add" button).
 *
 * Usage:
 *   <PageHeader
 *     title="Residents"
 *     sub="248 records"
 *     actions={<button className="btn btn-primary" onClick={...}>+ Add</button>}
 *   />
 * ============================================================
 */

import useOnlineStatus from '../../hooks/useOnlineStatus'
import { useSyncStatus } from '../../hooks/useSyncStatus'

export default function PageHeader({ title, sub, actions }) {
  const status = useOnlineStatus()
  const online = status?.online ?? false
  const lastChanged = status?.lastChanged ?? null
  const sync = useSyncStatus()

  return (
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      {/* Left side: title and subtitle */}
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>

      {/* Right side: online indicator + actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title={lastChanged ? `Last changed: ${lastChanged}` : ''}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 20,
              background: online ? '#16a34a' : '#f97316',
              boxShadow: '0 0 4px rgba(0,0,0,0.12)'
            }}
          />
          <span style={{ fontSize: 12, color: online ? '#065f46' : '#92400e' }}>
            {online ? 'Online' : 'Offline — Working offline'}
          </span>
            {/* Sync state (if available) */}
            {sync && (
              <span style={{ marginLeft: 10, display: 'flex', alignItems: 'center', gap:8 }}>
                {sync.isSyncing ? (
                  <span style={{ fontSize:12, color:'#2563eb' }}>⟳ Syncing…</span>
                ) : sync.pendingCount > 0 ? (
                  <span style={{ background:'#f59e0b', color:'#0b1320', fontWeight:700, padding:'2px 8px', borderRadius:12 }}>{sync.pendingCount} pending</span>
                ) : (
                  <span style={{ color:'#16a34a', fontSize:12 }}>✓ Synced</span>
                )}
              </span>
            )}
        </div>

        {actions && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
