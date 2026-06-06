/**
 * ============================================================
 * LC1 VIMS SMS PROXY SERVER — server/smsProxy.js
 * ============================================================
 * Bridges the LC1 browser app to Africa's Talking.
 *
 * IMPORTANT: This version calls Africa's Talking REST API DIRECTLY
 * (the same call that works in curl), instead of the africastalking
 * Node SDK. The old SDK (v0.7) fails with a false 401 on newer Node
 * versions (18/20/22/24). The direct REST call is reliable everywhere.
 *
 * HOW TO START:
 *   cd server
 *   npm install        (only needs express + cors now)
 *   npm start
 *   -> SMS Proxy running on port 3001
 *
 * Then in the app:
 *   Settings -> SMS & APIs -> SMS Proxy URL -> http://localhost:3001/sms
 * ============================================================
 */

require('dotenv').config()   // optional .env

const express = require('express')
const cors    = require('cors')

const PORT = process.env.PORT || 3001

// AT REST endpoints
const AT_LIVE_URL    = 'https://api.africastalking.com/version1/messaging'
const AT_SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1/messaging'

const app = express()
app.use(express.json())
app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type'] }))

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok:      true,
    service: 'LC1 VIMS SMS Proxy',
    version: '2.0.0 (direct REST)',
    node:    process.version,
    time:    new Date().toISOString(),
  })
})

// Send SMS - direct REST call (mirrors the working curl)
app.post('/sms', async (req, res) => {
  const { to, message, from, sandbox, username: bodyUsername, apiKey: bodyApiKey } = req.body

  const username = bodyUsername || process.env.AT_USERNAME || ''
  const apiKey   = bodyApiKey   || process.env.AT_API_KEY  || ''

  if (!to || !Array.isArray(to) || to.length === 0) {
    return res.status(400).json({ success:false, error:'to[] is required' })
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ success:false, error:'message is required' })
  }
  if (!username || !apiKey) {
    return res.status(400).json({
      success:false,
      error:"Africa's Talking credentials missing. Enter username and API key in Settings -> SMS & APIs.",
    })
  }

  const url  = sandbox ? AT_SANDBOX_URL : AT_LIVE_URL
  const mode = sandbox ? 'SANDBOX' : 'LIVE'

  console.log(`\n[${new Date().toISOString()}] SMS ${mode}`)
  console.log(`  To      : ${to.join(', ')}`)
  console.log(`  Username: ${username}`)
  console.log(`  Sender  : ${from || '(AT default)'}`)
  console.log(`  Endpoint: ${url}`)
  console.log(`  Key len : ${apiKey.length} chars`)

  const params = new URLSearchParams()
  params.append('username', username)
  params.append('to', to.join(','))
  params.append('message', message.trim())
  if (from && from.trim()) params.append('from', from.trim())

  try {
    const atRes = await fetch(url, {
      method: 'POST',
      headers: {
        'apiKey':       apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'application/json',
      },
      body: params.toString(),
    })

    const text = await atRes.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (atRes.status === 401) {
      console.error('  x 401 from AT:', text)
      return res.status(401).json({
        success:false,
        error:"401 Unauthorized from Africa's Talking. In SANDBOX, username must be 'sandbox' and the key must be your SANDBOX key. In LIVE, use your live username + live key. New keys take ~5 minutes to activate.",
      })
    }
    if (!atRes.ok) {
      console.error(`  x HTTP ${atRes.status}:`, text)
      return res.status(atRes.status).json({ success:false, error:`AT returned ${atRes.status}: ${text}` })
    }

    const recipients = (data && data.SMSMessageData && data.SMSMessageData.Recipients) || []
    recipients.forEach(r => {
      const icon = (r.status === 'Success') ? 'OK ' : 'x  '
      console.log(`  ${icon} ${r.number}: ${r.status} | cost: ${r.cost || 'N/A'}`)
    })

    const anySuccess = recipients.some(r => r.status === 'Success')
    if (!anySuccess && recipients.length > 0) {
      const reason = recipients[0] && recipients[0].status || 'Unknown'
      console.log(`  x All failed. Reason: ${reason}`)
      return res.json({ success:false, error:`AT rejected: ${reason}`, recipients })
    }

    console.log(`  OK ${(data && data.SMSMessageData && data.SMSMessageData.Message) || 'Sent'}`)
    return res.json({ success:true, recipients, message: data && data.SMSMessageData && data.SMSMessageData.Message })

  } catch (err) {
    console.error('  x Network/proxy error:', err.message)
    return res.status(500).json({ success:false, error: err.message || 'Unknown error reaching AT' })
  }
})

app.listen(PORT, () => {
  console.log(`\n=  LC1 VIMS SMS Proxy v2 (direct REST) running on port ${PORT}`)
  console.log(`   Health : http://localhost:${PORT}/health`)
  console.log(`   SMS    : http://localhost:${PORT}/sms`)
  console.log(`   Node   : ${process.version}`)
  console.log(`\n   Enter  http://localhost:${PORT}/sms  in`)
  console.log(`   Settings -> SMS & APIs -> SMS Proxy URL\n`)
})
