/**
 * ============================================================
 * FULL DATA PUSH TO SUPABASE — src/services/dataMigration.js
 * ============================================================
 * Reads ALL data from every village's local IndexedDB and
 * upserts it to Supabase in one go.
 *
 * Called from Settings → Sync & Backup → "Push all data now"
 * ============================================================
 */

import { getRegisteredVillages, getVillageDB } from '../db/multiTenantDB.js'
import { getSupabaseConfig }                   from './cloudSync.js'

const STORES = [
  'residents','households','land','cases','births','deaths',
  'meetings','letters','welfare','businesses','security',
  'users','audit','settings',
]

const STORE_TABLE = {
  residents: 'lc1_residents', households: 'lc1_households',
  land:      'lc1_land',      cases:      'lc1_cases',
  births:    'lc1_births',    deaths:     'lc1_deaths',
  meetings:  'lc1_meetings',  letters:    'lc1_letters',
  welfare:   'lc1_welfare',   businesses: 'lc1_businesses',
  security:  'lc1_security',  users:      'lc1_users',
  audit:     'lc1_audit',     settings:   'lc1_settings',
}

function hdrs(key) {
  return {
    'Content-Type':  'application/json',
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Prefer':        'resolution=merge-duplicates,return=minimal',
  }
}

function buildRow(store, record, villageId) {
  const base = {
    id:         record.id || record.key || `${villageId}_${store}_${Math.random().toString(36).slice(2)}`,
    village_id: villageId,
    data:       record,
    updated_at: record.updatedAt || new Date().toISOString(),
    deleted:    record._deleted || false,
  }
  switch (store) {
    case 'residents':  return { ...base, surname: record.surname||null, first_name: record.firstName||null, nin: record.nin||null, status: record.status||'active', resident_type: record.residentType||'permanent', sex: record.sex||null, date_of_birth: record.dateOfBirth||null, nationality: record.nationality||'Ugandan', tribe: record.tribe||null, religion: record.religion||null }
    case 'cases':      return { ...base, case_number: record.caseNumber||null, category: record.category||null, status: record.status||'open', complainant_name: record.complainantName||null, date_reported: record.dateReported||null }
    case 'land':       return { ...base, plot_number: record.plotNumber||null, title_ref: record.titleRef||null, owner_name: record.ownerName||null, status: record.status||null }
    case 'births':     return { ...base, child_name: record.childName||null, child_surname: record.childSurname||null, date_of_birth: record.dateOfBirth||null, sex: record.sex||record.childSex||null }
    case 'deaths':     return { ...base, deceased_name: record.deceasedName||null, date_of_death: record.dateOfDeath||null }
    case 'settings':   return { id: `${villageId}_${record.key}`, village_id: villageId, setting_key: record.key, data: record, updated_at: new Date().toISOString(), deleted: false }
    case 'audit':      return { ...base, id: `${villageId}_audit_${record.id||Date.now()}_${Math.random().toString(36).slice(2,7)}`, action: record.action||null, store_name: record.table||null, timestamp: record.timestamp||new Date().toISOString() }
    default:           return base
  }
}

async function upsertBatch(url, key, table, rows) {
  if (rows.length === 0) return
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: hdrs(key),
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`${table}: ${err.message || err.hint || res.statusText}`)
  }
}

/**
 * pushAllDataToSupabase(onProgress)
 * Reads every village from the registry and pushes all stores.
 * @param {Function} onProgress - called with (message, pushed, total)
 * @returns {{ total, byVillage: {} }}
 */
export async function pushAllDataToSupabase(onProgress) {
  const { url, anonKey } = getSupabaseConfig()
  if (!url || !anonKey) throw new Error('Supabase not configured — enter URL and key in Settings first')

  const villages = await getRegisteredVillages()
  if (villages.length === 0) throw new Error('No villages registered on this device')

  let grandTotal = 0
  const byVillage = {}

  for (const village of villages) {
    const { villageId, villageName } = village
    if (onProgress) onProgress(`Processing ${villageName}…`, grandTotal)

    try {
      const vdb = await getVillageDB(villageId)
      let villageTotal = 0

      for (const store of STORES) {
        const table = STORE_TABLE[store]
        try {
          const records = await vdb.getAll(store)
          if (records.length === 0) continue

          const rows = records.map(r => buildRow(store, r, villageId))

          // Upsert in batches of 50
          for (let i = 0; i < rows.length; i += 50) {
            await upsertBatch(url, anonKey, table, rows.slice(i, i + 50))
          }
          villageTotal += records.length
          grandTotal   += records.length
          if (onProgress) onProgress(`${villageName} → ${store} (${records.length})`, grandTotal)
        } catch (err) {
          console.warn(`Skipped ${villageId}/${store}:`, err.message)
        }
      }
      byVillage[villageName] = villageTotal
    } catch (err) {
      byVillage[villageName] = `Error: ${err.message}`
    }
  }

  return { total: grandTotal, byVillage }
}
