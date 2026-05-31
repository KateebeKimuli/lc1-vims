/**
 * ============================================================
 * VILLAGE-SCOPED DATABASE UTILITY — src/db/villageDB.js
 * ============================================================
 * THE PROBLEM THIS SOLVES:
 *   Every village must have its own completely isolated database.
 *   The old code used a single shared IndexedDB called 'lc1-vims'
 *   for all villages, so logging in as any village showed all
 *   other villages' data on the dashboard and in every list.
 *
 * THE SOLUTION:
 *   This module provides a useVillageDB() hook that returns
 *   database helper functions already scoped to the current
 *   user's village. Every page imports these helpers instead
 *   of the legacy dbGetAll/dbAdd/etc from '../db'.
 *
 *   Database naming:
 *     lc1-village-V024   ← Kyanja Central village data
 *     lc1-village-V025   ← Kyanja North village data
 *     lc1-village-V026   ← another village
 *     lc1-master         ← system admin + village registry
 *
 *   Each village database is completely isolated. Logging into
 *   Kyanja Central only ever reads/writes lc1-village-V024.
 *   Logging into Kyanja North only reads/writes lc1-village-V025.
 *   They never share data.
 *
 * USAGE IN A PAGE COMPONENT:
 *
 *   import { useVillageDB } from '../db/villageDB'
 *
 *   export default function CasesPage() {
 *     const db = useVillageDB()
 *     useEffect(() => { db.getAll('cases').then(setRecords) }, [db.villageId])
 *     async function save(record) { await db.put('cases', record) }
 *   }
 *
 * The hook returns these functions, all pre-scoped to the village:
 *   db.getAll(store)              — get every record in a table
 *   db.get(store, id)             — get one record by id
 *   db.add(store, record)         — insert new record
 *   db.put(store, record)         — upsert (insert or replace)
 *   db.delete(store, id)          — delete a record
 *   db.count(store)               — count records in a table
 *   db.getByIndex(store, idx, v)  — get records by index value
 *   db.stats()                    — dashboard statistics for this village
 *   db.villageId                  — the current village ID string
 *   db.villageName                — the current village name string
 *   db.audit(action, table, id, details) — write audit log entry
 * ============================================================
 */

import { useCallback, useMemo } from 'react'
import { hashAuditEntry }       from '../security/crypto.js'
import { useAuth }              from '../hooks/useAuth'
import { getVillageDB }         from './multiTenantDB'
import { getDB }                from './index'

// ── Internal: open the right DB for the current session ───────────────────
/**
 * openDB(villageId)
 * Returns the correct IndexedDB instance:
 *   - If villageId is set and not MASTER → village-specific DB
 *   - Otherwise → legacy shared DB (fallback for default admin)
 */
async function openDB(villageId) {
  if (villageId && villageId !== 'MASTER') {
    return getVillageDB(villageId)
  }
  return getDB()
}

// ── Internal: tag a record for cloud sync ─────────────────────────────────
function withSync(record, villageId) {
  return {
    ...record,
    villageId:  villageId || '',
    syncStatus: 'pending',
    updatedAt:  new Date().toISOString(),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// useVillageDB() HOOK
// Call this at the top of any page component.
// Returns stable function references (via useCallback/useMemo) so they
// are safe to use in useEffect dependency arrays.
// ═══════════════════════════════════════════════════════════════════════════

export function useVillageDB() {
  const { user } = useAuth()
  const villageId   = user?.villageId   || ''
  const villageName = user?.villageName || ''
  const userId      = user?.id          || ''

  // getAll — fetch every record in a store for this village
  const getAll = useCallback(async (store) => {
    const db = await openDB(villageId)
    return db.getAll(store)
  }, [villageId])

  // get — fetch one record by primary key
  const get = useCallback(async (store, id) => {
    const db = await openDB(villageId)
    return db.get(store, id)
  }, [villageId])

  // add — insert a new record
  const add = useCallback(async (store, record) => {
    const db = await openDB(villageId)
    return db.add(store, withSync(record, villageId))
  }, [villageId])

  // put — upsert (insert or replace)
  const put = useCallback(async (store, record) => {
    const db = await openDB(villageId)
    return db.put(store, withSync(record, villageId))
  }, [villageId])

  // del — delete a record
  const del = useCallback(async (store, id) => {
    const db = await openDB(villageId)
    return db.delete(store, id)
  }, [villageId])

  // count — count records in a store
  const count = useCallback(async (store) => {
    const db = await openDB(villageId)
    return db.count(store)
  }, [villageId])

  // getByIndex — get records matching an index value
  const getByIndex = useCallback(async (store, index, value) => {
    const db = await openDB(villageId)
    return db.getAllFromIndex(store, index, value)
  }, [villageId])

  // audit — write a tamper-evident chained audit log entry
  const audit = useCallback(async (action, table, recordId, details = {}) => {
    try {
      const db = await openDB(villageId)

      // Get the last audit entry to chain with
      const allAudit = await db.getAll('audit')
      const lastEntry  = allAudit.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)).pop()
      const prevHash   = lastEntry?.chainHash || 'GENESIS'

      const entry = {
        action, table, recordId,
        userId,
        villageId,
        details,
        timestamp: new Date().toISOString(),
      }

      // Compute the chain hash for this entry
      const chainHash = await hashAuditEntry(entry, prevHash)

      await db.add('audit', { ...entry, chainHash })
    } catch { /* audit failure is non-critical */ }
  }, [villageId, userId])

  // stats — dashboard statistics scoped to this village only
  const stats = useCallback(async () => {
    const db = await openDB(villageId)

    // Run all counts in parallel
    const [
      households, land, births, deaths,
      welfare, businesses, security, meetings, letters,
      allResidents, allCases,
    ] = await Promise.all([
      db.count('households'), db.count('land'),
      db.count('births'),     db.count('deaths'),
      db.count('welfare'),    db.count('businesses'), db.count('security'),
      db.count('meetings'),   db.count('letters'),
      db.getAll('residents'), db.getAll('cases'),
    ])

    // Resident counts — split by status
    // active   = living here (permanent or tenant)
    // deceased = died; kept for records but NOT in active count
    // migrated = left the village; NOT in active count
    const activeResidents   = allResidents.filter(r => r.status === 'active'   || r.residentType === 'tenant')
    const deceasedResidents = allResidents.filter(r => r.status === 'deceased')
    const migratedResidents = allResidents.filter(r => r.status === 'migrated')
    const openCases         = allCases.filter(c => c.status === 'open').length

    return {
      residents:   activeResidents.length,
      deceased:    deceasedResidents.length,
      migrated:    migratedResidents.length,
      totalPeople: allResidents.length,
      male:        activeResidents.filter(r => r.sex === 'Male').length,
      female:      activeResidents.filter(r => r.sex === 'Female').length,
      households,
      land,
      births,
      deaths,
      cases:       allCases.length,
      openCases,
      welfare,
      businesses,
      security,
      meetings,
      letters,
    }
  }, [villageId])

  // Return a stable object — useMemo so the reference doesn't change on every render
  return useMemo(() => ({
    villageId,
    villageName,
    getAll,
    get,
    add,
    put,
    delete: del,
    count,
    getByIndex,
    audit,
    stats,
  }), [villageId, villageName, getAll, get, add, put, del, count, getByIndex, audit, stats])
}
