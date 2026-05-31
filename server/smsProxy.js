/**
 * ============================================================
 * LC1 VIMS SMS PROXY SERVER — server/smsProxy.js
 * ============================================================
 * Bridges the LC1 browser app to Africa's Talking API.
 *
 * HOW TO START:
 *   cd server
 *   npm install
 *   npm start
 *   → You should see: ✓ SMS Proxy running on port 3001
 *
 * Then in the LC1 app:
 *   Settings → 📱 SMS & APIs tab → SMS Proxy URL → http://localhost:3001/sms
 *
 * CREDENTIALS:
 *   Your Africa's Talking username and API key are entered in the
 *   LC1 app (Settings → SMS & APIs) and sent to this proxy with
 *   each request. You do NOT need a .env file unless you want to
 *   set defaults. The credentials travel only between your browser
 *   and this local server — they never go anywhere else.
 *
 * OPTIONAL .env defaults (create a .env file here if you want):
 *   AT_USERNAME=yourUsername
 *   AT_API_KEY=yourApiKey
 *   PORT=3001
 * ============================================================
 */

require('dotenv').config()   // loads .env if it exists — optional

const express        = require('express')
const cors           = require('cors')
const AfricasTalking = require('africastalking')

const PORT = process.env.PORT || 3001

const app = express()
app.use(express.json())
app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type'] }))

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const envUsername = process.env.AT_USERNAME || ''
  res.json({
    ok:        true,
    service:   'LC1 VIMS SMS Proxy',
    version:   '1.0.0',
    envLoaded: !!envUsername,
    envUsername: envUsername || '(not set — credentials come from the app)',
    time:      new Date().toISOString(),
  })
})

// ── Send SMS ───────────────────────────────────────────────────────────────
// Receives from the browser: { to, message, from, username, apiKey, sandbox }
// Uses credentials sent in the request body (from the app's Settings page).
// Falls back to .env values if the app doesn't send them.
app.post('/sms', async (req, res) => {
  const {
    to,
    message,
    from,
    sandbox,
    // Credentials sent from the browser (entered in Settings → SMS & APIs)
    username: bodyUsername,
    apiKey:   bodyApiKey,
  } = req.body

  // ── Pick credentials: request body first, then .env fallback ─────────
  const username = bodyUsername || process.env.AT_USERNAME || ''
  const apiKey   = bodyApiKey   || process.env.AT_API_KEY  || ''

  // ── Validate ──────────────────────────────────────────────────────────
  if (!to || !Array.isArray(to) || to.length === 0) {
    return res.status(400).json({ success:false, error:'to[] is required' })
  }
  if (!message?.trim()) {
    return res.status(400).json({ success:false, error:'message is required' })
  }
  if (!username || !apiKey) {
    return res.status(400).json({
      success: false,
      error: 'Africa\'s Talking credentials missing. Enter your username and API key in Settings → 📱 SMS & APIs.'
    })
  }

  // ── Log what we are doing ─────────────────────────────────────────────
  const mode = sandbox ? 'SANDBOX' : 'LIVE'
  console.log(`\n[${new Date().toISOString()}] SMS ${mode}`)
  console.log(`  To      : ${to.join(', ')}`)
  console.log(`  Username: ${username}`)
  console.log(`  Sender  : ${from || 'default'}`)

  // ── Initialise AT SDK with the credentials for this request ──────────
  // Note: we create a new instance per request so credentials from the
  // Settings page are always used, not stale cached ones.
  const AT = sandbox
    ? AfricasTalking({ username: 'sandbox', apiKey: 'apikey' })
    : AfricasTalking({ username, apiKey })

  try {
    const result = await AT.SMS.send({
      to,
      message: message.trim(),
      from:    from || undefined,   // undefined = AT picks default sender
    })

    const recipients = result?.SMSMessageData?.Recipients || []

    // Log each result
    recipients.forEach(r => {
      const icon = r.status === 'Success' ? '✓' : '✗'
      console.log(`  ${icon} ${r.number}: ${r.status} | cost: ${r.cost || 'N/A'}`)
    })

    const anySuccess = recipients.some(r => r.status === 'Success')

    if (!anySuccess && recipients.length > 0) {
      // All failed — surface the first failure reason
      const reason = recipients[0]?.statusCode || recipients[0]?.status || 'Unknown'
      console.log(`  ✗ All failed. Reason: ${reason}`)
      return res.json({ success: false, error: `AT rejected: ${reason}`, recipients })
    }

    return res.json({ success: true, recipients, message: result?.SMSMessageData?.Message })

  } catch (err) {
    // Africa's Talking SDK throws plain Error objects with the AT error message
    console.error(`  ✗ AT SDK error: ${err.message}`)

    // 401 / auth errors come back in the error message text
    const msg = err.message || ''
    if (msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('invalid key')) {
      return res.status(401).json({
        success: false,
        error: '401 Unauthorized — check your Africa\'s Talking API key. Make sure you are using the LIVE API key (not sandbox) and that your AT account is activated.'
      })
    }

    return res.status(500).json({ success: false, error: msg || 'Unknown AT error' })
  }
})

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✓  LC1 VIMS SMS Proxy running on port ${PORT}`)
  console.log(`   Health : http://localhost:${PORT}/health`)
  console.log(`   SMS    : http://localhost:${PORT}/sms`)
  console.log(`\n   Enter  http://localhost:${PORT}/sms  in`)
  console.log(`   Settings → 📱 SMS & APIs → SMS Proxy URL\n`)
})
