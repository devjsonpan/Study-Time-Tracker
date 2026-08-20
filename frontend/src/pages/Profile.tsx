// Profile / settings page — lets the user update their display name, timezone, and email.
// The email field is read-only once set (enforced on the server too).

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { getProfile, updateProfile, getTimezones } from '../api/profile'
import { getMyGroup, createGroup, joinGroup, leaveGroup } from '../api/groups'
import { getTheme } from '../lib/themes'

export default function Profile() {
  const queryClient = useQueryClient()
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groupError, setGroupError] = useState<string | null>(null)

  const { pathname } = useLocation()
  const theme = getTheme(pathname)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })

  // Timezone list is big (~500 items) — cache it indefinitely via staleTime
  const { data: timezones = [] } = useQuery({
    queryKey: ['timezones'],
    queryFn: getTimezones,
    staleTime: Infinity,
  })

  const { data: groupData, isLoading: groupLoading } = useQuery({
    queryKey: ['group'],
    queryFn: getMyGroup,
  })

  const createMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      setGroupError(null)
    },
    onError: (err: Error) => setGroupError(err.message),
  })

  const joinMutation = useMutation({
    mutationFn: joinGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      setGroupError(null)
    },
    onError: (err: Error) => setGroupError(err.message),
  })

  const leaveMutation = useMutation({
    mutationFn: leaveGroup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group'] }),
  })

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['me'] }) // refresh sidebar name
      setSuccess(true)
      setError(null)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (err: Error) => {
      setError(err.message)
      setSuccess(false)
    },
  })

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    setSuccess(false)
    updateMutation.mutate({
      fullname: fd.get('fullname') as string,
      timezone: fd.get('timezone') as string,
      email: (fd.get('email') as string) || undefined,
    })
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border text-sm font-medium text-slate-800 placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-100 transition'
  const labelCls = 'block text-xs font-bold uppercase tracking-wider mb-1'

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF', border: `1px solid ${theme.border}`, borderRadius: '16px',
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="font-semibold animate-pulse" style={{ color: theme.accent }}>Loading profile…</p>
    </div>
  )

  if (!profile) return null

  return (
    <div className="max-w-lg mx-auto px-4 py-10">

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Profile</h1>
        <p className="text-sm text-slate-400 mt-1 font-medium">@{profile.username}</p>
      </div>

      {/* Study Group section */}
      <div className="shadow-sm p-6 mb-5" style={cardStyle}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: theme.accent }}>
          Study Group
        </h2>

        {groupLoading ? (
          <p className="text-sm text-slate-400 animate-pulse">Loading…</p>
        ) : groupData ? (
          /* Already in a group — show info + leave button */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-800">{groupData.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Join code: <code className="font-mono font-bold tracking-widest">{groupData.join_code}</code>
                </p>
              </div>
              <button
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                className="px-3 py-1.5 text-xs font-bold text-rose-500 border border-rose-200 rounded-xl hover:bg-rose-50 cursor-pointer transition-colors disabled:opacity-50"
              >
                {leaveMutation.isPending ? 'Leaving…' : 'Leave group'}
              </button>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1 text-slate-400">Members</p>
              <div className="flex flex-wrap gap-2">
                {groupData.members.map(m => (
                  <span key={m} className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: theme.activeBg, color: theme.accent }}>
                    @{m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Not in a group — show create + join forms */
          <div className="space-y-4">
            {groupError && (
              <p className="text-sm font-semibold text-rose-500 bg-rose-50 px-3 py-2 rounded-xl">{groupError}</p>
            )}

            {/* Create a new group */}
            <form onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              createMutation.mutate(fd.get('group_name') as string)
              ;(e.currentTarget as HTMLFormElement).reset()
            }} className="flex gap-2">
              <input name="group_name" placeholder="Group name" required
                className={`flex-1 ${inputCls}`} style={{ borderColor: theme.border }} />
              <button type="submit" disabled={createMutation.isPending}
                className="btn-primary px-4 py-2 text-white font-bold rounded-xl text-sm cursor-pointer shrink-0"
                style={{ background: theme.accent }}>
                {createMutation.isPending ? '…' : 'Create'}
              </button>
            </form>

            <div className="flex items-center gap-2" style={{ color: theme.border }}>
              <div className="flex-1 h-px" style={{ background: theme.border, opacity: 0.4 }} />
              <span className="text-xs font-bold" style={{ color: theme.accent, opacity: 0.5 }}>or</span>
              <div className="flex-1 h-px" style={{ background: theme.border, opacity: 0.4 }} />
            </div>

            {/* Join an existing group */}
            <form onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              joinMutation.mutate(fd.get('join_code') as string)
              ;(e.currentTarget as HTMLFormElement).reset()
            }} className="flex gap-2">
              <input name="join_code" placeholder="Join code (e.g. AB12CD)" required
                className={`flex-1 ${inputCls} font-mono uppercase`} style={{ borderColor: theme.border }} />
              <button type="submit" disabled={joinMutation.isPending}
                className="btn-secondary px-4 py-2 font-bold rounded-xl text-sm cursor-pointer shrink-0"
                style={{ background: theme.activeBg, color: theme.accent }}>
                {joinMutation.isPending ? '…' : 'Join'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Profile form */}
      <div className="shadow-sm p-6" style={cardStyle}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls} style={{ color: theme.accent }}>Display Name</label>
            <input name="fullname" defaultValue={profile.fullname} required
              className={inputCls} style={{ borderColor: theme.border }} />
          </div>

          <div>
            <label className={labelCls} style={{ color: theme.accent }}>Timezone</label>
            <select name="timezone" defaultValue={profile.timezone}
              className={inputCls} style={{ borderColor: theme.border }}>
              {timezones.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} style={{ color: theme.accent }}>
              Email
              {profile.email && <span className="ml-1 text-slate-400 normal-case font-medium">(locked)</span>}
            </label>
            <input
              name="email"
              type="email"
              defaultValue={profile.email ?? ''}
              // Email can only be set once — if it's already set, make the field read-only
              readOnly={!!profile.email}
              className={`${inputCls} ${profile.email ? 'opacity-60 cursor-not-allowed' : ''}`}
              style={{ borderColor: theme.border }}
            />
            {profile.email && (
              <p className="text-xs text-slate-400 mt-1">Email is locked once set. Contact support to change it.</p>
            )}
          </div>

          {/* Auth method badges */}
          <div className="flex gap-2 pt-1">
            {profile.has_password && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: theme.activeBg, color: theme.accent }}>
                Password login
              </span>
            )}
            {profile.has_google && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                Google login
              </span>
            )}
          </div>

          {success && (
            <p className="text-sm font-semibold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl">
              Profile updated!
            </p>
          )}
          {error && (
            <p className="text-sm font-semibold text-rose-500 bg-rose-50 px-3 py-2 rounded-xl">{error}</p>
          )}

          <button type="submit" disabled={updateMutation.isPending}
            className="btn-primary w-full py-2.5 text-white font-bold rounded-xl text-sm cursor-pointer shadow-sm"
            style={{ background: theme.accent }}>
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}
