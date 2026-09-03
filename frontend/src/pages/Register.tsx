// Registration page — collects username, fullname, email, password, and timezone.
// Timezone is fetched from Flask (/api/timezones) because it uses the server's pytz list.

import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { register } from '../api/auth'
import { getTimezones } from '../api/profile'

export default function Register() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  // Fetch timezone list for the <select> — only needed on this page and Profile
  const { data: timezones = [] } = useQuery({
    queryKey: ['timezones'],
    queryFn: getTimezones,
  })

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: () => navigate('/home', { replace: true }),
    onError: (err: Error) => setError(err.message),
  })

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    registerMutation.mutate({
      username: fd.get('username') as string,
      fullname: fd.get('fullname') as string,
      email: fd.get('email') as string,
      password: fd.get('password') as string,
      confirm_password: fd.get('confirm_password') as string,
      timezone: fd.get('timezone') as string,
    })
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl border border-amber-200 bg-amber-50/40 text-sm font-medium text-[#1c1814] focus:outline-none focus:ring-2 focus:ring-amber-300 transition'
  const labelCls = 'block text-xs font-bold text-amber-600 uppercase tracking-wider mb-1'

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 px-4 py-10">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-amber-600 tracking-tight">
            LockNIn
          </h1>
          <p className="text-sm text-amber-500/60 mt-1 font-medium">
            Create your account
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className={labelCls}>Full Name</label>
              <input name="fullname" required autoComplete="name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Username</label>
              <input name="username" required autoComplete="username" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input name="email" type="email" required autoComplete="email" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input name="password" type="password" required autoComplete="new-password" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Confirm Password</label>
              <input name="confirm_password" type="password" required autoComplete="new-password" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Timezone</label>
              <select name="timezone" required defaultValue="America/Toronto" className={inputCls}>
                {timezones.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-sm font-semibold text-rose-500 bg-rose-50 px-3 py-2 rounded-xl">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer shadow-sm"
            >
              {registerMutation.isPending ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-amber-500/60 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-amber-500 hover:text-amber-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
