// Login page — three steps:
//   'login'  → username + password
//   'email'  → enter email to request a reset code
//   'code'   → enter 6-digit code + new password
// Steps are managed with a single `step` state variable so only one form shows at a time.

import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { login, forgotPassword, resetPassword } from '../api/auth'
import { signInWithGoogle } from '../lib/supabase'

type Step = 'login' | 'email' | 'code'

const inputCls = 'w-full px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-900/30 bg-amber-50/40 dark:bg-[#1c1814] text-sm font-medium text-[#1c1814] dark:text-[#f5f0e8] focus:outline-none focus:ring-2 focus:ring-amber-300 dark:focus:ring-amber-700 transition'
const labelCls = 'block text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1'

export default function Login() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('login')
  const [error, setError] = useState<string | null>(null)
  const [resetEmail, setResetEmail] = useState('')   // carried from step 2 → 3
  const [cooldown, setCooldown] = useState(0)        // seconds until resend is allowed
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [googlePending, setGooglePending] = useState(false)

  // Countdown timer — ticks down cooldown every second after a code is sent
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  // --- Step 1: Login ---
  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      login(username, password),
    onSuccess: () => navigate('/home', { replace: true }),
    onError: (err: Error) => setError(err.message),
  })

  // --- Step 2: Request reset code ---
  const forgotMutation = useMutation({
    mutationFn: forgotPassword,
    onSuccess: () => {
      setError(null)
      setCooldown(60)    // start 60-second resend cooldown
      setStep('code')    // advance to code entry
    },
    onError: (err: Error) => setError(err.message),
  })

  // --- Step 3: Verify code + set new password ---
  const resetMutation = useMutation({
    mutationFn: ({ code, password }: { code: string; password: string }) =>
      resetPassword(resetEmail, code, password),
    onSuccess: () => {
      setSuccessMsg('Password updated! You can now sign in.')
      setStep('login')
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  function handleLogin(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    setSuccessMsg(null)
    loginMutation.mutate({
      username: fd.get('username') as string,
      password: fd.get('password') as string,
    })
  }

  function handleForgot(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = fd.get('email') as string
    setResetEmail(email)
    setError(null)
    forgotMutation.mutate(email)
  }

  function handleReset(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const password = fd.get('password') as string
    const confirm = fd.get('confirm_password') as string
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setError(null)
    resetMutation.mutate({ code: fd.get('code') as string, password })
  }

  // Resend: re-run forgotMutation with the stored email
  function handleResend() {
    if (cooldown > 0) return
    setError(null)
    forgotMutation.mutate(resetEmail)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 dark:bg-[#1c1814] px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
            LockNIn
          </h1>
          <p className="text-sm text-amber-500/60 dark:text-amber-600/50 mt-1 font-medium">
            {step === 'login' && 'Welcome back!'}
            {step === 'email' && 'Reset your password'}
            {step === 'code'  && 'Enter your code'}
          </p>
        </div>

        <div className="bg-white dark:bg-[#2a2420] rounded-2xl border border-amber-100 dark:border-amber-900/20 shadow-sm p-6">

          {/* Shared error/success banners */}
          {successMsg && (
            <p className="text-sm font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-xl mb-4">
              {successMsg}
            </p>
          )}
          {error && (
            <p className="text-sm font-semibold text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-xl mb-4">
              {error}
            </p>
          )}

          {/* ── Step 1: Login form ── */}
          {step === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={labelCls}>Username</label>
                <input name="username" required autoComplete="username" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Password</label>
                <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
              </div>
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer shadow-sm"
              >
                {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-amber-100 dark:bg-amber-900/30" />
                <span className="text-xs font-bold text-amber-400/60">or</span>
                <div className="flex-1 h-px bg-amber-100 dark:bg-amber-900/30" />
              </div>

              {/* Google OAuth */}
              <button
                type="button"
                disabled={googlePending}
                onClick={async () => {
                  setGooglePending(true)
                  setError(null)
                  try {
                    await signInWithGoogle()
                    // If we reach here without redirect, something is wrong
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Google sign-in failed.')
                    setGooglePending(false)
                  }
                }}
                className="w-full py-2.5 bg-white dark:bg-[#1c1814] border border-amber-200 dark:border-amber-900/30 text-[#1c1814] dark:text-[#f5f0e8] font-bold rounded-xl text-sm transition-colors cursor-pointer shadow-sm hover:bg-amber-50 dark:hover:bg-[#2a2420] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {/* Google "G" SVG logo */}
                <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M47.532 24.552c0-1.636-.147-3.272-.441-4.868H24.48v9.22h12.984c-.566 2.982-2.24 5.522-4.762 7.21v5.992h7.706c4.508-4.152 7.124-10.27 7.124-17.554z" fill="#4285F4"/>
                  <path d="M24.48 48c6.492 0 11.944-2.142 15.928-5.836l-7.706-5.992c-2.142 1.44-4.898 2.296-8.222 2.296-6.3 0-11.64-4.254-13.554-9.976H3.012v6.174C6.96 42.9 15.216 48 24.48 48z" fill="#34A853"/>
                  <path d="M10.926 28.492A14.38 14.38 0 0 1 10.2 24c0-1.566.27-3.088.726-4.492V13.334H3.012A23.964 23.964 0 0 0 .48 24c0 3.862.924 7.52 2.532 10.666l7.914-6.174z" fill="#FBBC05"/>
                  <path d="M24.48 9.556c3.534 0 6.72 1.218 9.224 3.608l6.876-6.876C36.416 2.394 30.964 0 24.48 0 15.216 0 6.96 5.1 3.012 13.334l7.914 6.174c1.914-5.722 7.254-9.952 13.554-9.952z" fill="#EA4335"/>
                </svg>
                {googlePending ? 'Redirecting…' : 'Continue with Google'}
              </button>

              <button
                type="button"
                onClick={() => { setError(null); setSuccessMsg(null); setStep('email') }}
                className="w-full text-xs font-semibold text-amber-500/70 hover:text-amber-600 cursor-pointer transition-colors"
              >
                Forgot password?
              </button>
            </form>
          )}

          {/* ── Step 2: Email entry ── */}
          {step === 'email' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-sm text-amber-700/60 dark:text-amber-400/50">
                Enter the email linked to your account and we'll send a 6-digit code.
              </p>
              <div>
                <label className={labelCls}>Email</label>
                <input name="email" type="email" required autoComplete="email" className={inputCls} />
              </div>
              <button
                type="submit"
                disabled={forgotMutation.isPending}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer shadow-sm"
              >
                {forgotMutation.isPending ? 'Sending…' : 'Send Code'}
              </button>
              <button
                type="button"
                onClick={() => { setError(null); setStep('login') }}
                className="w-full text-xs font-semibold text-amber-500/70 hover:text-amber-600 cursor-pointer transition-colors"
              >
                Back to sign in
              </button>
            </form>
          )}

          {/* ── Step 3: Code + new password ── */}
          {step === 'code' && (
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-sm text-amber-700/60 dark:text-amber-400/50">
                Code sent to <span className="font-bold text-amber-600 dark:text-amber-400">{resetEmail}</span>. It expires in 10 minutes.
              </p>
              <div>
                <label className={labelCls}>6-digit code</label>
                <input
                  name="code"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="123456"
                  className={`${inputCls} font-mono tracking-widest text-center text-lg`}
                />
              </div>
              <div>
                <label className={labelCls}>New password</label>
                <input name="password" type="password" required autoComplete="new-password" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Confirm password</label>
                <input name="confirm_password" type="password" required autoComplete="new-password" className={inputCls} />
              </div>
              <button
                type="submit"
                disabled={resetMutation.isPending}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer shadow-sm"
              >
                {resetMutation.isPending ? 'Updating…' : 'Update Password'}
              </button>

              {/* Resend with cooldown */}
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || forgotMutation.isPending}
                className="w-full text-xs font-semibold text-amber-500/70 hover:text-amber-600 disabled:opacity-40 cursor-pointer transition-colors"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </form>
          )}
        </div>

        {step === 'login' && (
          <p className="text-center text-xs text-amber-500/60 dark:text-amber-600/50 mt-4">
            No account?{' '}
            <Link to="/register" className="font-bold text-amber-500 hover:text-amber-600">
              Register here
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
