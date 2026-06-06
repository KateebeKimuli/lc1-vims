/**
 * ============================================================
 * CONNECTIVITY NOTIFIER — src/components/shared/ConnectivityNotifier.jsx
 * ============================================================
 * Detects REAL internet reachability, not just whether a network
 * interface exists. navigator.onLine is unreliable — it reports
 * "online" whenever WiFi/LAN is connected, even with no internet.
 *
 * STRATEGY (active heartbeat):
 *   1. Listen to browser online/offline events (fast hint)
 *   2. ACTIVELY ping a real endpoint every few seconds:
 *        - your Supabase URL if configured
 *        - else a tiny well-known public endpoint
 *   3. Status = whether that ping actually succeeds
 *   4. Debounce: needs 1 confirmation to flip state (avoids flicker)
 *
 * Shows:
 *   • Red toast when reachability is lost
 *   • Green toast when restored
 *   • Always-visible pill (bottom-left) with live state
 * ============================================================
 */
import { useState, useEffect, useRef } from 'react'
import { getSupabaseConfig } from '../../services/cloudSync'

// How often to actively check (ms)
const CHECK_INTERVAL = 5000
// Fetch timeout for each probe (ms)
const PROBE_TIMEOUT  = 4000

// Pick a URL we can probe. Prefer Supabase (same server we sync to).
function getProbeTarget() {
  try {
    const cfg = getSupabaseConfig()
    if (cfg?.url) {
      // Supabase REST root responds quickly; cache-bust each time
      return { url: `${cfg.url.replace(/\/$/, '')}/rest/v1/`, mode: 'cors', headers: cfg.anonKey ? { apikey: cfg.anonKey } : {} }
    }
  } catch {}
  // Fallback: a tiny, fast, CORS-friendly public endpoint
  return { url: 'https://www.gstatic.com/generate_204', mode: 'no-cors', headers: {} }
}

// Run one reachability probe. Resolves true if the network round-trips.
async function probe() {
  const target = getProbeTarget()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT)
  try {
    await fetch(`${target.url}${target.url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
      method: 'GET',
      mode: target.mode,
      cache: 'no-store',
      signal: controller.signal,
      headers: target.headers,
    })
    clearTimeout(timer)
    // In no-cors mode the response is opaque but a resolved fetch = network reached
    return true
  } catch {
    clearTimeout(timer)
    return false
  }
}

export default function ConnectivityNotifier() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [toast,  setToast]  = useState(null)

  const onlineRef  = useRef(online)
  const hideTimer  = useRef(null)
  const pollTimer  = useRef(null)
  const firstCheck = useRef(true)

  useEffect(() => { onlineRef.current = online }, [online])

  useEffect(() => {
    let cancelled = false

    function showToast(type) {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      const id = Date.now()
      setToast({ type, id })
      hideTimer.current = setTimeout(() => {
        setToast(t => (t && t.id === id ? null : t))
      }, type === 'offline' ? 8000 : 4000)
    }

    // Apply a new reachability reading, firing toast only on change
    function applyState(isReachable) {
      if (cancelled) return
      const was = onlineRef.current
      if (isReachable === was) return  // no change

      onlineRef.current = isReachable
      setOnline(isReachable)

      // Don't toast on the very first determination
      if (firstCheck.current) { firstCheck.current = false; return }

      if (isReachable) {
        showToast('online')
        try { window.dispatchEvent(new CustomEvent('lc1:reconnected')) } catch {}
      } else {
        showToast('offline')
      }
    }

    async function runProbe() {
      // If the browser itself says offline, trust that immediately (it's only
      // wrong in the "interface up but no internet" direction, never the reverse)
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        applyState(false)
        firstCheck.current = false
        return
      }
      const reachable = await probe()
      applyState(reachable)
      if (firstCheck.current) firstCheck.current = false
    }

    // Browser events give us a fast nudge — but we always confirm with a probe
    function onBrowserOnline()  { runProbe() }
    function onBrowserOffline() { applyState(false); firstCheck.current = false }

    window.addEventListener('online',  onBrowserOnline)
    window.addEventListener('offline', onBrowserOffline)

    // Re-check when tab becomes visible again
    function onVisible() { if (document.visibilityState === 'visible') runProbe() }
    document.addEventListener('visibilitychange', onVisible)

    // Initial probe + steady polling
    runProbe()
    pollTimer.current = setInterval(runProbe, CHECK_INTERVAL)

    return () => {
      cancelled = true
      window.removeEventListener('online',  onBrowserOnline)
      window.removeEventListener('offline', onBrowserOffline)
      document.removeEventListener('visibilitychange', onVisible)
      if (pollTimer.current) clearInterval(pollTimer.current)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  return (
    <>
      <style>{`
        @keyframes lc1-slide-in {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes lc1-pulse {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.4; }
        }
      `}</style>

      {/* Transition toast (top-right) */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', top: 20, right: 20, zIndex: 99999,
            minWidth: 280, maxWidth: 360, padding: '14px 18px',
            borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
            color: '#fff', fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 8px 30px rgba(0,0,0,0.28)',
            animation: 'lc1-slide-in 0.35s cubic-bezier(0.22,1,0.36,1)',
            background: toast.type === 'online'
              ? 'linear-gradient(135deg, #1A7F46, #0F5C30)'
              : 'linear-gradient(135deg, #C0392B, #8E2419)',
            border: `1px solid ${toast.type === 'online' ? '#27AE60' : '#E74C3C'}`,
          }}
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>
            {toast.type === 'online' ? '📶' : '📵'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
              {toast.type === 'online' ? 'Back online' : 'You are now offline'}
            </div>
            <div style={{ fontSize: 12, opacity: 0.92, lineHeight: 1.45 }}>
              {toast.type === 'online'
                ? 'Connection restored. Your data will sync to the cloud automatically.'
                : 'No internet connection. You can keep working — everything is saved on this device and will sync when you reconnect.'}
            </div>
          </div>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            style={{
              background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff',
              borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14, flexShrink: 0,
            }}
          >✕</button>
        </div>
      )}

      {/* Persistent status pill (bottom-left) */}
      <div
        style={{
          position: 'fixed', bottom: 16, left: 16, zIndex: 99998,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
          color: online ? '#0F5C30' : '#8E2419',
          background: online ? 'rgba(39,174,96,0.14)' : 'rgba(231,76,60,0.16)',
          border: `1px solid ${online ? 'rgba(39,174,96,0.5)' : 'rgba(231,76,60,0.6)'}`,
          backdropFilter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none',
        }}
      >
        <span
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: online ? '#27AE60' : '#E74C3C',
            animation: online ? 'none' : 'lc1-pulse 1.2s ease-in-out infinite',
            display: 'inline-block',
          }}
        />
        {online ? 'Online' : 'Offline'}
      </div>
    </>
  )
}
