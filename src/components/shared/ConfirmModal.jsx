/**
 * ============================================================
 * SHARED CONFIRM MODAL — src/components/shared/ConfirmModal.jsx
 * ============================================================
 * A reusable confirmation dialog used before destructive actions
 * like deleting records. Prevents accidental deletions.
 *
 * Usage:
 *   <ConfirmModal
 *     open={!!deleteId}
 *     title="Delete resident?"
 *     message="This cannot be undone."
 *     onConfirm={() => handleDelete(deleteId)}
 *     onCancel={() => setDeleteId(null)}
 *   />
 * ============================================================
 */

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, danger = true }) {
  // Don't render anything if the modal is closed
  if (!open) return null

  return (
    // Semi-transparent overlay — clicking it cancels the action
    <div className="modal-overlay" onClick={onCancel}>
      {/* Modal box — stop click propagation so clicking inside doesn't cancel */}
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>

        {/* Title */}
        <h2 style={{ marginBottom: 12 }}>{title || 'Are you sure?'}</h2>

        {/* Descriptive message */}
        <p style={{ color: 'var(--c-text2)', marginBottom: 24, lineHeight: 1.6 }}>
          {message || 'This action cannot be undone.'}
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>

      </div>
    </div>
  )
}
