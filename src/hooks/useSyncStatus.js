/**
 * ============================================================
 * SYNC STATUS HOOK — src/hooks/useSyncStatus.js
 * ============================================================
 * React hook that subscribes any component to the real-time
 * sync engine state. Used by:
 *   - The sidebar badge (shows pending count)
 *   - The dashboard (shows last sync time)
 *   - The settings page (shows sync errors)
 *
 * Usage:
 *   const { online, isSyncing, pendingCount, lastSyncAt, error } = useSyncStatus()
 * ============================================================
 */

import { useState, useEffect } from 'react'
import { subscribeSyncState, syncPendingRecords } from '../sync/syncEngine'

/**
 * useSyncStatus()
 * Returns the current sync state object:
 *   online        — true if browser has network connectivity
 *   isSyncing     — true while a sync is in progress
 *   pendingCount  — number of records waiting to be pushed
 *   lastSyncAt    — ISO timestamp of last successful sync (or null)
 *   error         — last sync error message (or null)
 *   triggerSync   — function to manually trigger a sync
 */
export function useSyncStatus() {
  // Initial state before the sync engine sends its first update
  const [state, setState] = useState({
    online:       navigator.onLine,
    isSyncing:    false,
    pendingCount: 0,
    lastSyncAt:   null,
    error:        null,
  })

  useEffect(() => {
    // Subscribe to sync engine state changes.
    // subscribeSyncState immediately calls setState with the current state,
    // then calls it again whenever the engine updates.
    const unsubscribe = subscribeSyncState(newState => setState(newState))

    // Clean up subscription when the component unmounts
    return unsubscribe
  }, [])

  return {
    ...state,
    triggerSync: syncPendingRecords,  // expose manual sync trigger
  }
}
