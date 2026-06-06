import { useEffect }                      from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth }                        from './hooks/useAuth'
import { initSyncEngine }                 from './sync/syncEngine'
import Layout                             from './components/layout/Layout'
import VillageGuard                       from './components/shared/VillageGuard'
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
initSyncEngine()

// ── Village-aware wrapper — shows village picker for sysadmin ─────────────
// All village-specific pages are wrapped so sysadmin MUST select a village first
const V = ({ children }) => <VillageGuard>{children}</VillageGuard>

// ── Protected route wrapper ────────────────────────────────────────────────
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

  if (!user) return <Navigate to="/login" replace />
  if (!canAccessRoute(location.pathname)) return <Navigate to="/" replace />
  return children
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index                     element={<Dashboard />} />
        <Route path="residents"          element={<Protected><V><ResidentsPage /></V></Protected>} />
        <Route path="residents/new"      element={<Protected><V><ResidentForm /></V></Protected>} />
        <Route path="residents/:id"      element={<Protected><V><ResidentProfile /></V></Protected>} />
        <Route path="residents/:id/edit" element={<Protected><V><ResidentForm /></V></Protected>} />
        <Route path="households"         element={<Protected><V><HouseholdsPage /></V></Protected>} />
        <Route path="land"               element={<Protected><V><LandPage /></V></Protected>} />
        <Route path="cases"              element={<Protected><V><CasesPage /></V></Protected>} />
        <Route path="meetings"           element={<Protected><V><MeetingsPage /></V></Protected>} />
        <Route path="births"             element={<Protected><V><BirthsPage /></V></Protected>} />
        <Route path="deaths"             element={<Protected><V><DeathsPage /></V></Protected>} />
        <Route path="letters"            element={<Protected><V><LettersPage /></V></Protected>} />
        <Route path="welfare"            element={<Protected><V><WelfarePage /></V></Protected>} />
        <Route path="businesses"         element={<Protected><V><BusinessesPage /></V></Protected>} />
        <Route path="security"           element={<Protected><V><SecurityPage /></V></Protected>} />
        <Route path="reports"            element={<Protected><ReportsPage /></Protected>} />
        <Route path="audit"              element={<Protected><AuditPage /></Protected>} />
        <Route path="settings"           element={<Protected><SettingsPage /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
