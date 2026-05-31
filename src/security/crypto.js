/**
 * ============================================================
 * CRYPTOGRAPHY MODULE — src/security/crypto.js
 * ============================================================
 * Uses the browser's built-in Web Crypto API (SubtleCrypto).
 * This is hardware-accelerated, audited by browser vendors,
 * and requires NO external libraries.
 *
 * FUNCTIONS:
 *   hashPassword(plaintext)         → hashed string (store this)
 *   verifyPassword(plain, hash)     → true/false
 *   encryptField(value, key)        → encrypted string (store this)
 *   decryptField(encrypted, key)    → original value
 *   generateToken(length)           → random secure token string
 *   deriveEncryptionKey(villageId)  → AES-GCM key for a village
 *
 * PASSWORD HASHING:
 *   Uses PBKDF2 with SHA-256, 310,000 iterations (OWASP 2023
 *   recommended minimum), 16-byte random salt per password.
 *   Output format:  pbkdf2$<salt_hex>$<hash_hex>
 *   This is stored instead of the plain password. The salt is
 *   unique per password so two identical passwords produce
 *   completely different stored hashes.
 *
 * FIELD ENCRYPTION (AES-GCM):
 *   Sensitive fields (NIN, phone numbers) are encrypted with
 *   AES-256-GCM before being stored in IndexedDB. The key is
 *   derived from the village ID + a device secret. Even if
 *   someone reads the IndexedDB file directly they cannot
 *   recover the plaintext without the key.
 *
 * WHY NOT BCRYPT:
 *   bcryptjs is a JavaScript reimplementation. Web Crypto is
 *   native C++ code in the browser engine — faster, audited
 *   by Google/Mozilla/Apple, and available without npm.
 * ============================================================
 */

// PBKDF2 iteration count — 310,000 is OWASP 2023 recommendation for SHA-256
const PBKDF2_ITERATIONS = 310_000
const SALT_LENGTH       = 16   // bytes
const KEY_LENGTH        = 32   // bytes = 256 bits

// ─────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────

/** Convert ArrayBuffer → hex string */
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Convert hex string → Uint8Array */
function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

/** Encode string → Uint8Array */
const encode = (str) => new TextEncoder().encode(str)

/** Decode Uint8Array → string */
const decode = (buf) => new TextDecoder().decode(buf)

// ─────────────────────────────────────────────────────────────────────────
// PASSWORD HASHING
// ─────────────────────────────────────────────────────────────────────────

/**
 * hashPassword(plaintext)
 * Hashes a password using PBKDF2-SHA256 with a random salt.
 * Returns a string in the format:  pbkdf2$<salt_hex>$<hash_hex>
 * This string is safe to store in IndexedDB.
 *
 * @param {string} plaintext  — the password the user typed
 * @returns {Promise<string>} — the hash string to store
 */
export async function hashPassword(plaintext) {
  // Generate a cryptographically random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

  // Import the password as a PBKDF2 key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encode(plaintext),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  // Derive the hash
  const hashBuf = await crypto.subtle.deriveBits(
    {
      name:       'PBKDF2',
      hash:       'SHA-256',
      salt:       salt,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    KEY_LENGTH * 8  // bits
  )

  return `pbkdf2$${bufToHex(salt)}$${bufToHex(hashBuf)}`
}

/**
 * verifyPassword(plaintext, storedHash)
 * Verifies a plaintext password against a stored hash string.
 * Returns true if they match, false otherwise.
 * Safe against timing attacks (constant-time comparison via SubtleCrypto).
 *
 * Also handles legacy plain-text passwords (for migration):
 * if the stored value doesn't start with 'pbkdf2$', it falls
 * back to a plain comparison so existing accounts still work
 * on first login, then triggers a re-hash.
 *
 * @param {string} plaintext   — the password the user typed
 * @param {string} storedHash  — the value stored in IndexedDB
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plaintext, storedHash) {
  if (!storedHash) return false

  // ── Legacy plain-text passwords (before hashing was added) ───────────
  // This handles the transition period. On first login with a plain-text
  // password, useAuth will detect this and re-hash the password.
  if (!storedHash.startsWith('pbkdf2$')) {
    return plaintext === storedHash
  }

  // ── Proper PBKDF2 hash verification ──────────────────────────────────
  const parts = storedHash.split('$')
  if (parts.length !== 3) return false

  const [, saltHex, hashHex] = parts
  const salt = hexToBuf(saltHex)

  const keyMaterial = await crypto.subtle.importKey(
    'raw', encode(plaintext), 'PBKDF2', false, ['deriveBits']
  )

  const newHashBuf = await crypto.subtle.deriveBits(
    { name:'PBKDF2', hash:'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    KEY_LENGTH * 8
  )

  const newHash    = bufToHex(newHashBuf)
  const storedOnly = hashHex

  // Constant-time comparison to prevent timing attacks
  if (newHash.length !== storedOnly.length) return false
  let diff = 0
  for (let i = 0; i < newHash.length; i++) {
    diff |= newHash.charCodeAt(i) ^ storedOnly.charCodeAt(i)
  }
  return diff === 0
}

/**
 * isLegacyPassword(storedHash)
 * Returns true if the stored value is a plain-text password
 * that needs to be re-hashed on next save.
 */
export function isLegacyPassword(storedHash) {
  return storedHash && !storedHash.startsWith('pbkdf2$')
}

// ─────────────────────────────────────────────────────────────────────────
// FIELD-LEVEL AES-GCM ENCRYPTION
// ─────────────────────────────────────────────────────────────────────────

// Device-specific secret — derived from browser storage on first run
// This means the encrypted data is tied to this specific browser profile
const DEVICE_SECRET_KEY = 'lc1_device_secret_v1'

async function getOrCreateDeviceSecret() {
  let secret = localStorage.getItem(DEVICE_SECRET_KEY)
  if (!secret) {
    const raw    = crypto.getRandomValues(new Uint8Array(32))
    secret       = bufToHex(raw)
    localStorage.setItem(DEVICE_SECRET_KEY, secret)
  }
  return secret
}

/**
 * deriveEncryptionKey(context)
 * Derives an AES-256-GCM key from the device secret + a context string.
 * Context is typically the village ID so each village's data uses a
 * different key — even if somehow one key leaked, other villages are safe.
 *
 * @param {string} context  — e.g. 'V024' (village ID)
 * @returns {Promise<CryptoKey>}
 */
export async function deriveEncryptionKey(context = 'default') {
  const deviceSecret = await getOrCreateDeviceSecret()
  const combined     = `${deviceSecret}:${context}`

  const keyMaterial = await crypto.subtle.importKey(
    'raw', encode(combined), 'PBKDF2', false, ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      hash:       'SHA-256',
      salt:       encode('lc1-vims-field-encryption-v1'),
      iterations: 100_000,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * encryptField(value, context)
 * Encrypts a string field with AES-256-GCM.
 * Returns a string in the format:  enc$<iv_hex>$<ciphertext_hex>
 *
 * @param {string} value    — plaintext to encrypt
 * @param {string} context  — village ID or other context for key derivation
 * @returns {Promise<string>}
 */
export async function encryptField(value, context = 'default') {
  if (!value) return value
  // Don't double-encrypt
  if (typeof value === 'string' && value.startsWith('enc$')) return value

  try {
    const key        = await deriveEncryptionKey(context)
    const iv         = crypto.getRandomValues(new Uint8Array(12))  // 96-bit IV for AES-GCM
    const cipherBuf  = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encode(String(value))
    )
    return `enc$${bufToHex(iv)}$${bufToHex(cipherBuf)}`
  } catch {
    // Encryption failure — return value unencrypted rather than lose data
    console.warn('Field encryption failed — storing unencrypted')
    return value
  }
}

/**
 * decryptField(encrypted, context)
 * Decrypts an AES-GCM encrypted field.
 * Returns the original plaintext, or the input if not encrypted.
 *
 * @param {string} encrypted  — the stored encrypted string
 * @param {string} context    — same context used when encrypting
 * @returns {Promise<string>}
 */
export async function decryptField(encrypted, context = 'default') {
  if (!encrypted) return encrypted
  if (typeof encrypted !== 'string' || !encrypted.startsWith('enc$')) return encrypted

  try {
    const parts = encrypted.split('$')
    if (parts.length !== 3) return encrypted

    const [, ivHex, cipherHex] = parts
    const key       = await deriveEncryptionKey(context)
    const plainBuf  = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBuf(ivHex) },
      key,
      hexToBuf(cipherHex)
    )
    return decode(plainBuf)
  } catch {
    // Decryption failure — return raw value (handles unencrypted legacy data)
    return encrypted
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SECURE TOKEN GENERATION
// ─────────────────────────────────────────────────────────────────────────

/**
 * generateToken(length)
 * Generates a cryptographically secure random token.
 * Uses only alphanumeric characters for readability.
 * Default 8 chars = 41 bits of entropy (sufficient for short-lived tokens).
 *
 * @param {number} length  — character length of the token
 * @returns {string}       — e.g. 'A4X9K2M8'
 */
export function generateToken(length = 8) {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no confusable chars (0,O,1,I)
  const bytes  = crypto.getRandomValues(new Uint8Array(length * 2))
  let token    = ''
  for (let i = 0; i < bytes.length && token.length < length; i++) {
    const idx = bytes[i] % chars.length
    token += chars[idx]
  }
  return token
}

/**
 * generateSessionToken()
 * Generates a long secure session token for use as a session ID.
 * 32 chars = ~160 bits entropy.
 */
export function generateSessionToken() {
  return generateToken(32)
}

// ─────────────────────────────────────────────────────────────────────────
// AUDIT HASH CHAIN
// ─────────────────────────────────────────────────────────────────────────

/**
 * hashAuditEntry(entry, previousHash)
 * Creates a SHA-256 hash of an audit entry chained with the previous hash.
 * This makes the audit log tamper-evident: altering any entry breaks
 * the hash chain and the tampering is immediately detectable.
 *
 * @param {object} entry         — the audit log entry object
 * @param {string} previousHash  — hash of the previous entry ('GENESIS' for first)
 * @returns {Promise<string>}    — hex hash string
 */
export async function hashAuditEntry(entry, previousHash = 'GENESIS') {
  const payload = JSON.stringify({ entry, previousHash })
  const hashBuf = await crypto.subtle.digest('SHA-256', encode(payload))
  return bufToHex(hashBuf)
}

/**
 * verifyAuditChain(entries)
 * Verifies the integrity of an audit log chain.
 * Returns { valid: true } if the chain is unbroken, or
 * { valid: false, brokenAt: index, entry: {...} } if tampered.
 *
 * @param {Array} entries  — audit entries in chronological order, each with a .chainHash field
 * @returns {Promise<{valid: boolean, brokenAt?: number}>}
 */
export async function verifyAuditChain(entries) {
  if (!entries || entries.length === 0) return { valid: true }

  let previousHash = 'GENESIS'

  for (let i = 0; i < entries.length; i++) {
    const entry      = entries[i]
    const { chainHash, ...entryData } = entry  // exclude the stored hash itself

    const expected = await hashAuditEntry(entryData, previousHash)
    if (expected !== entry.chainHash) {
      return { valid: false, brokenAt: i, entry }
    }
    previousHash = entry.chainHash
  }

  return { valid: true }
}
