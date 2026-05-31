/**
 * ============================================================
 * RICH TEXT EDITOR — src/components/shared/RichTextEditor.jsx
 * ============================================================
 * A lightweight document editor providing:
 *   Bold · Italic · Underline · Strikethrough
 *   Headings (H1, H2) · Bullet list · Numbered list
 *   Align left / centre / right
 *   Indent / outdent
 *   Horizontal rule
 *   Clear formatting
 *
 * Built on the browser's built-in contentEditable + execCommand
 * so it requires ZERO external dependencies.
 *
 * STORAGE FORMAT:
 *   Content is stored as HTML string (e.g. "<b>Bold text</b>").
 *   This preserves formatting when displayed and when printed to PDF.
 *   The `stripHtml(html)` helper extracts plain text for any
 *   context that needs it (PDF body, SMS, search index).
 *
 * USAGE:
 *   import RichTextEditor, { stripHtml } from '../components/shared/RichTextEditor'
 *
 *   // Controlled — value + onChange (like a textarea)
 *   <RichTextEditor
 *     value={form.minutes}
 *     onChange={html => setForm(prev => ({ ...prev, minutes: html }))}
 *     placeholder="Record what was discussed…"
 *     minHeight={160}
 *     label="Minutes / Resolutions"
 *   />
 *
 * IMPORTANT — DEFINED AT MODULE SCOPE:
 *   All sub-components (ToolbarButton, ToolbarSep) are defined
 *   outside the main component to prevent React from remounting
 *   them (and losing focus) on every parent re-render.
 * ============================================================
 */

import { useRef, useEffect, useCallback, useState } from 'react'

// ── Toolbar button — module scope, stable identity ────────────────────────
function ToolbarButton({ title, onClick, active, children, wide }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => {
        // Prevent the editor from losing focus when toolbar is clicked
        e.preventDefault()
        onClick()
      }}
      style={{
        padding:      wide ? '4px 8px' : '4px 6px',
        border:       'none',
        borderRadius: 5,
        background:   active ? 'var(--c-green)' : 'var(--c-border)',
        color:        active ? '#fff' : 'var(--c-text)',
        cursor:       'pointer',
        fontSize:     13,
        fontWeight:   600,
        lineHeight:   1,
        minWidth:     26,
        transition:   'background 0.12s, color 0.12s',
        flexShrink:   0,
      }}
    >
      {children}
    </button>
  )
}

// ── Toolbar separator ─────────────────────────────────────────────────────
function ToolbarSep() {
  return (
    <div style={{
      width:      1,
      height:     22,
      background: 'var(--c-border2)',
      margin:     '0 4px',
      flexShrink: 0,
    }} />
  )
}

// ── Helper: strip HTML tags to get plain text ─────────────────────────────
/**
 * stripHtml(html)
 * Converts HTML-formatted content back to plain text.
 * Used when passing content to PDF generators or SMS.
 *
 * e.g. "<b>Hello</b><br>World" → "Hello\nWorld"
 */
export function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — module scope
// ═══════════════════════════════════════════════════════════════════════════

export default function RichTextEditor({
  value       = '',
  onChange,
  placeholder = 'Type here…',
  minHeight   = 140,
  label,
  required    = false,
}) {
  const editorRef    = useRef(null)
  const isComposing  = useRef(false)  // IME composition guard
  const lastHtml     = useRef(value)  // track last HTML to avoid needless updates

  // Active format states for toolbar button highlighting
  const [formats, setFormats] = useState({
    bold: false, italic: false, underline: false, strikethrough: false,
  })

  // ── Sync incoming value → editor DOM (edit mode load) ─────────────────
  // Only update DOM if value changed externally (e.g. when the modal opens
  // with existing data). Avoid overwriting during user typing.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (value !== lastHtml.current) {
      el.innerHTML = value || ''
      lastHtml.current = value
    }
  }, [value])

  // ── Execute a formatting command ───────────────────────────────────────
  const exec = useCallback((command, arg = null) => {
    editorRef.current?.focus()
    document.execCommand(command, false, arg)
    updateFormatState()
    // Trigger onChange with current content after command
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      lastHtml.current = html
      onChange?.(html)
    }
  }, [onChange])

  // ── Update toolbar active states ───────────────────────────────────────
  function updateFormatState() {
    setFormats({
      bold:          document.queryCommandState('bold'),
      italic:        document.queryCommandState('italic'),
      underline:     document.queryCommandState('underline'),
      strikethrough: document.queryCommandState('strikeThrough'),
    })
  }

  // ── Handle editor input — fire onChange with HTML ──────────────────────
  function handleInput() {
    if (isComposing.current) return  // wait for IME composition to finish
    const el = editorRef.current
    if (!el) return
    const html = el.innerHTML
    // Treat empty / whitespace-only content as empty string
    const isEmpty = html === '<br>' || html === '' || !el.textContent.trim()
    const out     = isEmpty ? '' : html
    lastHtml.current = out
    onChange?.(out)
    updateFormatState()
  }

  // ── Handle keyboard shortcuts ──────────────────────────────────────────
  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); exec('bold');         break
        case 'i': e.preventDefault(); exec('italic');       break
        case 'u': e.preventDefault(); exec('underline');    break
      }
    }
  }

  // ── Toolbar groups ─────────────────────────────────────────────────────
  // Each group is an array of button definitions
  const TOOLBAR = [
    // Text style
    [
      { cmd: 'bold',        icon: 'B',  title: 'Bold (Ctrl+B)',       style: { fontWeight:'900' }             },
      { cmd: 'italic',      icon: 'I',  title: 'Italic (Ctrl+I)',     style: { fontStyle:'italic' }           },
      { cmd: 'underline',   icon: 'U',  title: 'Underline (Ctrl+U)',  style: { textDecoration:'underline' }   },
      { cmd: 'strikeThrough',icon:'S',  title: 'Strikethrough',       style: { textDecoration:'line-through'} },
    ],
    // Headings
    [
      { cmd: 'formatBlock', arg: 'H1', icon: 'H1', title: 'Heading 1', wide: true },
      { cmd: 'formatBlock', arg: 'H2', icon: 'H2', title: 'Heading 2', wide: true },
      { cmd: 'formatBlock', arg: 'P',  icon: 'P',  title: 'Paragraph', wide: true },
    ],
    // Lists
    [
      { cmd: 'insertUnorderedList', icon: '• —', title: 'Bullet list',   wide: true },
      { cmd: 'insertOrderedList',   icon: '1.—', title: 'Numbered list', wide: true },
    ],
    // Alignment
    [
      { cmd: 'justifyLeft',   icon: '⬛▬▬', title: 'Align left'   },
      { cmd: 'justifyCenter', icon: '▬⬛▬', title: 'Align centre' },
      { cmd: 'justifyRight',  icon: '▬▬⬛', title: 'Align right'  },
    ],
    // Indent
    [
      { cmd: 'indent',   icon: '→|', title: 'Indent',   wide: true },
      { cmd: 'outdent',  icon: '|←', title: 'Outdent',  wide: true },
    ],
    // Insert / clear
    [
      { cmd: 'insertHorizontalRule', icon: '—', title: 'Insert horizontal line', wide: true },
      { cmd: 'removeFormat',         icon: '✕', title: 'Clear formatting',       wide: true },
    ],
  ]

  // Active state lookup for toggle buttons
  const isActive = (cmd) => {
    if (cmd === 'bold')         return formats.bold
    if (cmd === 'italic')       return formats.italic
    if (cmd === 'underline')    return formats.underline
    if (cmd === 'strikeThrough')return formats.strikethrough
    return false
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="form-group">
      {/* Label */}
      {label && (
        <label className="form-label">
          {label}{required && <span style={{ color:'var(--c-red-l)', marginLeft:4 }}>*</span>}
        </label>
      )}

      {/* Editor container */}
      <div style={{
        border:       '1px solid var(--c-border)',
        borderRadius: 'var(--r-md)',
        overflow:     'hidden',
        background:   'var(--c-surface2)',
        transition:   'border-color 0.15s',
      }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--c-green-l)'}
        onBlur={e  => e.currentTarget.style.borderColor = 'var(--c-border)'}
      >

        {/* ── Toolbar ── */}
        <div style={{
          display:    'flex',
          flexWrap:   'wrap',
          gap:        4,
          padding:    '6px 8px',
          borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-surface)',
          alignItems: 'center',
        }}>
          {TOOLBAR.map((group, gi) => (
            <>
              {gi > 0 && <ToolbarSep key={`sep-${gi}`} />}
              {group.map(btn => (
                <ToolbarButton
                  key={btn.cmd + (btn.arg || '')}
                  title={btn.title}
                  active={isActive(btn.cmd)}
                  wide={btn.wide}
                  onClick={() => exec(btn.cmd, btn.arg || null)}
                >
                  <span style={btn.style || {}}>{btn.icon}</span>
                </ToolbarButton>
              ))}
            </>
          ))}
        </div>

        {/* ── Editable content area ── */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={updateFormatState}
          onMouseUp={updateFormatState}
          onCompositionStart={() => { isComposing.current = true }}
          onCompositionEnd={() => { isComposing.current = false; handleInput() }}
          data-placeholder={placeholder}
          style={{
            minHeight:   minHeight,
            padding:     '10px 14px',
            outline:     'none',
            color:       'var(--c-text)',
            fontSize:    14,
            lineHeight:  1.7,
            fontFamily:  'var(--font-body)',
            // Placeholder via CSS — shown when editor is empty
            position:    'relative',
          }}
          // CSS placeholder trick using :empty pseudo-class
        />
      </div>

      {/* Character / word count */}
      <CharCount editorRef={editorRef} />
    </div>
  )
}

// ── Character count display — module scope ─────────────────────────────────
function CharCount({ editorRef }) {
  const [count, setCount] = useState({ chars: 0, words: 0 })

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    function update() {
      const text  = el.textContent || ''
      const words = text.trim() ? text.trim().split(/\s+/).length : 0
      setCount({ chars: text.length, words })
    }
    el.addEventListener('input', update)
    return () => el.removeEventListener('input', update)
  }, [])

  return (
    <div style={{ fontSize:11, color:'var(--c-text3)', marginTop:3, textAlign:'right' }}>
      {count.words} words · {count.chars} characters
    </div>
  )
}
