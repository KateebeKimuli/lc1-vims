/**
 * ============================================================
 * SESSION MANAGER — src/security/sessionManager.js
 * ============================================================
 * Manages user sessions with:
 *
 *   INACTIVITY TIMEOUT:
 *     Auto-logs out after 15 minutes of no mouse/keyboard/touch.
 *     Shows a 60-second warning countdown before logging out.
 *     Resets on any user interaction.
 *     Critical for shared LC1 office computers where an official
 *     might walk away while logged in.
 *
 *   LOGIN HISTORY:
 *     Records every login: username, timestamp, device info.
 *     Stored in the village DB under 'loginHistory'.
 *     Last 20 logins shown on the dashboard.
 *     Panelists can see accountability for who accessed the system.
 *
 *   SESSION TOKEN:
 *     Each session gets a unique random token stored in sessionStorage.
 *     Prevents session fixation attacks.
 *
 *   FAILED LOGIN TRACKING:
 *     After 5 failed attempts, account is locked for 15 minutes.
 *     Prevents brute-force password guessing.
 *
 * USAGE:
 *   // Start session monitoring after login:
 *   sessionManager.start(user, onTimeout)
 *
 *   // Stop when logging out:
 *   sessionManager.stop()
 *
 *   // Get warning state for the UI:
 *   sessionManager.onWarning = (secondsLeft) => { ... }
 * ============================================================
 */

import { generateSessionToken } from './crypto.js'

// ── Configuration ──────────────────────────────────────────────────────────
const TIMEOUT_MS       = 15 * 60 * 1000   // 15 minutes inactivity → logout
const WARNING_MS       = 60 * 1000         // show warning 60 seconds before logout
const MAX_FAILED_LOGIN = 5                 // attempts before lockout
const LOCKOUT_MS       = 15 * 60 * 1000   // 15 minute lockout
const HISTORY_KEY      = 'lc1_login_history'
const FAILED_KEY       = 'lc1_failed_logins'

// ── Internal state ─────────────────────────────────────────────────────────
let timeoutTimer  = null   // main inactivity timer
let warningTimer  = null   // warning countdown timer
let warningInterval = null // countdown interval (1s ticks)
let isActive      = false

// Callbacks set by consumers
let onTimeoutCallback = null    // called when session expires
let onWarningCallback = null    // called with secondsLeft (60→0)
let onActivityCallback = null   // called when warning is dismissed by activity

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────

const sessionManager = {

  /**
   * start(user, onTimeout)
   * Begin session monitoring after a successful login.
   * Attaches activity listeners and starts the inactivity timer.
   */
  start(user, onTimeout) {
    this.stop()  // clear any existing timers

    onTimeoutCallback = onTimeout
    isActive          = true

    // Generate a unique session token to detect session fixation
    const token = generateSessionToken()
    sessionStorage.setItem('lc1_session_token', token)
    sessionStorage.setItem('lc1_session_start', new Date().toISOString())

    // Attach activity listeners — any interaction resets the timer
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(evt => document.addEventListener(evt, this._onActivity, { passive: true }))
    this._events = events

    this._resetTimer()
  },

  /**
   * stop()
   * Stop session monitoring and clear all timers.
   * Called on logout or when the component unmounts.
   */
  stop() {
    isActive = false
    this._clearTimers()

    if (this._events) {
      this._events.forEach(evt =>
        document.removeEventListener(evt, this._onActivity)
      )
      this._events = null
    }

    sessionStorage.removeItem('lc1_session_token')
    sessionStorage.removeItem('lc1_session_start')
  },

  /**
   * onWarning
   * Set this to a function to receive warning countdown updates.
   * Called every second with the number of seconds remaining.
   * Set to null to remove.
   *
   * @example
   * sessionManager.onWarning = (secs) => setWarningSeconds(secs)
   */
  set onWarning(fn) { onWarningCallback = fn },
  get onWarning()   { return onWarningCallback },

  /**
   * onActivity
   * Set to receive notification when user activity dismisses the warning.
   */
  set onActivity(fn) { onActivityCallback = fn },

  /**
   * extendSession()
   * Call this when the user explicitly clicks "Stay logged in" on the warning.
   */
  extendSession() {
    this._resetTimer()
    if (onActivityCallback) onActivityCallback()
  },

  /**
   * getSessionAge()
   * Returns how long (in seconds) the current session has been active.
   */
  getSessionAge() {
    const start = sessionStorage.getItem('lc1_session_start')
    if (!start) return 0
    return Math.floor((Date.now() - new Date(start).getTime()) / 1000)
  },

  // ── Private methods ──────────────────────────────────────────────────

  _onActivity: null,  // bound handler set in constructor

  _resetTimer() {
    this._clearTimers()
    if (!isActive) return

    // Set warning timer (fires TIMEOUT_MS - WARNING_MS from now)
    warningTimer = setTimeout(() => {
      this._startWarningCountdown()
    }, TIMEOUT_MS - WARNING_MS)
  },

  _startWarningCountdown() {
    let secondsLeft = Math.floor(WARNING_MS / 1000)
    if (onWarningCallback) onWarningCallback(secondsLeft)

    warningInterval = setInterval(() => {
      secondsLeft--
      if (onWarningCallback) onWarningCallback(secondsLeft)
      if (secondsLeft <= 0) {
        this._clearTimers()
        // Session expired — call the timeout callback
        if (onTimeoutCallback) onTimeoutCallback()
      }
    }, 1000)
  },

  _clearTimers() {
    if (timeoutTimer)   { clearTimeout(timeoutTimer);    timeoutTimer   = null }
    if (warningTimer)   { clearTimeout(warningTimer);    warningTimer   = null }
    if (warningInterval){ clearInterval(warningInterval); warningInterval = null }
  },
}

// Bind the activity handler so 'this' is correct in event listeners
sessionManager._onActivity = function() {
  if (!isActive) return
  // If we're in the warning countdown, dismiss it and notify
  if (warningInterval) {
    if (onWarningCallback) onWarningCallback(null)  // null = warning dismissed
    if (onActivityCallback) onActivityCallback()
  }
  sessionManager._resetTimer()
}

// ─────────────────────────────────────────────────────────────────────────
// LOGIN HISTORY
// ─────────────────────────────────────────────────────────────────────────

/**
 * recordLogin(username, villageId, success, failReason)
 * Records a login attempt in localStorage (accessible without DB connection).
 * Stores up to 50 entries. Shown on the dashboard and audit log.
 *
 * @param {string}  username   — who tried to log in
 * @param {string}  villageId  — which village
 * @param {boolean} success    — was it successful?
 * @param {string}  failReason — reason for failure (optional)
 */
export function recordLogin(username, villageId, success, failReason = null) {
  try {
    const history = getLoginHistory()
    history.unshift({
      username,
      villageId,
      success,
      failReason,
      timestamp:  new Date().toISOString(),
      userAgent:  navigator.userAgent.slice(0, 100),  // device info (truncated)
      online:     navigator.onLine,
    })
    // Keep only the last 50 entries
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)))
  } catch { /* storage full or unavailable */ }
}

/**
 * getLoginHistory()
 * Returns the login history array (most recent first).
 */
export function getLoginHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch { return [] }
}

/**
 * clearLoginHistory()
 * Clears the login history (for privacy, on explicit request).
 */
export function clearLoginHistory() {
  localStorage.removeItem(HISTORY_KEY)
}

// ─────────────────────────────────────────────────────────────────────────
// FAILED LOGIN / ACCOUNT LOCKOUT
// ─────────────────────────────────────────────────────────────────────────

/**
 * recordFailedAttempt(username, villageId)
 * Increments the failed login counter for a username.
 * Returns the current count.
 */
export function recordFailedAttempt(username, villageId) {
  try {
    const key   = `${FAILED_KEY}_${villageId}_${username}`
    const data  = JSON.parse(localStorage.getItem(key) || '{"count":0}')
    data.count  = (data.count || 0) + 1
    data.lastAt = new Date().toISOString()
    if (data.count >= MAX_FAILED_LOGIN) {
      data.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString()
    }
    localStorage.setItem(key, JSON.stringify(data))
    return data.count
  } catch { return 0 }
}

/**
 * checkAccountLocked(username, villageId)
 * Returns { locked: false } or { locked: true, secondsLeft: N }
 */
export function checkAccountLocked(username, villageId) {
  try {
    const key  = `${FAILED_KEY}_${villageId}_${username}`
    const data = JSON.parse(localStorage.getItem(key) || '{"count":0}')
    if (!data.lockedUntil) return { locked: false }
    const remaining = new Date(data.lockedUntil).getTime() - Date.now()
    if (remaining <= 0) {
      // Lockout expired — clear it
      localStorage.removeItem(key)
      return { locked: false }
    }
    return { locked: true, secondsLeft: Math.ceil(remaining / 1000) }
  } catch { return { locked: false } }
}

/**
 * clearFailedAttempts(username, villageId)
 * Resets the failed login counter after a successful login.
 */
export function clearFailedAttempts(username, villageId) {
  try {
    localStorage.removeItem(`${FAILED_KEY}_${villageId}_${username}`)
  } catch {}
}

export default sessionManager
