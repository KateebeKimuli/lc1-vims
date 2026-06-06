/**
 * ============================================================
 * LOGO UPLOAD COMPONENT — src/components/shared/LogoUpload.jsx
 * ============================================================
 * Lets the user upload the official Ministry of Local Government
 * (or any organisation) logo. The logo is stored as a base64
 * data URL in IndexedDB settings under the key 'officialLogo'.
 *
 * Once uploaded, the logo appears:
 *   - In the sidebar header (replacing the text badge)
 *   - On the login screen
 *   - On every printed/PDF document (letterhead top-left)
 *
 * Accepted formats: PNG, JPG, JPEG, SVG
 * Recommended: PNG with transparent background, min 200×200px
 * Maximum size: 2MB (enforced by this component)
 *
 * The component also shows a live preview of the letterhead
 * as it will appear on printed documents.
 * ============================================================
 */

import { useState, useEffect, useRef } from 'react'
import { useToast, Toast }             from './Toast'
import { compressImage }               from '../../utils/imageCompress'

// Max file size: 2MB in bytes
const MAX_SIZE = 2 * 1024 * 1024

// Module-scope helper — defined outside component to prevent remount on re-render
function PreviewLetterhead({ logo, villageName, districtName }) {
  return (
    <div style={{
      border:       '1px solid var(--c-border)',
      borderRadius: 10,
      padding:      16,
      background:   '#fff',
      color:        '#000',
      fontFamily:   'serif',
    }}>
      {/* Letterhead preview */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>

        {/* Logo preview */}
        <div style={{
          width: 56, height: 56, flexShrink: 0,
          border: '1px solid #ccc', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', background: '#f5f5f5',
        }}>
          {logo
            ? <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 10, color: '#aaa', textAlign: 'center' }}>No logo</span>
          }
        </div>

        {/* Ministry text block */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: '#555', letterSpacing: 1 }}>
            REPUBLIC OF UGANDA
          </div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#004d00', marginTop: 2 }}>
            MINISTRY OF LOCAL GOVERNMENT
          </div>
          <div style={{ width: '80%', height: 1, background: '#004d00', margin: '4px auto' }} />
          <div style={{ fontSize: 10, fontWeight: 700 }}>
            {villageName || 'VILLAGE NAME'} VILLAGE — LOCAL COUNCIL 1
          </div>
          <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>
            {districtName || 'District'} District · Uganda
          </div>
        </div>

      </div>

      {/* Double rule */}
      <div style={{ height: 3, background: '#004d00', marginBottom: 1 }} />
      <div style={{ height: 1, background: '#004d00', marginBottom: 8 }} />

      {/* Sample content */}
      <div style={{ fontSize: 8, color: '#777', fontStyle: 'italic' }}>
        [Document content appears here]
      </div>
    </div>
  )
}

// ── Main upload component ──────────────────────────────────────────────────
export default function LogoUpload({ currentLogo, onLogoChange, settings }) {
  const { toast, showToast } = useToast()
  const fileInputRef = useRef(null)
  const [preview,  setPreview]  = useState(currentLogo || null)
  const [dragging, setDragging] = useState(false)

  // Keep preview in sync if currentLogo changes externally
  useEffect(() => {
    setPreview(currentLogo || null)
  }, [currentLogo])

  // ── Process a selected/dropped file ────────────────────────────────────
  function processFile(file) {
    if (!file) return

    // Validate type
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if (!allowed.includes(file.type)) {
      showToast('Please upload a PNG, JPG, or SVG image', 'error')
      return
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      showToast('Image must be under 2MB. Please resize and try again.', 'error')
      return
    }

    // Convert to base64, then compress (logos stay crisp at 500px for print)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const raw = e.target.result
      // PNG logos often have transparency — keep PNG to preserve it; else JPEG
      const isPng = file.type === 'image/png'
      const dataUrl = await compressImage(raw, {
        maxSize: 500,
        quality: 0.9,
        mime: isPng ? 'image/png' : 'image/jpeg',
      })
      setPreview(dataUrl)
      onLogoChange(dataUrl)
      showToast('Logo uploaded successfully')
    }
    reader.onerror = () => showToast('Failed to read file', 'error')
    reader.readAsDataURL(file)
  }

  // ── File input change ──────────────────────────────────────────────────
  function handleFileInput(e) {
    processFile(e.target.files?.[0])
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  // ── Drag and drop ──────────────────────────────────────────────────────
  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    processFile(e.dataTransfer.files?.[0])
  }

  function handleDragOver(e) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave() {
    setDragging(false)
  }

  // ── Remove logo ────────────────────────────────────────────────────────
  function removeLogo() {
    setPreview(null)
    onLogoChange(null)
    showToast('Logo removed')
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Upload zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border:        `2px dashed ${dragging ? 'var(--c-green)' : 'var(--c-border2)'}`,
          borderRadius:  12,
          padding:       '24px 20px',
          textAlign:     'center',
          cursor:        'pointer',
          background:    dragging ? 'rgba(45,122,79,0.08)' : 'var(--c-surface2)',
          transition:    'all 0.15s',
        }}
      >
        {preview ? (
          /* Show current logo with replace hint */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <img
              src={preview}
              alt="Current logo"
              style={{
                maxWidth: 120, maxHeight: 120,
                objectFit: 'contain',
                borderRadius: 8,
                border: '1px solid var(--c-border)',
                background: '#fff',
                padding: 4,
              }}
            />
            <div style={{ fontSize: 13, color: 'var(--c-text2)' }}>
              Click or drag to replace logo
            </div>
          </div>
        ) : (
          /* Empty state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 48 }}>🖼️</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--c-text)' }}>
              Upload official logo
            </div>
            <div style={{ fontSize: 13, color: 'var(--c-text2)', lineHeight: 1.5 }}>
              Drag &amp; drop here, or click to browse
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text3)' }}>
              PNG or JPG · Transparent background recommended · Max 2MB
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/svg+xml"
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={() => fileInputRef.current?.click()}
        >
          📁 Browse for logo
        </button>
        {preview && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={removeLogo}
          >
            Remove
          </button>
        )}
      </div>

      {/* Guidance */}
      <div style={{
        fontSize: 12, color: 'var(--c-text3)', lineHeight: 1.7,
        background: 'var(--c-surface2)', borderRadius: 8, padding: '10px 14px',
      }}>
        <strong style={{ color: 'var(--c-text2)' }}>Tip:</strong> For the best result on printed documents,
        use the official Uganda Ministry of Local Government logo in PNG format with a transparent background.
        The logo will appear in the top-left of all letterheads, letters, certificates, and reports.
      </div>

      {/* Live letterhead preview */}
      <div>
        <div className="section-title" style={{ marginBottom: 10 }}>
          Live document preview
        </div>
        <PreviewLetterhead
          logo={preview}
          villageName={settings?.villageName}
          districtName={settings?.districtName}
        />
      </div>

      <Toast toast={toast} />
    </div>
  )
}
