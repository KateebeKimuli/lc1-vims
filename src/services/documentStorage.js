/**
 * ============================================================
 * DOCUMENT STORAGE — src/services/documentStorage.js
 * ============================================================
 * Saves generated PDF documents into organised subfolders on
 * the user's computer using the File System Access API.
 *
 * FOLDER STRUCTURE CREATED:
 *   [User chosen base folder]/
 *     LC1-VIMS-[VillageName]/
 *       Birth Certificates/
 *       Death Certificates/
 *       Land Titles/
 *       Official Letters/
 *       Resident Profiles/
 *       Population Reports/
 *       Boundary Reports/
 *       Meeting Minutes/
 *       Identity Cards/
 *       Backups/
 *
 * HOW IT WORKS:
 *   1. First time: user picks a base folder (e.g. Documents or Desktop)
 *      The folder handle is stored in IndexedDB so it persists between
 *      sessions — the user only needs to pick once.
 *   2. Every time a document is generated, it is automatically saved
 *      into the correct subfolder with a dated filename.
 *   3. If the File System Access API is not available (Firefox, older
 *      browsers), falls back to standard browser download into Downloads.
 *
 * BROWSER SUPPORT:
 *   Chrome 86+  ✓  Full support
 *   Edge 86+    ✓  Full support
 *   Firefox     ✗  Falls back to standard download
 *   Safari      ✗  Falls back to standard download
 *
 * USAGE:
 *   import { saveDocument, FOLDERS, promptSetupFolder } from './documentStorage'
 *
 *   // Save a PDF blob to the correct folder
 *   await saveDocument(pdfBlob, 'birth-cert-ssemakula-2026.pdf', FOLDERS.BIRTH_CERTS)
 *
 *   // Let user pick their base folder (call once from Settings)
 *   await promptSetupFolder()
 * ============================================================
 */

// ── Folder names ───────────────────────────────────────────────────────────
export const FOLDERS = {
  BIRTH_CERTS:   'Birth Certificates',
  DEATH_CERTS:   'Death Certificates',
  LAND_TITLES:   'Land Titles',
  LETTERS:       'Official Letters',
  PROFILES:      'Resident Profiles',
  REPORTS:       'Population Reports',
  BOUNDARY:      'Boundary Reports',
  MEETINGS:      'Meeting Minutes',
  IDENTITY:      'Identity Cards',
  BACKUPS:       'Backups',
}

// ── Storage key for the persisted folder handle ────────────────────────────
const HANDLE_DB_KEY  = 'lc1_folder_handle'
const HANDLE_DB_NAME = 'lc1-folder-handles'

// ── Check if File System Access API is available ───────────────────────────
export function isFSApiSupported() {
  return typeof window !== 'undefined' &&
         typeof window.showDirectoryPicker === 'function'
}

// ─────────────────────────────────────────────────────────────────────────
// PERSISTING THE FOLDER HANDLE
// FileSystemDirectoryHandle must be stored in IndexedDB (not localStorage)
// because it is a complex object, not a serialisable string.
// ─────────────────────────────────────────────────────────────────────────

async function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('handles')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function saveHandle(handle) {
  const db  = await openHandleDB()
  const tx  = db.transaction('handles', 'readwrite')
  tx.objectStore('handles').put(handle, HANDLE_DB_KEY)
  return new Promise((res, rej) => {
    tx.oncomplete = res
    tx.onerror    = rej
  })
}

async function loadHandle() {
  try {
    const db  = await openHandleDB()
    const tx  = db.transaction('handles', 'readonly')
    return new Promise((res) => {
      const req = tx.objectStore('handles').get(HANDLE_DB_KEY)
      req.onsuccess = () => res(req.result || null)
      req.onerror   = () => res(null)
    })
  } catch { return null }
}

async function clearHandle() {
  try {
    const db = await openHandleDB()
    const tx = db.transaction('handles', 'readwrite')
    tx.objectStore('handles').delete(HANDLE_DB_KEY)
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────
// VERIFY PERMISSION
// FileSystem handles need permission to be re-verified after browser restart
// ─────────────────────────────────────────────────────────────────────────

async function verifyPermission(handle, readWrite = true) {
  const opts = { mode: readWrite ? 'readwrite' : 'read' }
  if (await handle.queryPermission(opts) === 'granted') return true
  if (await handle.requestPermission(opts) === 'granted') return true
  return false
}

// ─────────────────────────────────────────────────────────────────────────
// GET OR CREATE BASE FOLDER
// ─────────────────────────────────────────────────────────────────────────

/**
 * getBaseFolder(villageName)
 * Returns the LC1-VIMS-[VillageName] folder handle, creating it if needed.
 * Returns null if the user has not set up a folder or permission was denied.
 */
async function getBaseFolder(villageName = 'Village') {
  let rootHandle = await loadHandle()

  // If we have a stored handle, verify we still have permission
  if (rootHandle) {
    try {
      const hasPermission = await verifyPermission(rootHandle)
      if (!hasPermission) {
        await clearHandle()
        rootHandle = null
      }
    } catch {
      await clearHandle()
      rootHandle = null
    }
  }

  // If no valid handle, the user needs to pick a folder
  if (!rootHandle) return null

  // Create or get the village-specific subfolder
  const folderName = `LC1-VIMS-${villageName.replace(/[^a-zA-Z0-9\s\-]/g, '').trim()}`
  try {
    const baseDir = await rootHandle.getDirectoryHandle(folderName, { create: true })
    return baseDir
  } catch {
    return rootHandle  // fallback to root if subfolder creation fails
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────

/**
 * promptSetupFolder()
 * Opens a folder picker for the user to choose their base folder.
 * Called from Settings → Sync & Backup tab.
 * Returns { success, path } or { success: false, error }
 */
export async function promptSetupFolder() {
  if (!isFSApiSupported()) {
    return {
      success: false,
      error: 'Your browser does not support folder selection. Use Google Chrome or Microsoft Edge.',
    }
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode:             'readwrite',
      startIn:          'documents',
      id:               'lc1-vims-docs',
    })
    await saveHandle(handle)
    return { success: true, path: handle.name }
  } catch (err) {
    if (err.name === 'AbortError') return { success: false, error: 'Cancelled' }
    return { success: false, error: err.message }
  }
}

/**
 * getSetupStatus()
 * Returns info about whether a folder is configured.
 */
export async function getSetupStatus() {
  if (!isFSApiSupported()) return { supported: false }
  const handle = await loadHandle()
  if (!handle) return { supported: true, configured: false }
  try {
    const hasPermission = await verifyPermission(handle, false)
    return { supported: true, configured: true, hasPermission, folderName: handle.name }
  } catch {
    return { supported: true, configured: false }
  }
}

/**
 * clearSetupFolder()
 * Removes the stored folder handle (user wants to change folder).
 */
export async function clearSetupFolder() {
  await clearHandle()
}

/**
 * saveDocument(blob, filename, folderType, villageName)
 * Saves a PDF blob to the correct organised subfolder.
 *
 * If the File System Access API is available and a folder is configured,
 * the file is saved directly into the correct subfolder.
 * Otherwise, falls back to a standard browser download.
 *
 * @param {Blob}   blob        - the PDF blob to save
 * @param {string} filename    - the file name (e.g. 'birth-cert-2026.pdf')
 * @param {string} folderType  - one of FOLDERS.xxx constants
 * @param {string} villageName - village name for the root folder
 * @returns {{ saved: boolean, method: 'filesystem'|'download', path?: string }}
 */
export async function saveDocument(blob, filename, folderType, villageName = 'Village') {
  // ── Try File System API first ──────────────────────────────────────────
  if (isFSApiSupported()) {
    try {
      const baseDir = await getBaseFolder(villageName)
      if (baseDir) {
        // Create the document type subfolder
        const subDir     = await baseDir.getDirectoryHandle(folderType, { create: true })
        const fileHandle = await subDir.getFileHandle(filename, { create: true })
        const writable   = await fileHandle.createWritable()
        await writable.write(blob)
        await writable.close()
        return {
          saved:  true,
          method: 'filesystem',
          path:   `LC1-VIMS-${villageName}/${folderType}/${filename}`,
        }
      }
    } catch (err) {
      // Permission denied or other FS error — fall through to download
      console.warn('FS save failed, falling back to download:', err.message)
    }
  }

  // ── Fallback: standard browser download ────────────────────────────────
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { saved: true, method: 'download' }
}

/**
 * savePDFDoc(jsPDFInstance, filename, folderType, villageName)
 * Convenience wrapper for jsPDF instances.
 * Converts the jsPDF doc to a Blob and calls saveDocument().
 *
 * @param {jsPDF}  doc
 * @param {string} filename
 * @param {string} folderType
 * @param {string} villageName
 */
export async function savePDFDoc(doc, filename, folderType, villageName = 'Village') {
  const blob = doc.output('blob')
  return saveDocument(blob, filename, folderType, villageName)
}
