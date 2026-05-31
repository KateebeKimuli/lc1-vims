/**
 * ============================================================
 * SUPABASE CLOUD SYNC — src/services/cloudSync.js
 * ============================================================
 * Mirrors the IndexedDB structure exactly in Supabase.
 *
 * Each IndexedDB store has a matching Supabase table:
 *   lc1_residents, lc1_households, lc1_land, lc1_cases,
 *   lc1_births, lc1_deaths, lc1_meetings, lc1_letters,
 *   lc1_welfare, lc1_businesses, lc1_security,
 *   lc1_users, lc1_audit, lc1_settings, lc1_villages
 *
 * Every table follows the same pattern:
 *   - id          TEXT PRIMARY KEY
 *   - village_id  TEXT NOT NULL        (for isolation)
 *   - data        JSONB NOT NULL       (full record, mirrors IndexedDB)
 *   - updated_at  TIMESTAMPTZ          (for delta pull sync)
 *   - deleted     BOOLEAN DEFAULT FALSE
 *   - Searchable columns extracted from data (for querying in Supabase)
 *
 * SYNC STRATEGY:
 *   PUSH: read syncStatus='pending' records → upsert to Supabase table
 *         → mark local records syncStatus='synced'
 *   PULL: read records updated_at > last_pull → write to IndexedDB
 *   AUTO: every 30s when online · catches up immediately on reconnect
 * ============================================================
 */

import { getVillageDB, getRegisteredVillages } from '../db/multiTenantDB.js'

// ── Config keys ────────────────────────────────────────────────────────────
const CFG_KEY  = 'lc1_supabase_config'
const STAT_KEY = 'lc1_supabase_status'

// ── Auto sync timer ────────────────────────────────────────────────────────
let autoTimer  = null
let statusCb   = null

// ── Stores and their matching Supabase tables ──────────────────────────────
const STORE_TABLE_MAP = {
  residents:  'lc1_residents',
  households: 'lc1_households',
  land:       'lc1_land',
  cases:      'lc1_cases',
  births:     'lc1_births',
  deaths:     'lc1_deaths',
  meetings:   'lc1_meetings',
  letters:    'lc1_letters',
  welfare:    'lc1_welfare',
  businesses: 'lc1_businesses',
  security:   'lc1_security',
  users:      'lc1_users',
  audit:      'lc1_audit',
  settings:   'lc1_settings',
}

// ── Config ─────────────────────────────────────────────────────────────────
export function getSupabaseConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') }
  catch { return {} }
}

export function setSupabaseConfig(url, anonKey, enabled) {
  localStorage.setItem(CFG_KEY, JSON.stringify({
    url: (url || '').replace(/\/$/, ''),
    anonKey,
    enabled: Boolean(enabled),
  }))
}

// ── Status ─────────────────────────────────────────────────────────────────
function setStatus(s) {
  const full = { ...s, updatedAt: new Date().toISOString() }
  localStorage.setItem(STAT_KEY, JSON.stringify(full))
  if (statusCb) statusCb(full)
}

export function getSyncStatus() {
  try { return JSON.parse(localStorage.getItem(STAT_KEY) || '{"status":"not_configured"}') }
  catch { return { status: 'not_configured' } }
}

// ── HTTP helpers ───────────────────────────────────────────────────────────
function hdrs(anonKey, extra = {}) {
  return {
    'Content-Type':  'application/json',
    'apikey':        anonKey,
    'Authorization': `Bearer ${anonKey}`,
    ...extra,
  }
}

async function sbFetch(url, anonKey, method, body, query = '') {
  const res = await fetch(`${url}/rest/v1/${query}`, {
    method,
    headers: hdrs(anonKey, method !== 'GET' ? { 'Prefer': 'resolution=merge-duplicates,return=minimal' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || err.hint || `Supabase ${method} ${res.status}: ${res.statusText}`)
  }
  return method === 'GET' ? res.json() : null
}

// ── TEST CONNECTION ────────────────────────────────────────────────────────
export async function testSupabaseConnection(url, anonKey) {
  if (!url || !anonKey) return { success: false, error: 'Enter your Supabase URL and anon key first' }
  const base = url.replace(/\/$/, '')
  try {
    // Try to query lc1_residents — if it exists we're fully set up
    const res = await fetch(`${base}/rest/v1/lc1_residents?select=id&limit=1`, {
      headers: hdrs(anonKey),
    })
    if (res.ok) {
      const rows = await res.json()
      return { success: true, message: `Connected ✓  lc1_residents has ${rows.length} rows visible` }
    }
    if (res.status === 404 || res.status === 400) {
      // Table missing — check if we can reach Supabase at all
      const health = await fetch(`${base}/rest/v1/`, { headers: hdrs(anonKey) })
      if (health.ok || health.status === 200) {
        return {
          success: false,
          needsSetup: true,
          error: 'Connected to Supabase ✓ — but tables not created yet. Copy and run the SQL script below.',
        }
      }
    }
    if (res.status === 401) return { success: false, error: 'Invalid API key — check your anon/public key' }
    const err = await res.json().catch(() => ({}))
    return { success: false, error: err.message || `HTTP ${res.status}` }
  } catch (err) {
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))
      return { success: false, error: 'Cannot reach Supabase — check the URL and your internet connection' }
    return { success: false, error: err.message }
  }
}

// ── BUILD ROW for a given store ────────────────────────────────────────────
// Extracts searchable fields into columns + stores full record in data JSONB
function buildRow(store, record, villageId) {
  const base = {
    id:         record.id || record.key || `${villageId}_${Date.now()}`,
    village_id: villageId,
    data:       record,
    updated_at: record.updatedAt || new Date().toISOString(),
    deleted:    record._deleted || false,
  }

  // Add searchable columns per store
  switch (store) {
    case 'residents':
      return { ...base,
        surname:       record.surname      || null,
        first_name:    record.firstName    || null,
        nin:           record.nin          || null,
        status:        record.status       || 'active',
        resident_type: record.residentType || 'permanent',
        sex:           record.sex          || null,
        date_of_birth: record.dateOfBirth  || null,
        nationality:   record.nationality  || 'Ugandan',
        tribe:         record.tribe        || null,
        religion:      record.religion     || null,
      }
    case 'cases':
      return { ...base,
        case_number:      record.caseNumber      || null,
        category:         record.category        || null,
        status:           record.status          || 'open',
        complainant_name: record.complainantName || null,
        date_reported:    record.dateReported    || null,
      }
    case 'land':
      return { ...base,
        plot_number: record.plotNumber || null,
        title_ref:   record.titleRef   || null,
        owner_name:  record.ownerName  || null,
        status:      record.status     || null,
      }
    case 'births':
      return { ...base,
        child_name:    record.childName    || record.childSurname || null,
        date_of_birth: record.dateOfBirth  || null,
        sex:           record.sex || record.childSex || null,
      }
    case 'deaths':
      return { ...base,
        deceased_name: record.deceasedName || null,
        date_of_death: record.dateOfDeath  || null,
      }
    case 'settings':
      return {
        id:         `${villageId}_${record.key}`,
        village_id: villageId,
        setting_key:record.key,
        data:       record,
        updated_at: new Date().toISOString(),
        deleted:    false,
      }
    case 'audit':
      return { ...base,
        id:         `${villageId}_audit_${record.id || Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        action:     record.action    || null,
        store_name: record.table     || null,
        timestamp:  record.timestamp || new Date().toISOString(),
      }
    default:
      return base
  }
}

// ── PUSH: IndexedDB → Supabase ─────────────────────────────────────────────
export async function pushVillage(villageId) {
  const { url, anonKey } = getSupabaseConfig()
  if (!url || !anonKey || !villageId) return { pushed: 0 }

  const db     = await getVillageDB(villageId)
  let   pushed = 0

  for (const [store, table] of Object.entries(STORE_TABLE_MAP)) {
    try {
      const records = await db.getAll(store)
      const pending = records.filter(r => r.syncStatus !== 'synced')
      if (pending.length === 0) continue

      // Build rows for Supabase
      const rows = pending.map(r => buildRow(store, r, villageId))

      // Upsert in batches of 50 (Supabase payload limit)
      for (let i = 0; i < rows.length; i += 50) {
        await sbFetch(url, anonKey, 'POST', rows.slice(i, i + 50), table)
      }

      // Mark as synced in local DB
      for (const record of pending) {
        if (record.id || record.key) {
          try {
            await db.put(store, { ...record, syncStatus: 'synced' })
          } catch {}
        }
      }
      pushed += pending.length
    } catch (err) {
      console.warn(`Push failed for ${store}:`, err.message)
    }
  }
  return { pushed }
}

// ── PULL: Supabase → IndexedDB ─────────────────────────────────────────────
export async function pullVillage(villageId) {
  const { url, anonKey } = getSupabaseConfig()
  if (!url || !anonKey || !villageId) return { pulled: 0 }

  const db       = await getVillageDB(villageId)
  const lastKey  = `lc1_last_pull_${villageId}`
  const lastPull = localStorage.getItem(lastKey) || '1970-01-01T00:00:00.000Z'
  let   pulled   = 0
  let   newest   = lastPull

  for (const [store, table] of Object.entries(STORE_TABLE_MAP)) {
    try {
      const query = `${table}?village_id=eq.${encodeURIComponent(villageId)}&updated_at=gt.${encodeURIComponent(lastPull)}&order=updated_at.asc&limit=200`
      const rows  = await sbFetch(url, anonKey, 'GET', null, query)
      if (!rows || rows.length === 0) continue

      for (const row of rows) {
        try {
          const record = row.data
          if (!record) continue
          if (row.deleted) {
            const key = record.id || record.key
            if (key) await db.delete(store, key).catch(() => {})
          } else {
            await db.put(store, { ...record, syncStatus: 'synced' })
          }
          pulled++
          // Track newest timestamp
          if (row.updated_at && row.updated_at > newest) newest = row.updated_at
        } catch {}
      }
    } catch (err) {
      console.warn(`Pull failed for ${store}:`, err.message)
    }
  }

  if (newest !== lastPull) localStorage.setItem(lastKey, newest)
  return { pulled }
}

// ── FULL SYNC ──────────────────────────────────────────────────────────────
export async function syncVillage(villageId, onProgress) {
  const cfg = getSupabaseConfig()
  if (!cfg.enabled || !cfg.url || !cfg.anonKey) {
    return { pushed: 0, pulled: 0, skipped: true, reason: 'not_configured' }
  }
  if (!villageId || villageId === 'MASTER') {
    return { pushed: 0, pulled: 0, skipped: true, reason: 'no_village_id' }
  }

  try {
    setStatus({ status: 'syncing' })
    if (onProgress) onProgress('pushing')

    const { pushed } = await pushVillage(villageId)

    if (onProgress) onProgress('pulling')
    const { pulled } = await pullVillage(villageId)

    const result = { pushed, pulled, status: 'synced', lastSync: new Date().toISOString() }
    setStatus(result)
    if (onProgress) onProgress('synced', pushed, pulled)
    return result
  } catch (err) {
    const result = { pushed: 0, pulled: 0, status: 'error', error: err.message }
    setStatus(result)
    if (onProgress) onProgress('error', 0, 0, err.message)
    return result
  }
}

// ── AUTO SYNC ──────────────────────────────────────────────────────────────
export function startAutoSync(villageId, onStatus) {
  stopAutoSync()
  statusCb = onStatus
  const cfg = getSupabaseConfig()
  if (!cfg.enabled || !cfg.url || !cfg.anonKey || !villageId) {
    setStatus({ status: 'not_configured' })
    return
  }

  // Initial sync
  syncVillage(villageId, onStatus).catch(() => {})

  // Sync every 30 seconds
  autoTimer = setInterval(() => {
    if (!navigator.onLine) { setStatus({ status: 'offline' }); return }
    syncVillage(villageId, onStatus).catch(() => {})
  }, 30_000)

  // Sync when coming back online
  window.addEventListener('online',  () => syncVillage(villageId, onStatus).catch(() => {}))
  window.addEventListener('offline', () => setStatus({ status: 'offline' }))
}

export function stopAutoSync() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
}
