// Public profile page — accessible without login, linked from friends, group members, leaderboard.
// Lives at /user/:username. Shows basic stats; no private data.

import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPublicProfile } from '../api/profile'

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>()

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['publicProfile', username],
    queryFn: () => getPublicProfile(username!),
    enabled: !!username,
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-slate-400 font-semibold animate-pulse">Loading…</p>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 gap-3">
        <p className="text-2xl font-extrabold text-slate-700 dark:text-slate-200">User not found</p>
        <p className="text-slate-400 text-sm">@{username} doesn't exist.</p>
        <Link to="/home" className="text-sm font-bold text-violet-500 hover:text-violet-600">
          Go home
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 px-4 py-12">
      <div className="max-w-md mx-auto">

        {/* Back link */}
        <Link to="/home" className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 mb-8 inline-block">
          ← Back
        </Link>

        {/* Avatar + identity */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-8 mb-4 text-center">
          {/* Initials avatar */}
          <div className="w-20 h-20 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-extrabold text-violet-600 dark:text-violet-400">
              {profile.fullname.charAt(0).toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{profile.fullname}</h1>
          <p className="text-sm font-semibold text-slate-400 mt-0.5">@{profile.username}</p>
          {profile.group_name && (
            <span className="inline-block mt-3 text-xs font-bold px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
              {profile.group_name}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 text-center">
            <p className="text-3xl font-extrabold text-violet-600 dark:text-violet-400">{profile.total_hours}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">Hours studied</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 text-center">
            <p className="text-3xl font-extrabold text-violet-600 dark:text-violet-400">{profile.total_sessions}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">Sessions</p>
          </div>
        </div>

      </div>
    </div>
  )
}
