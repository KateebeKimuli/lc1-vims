/**
 * ============================================================
 * UGANDA ADMINISTRATIVE HIERARCHY — src/data/ugandaLocations.js
 * ============================================================
 * Uganda's administrative structure for LC1 selection:
 *
 *   District → County → Sub-county / Town Council → Parish → Village
 *
 * The login screen uses this to let the user drill down and
 * select their exact village before entering credentials.
 * This ensures every record is tagged to the correct location
 * and the right village data is shown on the dashboard.
 *
 * Structure of each entry:
 *   { id, name, type, parentId }
 *
 * HOW TO EXTEND:
 *   Add your district/sub-county/village to the appropriate array.
 *   Each entry needs a unique `id` (use the format shown).
 *   Set `parentId` to the id of the parent administrative unit.
 *
 * NOTE: This file contains a representative sample of Uganda's
 * administrative units. A full dataset would have all 146
 * districts, ~1,000 sub-counties, and ~65,000 villages.
 * Officials should add their village through the Settings page.
 * ============================================================
 */

// ═══════════════════════════════════════════════════════════════════════════
// DISTRICTS (146 in Uganda as of 2024)
// Only major/common ones included here — expandable in Settings
// ═══════════════════════════════════════════════════════════════════════════
export const DISTRICTS = [
  // Central Region
  { id: 'D001', name: 'Kampala',         region: 'Central' },
  { id: 'D002', name: 'Wakiso',          region: 'Central' },
  { id: 'D003', name: 'Mukono',          region: 'Central' },
  { id: 'D004', name: 'Luweero',         region: 'Central' },
  { id: 'D005', name: 'Masaka',          region: 'Central' },
  { id: 'D006', name: 'Kalangala',       region: 'Central' },
  { id: 'D007', name: 'Rakai',           region: 'Central' },
  { id: 'D008', name: 'Kayunga',         region: 'Central' },
  { id: 'D009', name: 'Mityana',         region: 'Central' },
  { id: 'D010', name: 'Mubende',         region: 'Central' },
  { id: 'D011', name: 'Kiboga',          region: 'Central' },
  { id: 'D012', name: 'Butebo',          region: 'Central' },
  { id: 'D013', name: 'Gomba',           region: 'Central' },
  { id: 'D014', name: 'Kalungu',         region: 'Central' },
  { id: 'D015', name: 'Lwengo',          region: 'Central' },
  { id: 'D016', name: 'Lyantonde',       region: 'Central' },
  { id: 'D017', name: 'Bukomansimbi',    region: 'Central' },
  { id: 'D018', name: 'Mpigi',           region: 'Central' },
  { id: 'D019', name: 'Butebo',          region: 'Central' },
  { id: 'D020', name: 'Nakaseke',        region: 'Central' },
  { id: 'D021', name: 'Nakasongola',     region: 'Central' },
  { id: 'D022', name: 'Sembabule',       region: 'Central' },
  // Eastern Region
  { id: 'D030', name: 'Jinja',           region: 'Eastern' },
  { id: 'D031', name: 'Mbale',           region: 'Eastern' },
  { id: 'D032', name: 'Tororo',          region: 'Eastern' },
  { id: 'D033', name: 'Iganga',          region: 'Eastern' },
  { id: 'D034', name: 'Soroti',          region: 'Eastern' },
  { id: 'D035', name: 'Kumi',            region: 'Eastern' },
  { id: 'D036', name: 'Bugiri',          region: 'Eastern' },
  { id: 'D037', name: 'Busia',           region: 'Eastern' },
  { id: 'D038', name: 'Kamuli',          region: 'Eastern' },
  { id: 'D039', name: 'Kapchorwa',       region: 'Eastern' },
  { id: 'D040', name: 'Pallisa',         region: 'Eastern' },
  { id: 'D041', name: 'Sironko',         region: 'Eastern' },
  { id: 'D042', name: 'Mayuge',          region: 'Eastern' },
  { id: 'D043', name: 'Namutumba',       region: 'Eastern' },
  { id: 'D044', name: 'Budaka',          region: 'Eastern' },
  { id: 'D045', name: 'Butaleja',        region: 'Eastern' },
  { id: 'D046', name: 'Kaliro',          region: 'Eastern' },
  { id: 'D047', name: 'Manafwa',         region: 'Eastern' },
  { id: 'D048', name: 'Amuria',          region: 'Eastern' },
  { id: 'D049', name: 'Bukedea',         region: 'Eastern' },
  // Western Region
  { id: 'D060', name: 'Mbarara',         region: 'Western' },
  { id: 'D061', name: 'Kabale',          region: 'Western' },
  { id: 'D062', name: 'Kasese',          region: 'Western' },
  { id: 'D063', name: 'Fort Portal',     region: 'Western' },
  { id: 'D064', name: 'Hoima',           region: 'Western' },
  { id: 'D065', name: 'Masindi',         region: 'Western' },
  { id: 'D066', name: 'Bushenyi',        region: 'Western' },
  { id: 'D067', name: 'Ntungamo',        region: 'Western' },
  { id: 'D068', name: 'Rukungiri',       region: 'Western' },
  { id: 'D069', name: 'Kyenjojo',        region: 'Western' },
  { id: 'D070', name: 'Kibale',          region: 'Western' },
  { id: 'D071', name: 'Buliisa',         region: 'Western' },
  { id: 'D072', name: 'Isingiro',        region: 'Western' },
  { id: 'D073', name: 'Kiruhura',        region: 'Western' },
  { id: 'D074', name: 'Sheema',          region: 'Western' },
  { id: 'D075', name: 'Buhweju',         region: 'Western' },
  { id: 'D076', name: 'Mitooma',         region: 'Western' },
  { id: 'D077', name: 'Rubirizi',        region: 'Western' },
  // Northern Region
  { id: 'D090', name: 'Gulu',            region: 'Northern' },
  { id: 'D091', name: 'Lira',            region: 'Northern' },
  { id: 'D092', name: 'Arua',            region: 'Northern' },
  { id: 'D093', name: 'Moroto',          region: 'Northern' },
  { id: 'D094', name: 'Kotido',          region: 'Northern' },
  { id: 'D095', name: 'Kitgum',          region: 'Northern' },
  { id: 'D096', name: 'Pader',           region: 'Northern' },
  { id: 'D097', name: 'Apac',            region: 'Northern' },
  { id: 'D098', name: 'Adjumani',        region: 'Northern' },
  { id: 'D099', name: 'Moyo',            region: 'Northern' },
  { id: 'D100', name: 'Nebbi',           region: 'Northern' },
  { id: 'D101', name: 'Yumbe',           region: 'Northern' },
  { id: 'D102', name: 'Amuru',           region: 'Northern' },
  { id: 'D103', name: 'Dokolo',          region: 'Northern' },
  { id: 'D104', name: 'Oyam',            region: 'Northern' },
  { id: 'D105', name: 'Amolatar',        region: 'Northern' },
  { id: 'D106', name: 'Koboko',          region: 'Northern' },
  { id: 'D107', name: 'Maracha',         region: 'Northern' },
  { id: 'D108', name: 'Zombo',           region: 'Northern' },
  { id: 'D109', name: 'Abim',            region: 'Northern' },
  { id: 'D110', name: 'Nakapiripirit',   region: 'Northern' },
  { id: 'D111', name: 'Napak',           region: 'Northern' },
  { id: 'D112', name: 'Alebtong',        region: 'Northern' },
  { id: 'D113', name: 'Otuke',           region: 'Northern' },
  { id: 'D114', name: 'Nwoya',           region: 'Northern' },
  { id: 'D115', name: 'Agago',           region: 'Northern' },
  { id: 'D116', name: 'Lamwo',           region: 'Northern' },
]

// ═══════════════════════════════════════════════════════════════════════════
// COUNTIES (keyed by districtId)
// One district can have multiple counties.
// Extended sample for Kampala, Wakiso, Gulu, Mbarara, Jinja, Mbale.
// ═══════════════════════════════════════════════════════════════════════════
export const COUNTIES = [
  // Kampala District divisions (Kampala has "Divisions" not counties)
  { id: 'C001', name: 'Kampala Central Division',  districtId: 'D001' },
  { id: 'C002', name: 'Kawempe Division',           districtId: 'D001' },
  { id: 'C003', name: 'Makindye Division',          districtId: 'D001' },
  { id: 'C004', name: 'Nakawa Division',            districtId: 'D001' },
  { id: 'C005', name: 'Rubaga Division',            districtId: 'D001' },
  // Wakiso District
  { id: 'C010', name: 'Busiro County',              districtId: 'D002' },
  { id: 'C011', name: 'Entebbe Municipality',       districtId: 'D002' },
  { id: 'C012', name: 'Kyadondo County',            districtId: 'D002' },
  { id: 'C013', name: 'Nansana Municipality',       districtId: 'D002' },
  // Mukono District
  { id: 'C020', name: 'Mukono County',              districtId: 'D003' },
  { id: 'C021', name: 'Buikwe County',              districtId: 'D003' },
  { id: 'C022', name: 'Buvuma County',              districtId: 'D003' },
  // Gulu District
  { id: 'C060', name: 'Gulu Municipality',          districtId: 'D090' },
  { id: 'C061', name: 'Aswa County',                districtId: 'D090' },
  { id: 'C062', name: 'Omoro County',               districtId: 'D090' },
  // Mbarara District
  { id: 'C070', name: 'Mbarara Municipality',       districtId: 'D060' },
  { id: 'C071', name: 'Isingiro County',            districtId: 'D060' },
  { id: 'C072', name: 'Kashari County',             districtId: 'D060' },
  { id: 'C073', name: 'Rwampara County',            districtId: 'D060' },
  // Jinja District
  { id: 'C080', name: 'Jinja Municipality',         districtId: 'D030' },
  { id: 'C081', name: 'Butembe County',             districtId: 'D030' },
  { id: 'C082', name: 'Jinja County',               districtId: 'D030' },
  // Mbale District
  { id: 'C090', name: 'Mbale Municipality',         districtId: 'D031' },
  { id: 'C091', name: 'Bubulo County',              districtId: 'D031' },
  { id: 'C092', name: 'Bungokho County',            districtId: 'D031' },
]

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COUNTIES & TOWN COUNCILS (keyed by countyId)
// In Uganda, urban areas have "Town Councils" while rural areas
// have "Sub-counties". Both are at the same administrative level.
// ═══════════════════════════════════════════════════════════════════════════
export const SUBCOUNTIES = [
  // Kawempe Division, Kampala
  { id: 'S001', name: 'Bwaise I Ward',              countyId: 'C002', type: 'ward' },
  { id: 'S002', name: 'Bwaise II Ward',             countyId: 'C002', type: 'ward' },
  { id: 'S003', name: 'Kazo Ward',                  countyId: 'C002', type: 'ward' },
  { id: 'S004', name: 'Kawempe Ward',               countyId: 'C002', type: 'ward' },
  { id: 'S005', name: 'Kyebando Ward',              countyId: 'C002', type: 'ward' },
  { id: 'S006', name: 'Makerere Ward',              countyId: 'C002', type: 'ward' },
  { id: 'S007', name: 'Mpererwe Ward',              countyId: 'C002', type: 'ward' },
  { id: 'S008', name: 'Mulago I Ward',              countyId: 'C002', type: 'ward' },
  { id: 'S009', name: 'Tula Ward',                  countyId: 'C002', type: 'ward' },
  // Makindye Division, Kampala
  { id: 'S010', name: 'Makindye I Ward',            countyId: 'C003', type: 'ward' },
  { id: 'S011', name: 'Makindye II Ward',           countyId: 'C003', type: 'ward' },
  { id: 'S012', name: 'Kibuye I Ward',              countyId: 'C003', type: 'ward' },
  { id: 'S013', name: 'Kabalagala Ward',            countyId: 'C003', type: 'ward' },
  // Busiro County, Wakiso
  { id: 'S020', name: 'Busiro South Sub-county',   countyId: 'C010', type: 'subcounty' },
  { id: 'S021', name: 'Busiro East Sub-county',    countyId: 'C010', type: 'subcounty' },
  { id: 'S022', name: 'Kyengera Town Council',     countyId: 'C010', type: 'town_council' },
  { id: 'S023', name: 'Nansana Town Council',      countyId: 'C010', type: 'town_council' },
  { id: 'S024', name: 'Kira Town Council',         countyId: 'C010', type: 'town_council' },
  // Kyadondo County, Wakiso
  { id: 'S030', name: 'Kyadondo Sub-county',       countyId: 'C012', type: 'subcounty' },
  { id: 'S031', name: 'Gayaza Town Council',       countyId: 'C012', type: 'town_council' },
  { id: 'S032', name: 'Kasangati Town Council',    countyId: 'C012', type: 'town_council' },
  // Aswa County, Gulu
  { id: 'S040', name: 'Aswa Sub-county',           countyId: 'C061', type: 'subcounty' },
  { id: 'S041', name: 'Palaro Sub-county',         countyId: 'C061', type: 'subcounty' },
  { id: 'S042', name: 'Unyama Sub-county',         countyId: 'C061', type: 'subcounty' },
  // Kashari County, Mbarara
  { id: 'S050', name: 'Kashari North Sub-county',  countyId: 'C072', type: 'subcounty' },
  { id: 'S051', name: 'Kashari South Sub-county',  countyId: 'C072', type: 'subcounty' },
  // Butembe County, Jinja
  { id: 'S060', name: 'Butembe Sub-county',        countyId: 'C081', type: 'subcounty' },
  { id: 'S061', name: 'Wakisi Sub-county',         countyId: 'C081', type: 'subcounty' },
  // Bungokho County, Mbale
  { id: 'S070', name: 'Bungokho Central',          countyId: 'C092', type: 'subcounty' },
  { id: 'S071', name: 'Bungokho North',            countyId: 'C092', type: 'subcounty' },
  { id: 'S072', name: 'Bungokho South',            countyId: 'C092', type: 'subcounty' },
]

// ═══════════════════════════════════════════════════════════════════════════
// PARISHES (keyed by subcountyId)
// ═══════════════════════════════════════════════════════════════════════════
export const PARISHES = [
  // Kawempe Ward parishes
  { id: 'P001', name: 'Bwaise I Parish',            subcountyId: 'S001' },
  { id: 'P002', name: 'Bwaise II Parish',           subcountyId: 'S002' },
  { id: 'P003', name: 'Makerere I Parish',          subcountyId: 'S006' },
  { id: 'P004', name: 'Makerere II Parish',         subcountyId: 'S006' },
  { id: 'P005', name: 'Kyebando Parish',            subcountyId: 'S005' },
  { id: 'P006', name: 'Mpererwe Parish',            subcountyId: 'S007' },
  // Kyadondo Sub-county parishes
  { id: 'P010', name: 'Gayaza Parish',              subcountyId: 'S030' },
  { id: 'P011', name: 'Kasangati Parish',           subcountyId: 'S030' },
  { id: 'P012', name: 'Kyanja Parish',              subcountyId: 'S030' },
  { id: 'P013', name: 'Nabweru Parish',             subcountyId: 'S030' },
  { id: 'P014', name: 'Namugongo Parish',           subcountyId: 'S030' },
  // Busiro South parishes
  { id: 'P020', name: 'Entebbe Parish',             subcountyId: 'S020' },
  { id: 'P021', name: 'Katabi Parish',              subcountyId: 'S020' },
  // Aswa Sub-county parishes
  { id: 'P030', name: 'Anaka Parish',               subcountyId: 'S040' },
  { id: 'P031', name: 'Ongako Parish',              subcountyId: 'S040' },
  // Kashari North parishes
  { id: 'P040', name: 'Ndeija Parish',              subcountyId: 'S050' },
  { id: 'P041', name: 'Omwizampaka Parish',         subcountyId: 'S050' },
]

// ═══════════════════════════════════════════════════════════════════════════
// VILLAGES (keyed by parishId)
// These are the LC1 units. Each village has exactly one LC1 committee.
// ═══════════════════════════════════════════════════════════════════════════
export const VILLAGES = [
  // Bwaise I Parish villages
  { id: 'V001', name: 'Bwaise I',                   parishId: 'P001' },
  { id: 'V002', name: 'Kazo Angelo',                parishId: 'P001' },
  { id: 'V003', name: 'Bwaise II',                  parishId: 'P002' },
  { id: 'V004', name: 'Makerere I',                 parishId: 'P003' },
  { id: 'V005', name: 'Makerere II',                parishId: 'P003' },
  { id: 'V006', name: 'Makerere III',               parishId: 'P003' },
  { id: 'V007', name: 'Makerere Kikoni',            parishId: 'P004' },
  { id: 'V008', name: 'Kyebando Kisalosalo',        parishId: 'P005' },
  { id: 'V009', name: 'Kyebando Central',           parishId: 'P005' },
  { id: 'V010', name: 'Mpererwe',                   parishId: 'P006' },
  // Kyadondo Sub-county villages
  { id: 'V020', name: 'Gayaza A',                   parishId: 'P010' },
  { id: 'V021', name: 'Gayaza B',                   parishId: 'P010' },
  { id: 'V022', name: 'Kasangati Central',          parishId: 'P011' },
  { id: 'V023', name: 'Kasangati East',             parishId: 'P011' },
  { id: 'V024', name: 'Kyanja Central',             parishId: 'P012' },
  { id: 'V025', name: 'Kyanja North',               parishId: 'P012' },
  { id: 'V026', name: 'Kyanja South',               parishId: 'P012' },
  { id: 'V027', name: 'Nabweru Central',            parishId: 'P013' },
  { id: 'V028', name: 'Nabweru North',              parishId: 'P013' },
  { id: 'V029', name: 'Namugongo',                  parishId: 'P014' },
  { id: 'V030', name: 'Sonde',                      parishId: 'P014' },
  // Busiro South villages
  { id: 'V040', name: 'Abaita Ababiri',             parishId: 'P020' },
  { id: 'V041', name: 'Katabi Central',             parishId: 'P021' },
  // Aswa Sub-county villages
  { id: 'V050', name: 'Anaka Central',              parishId: 'P030' },
  { id: 'V051', name: 'Ongako Central',             parishId: 'P031' },
  // Kashari North villages
  { id: 'V060', name: 'Ndeija A',                   parishId: 'P040' },
  { id: 'V061', name: 'Omwizampaka',                parishId: 'P041' },
]

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// Used by the LocationSelector component on the login screen
// ═══════════════════════════════════════════════════════════════════════════

/**
 * getCountiesByDistrict(districtId)
 * Returns all counties/divisions in the given district.
 */
export function getCountiesByDistrict(districtId) {
  return COUNTIES.filter(c => c.districtId === districtId)
}

/**
 * getSubcountiesByCounty(countyId)
 * Returns all sub-counties and town councils in the given county.
 */
export function getSubcountiesByCounty(countyId) {
  return SUBCOUNTIES.filter(s => s.countyId === countyId)
}

/**
 * getParishesBySubcounty(subcountyId)
 * Returns all parishes in the given sub-county.
 */
export function getParishesBySubcounty(subcountyId) {
  return PARISHES.filter(p => p.subcountyId === subcountyId)
}

/**
 * getVillagesByParish(parishId)
 * Returns all villages (LC1 units) in the given parish.
 */
export function getVillagesByParish(parishId) {
  return VILLAGES.filter(v => v.parishId === parishId)
}

/**
 * buildLocationLabel(villageId)
 * Builds a full human-readable location string for a given village ID.
 * Example: "Kyanja Central, Kyanja Parish, Kyadondo Sub-county, Wakiso"
 */
export function buildLocationLabel(villageId) {
  const village    = VILLAGES.find(v => v.id === villageId)
  if (!village) return ''
  const parish     = PARISHES.find(p => p.id === village.parishId)
  const subcounty  = parish  ? SUBCOUNTIES.find(s => s.id === parish.subcountyId)  : null
  const county     = subcounty ? COUNTIES.find(c => c.id === subcounty.countyId)   : null
  const district   = county  ? DISTRICTS.find(d => d.id === county.districtId)     : null
  return [village.name, parish?.name, subcounty?.name, district?.name]
    .filter(Boolean).join(', ')
}

/**
 * getDistrictsByRegion()
 * Returns districts grouped by region — used for the district dropdown
 * with optional regional headers.
 */
export function getDistrictsByRegion() {
  const regions = {}
  DISTRICTS.forEach(d => {
    if (!regions[d.region]) regions[d.region] = []
    regions[d.region].push(d)
  })
  return regions
}
