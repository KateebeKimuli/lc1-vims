/**
 * ============================================================
 * SYNC STATUS HOOK — src/hooks/useSyncStatus.js
 * ============================================================
 * Connects the UI to the Supabase cloud sync service.
 * Provides real-time sync status to any component.
 *
 * WHAT IT DOES:
 *   • Reads current sync status from localStorage (set by cloudSync.js)
 *   • Starts auto-sync (every 30s) when the user is online
 *   • Exposes triggerSync() for manual on-demand sync
 *   • Polls for status updates every 3s so the UI stays fresh
 *
 * USAGE:
 *   const { online, isSyncing, pendingCount, lastSyncAt, error, triggerSync } = useSyncStatus()
 * ============================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth }                                  from './useAuth'
import { syncVillage, getSyncStatus, getSupabaseConfig, startAutoSync } from '../services/cloudSync'

export function useSyncStatus() {
  const { user } = useAuth()

  const [online,       setOnline]       = useState(navigator.onLine)
  const [isSyncing,    setIsSyncing]    = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSyncAt,   setLastSyncAt]   = useState(null)
  const [error,        setError]        = useState(null)
  const [pushed,       setPushed]       = useState(0)
  const [pulled,       setPulled]       = useState(0)

  const syncingRef = useRef(false)

  // ── Read latest status from localStorage ──────────────────────────────
  const refreshStatus = useCallback(() => {
    const s = getSyncStatus()
    setIsSyncing(s.status === 'syncing')
    setLastSyncAt(s.lastSync || null)
    setError(s.status === 'error' ? s.error : null)
    if (s.pushed  !== undefined) setPushed(s.pushed)
    if (s.pulled  !== undefined) setPulled(s.pulled)

    // Count pending records from IndexedDB (approximate via sync status)
    if (s.status === 'synced') setPendingCount(0)
  }, [])

  // ── Poll status every 3 seconds ───────────────────────────────────────
  useEffect(() => {
    refreshStatus()
    const poll = setInterval(refreshStatus, 3000)
    return () => clearInterval(poll)
  }, [refreshStatus])

  // ── Online/offline detection ──────────────────────────────────────────
  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => { setOnline(false); setError(null) }
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online',  on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // ── Start auto-sync when user logs in and Supabase is configured ──────
  useEffect(() => {
    const cfg = getSupabaseConfig()
    if (!cfg.enabled || !cfg.url || !cfg.anonKey) return
    if (!user?.villageId || user.villageId === 'MASTER') return

    startAutoSync(user.villageId, (status, p, pl, err) => {
      setIsSyncing(status === 'syncing')
      if (status === 'synced') {
        setPendingCount(0)
        setError(null)
        setPushed(p || 0)
        setPulled(pl || 0)
      }
      if (status === 'error') setError(err || 'Sync failed')
      if (status === 'offline') setError(null)
    })
  }, [user?.villageId])

  // ── Manual sync trigger ────────────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return
    const cfg = getSupabaseConfig()
    if (!cfg.enabled || !cfg.url || !cfg.anonKey) {
      setError('Supabase not configured — go to Settings → Sync & Backup')
      return
    }
    if (!user?.villageId || user.villageId === 'MASTER') {
      setError('No village selected')
      return
    }
    syncingRef.current = true
    setIsSyncing(true)
    setError(null)
    try {
      const result = await syncVillage(user.villageId, (status) => {
        setIsSyncing(status === 'syncing')
      })
      if (result?.skipped) {
        setError('Configure Supabase in Settings → Sync & Backup first')
      } else {
        setPushed(result?.pushed || 0)
        setPulled(result?.pulled || 0)
        setPendingCount(0)
        setLastSyncAt(new Date().toISOString())
        setError(null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSyncing(false)
      syncingRef.current = false
      refreshStatus()
    }
  }, [user?.villageId, refreshStatus])

  // ── Check if Supabase is configured ───────────────────────────────────
  const cfg = getSupabaseConfig()
  const isConfigured = !!(cfg.enabled && cfg.url && cfg.anonKey)

  return {
    online,
    isSyncing,
    pendingCount,
    lastSyncAt,
    error,
    pushed,
    pulled,
    isConfigured,
    triggerSync,
  }
}
