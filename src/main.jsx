/**
 * ============================================================
 * APPLICATION ENTRY POINT — src/main.jsx
 * ============================================================
 * This is the first file executed by the browser. It mounts
 * the React app into the <div id="root"> in index.html.
 *
 * Provider hierarchy (outermost to innermost):
 *   BrowserRouter  — gives all components access to URL routing
 *   AuthProvider   — gives all components access to login state
 *   App            — the root component containing all routes
 * ============================================================
 */

import React    from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { AuthProvider } from './hooks/useAuth'
import App              from './App'
import './index.css'    // Global styles, design tokens, utility classes

// Mount the app into the #root div defined in index.html
ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode runs each component twice in development to catch side-effects
  <React.StrictMode>
    {/* BrowserRouter enables clean URLs like /residents/123 instead of /#/residents/123 */}
    <BrowserRouter>
      {/* AuthProvider makes login state available to every component in the tree */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
