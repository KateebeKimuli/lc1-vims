/**
 * ============================================================
 * CLOUD SYNC ENGINE — src/sync/syncEngine.js
 * ============================================================
 * Handles bidirectional sync between the local IndexedDB database
 * and a remote CouchDB/PouchDB compatible server.
 *
 * HOW IT WORKS:
 *   1. All local writes set syncStatus = 'pending' on the record.
 *   2. When the device goes online, the sync engine wakes up.
 *   3. It fetches all 'pending' records from every table.
 *   4. It pushes them to the remote server via REST API.
 *   5. On success, it marks those records as syncStatus = 'synced'.
 *   6. It also pulls any records from the server that are newer
 *      than the last sync timestamp (for multi-device support).
 *
 * CONFLICT RESOLUTION:
 *   Last-write-wins using the `updatedAt` timestamp. If two devices
 *   edit the same resident record, whichever was saved most recently
 *   becomes the canonical version. This is acceptable for LC1 scale.
 *
 * CONFIGURATION:
 *   Set the server URL in Settings → Cloud sync.
 *   The server should be a CouchDB instance or a Node.js API that
 *   accepts the endpoints defined in SYNC_API below.
 *
 * OFFLINE BEHAVIOUR:
 *   If the device is offline, sync simply does nothing and returns.
 *   All records stay in IndexedDB and will sync when connectivity
 *   is restored. The app shows a "pending sync" badge count.
 *
 * SECURITY:
 *   The sync API requires a bearer token (API key) configured in
 *   Settings. Each village's token is scoped to that village's data
 *   only — so a Kyanja official cannot read Kasangati data.
 * ============================================================
 */

import { getDB, dbGetAll, dbPut } from '../db'

// ── Sync API endpoint paths (relative to base URL) ────────────────────────
// The server implements these endpoints.
const SYNC_API = {
  push:     '/api/sync/push',   // POST: send local records to server
  pull:     '/api/sync/pull',   // GET:  fetch new records from server
  status:   '/api/sync/status', // GET:  check server health
}

// ── Tables that participate in sync (all data tables, not config) ──────────
const SYNC_TABLES = [
  'residents', 'households', 'land', 'cases',
  'meetings',  'births',     'deaths', 'letters',
  'welfare',   'businesses', 'security',
]

// ─────────────────────────────────────────────────────────────────────────
// SYNC STATE (in-memory, not persisted — resets on page refresh)
// A React context (useSyncStatus) reads these values for the UI badge.
// ─────────────────────────────────────────────────────────────────────────
let syncState = {
  isSyncing:    false,     // true while a sync is in progress
  lastSyncAt:   null,      // ISO timestamp of last successful sync
  pendingCount: 0,         // total records waiting to be pushed
  error:        null,      // last sync error message (or null)
  online:       navigator.onLine,
}

// Listeners subscribed to sync state changes (populated by useSyncStatus hook)
const listeners = new Set()

/**
 * notifyListeners()
 * Broadcasts the current syncState to all subscribed React components.
 */
function notifyListeners() {
  listeners.forEach(fn => fn({ ...syncState }))
}

/**
 * subscribeSyncState(callback)
 * Subscribe a React component to sync state changes.
 * Returns an unsubscribe function for use in useEffect cleanup.
 */
export function subscribeSyncState(callback) {
  listeners.add(callback)
  callback({ ...syncState }) // immediately call with current state
  return () => listeners.delete(callback)
}

// ─────────────────────────────────────────────────────────────────────────
// ONLINE / OFFLINE DETECTION
// Listen to browser online/offline events and trigger sync when
// the device comes back online.
// ─────────────────────────────────────────────────────────────────────────

/**
 * initSyncEngine()
 * Call this once on app startup (from main.jsx or App.jsx).
 * Sets up online/offline listeners and runs an initial pending count.
 */
export function initSyncEngine() {
  // Update online status when browser detects network change
  window.addEventListener('online', () => {
    syncState.online = true
    notifyListeners()
    // Auto-trigger sync when coming back online
    syncPendingRecords()
  })

  window.addEventListener('offline', () => {
    syncState.online = false
    notifyListeners()
  })

  // Count pending records on startup so the badge shows immediately
  countPendingRecords()

  // Run sync every 5 minutes if online
  setInterval(() => {
    if (syncState.online) syncPendingRecords()
  }, 5 * 60 * 1000)
}

// ─────────────────────────────────────────────────────────────────────────
// COUNT PENDING RECORDS
// Scans all tables and counts records with syncStatus = 'pending'.
// ─────────────────────────────────────────────────────────────────────────

/**
 * countPendingRecords()
 * Updates syncState.pendingCount with the current number of unsynced records.
 */
export async function countPendingRecords() {
  try {
    const db = await getDB()
    let total = 0

    for (const table of SYNC_TABLES) {
      // Get all records from this table using the syncStatus index
      try {
        const pending = await db.getAllFromIndex(table, 'syncStatus', 'pending')
        total += pending.length
      } catch {
        // Table may not have the syncStatus index — skip
      }
    }

    syncState.pendingCount = total
    notifyListeners()
    return total
  } catch (err) {
    console.warn('Could not count pending records:', err.message)
    return 0
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET SYNC CONFIGURATION FROM SETTINGS
// ─────────────────────────────────────────────────────────────────────────

/**
 * getSyncConfig()
 * Reads server URL, API token, and village ID from IndexedDB settings.
 * Returns null if sync is not configured.
 */
async function getSyncConfig() {
  try {
    const db       = await getDB()
    const urlEntry = await db.get('settings', 'syncServerUrl')
    const tokEntry = await db.get('settings', 'syncApiToken')
    const vidEntry = await db.get('settings', 'villageId')

    const url   = urlEntry?.value
    const token = tokEntry?.value
    const vid   = vidEntry?.value

    // Sync requires both a server URL and a token
    if (!url || !token) return null

    return { url, token, villageId: vid }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PUSH — Send local pending records to the server
// ─────────────────────────────────────────────────────────────────────────

/**
 * pushPendingRecords(config)
 * Collects all records with syncStatus='pending' from every table
 * and sends them to the server in a single batched POST request.
 *
 * On success, marks each sent record as syncStatus='synced'.
 */
async function pushPendingRecords(config) {
  const db      = await getDB()
  const payload = {}  // { tableName: [records...], ... }
  let   total   = 0

  // ── Collect pending records from every table ─────────────────────────
  for (const table of SYNC_TABLES) {
    try {
      const pending = await db.getAllFromIndex(table, 'syncStatus', 'pending')
      if (pending.length > 0) {
        // Tag each record with the village ID so the server can route it
        payload[table] = pending.map(r => ({ ...r, villageId: config.villageId }))
        total += pending.length
      }
    } catch {
      // Table doesn't exist yet or lacks the index — skip
    }
  }

  // Nothing to push
  if (total === 0) return { pushed: 0 }

  // ── Send to server ────────────────────────────────────────────────────
  const response = await fetch(`${config.url}${SYNC_API.push}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      villageId: config.villageId,
      timestamp: new Date().toISOString(),
      records:   payload,
    }),
    // Abort after 30 seconds to avoid hanging on a slow connection
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}: ${await response.text()}`)
  }

  const result = await response.json()

  // ── Mark successfully pushed records as 'synced' ──────────────────────
  for (const [table, records] of Object.entries(payload)) {
    for (const record of records) {
      try {
        await db.put(table, { ...record, syncStatus: 'synced', villageId: config.villageId })
      } catch {
        // If marking fails, the record will simply be retried next sync
      }
    }
  }

  return { pushed: total, serverResult: result }
}

// ─────────────────────────────────────────────────────────────────────────
// PULL — Fetch new/updated records from the server
// ─────────────────────────────────────────────────────────────────────────

/**
 * pullNewRecords(config)
 * Asks the server for any records updated after our last sync timestamp.
 * Merges them into the local IndexedDB (server wins on conflict).
 */
async function pullNewRecords(config) {
  // Use the last sync time, or pull everything from 30 days ago on first sync
  const since = syncState.lastSyncAt
    || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const response = await fetch(
    `${config.url}${SYNC_API.pull}?villageId=${config.villageId}&since=${encodeURIComponent(since)}`,
    {
      headers: { 'Authorization': `Bearer ${config.token}` },
      signal:  AbortSignal.timeout(30000),
    }
  )

  if (!response.ok) {
    throw new Error(`Pull failed: ${response.status}`)
  }

  const { records } = await response.json()
  const db           = await getDB()
  let   pulled       = 0

  // ── Merge server records into local IndexedDB ─────────────────────────
  for (const [table, serverRecords] of Object.entries(records || {})) {
    for (const serverRecord of serverRecords) {
      try {
        // Check if we have a local version
        const local = await db.get(table, serverRecord.id)

        // Merge rule: keep whichever version was updated most recently
        if (!local || new Date(serverRecord.updatedAt) > new Date(local.updatedAt)) {
          await db.put(table, { ...serverRecord, syncStatus: 'synced' })
          pulled++
        }
      } catch {
        // Skip records that fail to merge (e.g. unique constraint on NIN)
      }
    }
  }

  return { pulled }
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN SYNC FUNCTION
// ─────────────────────────────────────────────────────────────────────────

/**
 * syncPendingRecords()
 * The main entry point. Call this to trigger a full sync cycle:
 *   1. Check online + configured
 *   2. Push pending local records
 *   3. Pull new server records
 *   4. Update UI state
 *
 * Safe to call multiple times — won't run if already in progress.
 */
export async function syncPendingRecords() {
  // Don't start a new sync if one is already running
  if (syncState.isSyncing)  return
  // Don't attempt sync if offline
  if (!syncState.online)    { await countPendingRecords(); return }

  // Get server configuration from settings
  const config = await getSyncConfig()
  if (!config) {
    // Sync not configured — just update the pending count for the badge
    await countPendingRecords()
    return
  }

  // ── Begin sync ─────────────────────────────────────────────────────────
  syncState.isSyncing = true
  syncState.error     = null
  notifyListeners()

  try {
    // Push local changes, then pull server changes
    const pushResult = await pushPendingRecords(config)
    const pullResult = await pullNewRecords(config)

    // Update sync state on success
    syncState.lastSyncAt   = new Date().toISOString()
    syncState.pendingCount = 0   // reset — will be recounted below

    console.log(`✓ Sync complete: pushed ${pushResult.pushed}, pulled ${pullResult.pulled}`)

  } catch (err) {
    // Sync failed — record the error for the UI to display
    syncState.error = err.message
    console.warn('Sync failed:', err.message)
  } finally {
    // Always: mark sync as done and recount
    syncState.isSyncing = false
    await countPendingRecords()
    notifyListeners()
  }
}

/**
 * checkServerStatus(url, token)
 * Tests connectivity to the sync server. Used by the Settings page
 * to validate the server URL before saving.
 * Returns { ok: true } on success or { ok: false, error: '...' } on failure.
 */
export async function checkServerStatus(url, token) {
  try {
    const res = await fetch(`${url}${SYNC_API.status}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal:  AbortSignal.timeout(8000),
    })
    if (!res.ok) return { ok: false, error: `Server returned ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
