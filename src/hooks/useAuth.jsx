/**
 * ============================================================
 * AUTHENTICATION HOOK — src/hooks/useAuth.jsx  (v4 — secured)
 * ============================================================
 * Security additions in this version:
 *
 *   1. PASSWORD HASHING
 *      Passwords are verified with PBKDF2-SHA256 (310k iterations).
 *      Legacy plain-text passwords are accepted on first login and
 *      automatically re-hashed before being stored — transparent
 *      migration with no disruption to existing users.
 *
 *   2. SESSION TIMEOUT
 *      15-minute inactivity timeout. 60-second warning shown before
 *      auto-logout. Any mouse/keyboard activity resets the timer.
 *      Critical for shared office computers.
 *
 *   3. ACCOUNT LOCKOUT
 *      5 failed login attempts locks the account for 15 minutes.
 *      Prevents brute-force password attacks.
 *
 *   4. LOGIN HISTORY
 *      Every login attempt (success or failure) is recorded with
 *      timestamp, username, and device info. Shown on dashboard.
 *
 *   5. SESSION TOKEN
 *      Each session gets a unique random token in sessionStorage
 *      to prevent session fixation attacks.
 * ============================================================
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { getMasterDB, getVillageDB, seedMasterAdmin }  from '../db/multiTenantDB.js'
import { hasFullAccess, canAccessRoute, canWrite }      from '../data/roles'
import {
  verifyPassword, hashPassword, isLegacyPassword,
}                                                       from '../security/crypto.js'
import { startAutoSync, getSupabaseConfig } from '../services/cloudSync.js'
import sessionManager, {
  recordLogin, recordFailedAttempt,
  checkAccountLocked, clearFailedAttempts,
}                                                       from '../security/sessionManager.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,             setUser]            = useState(null)
  const [village,          setVillage]         = useState(null)
  const [loading,          setLoading]         = useState(true)
  const [warningSeconds,   setWarningSeconds]  = useState(null) // null = no warning
  const logoutRef = useRef(null)

  // ── Restore session on startup ─────────────────────────────────────────
  useEffect(() => {
    seedMasterAdmin()

    const su = sessionStorage.getItem('lc1_user')
    const sv = sessionStorage.getItem('lc1_village')
    let restored = null

    if (su) {
      try {
        restored = JSON.parse(su)
        setUser(restored)
      } catch { sessionStorage.removeItem('lc1_user') }
    }
    if (sv) {
      try { setVillage(JSON.parse(sv)) }
      catch { sessionStorage.removeItem('lc1_village') }
    }

    setLoading(false)

    // Re-attach session manager if session was restored
    if (restored) {
      sessionManager.onWarning  = (secs) => setWarningSeconds(secs)
      sessionManager.onActivity = ()     => setWarningSeconds(null)
      sessionManager.start(restored, () => {
        // Inactivity timeout — force logout
        if (logoutRef.current) logoutRef.current()
      })
    }

    return () => sessionManager.stop()
  }, [])

  // ── logout ─────────────────────────────────────────────────────────────
  const logout = useCallback((reason = 'manual') => {
    sessionManager.stop()
    setUser(null)
    setVillage(null)
    setWarningSeconds(null)
    sessionStorage.removeItem('lc1_user')
    sessionStorage.removeItem('lc1_village')
    // Store logout reason so login page can show a message
    if (reason === 'timeout') {
      sessionStorage.setItem('lc1_logout_reason', 'timeout')
    }
  }, [])

  // Keep a ref to logout so the session manager's closure always calls the latest version
  logoutRef.current = () => logout('timeout')

  // ── login ──────────────────────────────────────────────────────────────
  async function login(username, password, villageProfile) {
    const vid = villageProfile?.villageId || 'MASTER'

    // ── Check account lockout ──────────────────────────────────────────
    const lockCheck = checkAccountLocked(username, vid)
    if (lockCheck.locked) {
      const mins = Math.ceil(lockCheck.secondsLeft / 60)
      throw new Error(
        `Account locked after too many failed attempts. ` +
        `Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`
      )
    }

    let userRec  = null
    let sourceDB = null  // 'master' or 'village' — for re-hashing

    // ── Try master DB ──────────────────────────────────────────────────
    try {
      const masterDB = await getMasterDB()
      const master   = await masterDB.getFromIndex('systemUsers', 'username', username)
      if (master) {
        const ok = await verifyPassword(password, master.password)
        if (ok) {
          userRec  = { ...master, isMasterAdmin: true }
          sourceDB = 'master'
        }
      }
    } catch { /* master DB unavailable */ }

    // ── Try village DB ────────────────────────────────────────────────
    if (!userRec && villageProfile?.villageId) {
      try {
        const vdb   = await getVillageDB(villageProfile.villageId)
        const vUser = await vdb.getFromIndex('users', 'username', username)
        if (vUser) {
          const ok = await verifyPassword(password, vUser.password)
          if (ok) {
            userRec  = { ...vUser, isMasterAdmin: false }
            sourceDB = 'village'
          }
        }
      } catch { /* village DB unavailable */ }
    }

    // ── Authentication failed ──────────────────────────────────────────
    if (!userRec) {
      recordFailedAttempt(username, vid)
      recordLogin(username, vid, false, 'Wrong credentials')
      // Generic message — do NOT say "wrong password" vs "wrong username"
      // as that gives attackers information about which part is correct
      throw new Error('Invalid username or password')
    }

    // ── Account status check ───────────────────────────────────────────
    if (userRec.userStatus && userRec.userStatus !== 'active') {
      recordLogin(username, vid, false, `Account ${userRec.userStatus}`)
      throw new Error(`This account is marked as "${userRec.userStatus}" and cannot log in. Contact the system administrator.`)
    }

    // ── SUCCESS — clear failed attempts, record login ──────────────────
    clearFailedAttempts(username, vid)
    recordLogin(username, vid, true)

    // ── Re-hash legacy plain-text password transparently ─────────────
    // The user has just proven they know the correct password, so we
    // can safely replace the plain-text stored version with a proper hash.
    if (isLegacyPassword(userRec.password)) {
      try {
        const newHash = await hashPassword(password)
        if (sourceDB === 'master') {
          const masterDB = await getMasterDB()
          await masterDB.put('systemUsers', { ...userRec, password: newHash })
        } else if (sourceDB === 'village' && villageProfile?.villageId) {
          const vdb = await getVillageDB(villageProfile.villageId)
          await vdb.put('users', { ...userRec, password: newHash })
        }
        userRec = { ...userRec, password: newHash }
      } catch { /* re-hash failure is non-fatal — user stays logged in */ }
    }

    // ── Build full user session object ────────────────────────────────
    // Strip the password hash from the session (never store it in sessionStorage)
    const { password: _pw, ...safeUserRec } = userRec
    const fullUser = {
      ...safeUserRec,
      // System admin gets villageId='MASTER' so useVillageDB() knows to use master DB
      villageId:     safeUserRec.isMasterAdmin ? 'MASTER' : (villageProfile?.villageId    || ''),
      villageName:   safeUserRec.isMasterAdmin ? 'All Villages' : (villageProfile?.villageName  || ''),
      parishName:    villageProfile?.parishName   || '',
      subcountyName: villageProfile?.subcountyName|| '',
      countyName:    villageProfile?.countyName   || '',
      districtName:  villageProfile?.districtName || '',
      sessionStart:  new Date().toISOString(),
    }

    setUser(fullUser)
    setVillage(villageProfile || null)
    setWarningSeconds(null)
    sessionStorage.setItem('lc1_user',    JSON.stringify(fullUser))
    sessionStorage.setItem('lc1_village', JSON.stringify(villageProfile || null))
    sessionStorage.removeItem('lc1_logout_reason')

    // ── Start Supabase auto-sync ──────────────────────────────────────────
    const syncCfg = getSupabaseConfig()
    if (syncCfg.enabled && syncCfg.url && syncCfg.anonKey) {
      startAutoSync(fullUser.villageId, () => {})
    }

    // ── Start session manager ─────────────────────────────────────────
    sessionManager.onWarning  = (secs) => setWarningSeconds(secs)
    sessionManager.onActivity = ()     => setWarningSeconds(null)
    sessionManager.start(fullUser, () => {
      if (logoutRef.current) logoutRef.current()
    })

    return fullUser
  }

  // ── RBAC helpers ───────────────────────────────────────────────────────
  const userHasFullAccess  = () => user?.isMasterAdmin || (user ? hasFullAccess(user.role) : false)
  const userCanAccessRoute = (route) => user?.isMasterAdmin || (user ? canAccessRoute(user.role, route) : false)
  const userCanWrite       = (mod)   => user?.isMasterAdmin || (user ? canWrite(user.role, mod) : false)

  return (
    <AuthContext.Provider value={{
      user, village, login, logout, loading,
      warningSeconds,         // null = no warning, 1-60 = countdown
      extendSession: () => sessionManager.extendSession(),
      hasFullAccess:  userHasFullAccess,
      canAccessRoute: userCanAccessRoute,
      canWrite:       userCanWrite,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
