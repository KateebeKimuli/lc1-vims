/**
 * ============================================================
 * IMAGE COMPRESSION — src/utils/imageCompress.js
 * ============================================================
 * Resizes and re-encodes images to small JPEGs before they are
 * stored in IndexedDB and synced to Supabase.
 *
 * A typical 2–4 MB phone photo becomes ~30–60 KB with no visible
 * quality loss at ID-card / passport-photo size. This keeps the
 * local database lean and makes cloud sync fast even on poor
 * rural connections.
 *
 * USAGE:
 *   import { compressImage, compressFromFile } from '../utils/imageCompress'
 *
 *   // From a base64 data URL (e.g. webcam screenshot):
 *   const small = await compressImage(dataUrl, { maxSize: 400 })
 *
 *   // From a File object (e.g. <input type=file>):
 *   const small = await compressFromFile(file, { maxSize: 400 })
 * ============================================================
 */

/**
 * compressImage(src, opts)
 * @param {string} src   - image source: base64 data URL or object URL
 * @param {object} opts
 *   maxSize  - max pixels on the longest edge (default 400)
 *   quality  - JPEG quality 0–1 (default 0.8)
 *   mime     - output type (default 'image/jpeg')
 * @returns {Promise<string>} compressed base64 data URL
 */
export function compressImage(src, opts = {}) {
  const maxSize = opts.maxSize ?? 400
  const quality = opts.quality ?? 0.8
  const mime    = opts.mime    ?? 'image/jpeg'

  return new Promise((resolve, reject) => {
    if (!src) { resolve(src); return }

    const img = new Image()
    // Allow drawing cross-origin object URLs to canvas
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        let { width, height } = img
        if (!width || !height) { resolve(src); return }

        // Scale so the longest edge == maxSize (only shrink, never enlarge)
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height / width) * maxSize)
            width  = maxSize
          } else {
            width  = Math.round((width / height) * maxSize)
            height = maxSize
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        // White background — JPEG has no transparency, avoids black fills
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        const out = canvas.toDataURL(mime, quality)
        // If somehow the output is larger than input, keep the smaller one
        resolve(out.length < src.length ? out : src)
      } catch (err) {
        // On any failure, fall back to the original so we never block the user
        resolve(src)
      }
    }

    img.onerror = () => resolve(src)
    img.src = src
  })
}

/**
 * compressFromFile(file, opts)
 * Reads a File/Blob, then compresses it.
 * @returns {Promise<string>} compressed base64 data URL
 */
export function compressFromFile(file, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No file provided')); return }
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const compressed = await compressImage(e.target.result, opts)
        resolve(compressed)
      } catch {
        resolve(e.target.result)  // fall back to raw
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Rough byte size of a base64 data URL (for logging / UI hints).
 */
export function dataUrlSizeKB(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0
  const base64 = dataUrl.split(',')[1] || ''
  return Math.round((base64.length * 3 / 4) / 1024)
}
