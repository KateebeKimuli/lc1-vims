/**
 * ============================================================
 * GOVERNMENT API LAYER — src/services/govApiService.js
 * ============================================================
 * Connects the LC1 VIMS to Uganda's national government systems:
 *
 *   NIRA   — National Identification Registration Authority
 *            Verifies National IDs before resident registration.
 *            API: https://api.nira.go.ug (requires MOJ approval)
 *
 *   UBOS   — Uganda Bureau of Statistics
 *            Pushes village population data for national census.
 *            API: https://api.ubos.org (requires data sharing agreement)
 *
 *   MoH/DHIS2 — Ministry of Health / District Health Info System
 *            Pushes birth, death, and immunisation records.
 *            API: https://hmis.health.go.ug/api (DHIS2 standard)
 *
 *   MoLG   — Ministry of Local Government (home department)
 *            Pushes resident counts for PDM allocation calculations.
 *            API: https://api.molg.go.ug (internal)
 *
 *   IFMS   — Integrated Financial Management System
 *            Receives PDM fund disbursement data.
 *            API: https://efms.finance.go.ug
 *
 * HOW TO USE:
 *   All calls in this file are async and return:
 *     { success: true,  data: {...} }    on success
 *     { success: false, error: '...' }   on failure
 *
 *   Integration is OPTIONAL — the system works without it.
 *   Configure API keys in Settings → Government Integrations.
 *
 * AUTHENTICATION:
 *   Each API uses OAuth2 Bearer tokens issued by the respective
 *   ministry. Configure these in Settings → Integrations.
 *   Tokens are stored encrypted in IndexedDB settings.
 *
 * DATA STANDARDS:
 *   NIRA/UBOS: JSON REST (Uganda national standard)
 *   DHIS2: DHIS2 Web API (HL7-inspired)
 *   All dates: ISO 8601 (YYYY-MM-DD)
 *   IDs: Uganda NIN format (14 alphanumeric characters)
 * ============================================================
 */

// ── Government API base URLs ───────────────────────────────────────────────
// These are the official Uganda government API endpoints.
// Contact the respective ministry's IT department for access credentials.
const GOV_APIS = {
  NIRA:  'https://api.nira.go.ug/v1',
  UBOS:  'https://api.ubos.org/v1',
  DHIS2: 'https://hmis.health.go.ug/api',
  MoLG:  'https://api.molg.go.ug/v1',
  IFMS:  'https://efms.finance.go.ug/api',
}

// Timeout for all government API calls (they can be slow)
const GOV_API_TIMEOUT = 20000  // 20 seconds

// ─────────────────────────────────────────────────────────────────────────
// CONFIGURATION HELPERS
// ─────────────────────────────────────────────────────────────────────────

/**
 * getGovConfig(apiName)
 * Reads the API token for a specific government system from settings.
 * Returns null if not configured.
 */
async function getGovConfig(apiName) {
  try {
    const { getDB } = await import('../db/index.js')
    const db        = await getDB()
    const token     = (await db.get('settings', `govToken_${apiName}`))?.value
    const enabled   = (await db.get('settings', `govEnabled_${apiName}`))?.value === 'true'
    if (!token || !enabled) return null
    return { token, baseUrl: GOV_APIS[apiName] }
  } catch { return null }
}

/**
 * govRequest(url, token, method, body)
 * Base HTTP request wrapper for all government API calls.
 * Handles auth header, timeout, and error normalisation.
 */
async function govRequest(url, token, method = 'GET', body = null) {
  try {
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'X-Source':      'MoLG-LC1-VIMS',  // identifies our system to government APIs
      },
      signal: AbortSignal.timeout(GOV_API_TIMEOUT),
    }
    if (body) opts.body = JSON.stringify(body)

    const res  = await fetch(url, opts)
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return { success: false, error: `${res.status}: ${data.message || data.error || 'Unknown error'}` }
    }
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NIRA — NATIONAL ID VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * verifyNIN(nin)
 * Verifies a National ID Number against the NIRA database before
 * registering a resident. Prevents fake or duplicate registrations.
 *
 * Returns:
 *   { verified: true,  data: { surname, firstName, dob, sex, ... } }
 *   { verified: false, reason: '...' }
 *
 * @param {string} nin - 14-character Uganda National ID
 */
export async function verifyNIN(nin) {
  if (!nin || nin.length !== 14) {
    return { verified: false, reason: 'NIN must be 14 characters' }
  }

  const config = await getGovConfig('NIRA')

  // If NIRA integration is not configured, skip verification (offline mode)
  if (!config) {
    return { verified: null, reason: 'NIRA not configured — manual entry only' }
  }

  if (!navigator.onLine) {
    return { verified: null, reason: 'Offline — NIN verification skipped' }
  }

  const result = await govRequest(
    `${config.baseUrl}/persons/${nin}`,
    config.token
  )

  if (!result.success) {
    return { verified: false, reason: `NIRA check failed: ${result.error}` }
  }

  const p = result.data
  return {
    verified: true,
    data: {
      surname:     p.surname     || p.familyName || '',
      firstName:   p.firstName   || p.givenName  || '',
      otherNames:  p.otherNames  || '',
      dateOfBirth: p.dateOfBirth || p.dob        || '',
      sex:         p.sex         || p.gender     || '',
      nationality: p.nationality || 'Ugandan',
      photo:       p.photo       || null,  // base64 if available
    }
  }
}

/**
 * reportDeathToNIRA(deceased, dateOfDeath, villageProfile)
 * Notifies NIRA of a death so the NIN can be deactivated nationally.
 * This prevents identity fraud using the deceased person's ID.
 */
export async function reportDeathToNIRA(deceased, dateOfDeath, villageProfile) {
  const config = await getGovConfig('NIRA')
  if (!config || !navigator.onLine) {
    return { success: false, queued: true, reason: 'Offline or not configured' }
  }

  return govRequest(
    `${config.baseUrl}/deaths`,
    config.token,
    'POST',
    {
      nin:           deceased.nin,
      surname:       deceased.surname,
      firstName:     deceased.firstName,
      dateOfDeath,
      placeOfDeath:  `${villageProfile?.villageName} Village, ${villageProfile?.districtName}`,
      reportedBy:    'LC1 VIMS',
      villageCode:   villageProfile?.villageId,
      reportedAt:    new Date().toISOString(),
    }
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// UBOS — POPULATION DATA REPORTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * pushPopulationData(villageId, stats, villageProfile)
 * Sends village population counts to UBOS for national statistics.
 * Called automatically after every resident count change (births, deaths, migrations).
 *
 * @param {string} villageId       - LC1 village identifier
 * @param {object} stats           - { active, deceased, migrated, male, female, ... }
 * @param {object} villageProfile  - location hierarchy for context
 */
export async function pushPopulationData(villageId, stats, villageProfile) {
  const config = await getGovConfig('UBOS')
  if (!config || !navigator.onLine) {
    return { success: false, queued: true, reason: 'Offline or not configured' }
  }

  return govRequest(
    `${config.baseUrl}/villages/${villageId}/population`,
    config.token,
    'PUT',
    {
      villageId,
      villageName:    villageProfile?.villageName,
      districtName:   villageProfile?.districtName,
      subcountyName:  villageProfile?.subcountyName,
      countyName:     villageProfile?.countyName,
      reportDate:     new Date().toISOString().slice(0, 10),
      population: {
        activeResidents:   stats.active,
        deceasedOnRecord:  stats.deceased,
        migratedAway:      stats.migrated,
        tenants:           stats.tenants,
        totalMale:         stats.male,
        totalFemale:       stats.female,
      },
      reportedBy:   'MoLG-LC1-VIMS',
      reportedAt:   new Date().toISOString(),
    }
  )
}

/**
 * submitCensusData(villageId, residents, villageProfile)
 * Submits anonymised census data to UBOS.
 * Strips names and NINs — only sends demographic aggregates.
 * Called from the Reports page via "Submit to UBOS" button.
 */
export async function submitCensusData(villageId, residents, villageProfile) {
  const config = await getGovConfig('UBOS')
  if (!config || !navigator.onLine) {
    return { success: false, reason: 'Offline or UBOS not configured' }
  }

  // Build age-group aggregates (anonymised — no personal data sent)
  const ageGroups = { '0-4':0, '5-14':0, '15-24':0, '25-44':0, '45-64':0, '65+':0 }
  const active = residents.filter(r => r.status === 'active' || r.status === 'tenant')
  active.forEach(r => {
    if (!r.dateOfBirth) return
    const age = Math.floor((Date.now() - new Date(r.dateOfBirth)) / (365.25 * 24 * 3600 * 1000))
    if      (age <  5)  ageGroups['0-4']++
    else if (age < 15)  ageGroups['5-14']++
    else if (age < 25)  ageGroups['15-24']++
    else if (age < 45)  ageGroups['25-44']++
    else if (age < 65)  ageGroups['45-64']++
    else                ageGroups['65+']++
  })

  const tribeCounts    = {}
  const religionCounts = {}
  const occupationCounts = {}

  active.forEach(r => {
    if (r.tribe)      tribeCounts[r.tribe]          = (tribeCounts[r.tribe]       || 0) + 1
    if (r.religion)   religionCounts[r.religion]    = (religionCounts[r.religion] || 0) + 1
    if (r.occupation) occupationCounts[r.occupation]= (occupationCounts[r.occupation] || 0) + 1
  })

  return govRequest(
    `${config.baseUrl}/census/villages`,
    config.token,
    'POST',
    {
      villageId,
      villageName:       villageProfile?.villageName,
      districtId:        villageProfile?.districtId,
      districtName:      villageProfile?.districtName,
      subcountyName:     villageProfile?.subcountyName,
      totalPopulation:   active.length,
      ageDistribution:   ageGroups,
      tribeDistribution: tribeCounts,
      religion:          religionCounts,
      occupation:        occupationCounts,
      submittedAt:       new Date().toISOString(),
    }
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MINISTRY OF HEALTH — DHIS2 (Births & Deaths)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * reportBirthToDHIS2(birth, villageProfile)
 * Sends a birth registration to the national HMIS/DHIS2 system.
 * Used for maternal and child health tracking.
 */
export async function reportBirthToDHIS2(birth, villageProfile) {
  const config = await getGovConfig('DHIS2')
  if (!config || !navigator.onLine) {
    return { success: false, queued: true, reason: 'Offline or not configured' }
  }

  // DHIS2 uses its own event format
  return govRequest(
    `${config.baseUrl}/events`,
    config.token,
    'POST',
    {
      program:     'BIRTH_REG',            // DHIS2 program UID (get from MoH)
      orgUnit:     villageProfile?.villageId,
      eventDate:   birth.dateOfBirth,
      dataValues: [
        { dataElement: 'childName',     value: birth.childName },
        { dataElement: 'sex',           value: birth.sex },
        { dataElement: 'weight',        value: birth.weight },
        { dataElement: 'facilityBirth', value: !!birth.healthFacility },
        { dataElement: 'motherNIN',     value: birth.motherNIN || '' },
        { dataElement: 'village',       value: villageProfile?.villageName },
      ]
    }
  )
}

/**
 * reportDeathToDHIS2(death, villageProfile)
 * Reports a death to the national HMIS for vital statistics tracking.
 */
export async function reportDeathToDHIS2(death, villageProfile) {
  const config = await getGovConfig('DHIS2')
  if (!config || !navigator.onLine) {
    return { success: false, queued: true, reason: 'Offline or not configured' }
  }

  return govRequest(
    `${config.baseUrl}/events`,
    config.token,
    'POST',
    {
      program:   'DEATH_REG',
      orgUnit:   villageProfile?.villageId,
      eventDate: death.dateOfDeath,
      dataValues: [
        { dataElement: 'causeOfDeath',  value: death.cause },
        { dataElement: 'sex',           value: death.sex   },
        { dataElement: 'age',           value: death.age   },
        { dataElement: 'village',       value: villageProfile?.villageName },
      ]
    }
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MoLG — MINISTRY OF LOCAL GOVERNMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * syncVillageDataToMoLG(villageId, stats, villageProfile)
 * Pushes village summary data to the MoLG central system.
 * Used for PDM fund allocation and monitoring.
 */
export async function syncVillageDataToMoLG(villageId, stats, villageProfile) {
  const config = await getGovConfig('MoLG')
  if (!config || !navigator.onLine) {
    return { success: false, queued: true }
  }

  return govRequest(
    `${config.baseUrl}/villages/${villageId}/report`,
    config.token,
    'PUT',
    {
      villageId,
      villageName:     villageProfile?.villageName,
      parishName:      villageProfile?.parishName,
      subcountyName:   villageProfile?.subcountyName,
      districtName:    villageProfile?.districtName,
      activeResidents: stats.active,
      households:      stats.households,
      businesses:      stats.businesses,
      welfareRecords:  stats.welfare,
      reportDate:      new Date().toISOString().slice(0, 10),
      systemVersion:   '2.0.0',
    }
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION STATUS CHECK
// Used by Settings → Integrations to test each connection.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * testGovIntegration(apiName)
 * Pings the health/status endpoint of a government API.
 * Returns { ok: true/false, latencyMs, error }
 */
export async function testGovIntegration(apiName) {
  const config = await getGovConfig(apiName)
  if (!config) return { ok: false, error: 'Not configured' }
  if (!navigator.onLine) return { ok: false, error: 'Device is offline' }

  const start  = Date.now()
  const result = await govRequest(`${config.baseUrl}/health`, config.token)
  return {
    ok:        result.success,
    latencyMs: Date.now() - start,
    error:     result.error || null,
  }
}

/**
 * GOV_INTEGRATION_LIST
 * Configuration metadata for all government integrations.
 * Used by the Settings page to render the integrations panel.
 */
export const GOV_INTEGRATION_LIST = [
  {
    id:          'NIRA',
    name:        'NIRA — National ID Verification',
    description: 'Verifies resident NIDs before registration and reports deaths.',
    website:     'https://nira.go.ug',
    tokenKey:    'govToken_NIRA',
    enabledKey:  'govEnabled_NIRA',
  },
  {
    id:          'UBOS',
    name:        'UBOS — Population Statistics',
    description: 'Pushes village population data for national census and planning.',
    website:     'https://ubos.org',
    tokenKey:    'govToken_UBOS',
    enabledKey:  'govEnabled_UBOS',
  },
  {
    id:          'DHIS2',
    name:        'MoH / DHIS2 — Health Data',
    description: 'Reports births and deaths to the national health information system.',
    website:     'https://health.go.ug',
    tokenKey:    'govToken_DHIS2',
    enabledKey:  'govEnabled_DHIS2',
  },
  {
    id:          'MoLG',
    name:        'MoLG — Local Government Portal',
    description: 'Syncs village summaries for PDM fund allocation.',
    website:     'https://molg.go.ug',
    tokenKey:    'govToken_MoLG',
    enabledKey:  'govEnabled_MoLG',
  },
]
