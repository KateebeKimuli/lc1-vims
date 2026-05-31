/**
 * ============================================================
 * DATABASE LAYER — src/db/index.js  (v2)
 * ============================================================
 * IndexedDB schema for LC1 Village IMS.
 * Version 2 adds: villageId on all records, welfare/businesses/
 * security tables, role-uniqueness helpers, villageProfile store.
 * ============================================================
 */

import { openDB } from 'idb'

const DB_NAME    = 'lc1-vims'
const DB_VERSION = 2   // bump triggers upgrade() for new tables

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {

      // ── RESIDENTS ────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('residents')) {
        const r = db.createObjectStore('residents', { keyPath: 'id' })
        r.createIndex('nin',        'nin',        { unique: true })
        r.createIndex('surname',    'surname')
        r.createIndex('village',    'village')
        r.createIndex('status',     'status')
        r.createIndex('createdAt',  'createdAt')
        r.createIndex('syncStatus', 'syncStatus')
        r.createIndex('villageId',  'villageId')  // which LC1 this resident belongs to
      }

      // ── HOUSEHOLDS ───────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('households')) {
        const h = db.createObjectStore('households', { keyPath: 'id' })
        h.createIndex('headId',    'headId')
        h.createIndex('village',   'village')
        h.createIndex('syncStatus','syncStatus')
        h.createIndex('villageId', 'villageId')
      }

      // ── LAND ─────────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('land')) {
        const l = db.createObjectStore('land', { keyPath: 'id' })
        l.createIndex('ownerId',   'ownerId')
        l.createIndex('plotNumber','plotNumber', { unique: true })
        l.createIndex('village',   'village')
        l.createIndex('syncStatus','syncStatus')
        l.createIndex('villageId', 'villageId')
      }

      // ── CASES ────────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('cases')) {
        const c = db.createObjectStore('cases', { keyPath: 'id' })
        c.createIndex('caseNumber',   'caseNumber',   { unique: true })
        c.createIndex('status',       'status')
        c.createIndex('category',     'category')
        c.createIndex('complainantId','complainantId')
        c.createIndex('syncStatus',   'syncStatus')
        c.createIndex('villageId',    'villageId')
      }

      // ── MEETINGS ─────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('meetings')) {
        const m = db.createObjectStore('meetings', { keyPath: 'id' })
        m.createIndex('date',      'date')
        m.createIndex('type',      'type')
        m.createIndex('syncStatus','syncStatus')
        m.createIndex('villageId', 'villageId')
      }

      // ── BIRTHS ───────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('births')) {
        const b = db.createObjectStore('births', { keyPath: 'id' })
        b.createIndex('childName',  'childName')
        b.createIndex('motherId',   'motherId')
        b.createIndex('dateOfBirth','dateOfBirth')
        b.createIndex('syncStatus', 'syncStatus')
        b.createIndex('villageId',  'villageId')
      }

      // ── DEATHS ───────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('deaths')) {
        const d = db.createObjectStore('deaths', { keyPath: 'id' })
        d.createIndex('residentId', 'residentId')
        d.createIndex('dateOfDeath','dateOfDeath')
        d.createIndex('syncStatus', 'syncStatus')
        d.createIndex('villageId',  'villageId')
      }

      // ── LETTERS ──────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('letters')) {
        const lt = db.createObjectStore('letters', { keyPath: 'id' })
        lt.createIndex('residentId','residentId')
        lt.createIndex('type',      'type')
        lt.createIndex('issuedAt',  'issuedAt')
        lt.createIndex('syncStatus','syncStatus')
        lt.createIndex('villageId', 'villageId')
      }

      // ── WELFARE ──────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('welfare')) {
        const w = db.createObjectStore('welfare', { keyPath: 'id' })
        w.createIndex('residentId', 'residentId')
        w.createIndex('programType','programType')
        w.createIndex('status',     'status')
        w.createIndex('syncStatus', 'syncStatus')
        w.createIndex('villageId',  'villageId')
      }

      // ── BUSINESSES ───────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('businesses')) {
        const bz = db.createObjectStore('businesses', { keyPath: 'id' })
        bz.createIndex('ownerId',  'ownerId')
        bz.createIndex('type',     'type')
        bz.createIndex('status',   'status')
        bz.createIndex('syncStatus','syncStatus')
        bz.createIndex('villageId','villageId')
      }

      // ── SECURITY INCIDENTS ───────────────────────────────────────────
      if (!db.objectStoreNames.contains('security')) {
        const s = db.createObjectStore('security', { keyPath: 'id' })
        s.createIndex('date',      'date')
        s.createIndex('type',      'type')
        s.createIndex('status',    'status')
        s.createIndex('syncStatus','syncStatus')
        s.createIndex('villageId', 'villageId')
      }

      // ── USERS (LC1 committee members) ─────────────────────────────────
      // userStatus: 'active' | 'resigned' | 'deceased'
      // Role uniqueness: only one ACTIVE user per role is allowed.
      if (!db.objectStoreNames.contains('users')) {
        const u = db.createObjectStore('users', { keyPath: 'id' })
        u.createIndex('username',  'username',  { unique: true })
        u.createIndex('role',      'role')
        u.createIndex('villageId', 'villageId')
        u.createIndex('userStatus','userStatus')
      }

      // ── AUDIT LOG ────────────────────────────────────────────────────
      if (!db.objectStoreNames.contains('audit')) {
        const a = db.createObjectStore('audit', { keyPath: 'id', autoIncrement: true })
        a.createIndex('table',    'table')
        a.createIndex('userId',   'userId')
        a.createIndex('action',   'action')
        a.createIndex('timestamp','timestamp')
        a.createIndex('villageId','villageId')
      }

      // ── SETTINGS (key-value store) ───────────────────────────────────
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }

      // ── VILLAGE PROFILE ───────────────────────────────────────────────
      // Stores the full location hierarchy selected at login.
      // Keys stored: villageId, villageName, parishId, parishName,
      //   subcountyId, subcountyName, countyId, countyName,
      //   districtId, districtName, region
      if (!db.objectStoreNames.contains('villageProfile')) {
        db.createObjectStore('villageProfile', { keyPath: 'key' })
      }
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC CRUD HELPERS
// All writes tag records with syncStatus:'pending' so the sync engine
// knows which records need to be pushed to the cloud server.
// ═══════════════════════════════════════════════════════════════════════════

/** Add a new record. Throws ConstraintError if a unique index is violated. */
export async function dbAdd(store, record) {
  const db = await getDB()
  return db.add(store, { ...record, syncStatus:'pending', updatedAt: new Date().toISOString() })
}

/** Insert or replace a record (upsert). Safe for edits. */
export async function dbPut(store, record) {
  const db = await getDB()
  return db.put(store, { ...record, syncStatus:'pending', updatedAt: new Date().toISOString() })
}

/** Fetch one record by primary key. Returns undefined if not found. */
export async function dbGet(store, id) {
  const db = await getDB()
  return db.get(store, id)
}

/** Return all records in a table. */
export async function dbGetAll(store) {
  const db = await getDB()
  return db.getAll(store)
}

/** Return all records matching an index value. */
export async function dbGetByIndex(store, index, value) {
  const db = await getDB()
  return db.getAllFromIndex(store, index, value)
}

/** Hard-delete a record. Prefer status='archived' for important records. */
export async function dbDelete(store, id) {
  const db = await getDB()
  return db.delete(store, id)
}

/** Count total records in a table. */
export async function dbCount(store) {
  const db = await getDB()
  return db.count(store)
}

/** Search all records in a table with a custom filter function. */
export async function dbSearch(store, searchFn) {
  const all = await dbGetAll(store)
  return all.filter(searchFn)
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * logAudit(action, table, recordId, userId, details, villageId)
 * Writes a tamper-evident audit entry. Called on every save/delete.
 */
export async function logAudit(action, table, recordId, userId, details = {}, villageId = '') {
  const db = await getDB()
  await db.add('audit', { action, table, recordId, userId, details, villageId,
    timestamp: new Date().toISOString() })
}

// ═══════════════════════════════════════════════════════════════════════════
// VILLAGE PROFILE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * saveVillageProfile(profile)
 * Persists the selected village location to both villageProfile and settings.
 */
export async function saveVillageProfile(profile) {
  const db = await getDB()
  for (const [key, value] of Object.entries(profile)) {
    await db.put('villageProfile', { key, value })
    await db.put('settings', { key, value })
  }
}

/**
 * getVillageProfile()
 * Returns the current village profile, or null if not configured.
 */
export async function getVillageProfile() {
  const db      = await getDB()
  const entries = await db.getAll('villageProfile')
  if (!entries.length) return null
  const p = {}
  entries.forEach(e => { p[e.key] = e.value })
  return p
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLE UNIQUENESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * isRoleAvailable(roleId, excludeUserId)
 * Returns true if no ACTIVE user currently holds this role.
 * The excludeUserId param lets you skip the user being edited.
 */
export async function isRoleAvailable(roleId, excludeUserId = null) {
  const db      = await getDB()
  const holders = await db.getAllFromIndex('users', 'role', roleId)
  const active  = holders.filter(u => u.userStatus === 'active' && u.id !== excludeUserId)
  return active.length === 0
}

/**
 * getActiveRoleHolder(roleId)
 * Returns the active committee member holding a role, or null.
 */
export async function getActiveRoleHolder(roleId) {
  const db      = await getDB()
  const holders = await db.getAllFromIndex('users', 'role', roleId)
  return holders.find(u => u.userStatus === 'active') || null
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * seedAdmin()
 * Creates the default Chairperson account on first launch.
 * Change the password immediately via Settings → Users.
 */
export async function seedAdmin() {
  const db    = await getDB()
  const count = await db.count('users')
  if (count === 0) {
    await db.add('users', {
      id: 'admin-001', username: 'admin',
      password:   'lc1admin2024',   // ← CHANGE AFTER FIRST LOGIN
      role:       'LC1_CHAIR',
      fullName:   'System Administrator',
      userStatus: 'active',
      createdAt:  new Date().toISOString()
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

/** Returns all headline counts for the dashboard, in parallel. */
export async function getDashboardStats() {
  const [residents, households, land, cases, births, deaths, welfare, businesses, security] =
    await Promise.all([
      dbCount('residents'), dbCount('households'), dbCount('land'),
      dbCount('cases'),     dbCount('births'),     dbCount('deaths'),
      dbCount('welfare'),   dbCount('businesses'), dbCount('security'),
    ])
  const allCases  = await dbGetAll('cases')
  const openCases = allCases.filter(c => c.status === 'open').length
  return { residents, households, land, cases, openCases, births, deaths, welfare, businesses, security }
}
