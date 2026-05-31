/**
 * ============================================================
 * RBAC WRITE GUARD — src/security/rbacGuard.js
 * ============================================================
 * Enforces role-based access control at the DATA LAYER,
 * not just the UI layer.
 *
 * The UI already hides buttons from unauthorised roles, but a
 * determined user could call DB functions directly via DevTools.
 * This guard adds a second enforcement layer on every write.
 *
 * USAGE:
 *   import { guardWrite } from '../security/rbacGuard'
 *
 *   // In any save function:
 *   guardWrite(user, 'residents')   // throws if not allowed
 *   await db.put('residents', record)
 *
 * WRITE PERMISSION MAP (matches data/roles.js WRITE_PERMISSIONS):
 *   Full access roles    → all modules
 *   Restricted roles     → only their designated modules
 *   No role / undefined  → denied everywhere
 * ============================================================
 */

import { WRITE_PERMISSIONS } from '../data/roles.js'

/**
 * guardWrite(user, module)
 * Throws a permission error if the current user cannot write to this module.
 * Silent pass-through if allowed.
 *
 * @param {object} user    — the logged-in user object from useAuth
 * @param {string} module  — the module name (e.g. 'residents', 'cases')
 * @throws {Error}         — if permission denied
 */
export function guardWrite(user, module) {
  if (!user) {
    throw new Error('Permission denied: not logged in')
  }

  // Master admin can do anything
  if (user.isMasterAdmin) return

  const perm = WRITE_PERMISSIONS[user.role]

  // Role not in permissions map — deny
  if (!perm) {
    throw new Error(`Permission denied: role "${user.role}" is not recognised`)
  }

  // Full access — allow
  if (perm === 'all') return

  // Check specific module permission
  if (!Array.isArray(perm) || !perm.includes(module)) {
    throw new Error(
      `Permission denied: your role (${user.role.replace(/_/g,' ')}) ` +
      `cannot write to the "${module}" module. ` +
      `Contact the LC1 Chairperson or Secretary.`
    )
  }
}

/**
 * canWrite(user, module)
 * Non-throwing version — returns true/false.
 * Use this for conditional rendering.
 *
 * @param {object} user
 * @param {string} module
 * @returns {boolean}
 */
export function canWrite(user, module) {
  try { guardWrite(user, module); return true }
  catch { return false }
}

/**
 * guardDelete(user, module)
 * Deletion is restricted to full-access roles only (Chair, Vice, Secretary).
 * Even users who can write to a module cannot delete records unless they
 * have full system access.
 *
 * @param {object} user
 * @param {string} module
 * @throws {Error}
 */
export function guardDelete(user, module) {
  if (!user) throw new Error('Permission denied: not logged in')
  if (user.isMasterAdmin) return

  const perm = WRITE_PERMISSIONS[user.role]
  if (perm !== 'all') {
    throw new Error(
      `Permission denied: only the Chairperson, Vice Chairperson, and ` +
      `General Secretary can delete records. Your role (${user.role.replace(/_/g,' ')}) ` +
      `can view and create but not delete.`
    )
  }
}

/**
 * guardSensitiveRead(user, field)
 * Prevents restricted roles from reading sensitive fields like NIN.
 * Returns a masked value for unauthorised users.
 *
 * @param {object} user
 * @param {string} value   — the actual field value
 * @param {string} field   — field name (e.g. 'nin', 'phone')
 * @returns {string}       — original value or masked version
 */
export function guardSensitiveRead(user, value, field) {
  if (!value) return value
  if (!user) return '***'
  if (user.isMasterAdmin) return value

  const perm = WRITE_PERMISSIONS[user.role]
  if (perm === 'all') return value  // full access can see everything

  // Mask NIN for restricted roles (show only last 4 chars)
  if (field === 'nin') {
    return value.length > 4 ? '**********' + value.slice(-4) : '****'
  }

  // Mask phone for restricted roles (show only last 4 digits)
  if (field === 'phone' || field === 'phone2' || field === 'nextOfKinPhone') {
    return value.length > 4 ? '****' + value.slice(-4) : '****'
  }

  return value
}
