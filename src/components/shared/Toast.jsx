/**
 * ============================================================
 * SHARED TOAST COMPONENT — src/components/shared/Toast.jsx
 * ============================================================
 * A lightweight hook + component pair for showing temporary
 * notification messages (success, error, info) in the bottom-
 * right corner of the screen.
 *
 * Usage in any page:
 *   const { toast, showToast } = useToast()
 *   showToast('Record saved', 'success')
 *   showToast('NIN already exists', 'error')
 *   ...
 *   return <> ... <Toast toast={toast} /> </>
 * ============================================================
 */

import { useState, useCallback } from 'react'

// ── useToast hook ──────────────────────────────────────────────────────────
/**
 * Returns { toast, showToast }.
 * showToast(message, type, duration) — displays a toast for `duration` ms.
 * type: 'success' | 'error' | 'info'   (defaults to 'success')
 */
export function useToast() {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg, type = 'success', duration = 3500) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), duration)
  }, [])

  return { toast, showToast }
}

// ── Toast render component ─────────────────────────────────────────────────
/**
 * Renders the visible toast notification when `toast` is not null.
 * Place this at the bottom of your page's JSX return.
 */
export function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className="toast-container">
      <div className={`toast toast-${toast.type}`}>
        {/* Icon prefix by type */}
        {toast.type === 'success' && '✓ '}
        {toast.type === 'error'   && '✕ '}
        {toast.type === 'info'    && 'ℹ '}
        {toast.msg}
      </div>
    </div>
  )
}
