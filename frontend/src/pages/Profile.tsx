// Profile / settings page — lets the user update their display name, timezone, and email.
// The email field is read-only once set (enforced on the server too).

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { getProfile, updateProfile, getTimezones, changeUsername, setPassword } from '../api/profile'
import { getTheme } from '../lib/themes'

export default function Profile() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [usernameSuccess, setUsernameSuccess] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

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

  const usernameMutation = useMutation({
    mutationFn: (newUsername: string) => changeUsername(newUsername),
    onSuccess: (data) => {
      // Profile and sidebar both show username — invalidate both
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setUsernameSuccess(true)
      setUsernameError(null)
      setTimeout(() => setUsernameSuccess(false), 3000)
      // Update the displayed username in the form without a full page reload
      ;(document.querySelector('input[name="new_username"]') as HTMLInputElement | null)
        && ((document.querySelector('input[name="new_username"]') as HTMLInputElement).value = data.username)
    },
    onError: (err: Error) => {
      setUsernameError(err.message)
      setUsernameSuccess(false)
    },
  })

  const setPasswordMutation = useMutation({
    mutationFn: ({ password, confirm }: { password: string; confirm: string }) =>
      setPassword(password, confirm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setPasswordSuccess(true)
      setPasswordError(null)
    },
    onError: (err: Error) => {
      setPasswordError(err.message)
      setPasswordSuccess(false)
    },
  })

  // Reminder toggle auto-saves on change — no submit button needed
  const reminderMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
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

      {/* Change Username card */}
      <div className="shadow-sm p-6 mb-5" style={cardStyle}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: theme.accent }}>
          Change Username
        </h2>
        <form
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            setUsernameError(null)
            usernameMutation.mutate(fd.get('new_username') as string)
          }}
          className="space-y-3"
        >
          <input
            name="new_username"
            defaultValue={profile.username}
            required
            maxLength={30}
            placeholder="new_username"
            className={inputCls}
            style={{ borderColor: theme.border }}
          />
          <p className="text-xs text-slate-400">Letters, numbers, and underscores only. Max 30 characters.</p>
          {usernameSuccess && (
            <p className="text-sm font-semibold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl">Username updated!</p>
          )}
          {usernameError && (
            <p className="text-sm font-semibold text-rose-500 bg-rose-50 px-3 py-2 rounded-xl">{usernameError}</p>
          )}
          <button
            type="submit"
            disabled={usernameMutation.isPending}
            className="btn-primary w-full py-2 text-white font-bold rounded-xl text-sm cursor-pointer shadow-sm"
            style={{ background: theme.accent }}
          >
            {usernameMutation.isPending ? 'Saving…' : 'Update Username'}
          </button>
        </form>
      </div>

      {/* Set Password card — only shown for Google-only accounts */}
      {!profile.has_password && (
        <div className="shadow-sm p-6 mb-5" style={cardStyle}>
          <h2 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.accent }}>
            Set a Password
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Add a password so you can sign in with username and password in addition to Google.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              setPasswordError(null)
              setPasswordMutation.mutate({
                password: fd.get('password') as string,
                confirm:  fd.get('confirm_password') as string,
              })
            }}
            className="space-y-3"
          >
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="New password (min 8 chars)"
              autoComplete="new-password"
              className={inputCls}
              style={{ borderColor: theme.border }}
            />
            <input
              name="confirm_password"
              type="password"
              required
              placeholder="Confirm password"
              autoComplete="new-password"
              className={inputCls}
              style={{ borderColor: theme.border }}
            />
            {passwordSuccess && (
              <p className="text-sm font-semibold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl">
                Password set! You can now sign in with username and password.
              </p>
            )}
            {passwordError && (
              <p className="text-sm font-semibold text-rose-500 bg-rose-50 px-3 py-2 rounded-xl">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={setPasswordMutation.isPending}
              className="btn-primary w-full py-2 text-white font-bold rounded-xl text-sm cursor-pointer shadow-sm"
              style={{ background: theme.accent }}
            >
              {setPasswordMutation.isPending ? 'Setting…' : 'Set Password'}
            </button>
          </form>
        </div>
      )}

      {/* Email Reminders card */}
      <div className="shadow-sm p-6 mb-5" style={cardStyle}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: theme.accent }}>
          Email Reminders
        </h2>

        {/* Toggle row — clicking the label or the checkbox both work */}
        <label className="flex items-center justify-between cursor-pointer select-none">
          <div>
            <span className="text-sm font-semibold text-slate-700">Remind me 1 hour before deadlines</span>
            {!profile.email && (
              <p className="text-xs text-slate-400 mt-0.5">Requires an email address.</p>
            )}
          </div>
          <div className="relative shrink-0 ml-4">
            <input
              type="checkbox"
              className="sr-only"
              checked={profile.email_reminders}
              disabled={!profile.email || reminderMutation.isPending}
              onChange={e => reminderMutation.mutate({ email_reminders: e.target.checked })}
            />
            {/* Custom toggle pill — sr-only checkbox is the real control for accessibility */}
            <div className={`w-10 h-5 rounded-full transition-colors ${profile.email_reminders ? 'bg-violet-500' : 'bg-slate-200'}`} />
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${profile.email_reminders ? 'translate-x-5' : ''}`} />
          </div>
        </label>
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

      {/* Danger zone */}
      <div className="shadow-sm p-6 mt-5 border border-rose-100" style={{ ...cardStyle, borderColor: '#fecdd3' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-1 text-rose-500">Danger Zone</h2>
        <p className="text-xs text-slate-400 mb-4">Permanently deletes your account and all your data. This cannot be undone.</p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-2 border border-rose-300 text-rose-500 font-bold rounded-xl text-sm cursor-pointer hover:bg-rose-50 transition-colors"
          >
            Delete Account
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-rose-600">Are you sure? This is permanent.</p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await fetch('/api/auth/delete-account', { method: 'DELETE' })
                  navigate('/login', { replace: true })
                }}
                className="flex-1 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-sm cursor-pointer transition-colors"
              >
                Yes, delete everything
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-sm cursor-pointer hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
