import { useState, useEffect, useRef } from 'react'

// Simple hook reporting navigator.onLine and optional server reachability
// Returns an object: { online: boolean, lastChanged: ISOString }
export default function useOnlineStatus(pingUrl = null, intervalMs = 30000) {
  const initial = (typeof navigator !== 'undefined') ? navigator.onLine : true
  const [state, setState] = useState({ online: initial, lastChanged: new Date().toISOString() })
  const mounted = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!mounted.current) {
      // Sync initial value
      console.debug('[useOnlineStatus] init navigator.onLine=', navigator.onLine)
      setState({ online: navigator.onLine, lastChanged: new Date().toISOString() })
      mounted.current = true
    }

    const handleOnline = () => {
      console.debug('[useOnlineStatus] online event')
      setState({ online: true, lastChanged: new Date().toISOString() })
    }
    const handleOffline = () => {
      console.debug('[useOnlineStatus] offline event')
      setState({ online: false, lastChanged: new Date().toISOString() })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    let timer = null
    let cancelled = false

    async function checkPing() {
      if (!pingUrl) return
      try {
        console.debug('[useOnlineStatus] ping', pingUrl)
        const res = await fetch(pingUrl, { method: 'HEAD', cache: 'no-store' })
        if (!cancelled) setState({ online: res.ok, lastChanged: new Date().toISOString() })
      } catch (err) {
        console.debug('[useOnlineStatus] ping failed', err?.message || err)
        if (!cancelled) setState({ online: false, lastChanged: new Date().toISOString() })
      }
    }

    if (pingUrl) {
      checkPing()
      timer = setInterval(checkPing, intervalMs)
    }

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (timer) clearInterval(timer)
    }
  }, [pingUrl, intervalMs])

  return state
}
