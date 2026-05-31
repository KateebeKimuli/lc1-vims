/**
 * LC1 COUNCIL ROLES & PERMISSIONS — src/data/roles.js
 *
 * SYSTEM ADMINISTRATOR (isMasterAdmin):
 *   - Full access to ALL villages, ALL modules, ALL settings
 *   - Only one who can view Audit Log across all villages
 *   - Only one who can configure SMS & APIs, Sync & Backup, Logo
 *   - Logs in via the "System Administrator" button on login page
 *
 * LC1 CHAIR & VICE CHAIR:
 *   - Full module access within their village
 *   - Settings: Village info + Committee members ONLY
 *   - CANNOT see: Audit Log, SMS & APIs, Sync & Backup, Logo upload
 *   - Sync happens automatically in background (they don't manage it)
 *
 * LC1 GEN. SECRETARY:
 *   - Full module access
 *   - Settings: Village info + Committee members ONLY
 *
 * RESTRICTED ROLES (Secretaries):
 *   - Own module only
 */

export const LC1_ROLES = [
  {
    id: 'LC1_CHAIR', title: 'Chairperson', shortTitle: 'LC1 Chair',
    description: 'Heads the executive committee. Signs official letters and certificates.',
    accessLevel: 'full', canSign: true,
  },
  {
    id: 'LC1_VICE_CHAIR', title: 'Vice Chairperson', shortTitle: 'Vice Chair',
    description: 'Acts as Chairperson in their absence.',
    accessLevel: 'full', canSign: true,
  },
  {
    id: 'LC1_GEN_SECRETARY', title: 'General Secretary', shortTitle: 'Gen. Secretary',
    description: 'Administrative duties, minutes, and official correspondence.',
    accessLevel: 'full', canSign: true,
  },
  {
    id: 'LC1_SEC_INFO', title: 'Secretary for Information', shortTitle: 'Sec. Information',
    description: 'Village announcements and community mobilization.',
    accessLevel: 'restricted', allowedModules: ['meetings', 'letters'], canSign: false,
  },
  {
    id: 'LC1_SEC_SECURITY', title: 'Secretary for Security', shortTitle: 'Sec. Security',
    description: 'Local defense and law and order.',
    accessLevel: 'restricted', allowedModules: ['security', 'cases'], canSign: false,
  },
  {
    id: 'LC1_SEC_FINANCE', title: 'Secretary for Finance', shortTitle: 'Sec. Finance',
    description: 'Village funds and PDM allocations.',
    accessLevel: 'restricted', allowedModules: ['welfare', 'reports'], canSign: false,
  },
  {
    id: 'LC1_SEC_PRODUCTION', title: 'Secretary for Production', shortTitle: 'Sec. Production',
    description: 'Agriculture and land/business records.',
    accessLevel: 'restricted', allowedModules: ['land', 'businesses'], canSign: false,
  },
  {
    id: 'LC1_SEC_YOUTHS', title: 'Secretary for Youths', shortTitle: 'Sec. Youths',
    description: 'Village Youth Council representative.',
    accessLevel: 'restricted', allowedModules: ['welfare', 'residents'], canSign: false,
  },
  {
    id: 'LC1_SEC_WOMEN', title: 'Secretary for Women', shortTitle: 'Sec. Women',
    description: 'Women Council Chairperson. Also manages public health.',
    accessLevel: 'restricted', allowedModules: ['births', 'deaths', 'welfare', 'residents'], canSign: false,
  },
  {
    id: 'LC1_SEC_PWD', title: 'Secretary for PWDs', shortTitle: 'Sec. PWDs',
    description: 'PWD organization representative.',
    accessLevel: 'restricted', allowedModules: ['welfare', 'residents'], canSign: false,
  },
  {
    id: 'LC1_SEC_ELDERLY', title: 'Secretary for Elderly', shortTitle: 'Sec. Elderly',
    description: 'Council of Older Persons representative.',
    accessLevel: 'restricted', allowedModules: ['welfare', 'residents', 'deaths'], canSign: false,
  },
]

// ── Navigation permissions ─────────────────────────────────────────────────
// NOTE: Audit log, SMS & APIs, Sync & Backup are ONLY for SYSTEM_ADMIN (isMasterAdmin)
// Chair and Vice Chair get full module access but restricted settings
export const ROUTE_PERMISSIONS = {
  '/':            'all',
  '/residents':   'all',
  '/households':  ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_PRODUCTION'],
  '/land':        ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_PRODUCTION'],
  '/cases':       ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_SECURITY'],
  '/meetings':    ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_INFO'],
  '/births':      ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_WOMEN'],
  '/deaths':      ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_WOMEN','LC1_SEC_ELDERLY'],
  '/letters':     ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_INFO'],
  '/welfare':     ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_FINANCE','LC1_SEC_YOUTHS','LC1_SEC_WOMEN','LC1_SEC_PWD','LC1_SEC_ELDERLY'],
  '/businesses':  ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_PRODUCTION','LC1_SEC_FINANCE'],
  '/security':    ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_SECURITY'],
  '/reports':     ['LC1_CHAIR','LC1_VICE_CHAIR','LC1_GEN_SECRETARY','LC1_SEC_FINANCE'],
  // AUDIT LOG: System Admin ONLY — enforced by isMasterAdmin check in component
  '/audit':       'SYSTEM_ADMIN_ONLY',
  // SETTINGS: Chair + GenSec can access (but limited tabs — enforced in SettingsPage)
  '/settings':    ['LC1_CHAIR','LC1_GEN_SECRETARY'],
}

export const WRITE_PERMISSIONS = {
  LC1_CHAIR: 'all', LC1_VICE_CHAIR: 'all', LC1_GEN_SECRETARY: 'all',
  LC1_SEC_INFO:       ['meetings', 'letters'],
  LC1_SEC_SECURITY:   ['security', 'cases'],
  LC1_SEC_FINANCE:    ['welfare'],
  LC1_SEC_PRODUCTION: ['land', 'businesses'],
  LC1_SEC_YOUTHS:     ['welfare'],
  LC1_SEC_WOMEN:      ['births', 'deaths', 'welfare'],
  LC1_SEC_PWD:        ['welfare'],
  LC1_SEC_ELDERLY:    ['welfare', 'deaths'],
}

// Settings tabs each role can see
// System admin sees ALL tabs (handled by isMasterAdmin in SettingsPage)
export const SETTINGS_TAB_PERMISSIONS = {
  LC1_CHAIR:         ['village', 'committee'],
  LC1_VICE_CHAIR:    ['village', 'committee'],
  LC1_GEN_SECRETARY: ['village', 'committee'],
  // All other roles can't access settings at all
}

export function getRoleById(roleId) { return LC1_ROLES.find(r => r.id === roleId) }
export function hasFullAccess(roleId) { return getRoleById(roleId)?.accessLevel === 'full' }
export function canAccessRoute(roleId, route) {
  const p = ROUTE_PERMISSIONS[route]
  if (!p) return true
  if (p === 'all') return true
  if (p === 'SYSTEM_ADMIN_ONLY') return false  // only isMasterAdmin, handled separately
  return p.includes(roleId)
}
export function canWrite(roleId, module) {
  const p = WRITE_PERMISSIONS[roleId]
  if (!p) return false
  if (p === 'all') return true
  return p.includes(module)
}
export function getAllowedSettingsTabs(user) {
  if (!user) return []
  if (user.isMasterAdmin) return ['village','logo','committee','sms','sync','about']
  return SETTINGS_TAB_PERMISSIONS[user.role] || []
}
export function getAccessibleRoutes(roleId) {
  return Object.entries(ROUTE_PERMISSIONS)
    .filter(([,p]) => p === 'all' || (Array.isArray(p) && p.includes(roleId)))
    .map(([r]) => r)
}
