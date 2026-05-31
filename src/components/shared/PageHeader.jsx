/**
 * ============================================================
 * SHARED PAGE HEADER — src/components/shared/PageHeader.jsx
 * ============================================================
 * Consistent top-of-page header used by every module page.
 * Renders the page title, subtitle, and an optional actions
 * slot (typically a "+ Add" button).
 *
 * Usage:
 *   <PageHeader
 *     title="Residents"
 *     sub="248 records"
 *     actions={<button className="btn btn-primary" onClick={...}>+ Add</button>}
 *   />
 * ============================================================
 */

export default function PageHeader({ title, sub, actions }) {
  return (
    <div className="page-header">
      {/* Left side: title and subtitle */}
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>

      {/* Right side: action buttons (optional) */}
      {actions && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  )
}
