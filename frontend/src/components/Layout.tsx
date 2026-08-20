// Layout wraps every protected page with a fixed sidebar + scrollable main area.
// It also acts as the auth gate: if /api/auth/me returns 401, it redirects to /login.
// The sidebar accent colors (brand, borders, active nav) adapt to the current page
// using per-route pastel themes defined in src/lib/themes.ts.

import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Home, BookOpen, CalendarDays, BookOpenCheck, LayoutDashboard, Sparkles, User, LogOut,
} from 'lucide-react'
import { getMe, logout } from '../api/auth'
import { getTheme } from '../lib/themes'

const NAV_ITEMS = [
  { to: '/home',     label: 'Home',     icon: Home },
  { to: '/homework', label: 'Homework', icon: BookOpen },
  { to: '/events',   label: 'Events',   icon: CalendarDays },
  { to: '/study',    label: 'Study',    icon: BookOpenCheck },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/import',   label: 'Import',   icon: Sparkles },
]

export default function Layout() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const queryClient = useQueryClient()

  // Derive current page theme from the active route
  const theme = getTheme(location.pathname)

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
  })

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  useEffect(() => {
    if (error) navigate('/login', { replace: true })
  }, [error, navigate])

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: theme.bg }}>
      <p className="font-semibold animate-pulse" style={{ color: theme.accent }}>Loading…</p>
    </div>
  )

  if (!user) return null

  return (
    <div className="flex min-h-screen" style={{ background: theme.bg }}>

      {/* Fixed sidebar — white, with border + accent colors from the active page theme */}
      <aside
        className="w-56 shrink-0 flex flex-col fixed top-0 left-0 h-full z-20 bg-white"
        style={{ borderRight: `1px solid ${theme.border}` }}
      >
        {/* Brand + username */}
        <div className="px-5 py-5" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <h1
            className="text-base font-extrabold tracking-tight"
            style={{ color: theme.accent }}
          >
            LockNIn
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {user.fullname}
          </p>
        </div>

        {/* Navigation — active item uses the current page's pastel */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              style={({ isActive }) =>
                isActive
                  ? { background: theme.activeBg, color: theme.accent }
                  : { color: '#94A3B8' }
              }
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Profile + logout */}
        <div className="px-3 py-4 space-y-0.5" style={{ borderTop: `1px solid ${theme.border}` }}>
          <NavLink
            to="/profile"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            style={({ isActive }) =>
              isActive
                ? { background: theme.activeBg, color: theme.accent }
                : { color: '#94A3B8' }
            }
          >
            <User size={16} strokeWidth={2} />
            Profile
          </NavLink>
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer hover:bg-rose-50"
            style={{ color: '#FECDD3' }}
          >
            <LogOut size={16} strokeWidth={2} />
            {logoutMutation.isPending ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content — offset by sidebar width */}
      <main className="flex-1 ml-56 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
