import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

// Layout + public pages
import Layout       from './components/Layout'
import TimerPractice from './practice/TimerPractice'
import Login        from './pages/Login'
import Register     from './pages/Register'
import AuthCallback from './pages/AuthCallback'

// Protected pages
import Home     from './pages/Home'
import Homework from './pages/Homework'
import Events   from './pages/Events'
import Study    from './pages/Study'
import Overview from './pages/Overview'
import Import   from './pages/Import'
import Chat          from './pages/Chat'
import Profile       from './pages/Profile'
import PublicProfile from './pages/PublicProfile'

// createBrowserRouter (data router) is required for useBlocker to work.
// BrowserRouter does not support the navigation blocking API.
const router = createBrowserRouter([
  // Public routes — no sidebar
  { path: '/practice',        element: <TimerPractice /> },
  { path: '/login',           element: <Login /> },
  { path: '/register',        element: <Register /> },
  { path: '/auth/callback',   element: <AuthCallback /> },
  { path: '/user/:username',  element: <PublicProfile /> },

  // Protected routes — wrapped in Layout (sidebar + auth guard)
  {
    element: <Layout />,
    children: [
      { path: '/home',     element: <Home /> },
      { path: '/homework', element: <Homework /> },
      { path: '/events',   element: <Events /> },
      { path: '/study',    element: <Study /> },
      { path: '/overview', element: <Overview /> },
      { path: '/import',   element: <Import /> },
      { path: '/chat',     element: <Chat /> },
      { path: '/profile',  element: <Profile /> },

      // Legacy route redirects
      { path: '/session',  element: <Navigate to="/study"    replace /> },
      { path: '/break',    element: <Navigate to="/study"    replace /> },
      { path: '/notes',    element: <Navigate to="/study"    replace /> },
      { path: '/calendar', element: <Navigate to="/overview" replace /> },
      { path: '/summary',  element: <Navigate to="/overview" replace /> },
    ],
  },

  // Bare / → /home
  { path: '/', element: <Navigate to="/home" replace /> },
])

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
