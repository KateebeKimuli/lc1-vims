/**
 * ============================================================
 * ROOT ROUTER — src/App.jsx  (v2)
 * ============================================================
 * Updated:
 *   - Initialises the sync engine on startup
 *   - Protected route uses RBAC: restricted roles are redirected
 *     away from routes they cannot access
 * ============================================================
 */

import { useEffect }                      from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth }                        from './hooks/useAuth'
import { initSyncEngine }                 from './sync/syncEngine'
import Layout                             from './components/layout/Layout'
import LoginPage                          from './pages/LoginPage'
import Dashboard                          from './pages/Dashboard'
import ResidentsPage                      from './pages/ResidentsPage'
import ResidentForm                       from './pages/ResidentForm'
import ResidentProfile                    from './pages/ResidentProfile'
import HouseholdsPage                     from './pages/HouseholdsPage'
import LandPage                           from './pages/LandPage'
import CasesPage                          from './pages/CasesPage'
import MeetingsPage                       from './pages/MeetingsPage'
import BirthsPage                         from './pages/BirthsPage'
import DeathsPage                         from './pages/DeathsPage'
import LettersPage                        from './pages/LettersPage'
import WelfarePage                        from './pages/WelfarePage'
import BusinessesPage                     from './pages/BusinessesPage'
import SecurityPage                       from './pages/SecurityPage'
import ReportsPage                        from './pages/ReportsPage'
import AuditPage                          from './pages/AuditPage'
import SettingsPage                       from './pages/SettingsPage'

// ── Initialise sync engine once on app load ────────────────────────────────
// Must be called before any sync operations. Sets up online/offline
// listeners and schedules background sync every 5 minutes.
initSyncEngine()

// ── Protected route wrapper ────────────────────────────────────────────────
/**
 * Guards a route:
 *   1. If not logged in → redirect to /login
 *   2. If logged in but role cannot access this route → redirect to /
 *   3. Otherwise → render children
 */
function Protected({ children }) {
  const { user, loading, canAccessRoute } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        height:'100vh', color:'var(--c-text2)', fontFamily:'var(--font-body)' }}>
        Loading…
      </div>
    )
  }

  // Not logged in
  if (!user) return <Navigate to="/login" replace />

  // Logged in but no access to this specific route
  if (!canAccessRoute(location.pathname)) {
    return <Navigate to="/" replace />
  }

  return children
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  // Auto-start Supabase sync when user logs in
  // The sync is started by the AuthProvider when a village session is restored

  const { user } = useAuth()
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      {/* Protected shell */}
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index                  element={<Dashboard />} />
        <Route path="residents"       element={<Protected><ResidentsPage /></Protected>} />
        <Route path="residents/new"   element={<Protected><ResidentForm /></Protected>} />
        <Route path="residents/:id"   element={<Protected><ResidentProfile /></Protected>} />
        <Route path="residents/:id/edit" element={<Protected><ResidentForm /></Protected>} />
        <Route path="households"      element={<Protected><HouseholdsPage /></Protected>} />
        <Route path="land"            element={<Protected><LandPage /></Protected>} />
        <Route path="cases"           element={<Protected><CasesPage /></Protected>} />
        <Route path="meetings"        element={<Protected><MeetingsPage /></Protected>} />
        <Route path="births"          element={<Protected><BirthsPage /></Protected>} />
        <Route path="deaths"          element={<Protected><DeathsPage /></Protected>} />
        <Route path="letters"         element={<Protected><LettersPage /></Protected>} />
        <Route path="welfare"         element={<Protected><WelfarePage /></Protected>} />
        <Route path="businesses"      element={<Protected><BusinessesPage /></Protected>} />
        <Route path="security"        element={<Protected><SecurityPage /></Protected>} />
        <Route path="reports"         element={<Protected><ReportsPage /></Protected>} />
        <Route path="audit"           element={<Protected><AuditPage /></Protected>} />
        <Route path="settings"        element={<Protected><SettingsPage /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
