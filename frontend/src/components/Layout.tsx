// Layout wraps every protected page with a fixed sidebar + scrollable main area.
// It also acts as the auth gate: if /api/auth/me returns 401, it redirects to /login.
// The sidebar accent colors (brand, borders, active nav) adapt to the current page
// using per-route pastel themes defined in src/lib/themes.ts.

import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Home, BookOpen, CalendarDays, BookOpenCheck, LayoutDashboard, Sparkles, MessageCircle, User, LogOut,
} from 'lucide-react'
import { getMe, logout } from '../api/auth'
import { getTheme } from '../lib/themes'
import { socket } from '../lib/socket'

const NAV_ITEMS = [
  { to: '/home',     label: 'Home',     icon: Home },
  { to: '/homework', label: 'Homework', icon: BookOpen },
  { to: '/events',   label: 'Events',   icon: CalendarDays },
  { to: '/study',    label: 'Study',    icon: BookOpenCheck },
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/import',   label: 'Import',   icon: Sparkles },
  { to: '/chat',     label: 'Chat',     icon: MessageCircle },
]

export default function Layout() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const queryClient = useQueryClient()

  const theme = getTheme(location.pathname)

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
  })

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      socket.disconnect()
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
    <div className="flex" style={{ height: '100vh', background: theme.bg }}>

      {/* Vertical sidebar */}
      <nav
        className="flex flex-col shrink-0 py-5 px-3"
        style={{ width: '200px', borderRight: `1px solid ${theme.border}`, background: theme.bg }}
      >
        {/* Logo */}
        <span className="text-base font-extrabold tracking-tight px-3 mb-6" style={{ color: theme.accent }}>
          LockNIn
        </span>

        {/* Main nav items */}
        <div className="flex flex-col gap-0.5 flex-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
              style={({ isActive }) =>
                isActive ? { background: theme.activeBg, color: theme.accent } : { color: '#94A3B8' }
              }
            >
              <Icon size={15} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </div>

        {/* Bottom: profile + logout */}
        <div className="flex flex-col gap-0.5">
          <NavLink
            to="/profile"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
            style={({ isActive }) =>
              isActive ? { background: theme.activeBg, color: theme.accent } : { color: '#94A3B8' }
            }
          >
            <User size={15} strokeWidth={2} />
            Profile
          </NavLink>
          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer hover:bg-rose-50 text-left"
            style={{ color: '#FECDD3' }}
          >
            <LogOut size={15} strokeWidth={2} />
            {logoutMutation.isPending ? 'Logging out…' : 'Logout'}
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
