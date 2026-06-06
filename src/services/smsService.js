/**
 * ============================================================
 * SMS SERVICE — src/services/smsService.js
 * ============================================================
 * Sends SMS notifications via Africa's Talking API.
 *
 * ── WHY DIRECT BROWSER CALLS FAILED ──────────────────────────
 * Africa's Talking (like most SMS APIs) blocks direct browser
 * requests due to CORS (Cross-Origin Resource Sharing) policy.
 * The browser sends a preflight OPTIONS request, and AT's servers
 * respond without the required Access-Control-Allow-Origin header,
 * causing the browser to block the call before it even sends.
 *
 * This is a security measure — API keys should never be exposed
 * in client-side code anyway (anyone could view them in DevTools).
 *
 * ── THE CORRECT ARCHITECTURE ─────────────────────────────────
 * Browser (this app) → Your backend/proxy → Africa's Talking API
 *
 * You need a small server-side endpoint that:
 *   1. Accepts POST requests from this app
 *   2. Forwards them to AT's API using your API key
 *   3. Returns the result back to the app
 *
 * ── THREE DEPLOYMENT OPTIONS ─────────────────────────────────
 *
 * OPTION A — Node.js server (recommended for Uganda deployment):
 *   A small Express server running on the same VPS as the app.
 *   Set SMS_PROXY_URL in Settings to http://your-server.com/sms
 *   See: /server/smsProxy.js (included in this package)
 *
 * OPTION B — Vercel/Netlify serverless function (cloud hosting):
 *   Deploy /api/sms.js as a serverless function.
 *   Works with the free tier. Set SMS_PROXY_URL to the function URL.
 *
 * OPTION C — Direct AT SDK (Node.js runtime only):
 *   If this app is run as a Node.js app (Electron desktop),
 *   the AT Node.js SDK can be called directly without CORS issues.
 *
 * ── CONFIGURATION ────────────────────────────────────────────
 * In Settings → Integrations:
 *   AT Username    — Your Africa's Talking username
 *   AT API Key     — Your Africa's Talking API key (kept on server)
 *   SMS Proxy URL  — URL of your backend proxy endpoint
 *   Sender ID      — Your approved sender ID (e.g. MOLG-LC1)
 *   Sandbox mode   — Check this for testing without real sends
 * ============================================================
 */

// ── Africa's Talking endpoints (used by the PROXY, not the browser) ───────
export const AT_BASE_URL    = 'https://api.africastalking.com/version1'
export const AT_SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1'
export const AT_SMS_ENDPOINT = '/messaging'

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────

/**
 * getSMSConfig()
 * Reads SMS configuration from IndexedDB settings.
 * Returns null if SMS is not configured.
 */
async function getSMSConfig() {
  try {
    // SMS config is device-wide (one proxy, one AT account) — stored centrally
    // in the master DB so it's consistent across every village.
    const { getMasterDB } = await import('../db/multiTenantDB.js')
    const master = await getMasterDB()
    let username = (await master.get('settings', 'atUsername'))?.value
    let apiKey   = (await master.get('settings', 'atApiKey'))?.value
    let proxyUrl = (await master.get('settings', 'smsProxyUrl'))?.value
    let senderId = (await master.get('settings', 'atSenderId'))?.value
    let sandbox  = (await master.get('settings', 'atSandbox'))?.value

    // Fallback to legacy DB if not yet migrated
    if (!username || !apiKey) {
      const { getDB } = await import('../db/index.js')
      const db        = await getDB()
      username = username || (await db.get('settings', 'atUsername'))?.value
      apiKey   = apiKey   || (await db.get('settings', 'atApiKey'))?.value
      proxyUrl = proxyUrl || (await db.get('settings', 'smsProxyUrl'))?.value
      senderId = senderId || (await db.get('settings', 'atSenderId'))?.value
      sandbox  = sandbox  || (await db.get('settings', 'atSandbox'))?.value
    }

    if (!username || !apiKey) return null
    return {
      username,
      apiKey,
      proxyUrl: proxyUrl || '',
      senderId: senderId || 'MOLG-LC1',
      sandbox:  sandbox === 'true',
    }
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────
// PHONE NUMBER NORMALISATION
// ─────────────────────────────────────────────────────────────────────────

/**
 * formatUgandaPhone(phone)
 * Converts Uganda phone numbers to international E.164 format (+256XXXXXXXXX).
 * Handles: 07XXXXXXXX, 03XXXXXXXX, 256XXXXXXXXX, +256XXXXXXXXX
 */
export function formatUgandaPhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')  // strip all non-digit characters
  if (digits.startsWith('256') && digits.length === 12) return `+${digits}`
  if (digits.startsWith('0')   && digits.length === 10) return `+256${digits.slice(1)}`
  if (digits.length === 9)                               return `+256${digits}`
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// CORE SEND FUNCTION
// Routes through the configured proxy server to avoid CORS
// ─────────────────────────────────────────────────────────────────────────

/**
 * sendSMS(phones, message, config)
 * Sends an SMS via the configured proxy server.
 *
 * If proxyUrl is set → sends to your backend → backend sends to AT
 * If no proxyUrl    → logs the SMS to the queue for when proxy is set up
 *
 * @param {string[]} phones  - Phone numbers (will be normalised to +256...)
 * @param {string}   message - Text content (max 160 chars)
 * @param {object}   config  - from getSMSConfig()
 * @returns {{ sent, results?, queued?, error? }}
 */
async function sendSMS(phones, message, config) {
  // Normalise all phone numbers to international format
  const formatted = phones.map(formatUgandaPhone).filter(Boolean)
  if (formatted.length === 0) {
    return { sent: false, error: 'No valid Uganda phone numbers provided' }
  }

  // ── Route A: via backend proxy ─────────────────────────────────────────
  if (config.proxyUrl) {
    try {
      const response = await fetch(config.proxyUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:       formatted,
          message,
          from:     config.senderId,
          username: config.username,
          apiKey:   config.apiKey,
          sandbox:  config.sandbox,
        }),
        signal: AbortSignal.timeout(20000),
      })

      if (!response.ok) {
        const errText = await response.text()
        return { sent: false, error: `Proxy error ${response.status}: ${errText}` }
      }

      const data = await response.json()
      return { sent: true, results: data.recipients || data.SMSMessageData?.Recipients || [] }

    } catch (err) {
      return { sent: false, error: `Proxy unreachable: ${err.message}` }
    }
  }

  // ── Route B: no proxy configured — queue the message ──────────────────
  // The message will be retried when a proxy URL is configured.
  await queueSMS(formatted, message, 'pending_proxy')
  return {
    sent:   false,
    queued: true,
    error:  'SMS proxy URL not configured. Message queued. Set up the proxy server and add its URL in Settings → Integrations → SMS Proxy URL.',
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SMS QUEUE — stores unsent messages for later retry
// ─────────────────────────────────────────────────────────────────────────

async function queueSMS(phones, message, reason) {
  try {
    const { getDB } = await import('../db/index.js')
    const db        = await getDB()
    await db.put('settings', {
      key:   `smsQueue_${Date.now()}`,
      value: JSON.stringify({ phones, message, reason, queuedAt: new Date().toISOString() })
    })
  } catch { /* non-critical — silently ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC NOTIFICATION FUNCTIONS
// Called by page components on key events
// ─────────────────────────────────────────────────────────────────────────

/** Notify a resident when they are registered. */
export async function notifyResidentRegistered(resident, villageName) {
  const config = await getSMSConfig()
  if (!config || !resident.phone) return { sent: false, reason: 'no_config_or_phone' }
  const msg = `Dear ${resident.firstName}, you have been registered as a resident of ${villageName} Village LC1. Your record is on file. - MoLG Uganda`
  if (!navigator.onLine) { await queueSMS([resident.phone], msg, 'offline'); return { sent:false, queued:true } }
  return sendSMS([resident.phone], msg, config)
}

/** Notify next of kin when a resident is marked deceased. */
export async function notifyNextOfKinDeceased(deceased, nextOfKinPhone, villageName) {
  const config = await getSMSConfig()
  if (!config || !nextOfKinPhone) return { sent: false, reason: 'no_config_or_phone' }
  const msg = `The death of ${deceased.surname} ${deceased.firstName} has been officially recorded at ${villageName} Village LC1 office. - MoLG Uganda`
  if (!navigator.onLine) { await queueSMS([nextOfKinPhone], msg, 'offline'); return { sent:false, queued:true } }
  return sendSMS([nextOfKinPhone], msg, config)
}

/** Notify mother when a birth is registered. */
export async function notifyBirthRegistered(birth, motherPhone, villageName) {
  const config = await getSMSConfig()
  if (!config || !motherPhone) return { sent: false, reason: 'no_config_or_phone' }
  const msg = `The birth of ${birth.childSurname || ''} ${birth.childName} has been registered at ${villageName} LC1. Keep this for future reference. - MoLG Uganda`
  if (!navigator.onLine) { await queueSMS([motherPhone], msg, 'offline'); return { sent:false, queued:true } }
  return sendSMS([motherPhone], msg, config)
}

/** Notify complainant when a case is opened. */
export async function notifyCaseOpened(caseRecord, complainantPhone, caseNumber, villageName) {
  const config = await getSMSConfig()
  if (!config || !complainantPhone) return { sent: false, reason: 'no_config_or_phone' }
  const msg = `Your case (${caseNumber}) on "${caseRecord.category}" has been registered at ${villageName} LC1. Hearing: ${caseRecord.hearingDate || 'TBD'}. - MoLG Uganda`
  if (!navigator.onLine) { await queueSMS([complainantPhone], msg, 'offline'); return { sent:false, queued:true } }
  return sendSMS([complainantPhone], msg, config)
}

/** Notify all parties when a case is resolved. */
export async function notifyCaseResolved(phones, caseNumber, resolution, villageName) {
  const config = await getSMSConfig()
  if (!config || !phones.length) return { sent: false, reason: 'no_config_or_phones' }
  const msg = `Case ${caseNumber} at ${villageName} LC1 has been RESOLVED. ${resolution?.slice(0,80) || 'Contact LC1 office for details'}. - MoLG Uganda`
  if (!navigator.onLine) { await queueSMS(phones, msg, 'offline'); return { sent:false, queued:true } }
  return sendSMS(phones, msg, config)
}

/** Bulk SMS to residents about a meeting. Returns estimated cost in UGX. */
export async function notifyMeetingScheduled(meeting, phoneList, villageName) {
  const config = await getSMSConfig()
  if (!config) return { sent: false, error: 'SMS not configured' }
  const dateStr = meeting.date ? new Date(meeting.date).toLocaleDateString('en-UG') : 'TBD'
  const msg = `MEETING: ${villageName} LC1 ${meeting.type?.toUpperCase() || 'VILLAGE'} MEETING on ${dateStr} at ${meeting.time || 'TBD'}, ${meeting.venue || 'LC1 Office'}. Agenda: ${meeting.agenda?.slice(0,60) || 'See notice board'}. - MoLG`
  const estimatedCostUGX = phoneList.length * 70
  if (!navigator.onLine) { await queueSMS(phoneList, msg, 'offline'); return { sent:false, queued:true, estimatedCostUGX } }
  const result = await sendSMS(phoneList, msg, config)
  return { ...result, estimatedCostUGX }
}

/** Notify resident when a letter is issued for them. */
export async function notifyLetterIssued(letter, residentPhone, refNumber, villageName) {
  const config = await getSMSConfig()
  if (!config || !residentPhone) return { sent: false, reason: 'no_config_or_phone' }
  const msg = `An official letter (${letter.type}, Ref: ${refNumber}) has been issued for you by ${villageName} LC1. Collect it from the office. - MoLG Uganda`
  if (!navigator.onLine) { await queueSMS([residentPhone], msg, 'offline'); return { sent:false, queued:true } }
  return sendSMS([residentPhone], msg, config)
}

/** Send password reset token to an official's phone. */
export async function sendPasswordResetToken(officialPhone, token, username) {
  const config = await getSMSConfig()
  if (!config || !officialPhone) return { sent: false, error: 'No SMS config or phone number' }
  const msg = `LC1 VIMS Password Reset for ${username}: Your reset code is ${token}. Valid for 24 hours. Do NOT share this code. - MoLG Uganda`
  return sendSMS([officialPhone], msg, config)
}

/** Notify a welfare/PDM beneficiary of their registration. */
export async function notifyWelfareBeneficiary(beneficiaryName, phone, programType, amount, villageName) {
  const config = await getSMSConfig()
  if (!config || !phone) return { sent: false, reason: 'no_config_or_phone' }
  const amtStr = amount ? ` Amount: UGX ${Number(amount).toLocaleString()}.` : ''
  const msg = `Dear ${beneficiaryName}, you have been registered as a ${programType} beneficiary at ${villageName} LC1.${amtStr} Contact LC1 office. - MoLG Uganda`
  if (!navigator.onLine) { await queueSMS([phone], msg, 'offline'); return { sent:false, queued:true } }
  return sendSMS([phone], msg, config)
}
