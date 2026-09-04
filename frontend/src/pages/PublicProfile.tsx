// Public profile page — accessible without login, linked from friends, group members, leaderboard.
// Lives at /user/:username. Shows study stats and a GitHub-style heatmap; no private data.

import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPublicProfile } from '../api/profile'
import { getMe } from '../api/auth'

// --- Heatmap helpers (same logic as Overview stats panel) ---

function heatStyle(hours: number): React.CSSProperties {
  if (hours === 0) return { background: '#E2E8F0' }
  const opacity = hours < 1 ? 0.3 : hours < 2 ? 0.5 : hours < 4 ? 0.7 : 1
  return { background: '#7C3AED', opacity }
}

function buildWeeks(data: { date: string; hours: number }[]) {
  if (data.length === 0) return []
  const firstDay = new Date(data[0].date + 'T00:00:00').getDay()
  const padStart = (firstDay + 6) % 7
  const padded: ({ date: string; hours: number } | null)[] = [
    ...Array(padStart).fill(null), ...data,
  ]
  const weeks: (typeof padded[number])[][] = []
  for (let i = 0; i < padded.length; i += 7) {
    const week = padded.slice(i, i + 7)
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

function Heatmap({ data }: { data: { date: string; hours: number }[] }) {
  const weeks = buildWeeks(data)
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  // Compute month label positions for the header row
  const monthLabelCols: { wi: number; label: string }[] = []
  weeks.forEach((week, wi) => {
    for (const day of week) {
      if (day) {
        const d = new Date(day.date + 'T00:00:00')
        if (d.getDate() === 1) {
          monthLabelCols.push({ wi, label: d.toLocaleDateString('en-US', { month: 'short' }) })
          break
        }
      }
    }
  })

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* Month labels */}
        <div className="flex gap-1 mb-1" style={{ paddingLeft: '20px' }}>
          {weeks.map((_, wi) => {
            const label = monthLabelCols.find(m => m.wi === wi)
            return (
              <div key={wi} className="w-3 flex-shrink-0 relative" style={{ height: '10px' }}>
                {label && (
                  <span className="absolute text-[9px] text-slate-400 font-medium whitespace-nowrap" style={{ left: 0 }}>
                    {label.label}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Grid */}
        <div className="flex gap-1">
          <div className="flex flex-col gap-1 mr-1">
            {DAY_LABELS.map((d, i) => (
              <span key={i} className="text-[9px] text-slate-400 h-3 w-4 flex items-center font-medium">{d}</span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day, di) => (
                <div
                  key={di}
                  title={day ? `${day.date}: ${day.hours}h` : ''}
                  className="w-3 h-3 rounded-sm"
                  style={day ? heatStyle(day.hours) : { opacity: 0 }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Page ---

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['publicProfile', username],
    queryFn: () => getPublicProfile(username!),
    enabled: !!username,
    retry: false,
  })

  // Best-effort — works when logged in, silently undefined when not
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    retry: false,
  })

  const isOwnProfile = !!me && me.username === username

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 font-semibold animate-pulse">Loading…</p>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <p className="text-2xl font-extrabold text-slate-700">User not found</p>
        <p className="text-slate-400 text-sm">@{username} doesn't exist.</p>
        <button onClick={() => navigate(-1)} className="text-sm font-bold text-violet-500 hover:text-violet-600 cursor-pointer">
          ← Go back
        </button>
      </div>
    )
  }

  const hasActivity = profile.heatmap.some(d => d.hours > 0)

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="max-w-lg mx-auto">

        {/* Back — go to previous page in history */}
        <button
          onClick={() => navigate(-1)}
          className="text-xs font-bold text-slate-400 hover:text-slate-600 mb-8 inline-block cursor-pointer"
        >
          ← Back
        </button>

        {/* Avatar + identity */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 mb-4 text-center">
          <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-extrabold text-violet-600">
              {profile.username.charAt(0).toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">
            {profile.fullname}
          </h1>
          <p className="text-sm font-semibold text-slate-400 mt-0.5">@{profile.username}</p>
          {(isOwnProfile || profile.group_name) && (
            <div className="flex items-center justify-center gap-2 flex-wrap mt-3">
              {isOwnProfile && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                  your profile
                </span>
              )}
              {profile.group_name && (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-violet-50 text-violet-600">
                  {profile.group_name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Stats row: this week, current streak, longest streak */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
            <p className="text-3xl font-extrabold text-violet-600">{profile.this_week_hours}<span className="text-sm font-semibold text-slate-400 ml-0.5">h</span></p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">This week</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
            <p className="text-3xl font-extrabold text-violet-600">{profile.current_streak}<span className="text-sm font-semibold text-slate-400 ml-0.5">d</span></p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Streak</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
            <p className="text-3xl font-extrabold text-violet-600">{profile.longest_streak}<span className="text-sm font-semibold text-slate-400 ml-0.5">d</span></p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Best streak</p>
          </div>
        </div>

        {/* Heatmap */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Study activity</p>
          {hasActivity
            ? <Heatmap data={profile.heatmap} />
            : <p className="text-sm text-slate-400">No study sessions yet.</p>
          }
        </div>

      </div>
    </div>
  )
}
